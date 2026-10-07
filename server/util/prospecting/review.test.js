// server/util/prospecting/review.test.js
//
// The approval dashboard's actions, on the in-memory models.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createReview, normaliseEditedEmails, ReviewError } from "./review.js";
import { memoryModels } from "./memoryModels.js";
import { EM_DASH, FOOTER, OPT_OUT, composeEmails } from "./writer.js";
import { hashEmail } from "./normalise.js";

const GOOD = {
  subject: "Your Ikeja mall cost plan",
  first: "Dear Tunde,\n\nI read about your Ikeja mall cost plan. HERON measures from scanned sheets. Could we have a 20 minute call?",
  followUp1: "Dear Tunde,\n\nOne more point. HERON also handles valuations.",
  followUp2: "Dear Tunde,\n\nMy last note. I would be glad to show you HERON.",
};

async function setup() {
  const models = memoryModels();
  const review = createReview(models);
  const [profile] = await models.IdealCustomerProfile.insertMany([{ key: "qs", segment: "QS firms", targetProduct: "heron", active: true }]);
  const [p] = await models.Prospect.insertMany([{
    profileId: profile._id, matchedProduct: "heron", companyName: "Adeyemi QS", domain: "a.example",
    foundDay: "2026-09-26", status: "drafted", sources: [{ url: "https://a.example/about" }],
    createdAt: new Date("2026-09-26T10:00:00Z"),
  }]);
  const [c] = await models.ProspectContact.insertMany([{ prospectId: p._id, name: "Tunde", email: "t@a.example", primary: true }]);
  const [d] = await models.OutreachDraft.insertMany([{
    prospectId: p._id, contactId: c._id, profileId: profile._id, product: "heron",
    emails: composeEmails(GOOD), status: "pending_review", createdAt: new Date("2026-09-26T11:00:00Z"),
  }]);
  return { models, review, profile, p, c, d };
}

const fails = async (promise, status, re) => {
  await assert.rejects(promise, (err) => err instanceof ReviewError && err.status === status && (!re || re.test(err.message)));
};

/* ── the queue ──────────────────────────────────────────────────────── */

test("the queue shows pending drafts with their research and contact", async () => {
  const { review } = await setup();
  const q = await review.queue();
  assert.equal(q.total, 1);
  assert.equal(q.items[0].prospect.companyName, "Adeyemi QS");
  assert.equal(q.items[0].prospect.sources[0].url, "https://a.example/about");
  assert.equal(q.items[0].contact.email, "t@a.example");
  assert.equal(q.items[0].emails.length, 3);
});

/* ── approve ────────────────────────────────────────────────────────── */

test("approve as written moves the draft and the prospect to approved", async () => {
  const { models, review, d, p } = await setup();
  const out = await review.approve(d._id, { by: "reviewer@adlm.example" });
  assert.equal(out.draft.status, "approved");
  assert.equal(out.draft.reviewedBy, "reviewer@adlm.example");
  assert.ok(!out.draft.edited);
  assert.equal(models.Prospect.rows.find((x) => x._id === p._id).status, "approved");
});

test("a draft cannot be approved twice, or approved after rejection", async () => {
  const { review, d } = await setup();
  await review.approve(d._id, { by: "a" });
  await fails(review.approve(d._id, { by: "b" }), 409, /already approved/);
  await fails(review.reject(d._id, { by: "b", reason: "x" }), 409, /already approved/);
});

test("edit then approve keeps the model's original and restores the footer", async () => {
  const { review, d } = await setup();
  const edited = composeEmails(GOOD).map((e) => ({ subject: e.subject, body: e.body }));
  // The reviewer rewrites the first email and deletes the footer by accident.
  edited[0].body = "Dear Tunde,\n\nI saw your Ikeja mall cost plan. Could we have a 20 minute call next Tuesday?";
  const out = await review.approve(d._id, { by: "r", emails: edited });
  assert.equal(out.draft.edited, true);
  assert.equal(out.draft.original[0].body, composeEmails(GOOD)[0].body);
  assert.ok(out.draft.emails[0].body.endsWith(FOOTER));
  assert.ok(out.draft.emails[0].body.startsWith("Dear Tunde,\n\nI saw your Ikeja"));
});

