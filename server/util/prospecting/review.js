// server/util/prospecting/review.js
//
// Everything the approval dashboard does, as plain functions over the models:
// the review queue and its four actions, the prospect table, the stats, the
// profile editor, and the admin-only suppression and delete-on-request.
// routes/admin.prospecting.js is a thin HTTP layer over this.
//
// Built by createReview(models) like the store, so the tests run on the
// in-memory models. Every status move is conditional on the current status
// (findOneAndUpdate with the expected status in the filter), so two reviewers
// acting on the same draft cannot both win.
//
// Reviewer edits are checked too, more gently than the model's: the hard
// rules (no em dash, a subject, the sign-off and opt-out line intact) block
// the save; the style rules come back as warnings for the reviewer to judge.
import { createStore } from "./store.js";
import { hashEmail, normaliseDomain, normaliseEmail } from "./normalise.js";
import { EM_DASH, FOOTER, OPT_OUT, checkEmail, stripSignOff } from "./writer.js";
import { PROSPECT_PRODUCTS } from "../../models/IdealCustomerProfile.js";

export class ReviewError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PROFILE_FIELDS = ["segment", "targetProduct", "locations", "companyTypes", "jobTitles", "keywords", "exclusions", "notes", "active"];
const LIST_FIELDS = ["locations", "companyTypes", "jobTitles", "keywords", "exclusions"];

/** A reviewer's edited email, back in stored shape with the footer restored. */
export function normaliseEditedEmails(original, edited) {
  if (!Array.isArray(edited) || edited.length !== 3) throw new ReviewError(400, "Send all three emails.");
  const problems = [];
  const warnings = [];
  const emails = original.map((o, i) => {
    const e = edited[i] || {};
    const subject = String(e.subject ?? o.subject).trim();
    // The reviewer may edit the text above the footer, never the footer:
    // strip whatever sign-off or opt-out is there and put the real one back.
    const raw = String(e.body ?? o.body).replace(/\r\n/g, "\n");
    const body = stripSignOff(raw.split(OPT_OUT).join("").trim()).trim();

    const label = ["First email", "Day 3 follow-up", "Day 7 follow-up"][i];
    if (!body) problems.push(`${label}: the email is empty.`);
    if (!subject) problems.push(`${label}: the subject is empty.`);
    if (subject.length > 120) problems.push(`${label}: the subject is too long.`);
    if (body.includes(EM_DASH) || subject.includes(EM_DASH)) problems.push(`${label}: uses an em dash.`);
    for (const w of checkEmail(body, i === 0 ? "first" : "followUp")) {
      if (!/em dash/.test(w)) warnings.push(`${label}: ${w}`);
    }
    return { step: o.step, dayOffset: o.dayOffset, subject, body: body + FOOTER };
  });
  if (problems.length) throw new ReviewError(422, "The edit breaks the rules that cannot be waived.", { problems });
  return { emails, warnings };
}

