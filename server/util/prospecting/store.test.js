// server/util/prospecting/store.test.js
//
// The database side of dedupe, opt-out, deletion and the daily cap, run
// against the in-memory models (memoryModels.js) so the tests never touch
// Atlas (local dev shares the production cluster).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { hashEmail } from "./normalise.js";
import { memoryModels } from "./memoryModels.js";

function setup() {
  const models = memoryModels();
  return { models, store: createStore(models) };
}

// For the race test: a query that returns nothing, like a read that ran
// before the other writer committed.
const emptyQuery = () => ({ select() { return this; }, lean: async () => [] });

const profile = { _id: "profile1", targetProduct: "heron" };
const firm = (d) => ({ companyName: d, website: `https://www.${d}`, sources: [{ url: `https://${d}` }] });
const NOON_LAGOS = new Date("2026-09-26T11:00:00Z");

/* ── daily cap ───────────────────────────────────────────────────────── */

test("a run adds no more than the cap", async () => {
  const { models, store } = setup();
  const res = await store.addProspects({
    profile, candidates: ["a.com", "b.com", "c.com"].map(firm), cap: 2, now: NOON_LAGOS,
  });
  assert.equal(res.inserted.length, 2);
  assert.equal(models.Prospect.rows.length, 2);
  assert.equal(res.skipped[0].reason, "daily_cap");
});

test("the cap is per Lagos day and shared across runs and profiles", async () => {
  const { models, store } = setup();
  await store.addProspects({ profile, candidates: ["a.com", "b.com"].map(firm), cap: 3, now: NOON_LAGOS });
  const other = { _id: "profile2", targetProduct: "rategen" };
  const second = await store.addProspects({ profile: other, candidates: ["c.com", "d.com"].map(firm), cap: 3, now: NOON_LAGOS });
  assert.equal(second.foundToday, 2);
  assert.equal(second.inserted.length, 1);

  // Next Lagos day, the cap is fresh.
  const tomorrow = await store.addProspects({
    profile, candidates: [firm("e.com")], cap: 3, now: new Date("2026-09-27T11:00:00Z"),
  });
  assert.equal(tomorrow.inserted.length, 1);
  assert.equal(models.Prospect.rows.length, 4);
});

test("inserted prospects carry the profile, product, Lagos day and status new", async () => {
  const { models, store } = setup();
  await store.addProspects({ profile, candidates: [firm("a.com")], now: NOON_LAGOS, runId: "run-1" });
  const [p] = models.Prospect.rows;
  assert.equal(p.domain, "a.com");
  assert.equal(p.profileId, "profile1");
  assert.equal(p.matchedProduct, "heron");
  assert.equal(p.foundDay, "2026-09-26");
  assert.equal(p.status, "new");
  assert.equal(p.finderRunId, "run-1");
});

/* ── deduplication ───────────────────────────────────────────────────── */

test("a company found again on a later day is not added twice", async () => {
  const { models, store } = setup();
  await store.addProspects({ profile, candidates: [firm("a.com")], now: NOON_LAGOS });
  const again = await store.addProspects({ profile, candidates: [{ website: "http://A.com/team" }], now: NOON_LAGOS });
  assert.equal(again.inserted.length, 0);
  assert.equal(again.skipped[0].reason, "already_a_prospect");
  assert.equal(models.Prospect.rows.length, 1);
});

test("losing an insert race to another writer is a skip, not a crash", async () => {
  const { models, store } = setup();
  // Another writer inserts a.com between our read and our insert.
  const realFind = models.Prospect.find;
  models.Prospect.find = (q) => {
    models.Prospect.rows.push({ _id: "raced", domain: "a.com", foundDay: "2026-09-25" });
    models.Prospect.find = realFind;
    return emptyQuery();
  };
  const res = await store.addProspects({ profile, candidates: [firm("a.com"), firm("b.com")], now: NOON_LAGOS });
  assert.deepEqual(res.inserted.map((p) => p.domain), ["b.com"]);
  assert.ok(res.skipped.some((s) => s.domain === "a.com" && s.reason === "already_a_prospect"));
});

test("a contact already stored under another company is not stored again", async () => {
  const { models, store } = setup();
  await store.addContacts({ prospect: { _id: "p1" }, contacts: [{ email: "ade@a.com" }] });
  const res = await store.addContacts({ prospect: { _id: "p2" }, contacts: [{ email: "ADE@a.com" }, { email: "bola@a.com" }] });
  assert.deepEqual(res.inserted.map((c) => c.email), ["bola@a.com"]);
  assert.equal(models.ProspectContact.rows.length, 2);
});

/* ── opt-out ─────────────────────────────────────────────────────────── */

async function seededFirm(store, models) {
  const { inserted: [p] } = await store.addProspects({ profile, candidates: [firm("a.com")], now: NOON_LAGOS });
  await store.addContacts({ prospect: p, contacts: [{ email: "ade@a.com" }, { email: "bola@a.com" }] });
  models.OutreachDraft.rows.push(
    { _id: "d1", prospectId: p._id, status: "pending_review" },
    { _id: "d2", prospectId: p._id, status: "approved" },
    { _id: "d3", prospectId: p._id, status: "rejected" },
  );
  return p;
}