test("a reviewer cannot remove the opt-out line or duplicate it", async () => {
  const { review, d } = await setup();
  const edited = composeEmails(GOOD).map((e) => ({ subject: e.subject, body: e.body.replace(OPT_OUT, `${OPT_OUT}\n\n${OPT_OUT}`) }));
  const out = await review.approve(d._id, { by: "r", emails: edited });
  for (const e of out.draft.emails) assert.equal(e.body.split(OPT_OUT).length - 1, 1);
});

test("a reviewer's em dash blocks the save; style problems only warn", async () => {
  const { review, d } = await setup();
  const withDash = composeEmails(GOOD).map((e) => ({ subject: e.subject, body: e.body }));
  withDash[1].body = `Dear Tunde,\n\nOne more point ${EM_DASH} HERON also handles valuations.`;
  await assert.rejects(review.approve(d._id, { by: "r", emails: withDash }), (err) => err.status === 422 && err.problems.some((p) => /em dash/.test(p)));

  const hype = composeEmails(GOOD).map((e) => ({ subject: e.subject, body: e.body }));
  hype[1].body = "Dear Tunde,\n\nHERON is a revolutionary tool!";
  const out = await review.approve(d._id, { by: "r", emails: hype });
  assert.equal(out.draft.status, "approved");
  assert.ok(out.warnings.some((w) => /Hype words/.test(w)));
  assert.ok(out.warnings.some((w) => /exclamation/.test(w)));
});

test("an unchanged edit is an approve, not an edit", async () => {
  const { review, d } = await setup();
  const same = composeEmails(GOOD).map((e) => ({ subject: e.subject, body: e.body }));
  const out = await review.approve(d._id, { by: "r", emails: same });
  assert.ok(!out.draft.edited);
});

test("someone who opted out while in the queue cannot be approved", async () => {
  const { models, review, d } = await setup();
  await models.Suppression.insertMany([{ kind: "email", emailHash: hashEmail("t@a.example"), reason: "opt_out" }]);
  await fails(review.approve(d._id, { by: "r" }), 409, /suppression list/);
  assert.equal(models.OutreachDraft.rows[0].status, "superseded");
});

test("editing needs all three emails", () => {
  assert.throws(() => normaliseEditedEmails(composeEmails(GOOD), [{ subject: "x", body: "y" }]), /all three/);
});

/* ── reject, bad fit, outcomes ──────────────────────────────────────── */

test("reject needs a reason and records it", async () => {
  const { models, review, d, p } = await setup();
  await fails(review.reject(d._id, { by: "r", reason: "  " }), 400, /why/);
  const out = await review.reject(d._id, { by: "r", reason: "Wrong person, they left the firm" });
  assert.equal(out.draft.rejectReason, "Wrong person, they left the firm");
  assert.equal(models.Prospect.rows.find((x) => x._id === p._id).status, "rejected");
});

test("bad fit withdraws open drafts and keeps the prospect for dedupe", async () => {
  const { models, review, p } = await setup();
  await fails(review.badFit(p._id, { by: "r" }), 400, /why/);
  await review.badFit(p._id, { by: "r", reason: "They are a law firm" });
  assert.equal(models.Prospect.rows[0].status, "bad_fit");
  assert.equal(models.OutreachDraft.rows[0].status, "superseded");
  await fails(review.badFit(p._id, { by: "r", reason: "again" }), 409, /already bad fit/);
});

test("booked implies replied, and the first reply date is kept", async () => {
  const { models, review, p } = await setup();
  await review.recordOutcome(p._id, { outcome: "replied", at: new Date("2026-10-01T09:00:00Z") });
  await review.recordOutcome(p._id, { outcome: "booked", at: new Date("2026-10-02T09:00:00Z") });
  const row = models.Prospect.rows[0];
  assert.equal(row.status, "booked");
  assert.equal(row.repliedAt.toISOString(), "2026-10-01T09:00:00.000Z");
  assert.equal(row.bookedAt.toISOString(), "2026-10-02T09:00:00.000Z");
  await fails(review.recordOutcome(p._id, { outcome: "sent" }), 400);
});

test("no outcome can be recorded for someone who opted out", async () => {
  const { models, review, p } = await setup();
  models.Prospect.rows[0].status = "opted_out";
  await fails(review.recordOutcome(p._id, { outcome: "replied" }), 409);
});

/* ── table and stats ────────────────────────────────────────────────── */