export function createReview(models) {
  const { IdealCustomerProfile, Prospect, ProspectContact, OutreachDraft, Suppression } = models;
  const store = createStore(models);

  async function loadDraftContext(draft) {
    const [prospect, contact] = await Promise.all([
      Prospect.findById(draft.prospectId).lean(),
      ProspectContact.findById(draft.contactId).lean(),
    ]);
    return { ...draft, prospect, contact };
  }

  /* ───────────────────────────── the queue ───────────────────────────── */

  /** Drafts waiting for review, oldest first, each with its research and contact. */
  async function queue({ profileId, limit = 25 } = {}) {
    const filter = { status: "pending_review" };
    if (profileId) filter.profileId = profileId;
    const [rows, total] = await Promise.all([
      OutreachDraft.find(filter).sort({ createdAt: 1 }).limit(Math.min(100, Math.max(1, limit))).lean(),
      OutreachDraft.countDocuments(filter),
    ]);
    return { total, items: await Promise.all(rows.map(loadDraftContext)) };
  }

  async function getDraft(id) {
    const d = await OutreachDraft.findById(id).lean();
    if (!d) throw new ReviewError(404, "Draft not found.");
    return loadDraftContext(d);
  }

  /** Moves a draft out of pending_review, or explains why it could not. */
  async function claim(id, set) {
    const moved = await OutreachDraft.findOneAndUpdate({ _id: id, status: "pending_review" }, { $set: set }, { new: true }).lean();
    if (moved) return moved;
    const d = await OutreachDraft.findById(id).select("status").lean();
    if (!d) throw new ReviewError(404, "Draft not found.");
    throw new ReviewError(409, `This draft is already ${d.status.replace("_", " ")}.`);
  }

  /**
   * Approve as written, or with the reviewer's edits (`emails`). A person who
   * opted out while the draft sat in the queue cannot be approved.
   */
  async function approve(id, { by, emails: edited } = {}) {
    const draft = await OutreachDraft.findById(id).lean();
    if (!draft) throw new ReviewError(404, "Draft not found.");
    const contact = await ProspectContact.findById(draft.contactId).select("email").lean();
    if (!contact || (await store.isSuppressed(contact.email))) {
      await OutreachDraft.updateOne({ _id: id, status: "pending_review" }, { $set: { status: "superseded", rejectReason: "Contact is on the suppression list." } });
      throw new ReviewError(409, "This person is on the suppression list and can't be approved.");
    }

    let set = { status: "approved", reviewedBy: by, reviewedAt: new Date() };
    let warnings = [];
    if (edited) {
      const n = normaliseEditedEmails(draft.emails, edited);
      warnings = n.warnings;
      const changed = JSON.stringify(n.emails) !== JSON.stringify(draft.emails);
      if (changed) set = { ...set, emails: n.emails, original: draft.emails, edited: true };
    }
    const moved = await claim(id, set);
    await Prospect.updateOne({ _id: draft.prospectId }, { $set: { status: "approved", statusNote: "" } });
    return { draft: moved, warnings };
  }

  async function reject(id, { by, reason } = {}) {
    const why = String(reason || "").trim();
    if (!why) throw new ReviewError(400, "Say why the draft is rejected.");
    const moved = await claim(id, { status: "rejected", reviewedBy: by, reviewedAt: new Date(), rejectReason: why.slice(0, 2000) });
    await Prospect.updateOne({ _id: moved.prospectId }, { $set: { status: "rejected", statusNote: `Draft rejected: ${why.slice(0, 300)}` } });
    return { draft: moved };
  }

  /**
   * Not a customer. The prospect is never drafted again, and any open draft
   * is withdrawn. The row is kept so dedupe keeps it out of future runs.
   */
  async function badFit(prospectId, { by, reason } = {}) {
    const why = String(reason || "").trim();
    if (!why) throw new ReviewError(400, "Say why this is a bad fit.");
    const p = await Prospect.findOneAndUpdate(
      { _id: prospectId, status: { $nin: ["opted_out", "bad_fit"] } },
      { $set: { status: "bad_fit", statusNote: `Bad fit (${by}): ${why.slice(0, 500)}` } },
      { new: true },
    ).lean();
    if (!p) {
      const exists = await Prospect.findById(prospectId).select("status").lean();
      if (!exists) throw new ReviewError(404, "Prospect not found.");
      throw new ReviewError(409, `This prospect is already ${exists.status.replace("_", " ")}.`);
    }
    await OutreachDraft.updateMany(
      { prospectId, status: { $in: ["pending_review", "approved"] } },
      { $set: { status: "superseded", rejectReason: `Marked bad fit: ${why.slice(0, 300)}`, reviewedBy: by, reviewedAt: new Date() } },
    );
    return { prospect: p };
  }

  /**
   * Records a reply or a booked call by hand, until the phase 3 ReplyHandler
   * does it. Booked implies replied.
   */
  async function recordOutcome(prospectId, { outcome, at = new Date() } = {}) {
    if (!["replied", "booked"].includes(outcome)) throw new ReviewError(400, 'Outcome must be "replied" or "booked".');
    const p = await Prospect.findById(prospectId).lean();
    if (!p) throw new ReviewError(404, "Prospect not found.");
    if (["opted_out", "bad_fit"].includes(p.status)) throw new ReviewError(409, `This prospect is ${p.status.replace("_", " ")}.`);
    const set = { status: outcome };
    if (!p.repliedAt) set.repliedAt = at;
    if (outcome === "booked") set.bookedAt = p.bookedAt || at;
    await Prospect.updateOne({ _id: prospectId }, { $set: set });
    return { prospect: { ...p, ...set } };
  }

  /* ───────────────────────────── the table ───────────────────────────── */

  async function listProspects({ profileId, status, from, to, q, page = 1, limit = 50 } = {}) {
    const filter = {};
    if (profileId) filter.profileId = profileId;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lt = new Date(to);
    }
    if (q) {
      const rx = new RegExp(esc(String(q).slice(0, 100)), "i");
      filter.$or = [{ companyName: rx }, { domain: rx }, { location: rx }];
    }
    const size = Math.min(200, Math.max(1, Number(limit) || 50));
    const pg = Math.max(1, Number(page) || 1);
    const [rows, total] = await Promise.all([
      Prospect.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * size).limit(size).lean(),
      Prospect.countDocuments(filter),
    ]);
    const items = await Promise.all(
      rows.map(async (p) => ({
        ...p,
        contact: await ProspectContact.findOne({ prospectId: p._id, primary: true }).select("name title email confidence").lean(),
      })),
    );
    return { items, total, page: pg, limit: size };
  }

  async function getProspect(id) {
    const p = await Prospect.findById(id).lean();
    if (!p) throw new ReviewError(404, "Prospect not found.");
    const [contacts, drafts, profile] = await Promise.all([
      ProspectContact.find({ prospectId: p._id }).sort({ primary: -1 }).lean(),
      OutreachDraft.find({ prospectId: p._id }).sort({ createdAt: -1 }).lean(),
      IdealCustomerProfile.findById(p.profileId).select("key segment").lean(),
    ]);
    return { ...p, contacts, drafts, profile };
  }

  /* ───────────────────────────── stats ───────────────────────────── */

  /** Counts for the stats strip, over [from, to), optionally for one profile. */
  async function stats({ from, to, profileId } = {}) {
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lt = new Date(to);
    const within = (field) => (Object.keys(range).length ? { [field]: range } : { [field]: { $ne: null } });
    const p = profileId ? { profileId } : {};

    const [found, approved, rejected, replied, booked, pending] = await Promise.all([
      Prospect.countDocuments({ ...p, ...(Object.keys(range).length ? { createdAt: range } : {}) }),
      OutreachDraft.countDocuments({ ...p, status: "approved", ...within("reviewedAt") }),
      OutreachDraft.countDocuments({ ...p, status: "rejected", ...within("reviewedAt") }),
      Prospect.countDocuments({ ...p, ...within("repliedAt") }),
      Prospect.countDocuments({ ...p, ...within("bookedAt") }),
      OutreachDraft.countDocuments({ ...p, status: "pending_review" }),
    ]);
    return { found, approved, rejected, replied, booked, pendingReview: pending };
  }

  /* ───────────────────────────── profiles ───────────────────────────── */

  async function listProfiles() {
    const rows = await IdealCustomerProfile.find({}).sort({ segment: 1 }).lean();
    return Promise.all(rows.map(async (r) => ({ ...r, prospects: await Prospect.countDocuments({ profileId: r._id }) })));
  }

  function cleanProfile(body) {
    const out = {};
    for (const k of PROFILE_FIELDS) if (body?.[k] !== undefined) out[k] = body[k];
    for (const k of LIST_FIELDS) {
      if (out[k] !== undefined) {
        const arr = Array.isArray(out[k]) ? out[k] : String(out[k]).split(/[\n,]/);
        out[k] = arr.map((s) => String(s).trim()).filter(Boolean);
      }
    }
    if (out.targetProduct !== undefined && !PROSPECT_PRODUCTS.includes(out.targetProduct)) {
      throw new ReviewError(400, `Target product must be one of: ${PROSPECT_PRODUCTS.join(", ")}.`);
    }
    if (out.active !== undefined) out.active = !!out.active;
    return out;
  }

  async function createProfile(body) {
    const data = cleanProfile(body);
    const key = String(body?.key || data.segment || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    if (!key || !data.segment || !data.targetProduct) throw new ReviewError(400, "A profile needs a segment name and a target product.");
    if (await IdealCustomerProfile.exists({ key })) throw new ReviewError(409, "A profile with that name already exists.");
    const [row] = await IdealCustomerProfile.insertMany([{ ...data, key, active: data.active ?? true }]);
    return row;
  }

  async function updateProfile(id, body) {
    const data = cleanProfile(body);
    if (data.segment !== undefined && !String(data.segment).trim()) throw new ReviewError(400, "The segment name can't be empty.");
    const row = await IdealCustomerProfile.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).lean();
    if (!row) throw new ReviewError(404, "Profile not found.");
    return row;
  }

  /* ─────────────────────── admin: suppression & deletion ─────────────────────── */

  /**
   * Adds an email (via the permanent opt-out) or a whole domain to the
   * suppression list, e.g. when someone asked by phone or from another inbox.
   */
  async function suppress({ email, domain, note = "", by = "" } = {}) {
    if (email) {
      const address = normaliseEmail(email);
      if (!address) throw new ReviewError(400, "That is not a valid email address.");
      return { kind: "email", ...(await store.optOut(address, { by, note })) };
    }
    if (domain) {
      const d = normaliseDomain(domain);
      if (!d) throw new ReviewError(400, "That is not a valid domain.");
      await Suppression.updateOne({ kind: "domain", domain: d }, { $setOnInsert: { kind: "domain", domain: d, reason: "manual", note, addedBy: by } }, { upsert: true });
      await Prospect.updateMany({ domain: d, status: { $nin: ["opted_out"] } }, { $set: { status: "opted_out", statusNote: "Domain suppressed by an admin." } });
      const ps = await Prospect.find({ domain: d }).select("_id").lean();
      if (ps.length) {
        await OutreachDraft.updateMany(
          { prospectId: { $in: ps.map((x) => x._id) }, status: { $in: ["pending_review", "approved"] } },
          { $set: { status: "superseded", rejectReason: "Domain suppressed." } },
        );
      }
      return { kind: "domain", domain: d };
    }
    throw new ReviewError(400, "Give an email or a domain.");
  }

  /** Is this address or domain suppressed? Answers yes/no without listing anyone. */
  async function checkSuppressed({ email, domain } = {}) {
    if (email) {
      const h = hashEmail(email);
      if (!h) throw new ReviewError(400, "That is not a valid email address.");
      return { suppressed: await store.isSuppressed(email) };
    }
    const d = normaliseDomain(domain);
    if (!d) throw new ReviewError(400, "Give an email or a domain.");
    return { suppressed: !!(await Suppression.findOne({ kind: "domain", domain: d }).select("_id").lean()) };
  }

  /** NDPA delete-on-request. See store.deleteProspectData. */
  async function deleteOnRequest(prospectId, { by, note } = {}) {
    const why = String(note || "").trim();
    if (!why) throw new ReviewError(400, "Record where the request came from (for example, the email it arrived in).");
    const out = await store.deleteProspectData(prospectId, { by, note: why.slice(0, 1000) });
    if (!out.deleted) throw new ReviewError(404, "Prospect not found.");
    return out;
  }

  return {
    queue, getDraft, approve, reject, badFit, recordOutcome,
    listProspects, getProspect, stats,
    listProfiles, createProfile, updateProfile,
    suppress, checkSuppressed, deleteOnRequest,
  };
}