test("opting out suppresses the address, stops the firm and withdraws unsent drafts", async () => {
  const { models, store } = setup();
  const p = await seededFirm(store, models);

  const res = await store.optOut("  ADE@a.com ", { by: "reply-handler" });
  assert.equal(res.emailHash, hashEmail("ade@a.com"));

  const sup = models.Suppression.rows;
  assert.equal(sup.length, 1);
  assert.equal(sup[0].reason, "opt_out");
  assert.equal(sup[0].emailHash, hashEmail("ade@a.com"));
  assert.ok(!JSON.stringify(sup).includes("ade@a.com"), "the suppression list holds a hash, not the address");

  assert.equal(models.Prospect.rows.find((r) => r._id === p._id).status, "opted_out");
  const status = Object.fromEntries(models.OutreachDraft.rows.map((d) => [d._id, d.status]));
  assert.deepEqual(status, { d1: "superseded", d2: "superseded", d3: "rejected" });
});

test("opting out twice is harmless and keeps one suppression row", async () => {
  const { models, store } = setup();
  await seededFirm(store, models);
  await store.optOut("ade@a.com");
  await store.optOut("Ade@A.com");
  assert.equal(models.Suppression.rows.length, 1);
});

test("an opt-out from someone we never stored is still recorded", async () => {
  const { models, store } = setup();
  const res = await store.optOut("stranger@elsewhere.com");
  assert.equal(res.contacts, 0);
  assert.equal(models.Suppression.rows.length, 1);
  assert.ok(await store.isSuppressed("Stranger@Elsewhere.com"));
});

test("an opted-out person is refused when Hunter finds them again", async () => {
  const { store } = setup();
  await store.optOut("ade@a.com");
  const res = await store.addContacts({ prospect: { _id: "p9" }, contacts: [{ email: "ade@a.com" }] });
  assert.equal(res.inserted.length, 0);
  assert.equal(res.skipped[0].reason, "suppressed");
});

test("an opted-out firm is not re-added by the finder", async () => {
  const { store } = setup();
  const { inserted: [p] } = await store.addProspects({ profile, candidates: [firm("a.com")], now: NOON_LAGOS });
  await store.addContacts({ prospect: p, contacts: [{ email: "ade@a.com" }] });
  await store.optOut("ade@a.com");
  // A month later the finder turns the same firm up again.
  const again = await store.addProspects({ profile, candidates: [firm("a.com")], now: new Date("2026-10-30T11:00:00Z") });
  assert.equal(again.inserted.length, 0);
});

test("optOut refuses something that is not an email", async () => {
  const { store } = setup();
  await assert.rejects(store.optOut("not an email"), /valid email/);
});

/* ── delete on request (NDPA) ────────────────────────────────────────── */

test("deleting a prospect erases its data but keeps it suppressed", async () => {
  const { models, store } = setup();
  const p = await seededFirm(store, models);

  const res = await store.deleteProspectData(p._id, { by: "admin@adlmstudio.net", note: "Email request 26 Sep" });
  assert.deepEqual(
    { deleted: res.deleted, contacts: res.contacts, drafts: res.drafts, suppressed: res.suppressed },
    { deleted: true, contacts: 2, drafts: 3, suppressed: 3 },
  );
  assert.equal(models.Prospect.rows.length, 0);
  assert.equal(models.ProspectContact.rows.length, 0);
  assert.equal(models.OutreachDraft.rows.length, 0);

  const sup = models.Suppression.rows;
  assert.ok(sup.every((r) => r.reason === "deletion_request"));
  assert.ok(!JSON.stringify(sup).includes("ade@a.com"), "no address survives the deletion");

  // And it stays gone: neither the firm nor its people can come back.
  const again = await store.addProspects({ profile, candidates: [firm("a.com")], now: NOON_LAGOS });
  assert.equal(again.skipped[0].reason, "suppressed");
  const people = await store.addContacts({ prospect: { _id: "px" }, contacts: [{ email: "ade@a.com" }, { email: "new@a.com" }] });
  assert.equal(people.inserted.length, 0);
});

test("a deletion after an opt-out keeps the original opt-out reason", async () => {
  const { models, store } = setup();
  const p = await seededFirm(store, models);
  await store.optOut("ade@a.com");
  await store.deleteProspectData(p._id);
  const ade = models.Suppression.rows.find((r) => r.emailHash === hashEmail("ade@a.com"));
  assert.equal(ade.reason, "opt_out");
});

test("deleting a prospect that is not there reports deleted:false", async () => {
  const { store } = setup();
  assert.deepEqual(await store.deleteProspectData("missing"), { deleted: false });
});

test("the suppression is written before anything is deleted", async () => {
  const { models, store } = setup();
  const p = await seededFirm(store, models);
  models.Suppression.bulkWrite = async () => { throw new Error("Atlas down"); };
  await assert.rejects(store.deleteProspectData(p._id), /Atlas down/);
  assert.equal(models.Prospect.rows.length, 1, "nothing was deleted without its suppression");
  assert.equal(models.ProspectContact.rows.length, 2);
});