test("the prospect table filters by profile, status, date and search", async () => {
  const { review, profile } = await setup();
  assert.equal((await review.listProspects({ profileId: profile._id })).total, 1);
  assert.equal((await review.listProspects({ status: "new" })).total, 0);
  assert.equal((await review.listProspects({ from: "2026-09-27" })).total, 0);
  assert.equal((await review.listProspects({ from: "2026-09-26", to: "2026-09-27" })).total, 1);
  assert.equal((await review.listProspects({ q: "adeyemi" })).total, 1);
  assert.equal((await review.listProspects({ q: "a.b(" })).total, 0, "search text is escaped, not a pattern");
  const row = (await review.listProspects({})).items[0];
  assert.equal(row.contact.email, "t@a.example");
});

test("stats count found, approved, rejected, replied, booked and the queue", async () => {
  const { review, d, p } = await setup();
  assert.deepEqual(await review.stats({}), { found: 1, approved: 0, rejected: 0, replied: 0, booked: 0, pendingReview: 1 });
  await review.approve(d._id, { by: "r" });
  await review.recordOutcome(p._id, { outcome: "booked" });
  assert.deepEqual(await review.stats({}), { found: 1, approved: 1, rejected: 0, replied: 1, booked: 1, pendingReview: 0 });
  const earlier = await review.stats({ from: "2020-01-01", to: "2020-02-01" });
  assert.deepEqual(earlier, { found: 0, approved: 0, rejected: 0, replied: 0, booked: 0, pendingReview: 0 });
});

/* ── profiles ───────────────────────────────────────────────────────── */

test("profiles are created and edited, lists cleaned, bad products refused", async () => {
  const { review } = await setup();
  const created = await review.createProfile({ segment: "MEP contractors in Port Harcourt", targetProduct: "mep", jobTitles: "Head of MEP, Estimator\n" });
  assert.equal(created.key, "mep-contractors-in-port-harcourt");
  assert.deepEqual(created.jobTitles, ["Head of MEP", "Estimator"]);
  await fails(review.createProfile({ segment: "MEP contractors in Port Harcourt", targetProduct: "mep" }), 409);
  await fails(review.createProfile({ segment: "X", targetProduct: "civiq" }), 400, /Target product/);
  const updated = await review.updateProfile(created._id, { active: false, keywords: ["HVAC"] });
  assert.equal(updated.active, false);
  assert.deepEqual(updated.keywords, ["HVAC"]);
  const all = await review.listProfiles();
  assert.equal(all.length, 2);
});

/* ── admin: suppression and deletion ────────────────────────────────── */

test("an admin can suppress an email; it stops the firm and is checkable", async () => {
  const { models, review } = await setup();
  await review.suppress({ email: "T@A.example", by: "admin", note: "Asked by phone" });
  assert.equal(models.Prospect.rows[0].status, "opted_out");
  assert.equal(models.OutreachDraft.rows[0].status, "superseded");
  assert.deepEqual(await review.checkSuppressed({ email: "t@a.example" }), { suppressed: true });
  assert.deepEqual(await review.checkSuppressed({ email: "other@a.example" }), { suppressed: false });
});

test("an admin can suppress a whole domain", async () => {
  const { models, review } = await setup();
  await review.suppress({ domain: "https://www.A.example/contact", by: "admin" });
  assert.equal(models.Suppression.rows[0].domain, "a.example");
  assert.equal(models.Prospect.rows[0].status, "opted_out");
  assert.deepEqual(await review.checkSuppressed({ domain: "a.example" }), { suppressed: true });
  // Anyone at that domain is now suppressed too.
  assert.deepEqual(await review.checkSuppressed({ email: "new@a.example" }), { suppressed: true });
});

test("delete-on-request needs a note, erases everything and leaves only hashes", async () => {
  const { models, review, p } = await setup();
  await fails(review.deleteOnRequest(p._id, { by: "admin" }), 400, /where the request came from/);
  const out = await review.deleteOnRequest(p._id, { by: "admin", note: "Email from Tunde, 26 Sep" });
  assert.equal(out.deleted, true);
  assert.equal(models.Prospect.rows.length, 0);
  assert.equal(models.ProspectContact.rows.length, 0);
  assert.equal(models.OutreachDraft.rows.length, 0);
  assert.ok(!JSON.stringify(models.Suppression.rows).includes("t@a.example"));
  await fails(review.deleteOnRequest(p._id, { by: "admin", note: "again" }), 404);
});
