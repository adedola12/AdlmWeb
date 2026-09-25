// server/util/prospecting/store.js
//
// Database side of the prospecting rules in guards.js: load what already
// exists, add what passes, and the two actions that must never be half done,
// opt-out and delete-on-request.
//
// Built by createStore(models) so the tests can hand in fakes; the app uses
// the default export, wired to the real models.
import { Prospect } from "../../models/Prospect.js";
import { ProspectContact } from "../../models/ProspectContact.js";
import { OutreachDraft } from "../../models/OutreachDraft.js";
import { Suppression } from "../../models/Suppression.js";
import { hashEmail, lagosDay, normaliseDomain, normaliseEmail } from "./normalise.js";
import { dailyCap, remainingToday, screenCandidates, screenContacts } from "./guards.js";

// A bulk insert that failed ONLY on duplicate keys (a lost race). Anything
// else, including an error with no writeErrors at all, is a real failure.
const isDuplicateKey = (err) => {
  if (err?.code === 11000) return true;
  const w = err?.writeErrors;
  return Array.isArray(w) && w.length > 0 && w.every((e) => (e?.code ?? e?.err?.code) === 11000);
};

export function createStore(models) {
  const { Prospect, ProspectContact, OutreachDraft, Suppression } = models;

  async function suppressedDomainSet(domains) {
    if (!domains.length) return new Set();
    const rows = await Suppression.find({ kind: "domain", domain: { $in: domains } }).select("domain").lean();
    return new Set(rows.map((r) => r.domain));
  }

  /**
   * Adds the finder's candidates for one profile that pass dedupe,
   * suppression and today's cap. A row that loses an insert race to another
   * writer is reported as already_a_prospect, never as an error.
   */
  async function addProspects({ profile, candidates, runId = "", now = new Date(), cap = dailyCap() }) {
    const day = lagosDay(now);
    const domains = [...new Set(candidates.map((c) => normaliseDomain(c?.domain || c?.website)).filter(Boolean))];

    const [foundToday, existing, suppressedDomains] = await Promise.all([
      Prospect.countDocuments({ foundDay: day }),
      Prospect.find({ domain: { $in: domains } }).select("domain").lean(),
      suppressedDomainSet(domains),
    ]);

    const { accepted, skipped } = screenCandidates({
      candidates,
      existingDomains: new Set(existing.map((p) => p.domain)),
      suppressedDomains,
      remaining: remainingToday(cap, foundToday),
    });

    const docs = accepted.map((c) => ({
      ...c,
      profileId: profile._id,
      matchedProduct: profile.targetProduct,
      foundDay: day,
      finderRunId: runId,
      status: "new",
    }));

    let inserted = [];
    if (docs.length) {
      try {
        inserted = await Prospect.insertMany(docs, { ordered: false });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        inserted = err.insertedDocs || [];
        const got = new Set(inserted.map((d) => d.domain));
        for (const d of docs) if (!got.has(d.domain)) skipped.push({ input: d.domain, domain: d.domain, reason: "already_a_prospect" });
      }
    }
    return { day, cap, foundToday, inserted, skipped };
  }

  /** Stores Hunter's contacts for one prospect that pass dedupe and suppression. */
  async function addContacts({ prospect, contacts }) {
    const emails = [...new Set(contacts.map((c) => normaliseEmail(c?.email)).filter(Boolean))];
    const hashes = emails.map(hashEmail);
    const domains = [...new Set(emails.map(normaliseDomain).filter(Boolean))];

    const [existing, suppressedRows, suppressedDomains] = await Promise.all([
      ProspectContact.find({ email: { $in: emails } }).select("email").lean(),
      Suppression.find({ kind: "email", emailHash: { $in: hashes } }).select("emailHash").lean(),
      suppressedDomainSet(domains),
    ]);

    const { accepted, skipped } = screenContacts({
      contacts,
      existingEmails: new Set(existing.map((c) => c.email)),
      suppressedHashes: new Set(suppressedRows.map((r) => r.emailHash)),
      suppressedDomains,
    });

    const docs = accepted.map((c) => ({ ...c, prospectId: prospect._id }));
    let inserted = [];
    if (docs.length) {
      try {
        inserted = await ProspectContact.insertMany(docs, { ordered: false });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        inserted = err.insertedDocs || [];
      }
    }
    return { inserted, skipped };
  }

  /** Is this address, or its domain, on the suppression list? */
  async function isSuppressed(email) {
    const hash = hashEmail(email);
    if (!hash) return false;
    const domain = normaliseDomain(email);
    const hit = await Suppression.findOne({
      $or: [{ kind: "email", emailHash: hash }, { kind: "domain", domain }],
    }).select("_id").lean();
    return !!hit;
  }

  /**
   * Permanent opt-out. The suppression row is written FIRST, so a failure
   * part-way leaves the person suppressed rather than still in the queue.
   * Their firm is marked opted_out (nobody else there is emailed either) and
   * any draft not yet sent is withdrawn. Safe to call twice.
   */
  async function optOut(email, { by = "", note = "" } = {}) {
    const address = normaliseEmail(email);
    if (!address) throw new Error("optOut needs a valid email address");
    const emailHash = hashEmail(address);

    await Suppression.updateOne(
      { kind: "email", emailHash },
      { $setOnInsert: { kind: "email", emailHash, reason: "opt_out", note, addedBy: by } },
      { upsert: true },
    );

    const contacts = await ProspectContact.find({ email: address }).select("_id prospectId").lean();
    const contactIds = contacts.map((c) => c._id);
    const prospectIds = contacts.map((c) => c.prospectId);

    if (prospectIds.length) {
      await Prospect.updateMany({ _id: { $in: prospectIds } }, { $set: { status: "opted_out", statusNote: "Asked not to be emailed." } });
      await OutreachDraft.updateMany(
        { prospectId: { $in: prospectIds }, status: { $in: ["pending_review", "approved"] } },
        { $set: { status: "superseded", rejectReason: "Contact opted out." } },
      );
    }
    return { emailHash, contacts: contactIds.length, prospects: prospectIds.length };
  }

  /**
   * NDPA delete-on-request. Every contact's email hash and the company domain
   * go on the suppression list first, then the drafts, contacts and prospect
   * are deleted outright. What remains is only enough to recognise and refuse
   * them if the finder turns them up again.
   */
  async function deleteProspectData(prospectId, { by = "", note = "" } = {}) {
    const prospect = await Prospect.findById(prospectId).select("_id domain").lean();
    if (!prospect) return { deleted: false };

    const contacts = await ProspectContact.find({ prospectId: prospect._id }).select("email").lean();
    const ops = contacts
      .map((c) => hashEmail(c.email))
      .filter(Boolean)
      .map((emailHash) => ({
        updateOne: {
          filter: { kind: "email", emailHash },
          update: { $setOnInsert: { kind: "email", emailHash, reason: "deletion_request", note, addedBy: by } },
          upsert: true,
        },
      }));
    ops.push({
      updateOne: {
        filter: { kind: "domain", domain: prospect.domain },
        update: { $setOnInsert: { kind: "domain", domain: prospect.domain, reason: "deletion_request", note, addedBy: by } },
        upsert: true,
      },
    });
    await Suppression.bulkWrite(ops, { ordered: true });

    const drafts = await OutreachDraft.deleteMany({ prospectId: prospect._id });
    const removedContacts = await ProspectContact.deleteMany({ prospectId: prospect._id });
    await Prospect.deleteOne({ _id: prospect._id });

    return {
      deleted: true,
      domain: prospect.domain,
      contacts: removedContacts.deletedCount ?? 0,
      drafts: drafts.deletedCount ?? 0,
      suppressed: ops.length,
    };
  }

  return { addProspects, addContacts, isSuppressed, optOut, deleteProspectData };
}

export default createStore({ Prospect, ProspectContact, OutreachDraft, Suppression });
