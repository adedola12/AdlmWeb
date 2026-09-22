// server/util/releaseDigest.test.js
//
// The weekly release digest (util/releaseDigest.js), driven for real against
// the in-memory store the per-release tests use (releaseNotifier.memoryStore.js):
// one notice per key, one digest per key, one ledger row per (digest, customer)
// and per (digest, address), claims that only succeed on a pending row. SES is
// a stub everywhere: nothing here can send mail or reach AWS, and nothing
// touches a database.
//
// The clock is injected. Week 40 of 2026 is Monday 28 September to Sunday 4
// October; its digest slot is Monday 09:00 in Lagos, which is 08:00 UTC.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createManualNotice,
  recordDeploymentRelease,
  runReleaseNoticeDrain,
  sendReleaseNotice,
} from "./releaseNotifier.js";
import {
  cancelQueuedNotice,
  createManualHubNotice,
  decideHubNotice,
  digestSchedule,
  digestStatus,
  digestWindow,
  formatLagos,
  hubVersionFromUrl,
  isDigestEnabled,
  nextDigestAt,
  nextDigestRun,
  previewDigest,
  previewSendNow,
  recordInstallerHubChange,
  runReleaseDigestTick,
  sendDigestNow,
  tzOffsetMs,
  updatesFor,
  digestAudienceFilter,
  HUB_AUDIENCE_KEYS,
  withNextDigest,
} from "./releaseDigest.js";
import { buildDigestMessage, digestSubject, HUB_PRODUCT } from "./releaseDigestEmail.js";
import { productFor, LEGAL_LINE } from "./releaseEmail.js";
import { readTopicUnsubscribeToken } from "./campaigns.js";
import {
  memoryStore,
  quiet,
  noPause,
  live,
  person,
  PRODUCTION,
  stubSes,
  sesErr,
  put,
} from "./releaseNotifier.memoryStore.js";

process.env.API_BASE_URL = "https://api.adlmstudio.net";
const ENV = [
  "DRY_RUN",
  "MAIL_SEND_RATE_PER_SEC",
  "RELEASE_HOLD_MS",
  "RELEASE_DIGEST_ENABLED",
  "RELEASE_DIGEST_DOW",
  "RELEASE_DIGEST_HOUR",
  "RELEASE_DIGEST_WINDOW_HOURS",
];
for (const k of ENV) delete process.env[k];
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
});

const SCHEDULE = digestSchedule({}); // Monday 09:00 Lagos, started within 6 h
const MIN = 60 * 1000;

const TONIGHT = "2026-09-21T21:00:00.000Z"; // Mon 21 Sep 2026, 22:00 WAT: a deploy tonight
const SAT_W39 = "2026-09-26T10:00:00.000Z"; // the week's releases land on Saturday
const MON_W40 = "2026-09-28T08:00:00.000Z"; // Mon 28 Sep 2026, 09:00 WAT
const MON_W41 = "2026-10-05T08:00:00.000Z";

const at = (iso) => () => new Date(iso);
const plus = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * MIN).toISOString();

const rategen = (version, extra = {}) =>
  put(version, { productKey: "rategen", displayName: "", packageUri: "https://cdn.test/r.zip", ...extra });
const mep = (version, extra = {}) => put(version, { productKey: "mep", displayName: "", packageUri: "https://cdn.test/m.zip", ...extra });

/** What the deployment PUT does, in miniature (as in releaseNotifier.test.js). */
async function deploy(store, item, { previous, body = {}, when = SAT_W39 } = {}) {
  const key = item.productKey;
  const before = previous !== undefined ? previous : (store.deployments.get(key) ?? null);
  store.deployments.set(key, { ...item });
  return recordDeploymentRelease({ previous: before, item, body, store, log: quiet, now: at(when) });
}

/** QUIV 3.1.10 -> 3.1.11 and RateGen 2.9.1 -> 2.9.2, the same week. */
async function twoReleases(store, when = SAT_W39) {
  await deploy(store, put("3.1.11"), { previous: put("3.1.10"), when });
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1"), when });
}

const quivOnly = (n, over = {}) => person(n, { entitlements: [live("revit")], ...over });
const rategenOnly = (n, over = {}) => person(n, { entitlements: [live("rategen")], ...over });
const both = (n, over = {}) => person(n, { entitlements: [live("revit"), live("rategen")], ...over });

const opts = (store, ses, extra = {}) => ({
  store,
  send: ses.send,
  sesAccount: async () => PRODUCTION,
  pause: noPause,
  log: quiet,
  lock: false,
  dryRun: false,
  holdMs: 0,
  enabled: true,
  schedule: SCHEDULE,
  ...extra,
});

/** One fifteen-minute tick at `iso`. */
const tick = (store, ses, iso, extra = {}) => runReleaseDigestTick({ ...opts(store, ses, extra), now: at(iso) });

const to = (ses) => ses.calls.map((m) => m.to[0]).sort();
const mailTo = (ses, email) => ses.calls.filter((m) => m.to[0] === email);
const LEGAL_TEXT = LEGAL_LINE.replace(/&amp;/g, "&");

/* ═══════════════════════════════════════════════════════════ the clock ══ */

test("Monday 09:00 in Lagos is 08:00 UTC, whatever the UTC date says, and across the ISO year end", () => {
  assert.equal(tzOffsetMs(new Date(MON_W40)), 60 * MIN, "WAT is UTC+1");

  const w = digestWindow(new Date(MON_W40), SCHEDULE);
  assert.equal(w.key, "digest@2026-W40");
  assert.equal(w.slotAt.toISOString(), MON_W40);
  assert.equal(w.windowEndsAt.toISOString(), "2026-09-28T14:00:00.000Z");
  assert.equal(w.open, true);

  const justBefore = digestWindow(new Date("2026-09-28T07:59:59.000Z"), SCHEDULE);
  assert.equal(justBefore.before, true);
  assert.equal(justBefore.open, false);

  // 23:30 UTC on Sunday is already 00:30 on Monday in Lagos: week 40, before its slot.
  const lagosMonday = digestWindow(new Date("2026-09-27T23:30:00.000Z"), SCHEDULE);
  assert.equal(lagosMonday.key, "digest@2026-W40");
  assert.equal(lagosMonday.before, true);
  // 22:30 UTC on Sunday is 23:30 on Sunday in Lagos: still week 39, whose window has passed.
  const lagosSunday = digestWindow(new Date("2026-09-27T22:30:00.000Z"), SCHEDULE);
  assert.equal(lagosSunday.key, "digest@2026-W39");
  assert.equal(lagosSunday.open || lagosSunday.before, false);

  // The window: open from the slot for six hours, then shut.
  assert.equal(digestWindow(new Date("2026-09-28T13:59:59.000Z"), SCHEDULE).open, true);
  assert.equal(digestWindow(new Date("2026-09-28T14:00:00.000Z"), SCHEDULE).open, false);

  // ISO weeks at the year end: 2026 has 53.
  assert.equal(digestWindow(new Date("2026-12-28T08:30:00.000Z"), SCHEDULE).key, "digest@2026-W53");
  assert.equal(digestWindow(new Date("2027-01-04T08:30:00.000Z"), SCHEDULE).key, "digest@2027-W01");

  // Another day and hour: Sunday 18:00 Lagos is 17:00 UTC; Friday 00:00 Lagos is Thursday 23:00 UTC.
  const sunday = digestSchedule({ RELEASE_DIGEST_DOW: "0", RELEASE_DIGEST_HOUR: "18" });
  const s = digestWindow(new Date("2026-09-23T12:00:00.000Z"), sunday);
  assert.equal(s.slotAt.toISOString(), "2026-09-27T17:00:00.000Z");
  assert.equal(s.key, "digest@2026-W39");
  const friday = digestSchedule({ RELEASE_DIGEST_DOW: "5", RELEASE_DIGEST_HOUR: "0" });
  assert.equal(digestWindow(new Date("2026-09-23T12:00:00.000Z"), friday).slotAt.toISOString(), "2026-09-24T23:00:00.000Z");

  // Nonsense falls back to Monday 09:00 for 6 h, never to "now".
  assert.deepEqual(
    digestSchedule({ RELEASE_DIGEST_DOW: "7", RELEASE_DIGEST_HOUR: "25", RELEASE_DIGEST_WINDOW_HOURS: "soon" }),
    { dow: 1, hour: 9, windowHours: 6, tz: "Africa/Lagos" },
  );
  assert.equal(formatLagos(new Date(MON_W40)), "Mon 28 Sep 2026, 09:00 WAT");
});

test("a deploy tonight (Mon 21 Sep 2026, 22:00 WAT) fires nothing: this morning's window has passed, the first digest is Mon 28 Sep 09:00 WAT", async () => {
  const w = digestWindow(new Date(TONIGHT), SCHEDULE);
  assert.equal(w.key, "digest@2026-W39");
  assert.equal(w.open, false);
  assert.equal(w.before, false);

  const next = nextDigestAt(new Date(TONIGHT), { schedule: SCHEDULE });
  assert.equal(next.at.toISOString(), MON_W40);
  assert.equal(formatLagos(next.at), "Mon 28 Sep 2026, 09:00 WAT");
  assert.equal(next.dueNow, false);

  // With releases already queued (say, recorded under the old code this
  // weekend), on a store no tick has seen yet: exactly a fresh deploy.
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2)], armedAt: null });
  const ses = stubSes();
  await twoReleases(store, "2026-09-20T10:00:00.000Z");
  const out = await tick(store, ses, TONIGHT);
  assert.equal(store.state.armedAt.toISOString(), TONIGHT, "the first tick arms the digest");
  assert.equal(out.skipped, true);
  assert.equal(out.reason, "window-passed");
  assert.equal(out.nextAt, MON_W40);
  assert.equal(out.nextAtLagos, "Mon 28 Sep 2026, 09:00 WAT");
  assert.equal(ses.calls.length, 0);
  assert.equal(store.digests.size, 0, "not even an empty week is recorded");

  // The status an admin sees tonight says the same.
  const status = await digestStatus({ store, now: at(TONIGHT), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.equal(status.nextRunAt, MON_W40);
  assert.equal(status.nextRunLagos, "Mon 28 Sep 2026, 09:00 WAT");
  assert.equal(status.thisWeek.key, "digest@2026-W39");
  assert.equal(status.thisWeek.status, null);
  assert.deepEqual(status.queued.map((u) => u.key).sort(), ["rategen@2.9.2", "revit@3.1.11"]);
  assert.equal(status.recipientsEstimate, 2);
  assert.equal(status.armedAt, TONIGHT);

  // Every tick until the slot does nothing; the first tick at the slot sends.
  for (let t = new Date(TONIGHT).getTime() + 15 * MIN; t < new Date(MON_W40).getTime(); t += 15 * MIN) {
    assert.equal((await tick(store, ses, new Date(t).toISOString())).skipped, true);
  }
  assert.equal(ses.calls.length, 0);
  const monday = await tick(store, ses, plus(MON_W40, 7)); // a rate(15 minutes) tick lands at any minute
  assert.equal(monday.started, "digest@2026-W40");
  assert.equal(ses.calls.length, 2);
});

test("a first deploy inside a Monday window fires nothing that week: the digest arms on its first tick and starts at the next slot", async () => {
  // Deployed Mon 28 Sep 2026 at 10:00 WAT, inside that morning's window, with releases queued.
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2)], armedAt: null });
  const ses = stubSes();
  await twoReleases(store);
  const deployedAt = plus(MON_W40, 60);

  // Before the first tick an admin is told next week, not "now".
  const before = await digestStatus({ store, now: at(deployedAt), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.equal(before.armedAt, null);
  assert.equal(before.nextRunAt, MON_W41);

  // A DRY_RUN tick says the same and does not arm.
  const dry = await tick(store, ses, deployedAt, { dryRun: true });
  assert.equal(dry.reason, "armed-after-slot");
  assert.equal(store.state.armedAt, null);

  for (let m = 60; m < 6 * 60; m += 15) {
    const out = await tick(store, ses, plus(MON_W40, m));
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "armed-after-slot");
    assert.equal(out.nextAt, MON_W41);
  }
  assert.equal(store.state.armedAt.toISOString(), deployedAt);
  assert.equal(ses.calls.length, 0);
  assert.equal(store.digests.size, 0);
  assert.equal((await nextDigestRun({ store, now: at(plus(MON_W40, 90)), schedule: SCHEDULE })).at, MON_W41);

  const next = await tick(store, ses, MON_W41);
  assert.equal(next.started, "digest@2026-W41");
  assert.equal(ses.calls.length, 2);
});

/* ═════════════════════════════════════════ migrating from the per-release email ══ */

test("migration: a release already mailed per release is never in the digest, and a hub link set before the deploy makes no hub item", async () => {
  // Tuesday morning, on the old code: the owner announces QUIV 3.1.11 by hand
  // (POST /admin/release-notifications, then /send) with a line about
  // Installation Center 1.0.3, and points the dashboard at the 1.0.3 file.
  // RateGen 2.9.2 went out part way. MEP 1.8.5 is recorded minutes before the
  // deploy, before the old drain reached it.
  const TUE = "2026-09-22T08:00:00.000Z";
  const HUB_SET = "https://cdn.test/adlm/installer-hub/1726990000000-ADLMInstallerHub-v1.0.3.zip";
  const store = memoryStore({
    hubUrl: HUB_SET,
    armedAt: null,
    users: [quivOnly(1), rategenOnly(2), both(3), person(4, { entitlements: [live("mep")] })],
  });
  const ses = stubSes();
  const legacy = { store, send: ses.send, sesAccount: async () => PRODUCTION, pause: noPause, log: quiet, dryRun: false, now: at(TUE) };
  store.deployments.set("revit", put("3.1.11"));
  await createManualNotice({
    productKey: "revit",
    version: "3.1.11",
    releaseNotes: "- Installation Center 1.0.3 is out too",
    store,
    log: quiet,
    now: at(TUE),
  });
  assert.equal((await sendReleaseNotice("revit@3.1.11", { ...legacy, resume: true })).status, "done");
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1"), when: TUE });
  assert.equal((await sendReleaseNotice("rategen@2.9.2", { ...legacy, limit: 1 })).status, "sending");
  await deploy(store, mep("1.8.5"), { previous: mep("1.8.4"), when: "2026-09-22T20:50:00.000Z" });
  const mailedBefore = ses.calls.length;

  // The digest is deployed that night; its first tick arms it.
  await tick(store, ses, "2026-09-22T21:05:00.000Z");
  // Saving the Hub settings again after the deploy records nothing, nor does a
  // re-upload of the same version under a new name.
  assert.equal((await recordInstallerHubChange({ previousUrl: HUB_SET, nextUrl: HUB_SET, store, log: quiet })).reason, "unchanged");
  const reupload = "https://cdn.test/adlm/installer-hub/1727100000000-ADLMInstallerHub-v1.0.3.zip";
  assert.equal(
    (await recordInstallerHubChange({ previousUrl: HUB_SET, nextUrl: reupload, store, log: quiet })).reason,
    "same-version",
  );

  const out = await tick(store, ses, MON_W40);
  assert.equal(out.status, "done");
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys, ["mep@1.8.5"]);
  assert.deepEqual(
    ses.calls.slice(mailedBefore).map((m) => [m.to[0], m.subject]),
    [["user4@firm.test", "ADLM MEP 1.8.5 is ready — update from the Installation Center"]],
    "QUIV and RateGen holders hear nothing again",
  );
  assert.ok(![...store.notices.keys()].some((k) => k.startsWith("hub@")), "no hub item made after the fact");
  assert.equal(store.notices.get("revit@3.1.11").status, "done");
  assert.ok(!store.notices.get("revit@3.1.11").digestKey);

  // The part-sent RateGen email is flagged for an admin, never finished on a timer.
  const status = await digestStatus({ store, now: at(plus(MON_W40, 5)), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.deepEqual(status.legacyInProgress, [{ key: "rategen@2.9.2", status: "sending", enrolled: true }]);
  await tick(store, ses, MON_W41);
  assert.equal(store.notices.get("rategen@2.9.2").status, "sending");
});

test("a release SES refused before anybody was mailed goes in the next digest; one refused part way does not", async () => {
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2), rategenOnly(3)] });
  const ses = stubSes();
  await twoReleases(store);
  const legacy = { store, pause: noPause, log: quiet, dryRun: false, now: at(SAT_W39), resume: true };

  // QUIV: refused by a sandboxed account before anything was enrolled.
  const sandbox = async () => ({ ...PRODUCTION, ProductionAccessEnabled: false });
  const refused = await sendReleaseNotice("revit@3.1.11", { ...legacy, send: ses.send, sesAccount: sandbox });
  assert.equal(refused.status, "failed");
  assert.equal(store.notices.get("revit@3.1.11").enrolledAt, null);

  // RateGen: one message out, then access denied.
  let n = 0;
  const denying = stubSes({ failFor: () => (++n > 1 ? sesErr("AccessDeniedException", "not authorized", 403) : null) });
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  const partWay = await sendReleaseNotice("rategen@2.9.2", { ...legacy, send: denying.send, sesAccount: async () => PRODUCTION });
  delete process.env.MAIL_SEND_RATE_PER_SEC;
  assert.equal(partWay.status, "failed");
  assert.equal(partWay.counts.sent, 1);

  const out = await tick(store, ses, MON_W40);
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys, ["revit@3.1.11"]);
  assert.deepEqual(to(ses), ["user1@firm.test"]);
  assert.equal(out.status, "done");
  assert.equal(store.notices.get("rategen@2.9.2").status, "failed", "left for an admin");
});

test("a notice a digest carried and then cancelled is never queued again, even when the same build comes back", async () => {
  const store = memoryStore({ users: Array.from({ length: 4 }, (_, i) => both(i + 1)) });
  const ses = stubSes();
  await twoReleases(store);

  await tick(store, ses, MON_W40, { limit: 2 }); // two customers have both
  store.deployments.set("rategen", rategen("2.9.2", { enabled: false })); // pulled
  await tick(store, ses, plus(MON_W40, 15));
  assert.equal(store.notices.get("rategen@2.9.2").status, "cancelled");
  const mails = ses.calls.length;
  assert.equal(mails, 4);

  // Switched back on: two customers already have it, so it is not queued again.
  const back = await deploy(store, rategen("2.9.2"), { when: plus(MON_W40, 60) });
  assert.equal(back.reason, "already-in-digest");
  assert.equal(back.status, "cancelled");
  await assert.rejects(
    createManualNotice({ productKey: "rategen", version: "2.9.2", store, log: quiet }),
    (err) => err.status === 409 && err.details.code === "already-in-digest",
  );
  const next = await tick(store, ses, MON_W41);
  assert.equal(next.status, "empty");
  assert.equal(ses.calls.length, mails);

  // A newer version is announced as usual.
  await deploy(store, rategen("2.9.3"), { when: plus(MON_W41, 60) });
  assert.equal(store.notices.get("rategen@2.9.3").status, "pending");
});

/* ═════════════════════════════════════════ releases wait for the digest ══ */

test("releases accumulate as queued notices, and the fifteen-minute job mails nothing all week", async () => {
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2), both(3)] });
  const ses = stubSes();
  const a = await deploy(store, put("3.1.11"), { previous: put("3.1.10"), when: "2026-09-22T09:00:00.000Z" });
  assert.equal(a.created, true);
  assert.equal(a.deliveredBy, "weekly-digest");
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1"), when: "2026-09-24T15:00:00.000Z" });

  // Every quarter of an hour from tonight until just before Monday's slot.
  let ticks = 0;
  for (let t = new Date(TONIGHT).getTime(); t < new Date(MON_W40).getTime(); t += 15 * MIN) {
    const out = await tick(store, ses, new Date(t).toISOString());
    assert.equal(out.skipped, true);
    ticks += 1;
  }
  assert.ok(ticks > 600);
  assert.equal(ses.calls.length, 0, "nobody mailed between digests");
  assert.equal(store.digests.size, 0);
  assert.deepEqual([...store.notices.values()].map((n) => n.status), ["pending", "pending"]);
  assert.equal(store.rows.length, 0, "the per-release ledger is never written");

  // And at the slot, both go, in one digest.
  const out = await tick(store, ses, MON_W40);
  assert.equal(out.started, "digest@2026-W40");
  assert.equal(out.status, "done");
  assert.equal(ses.calls.length, 3);
});

test("the digest runs once a week: later ticks that week do nothing, and a release after it waits for the next Monday", async () => {
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2), both(3), person(4, { entitlements: [live("mep")] })] });
  const ses = stubSes();
  await twoReleases(store);

  const first = await tick(store, ses, MON_W40);
  assert.equal(first.started, "digest@2026-W40");
  assert.equal(ses.calls.length, 3);

  for (let m = 15; m < 6 * 60; m += 15) {
    const out = await tick(store, ses, plus(MON_W40, m));
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "already-done");
  }
  assert.equal(ses.calls.length, 3);

  // An MEP release on Monday afternoon: queued, not mailed this week.
  await deploy(store, mep("1.8.5"), { previous: mep("1.8.4"), when: plus(MON_W40, 120) });
  await tick(store, ses, plus(MON_W40, 135));
  assert.equal(ses.calls.length, 3);
  assert.equal(store.notices.get("mep@1.8.5").status, "pending");

  const next = await tick(store, ses, MON_W41);
  assert.equal(next.started, "digest@2026-W41");
  assert.deepEqual(ses.calls.slice(3).map((m) => m.to[0]), ["user4@firm.test"]);
  assert.equal(ses.calls[3].subject, "ADLM MEP 1.8.5 is ready — update from the Installation Center");
});

test("two containers racing on the same Monday make one digest, and every customer gets one email", async () => {
  const users = Array.from({ length: 20 }, (_, i) => (i % 2 ? both(i + 1) : quivOnly(i + 1)));
  const store = memoryStore({ users });
  const ses = stubSes();
  await twoReleases(store);

  await Promise.all([tick(store, ses, MON_W40), tick(store, ses, MON_W40), tick(store, ses, plus(MON_W40, 1))]);
  const sent = ses.calls.map((m) => m.to[0]);
  assert.equal(sent.length, 20);
  assert.equal(new Set(sent).size, 20, "nobody twice");
  assert.deepEqual([...store.digests.keys()], ["digest@2026-W40"]);
  assert.equal(store.digests.get("digest@2026-W40").status, "done");
});

/* ═══════════════════════════════════════════ one email, only what you hold ══ */

test("one email per customer: two products in one email, one product sees only its own", async () => {
  const store = memoryStore({
    users: [quivOnly(1), rategenOnly(2), both(3), person(4, { entitlements: [live("mep")] })],
  });
  const ses = stubSes();
  await deploy(store, put("3.1.11"), { previous: put("3.1.10"), body: { releaseNotes: "### Fixed\n- Budget totals hold after a re-run" } });
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1") });

  const out = await tick(store, ses, MON_W40);
  assert.equal(out.status, "done");
  assert.deepEqual(to(ses), ["user1@firm.test", "user2@firm.test", "user3@firm.test"], "nothing for MEP-only user4");

  const [three] = mailTo(ses, "user3@firm.test");
  assert.equal(mailTo(ses, "user3@firm.test").length, 1, "ONE email for both products");
  assert.equal(three.subject, "This week's ADLM updates: QUIV 3.1.11, RateGen 2.9.2");
  assert.match(three.html, /QUIV 3\.1\.11/);
  assert.match(three.html, /RateGen 2\.9\.2/);
  assert.match(three.html, /Budget totals hold after a re-run/);
  assert.match(three.text, /close Revit first/, "QUIV's own update step");
  assert.match(three.text, /close ADLM RateGen first/, "RateGen's own update step");
  assert.match(three.text, /Open the ADLM Installation Center/);
  assert.match(three.text, /Find QUIV in the list and click Update/);
  assert.match(three.text, /Find RateGen in the list and click Update/);

  const [one] = mailTo(ses, "user1@firm.test");
  assert.equal(one.subject, "QUIV 3.1.11 is ready — update from the Installation Center");
  assert.ok(!/RateGen/.test(one.html + one.text), "only the product they hold");
  const [two] = mailTo(ses, "user2@firm.test");
  assert.equal(two.subject, "RateGen 2.9.2 is ready — update from the Installation Center");
  assert.ok(!/QUIV/.test(two.subject + two.text));

  for (const m of ses.calls) {
    assert.match(m.from, /^ADLM Studio </);
    assert.match(m.listUnsubscribe, /^https:\/\/api\.adlmstudio\.net\/api\/email\/unsubscribe\/product-updates\//);
    const token = decodeURIComponent(m.listUnsubscribe.split("/").pop());
    assert.equal(`${readTopicUnsubscribeToken("product-updates", token)}@firm.test`.replace(/^u/, "user"), m.to[0]);
    assert.ok(m.html.includes(m.listUnsubscribe.replace(/&/g, "&amp;")), "the opt-out is in the body too");
    assert.ok(m.html.includes(LEGAL_LINE), "legal line (html)");
    assert.ok(m.text.includes(LEGAL_TEXT), "legal line (text)");
  }

  const row = store.digestRows.find((r) => r.email === "user3@firm.test");
  assert.deepEqual(row.sentNoticeKeys.sort(), ["rategen@2.9.2", "revit@3.1.11"]);
  for (const n of store.notices.values()) {
    assert.equal(n.status, "done");
    assert.equal(n.digestKey, "digest@2026-W40");
  }
  assert.equal(store.digestSendLog.filter((e) => e.ok).length, 3);
});

test("the subject: one product, several, and the Installation Center alone", () => {
  const quiv = { kind: "product", product: productFor("revit"), version: "3.1.11" };
  const rg = { kind: "product", product: productFor("rategen"), version: "2.9.2" };
  const hub = { kind: "hub", product: HUB_PRODUCT, version: "1.0.3" };
  assert.equal(digestSubject([quiv]), "QUIV 3.1.11 is ready — update from the Installation Center");
  assert.equal(digestSubject([rg, quiv]), "This week's ADLM updates: QUIV 3.1.11, RateGen 2.9.2");
  assert.equal(digestSubject([hub]), "A new ADLM Installation Center is ready");
  assert.equal(digestSubject([quiv, hub]), "This week's ADLM updates: Installation Center 1.0.3, QUIV 3.1.11");
});

/* ═════════════════════════════════════════ withdrawn, superseded, newest ══ */

test("withdrawn and superseded releases are left out, and only a product's newest version is listed", async () => {
  const everything = [live("revit"), live("rategen"), live("mep"), live("civil3d")];
  const store = memoryStore({ users: [person(1, { entitlements: everything })] });
  const ses = stubSes();

  // QUIV twice in one week: the newer supersedes the older.
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });
  await deploy(store, put("3.1.12"));
  assert.equal(store.notices.get("revit@3.1.11").status, "superseded");
  // RateGen published, then switched off: cancelled by the PUT.
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1") });
  await deploy(store, rategen("2.9.2", { enabled: false }));
  // MEP published, then its record deleted behind the API's back: caught at digest time.
  await deploy(store, mep("1.8.5"), { previous: mep("1.8.4") });
  store.deployments.delete("mep");
  // CIVIQ published, then rolled back.
  const civ = (v) => put(v, { productKey: "civil3d", displayName: "", packageUri: "https://cdn.test/c.zip" });
  await deploy(store, civ("1.2.0"), { previous: civ("1.1.0") });
  await deploy(store, civ("1.1.0"));

  const out = await tick(store, ses, MON_W40);
  assert.equal(out.status, "done");
  assert.equal(ses.calls.length, 1);
  assert.equal(ses.calls[0].subject, "QUIV 3.1.12 is ready — update from the Installation Center");
  assert.ok(!/3\.1\.11|RateGen|ADLM MEP|CIVIQ/.test(ses.calls[0].html), "nothing withdrawn or superseded");

  assert.equal(store.notices.get("rategen@2.9.2").status, "cancelled");
  assert.equal(store.notices.get("civil3d@1.2.0").status, "cancelled");
  assert.equal(store.notices.get("mep@1.8.5").status, "cancelled");
  assert.match(store.notices.get("mep@1.8.5").cancelledReason, /Not sent: the deployment was deleted/);
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys, ["revit@3.1.12"]);
});

test("a build pulled halfway through the digest drops out of every email not yet sent", async () => {
  const users = Array.from({ length: 8 }, (_, i) => both(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await twoReleases(store);

  const first = await tick(store, ses, MON_W40, { limit: 3 });
  assert.equal(first.sent, 3);
  assert.equal(first.status, "sending");
  for (const m of ses.calls) assert.match(m.subject, /QUIV 3\.1\.11, RateGen 2\.9\.2/);

  // RateGen pulled (the admin UI's switch) before the next tick carries on.
  store.deployments.set("rategen", rategen("2.9.2", { enabled: false }));
  const rest = await tick(store, ses, plus(MON_W40, 15));
  assert.equal(rest.continued, "digest@2026-W40");
  assert.equal(rest.status, "done");
  assert.equal(ses.calls.length, 8);
  assert.equal(new Set(ses.calls.map((m) => m.to[0])).size, 8, "nobody twice");
  for (const m of ses.calls.slice(3)) {
    assert.equal(m.subject, "QUIV 3.1.11 is ready — update from the Installation Center");
    assert.ok(!/RateGen/.test(m.html));
  }
  assert.equal(store.notices.get("rategen@2.9.2").status, "cancelled");
  assert.equal(store.notices.get("revit@3.1.11").status, "done");
});

/* ═════════════════════════════════════════════ the Installation Center ══ */

const HUB_102 = "https://cdn.test/adlm/installers/ADLMInstallerHub-v1-0-2/ADLMInstallerHub-v1.0.2.zip";
const HUB_103 = "https://cdn.test/adlm/installers/ADLMInstallerHub-v1-0-3/ADLMInstallerHub-v1.0.3.zip";

test("the Installation Center's version is read from its setup file's name", () => {
  assert.equal(hubVersionFromUrl(HUB_103), "1.0.3");
  // What server/scripts/upload-hub-release.mjs prints: <publicBase>/adlm/installer-hub/<ms>-<file>.
  assert.equal(hubVersionFromUrl("https://pub.r2.dev/adlm/installer-hub/1727000000000-ADLMInstallerHub-v1.0.3.zip"), "1.0.3");
  assert.equal(hubVersionFromUrl("https://res.cloudinary.com/x/raw/upload/v17/adlm/installers/ADLMInstallerHub-v1-0-4"), "1.0.4");
  assert.equal(hubVersionFromUrl("https://cdn.test/ADLMInstallerHub-v2.1.zip?download=1"), "2.1");
  assert.equal(hubVersionFromUrl("https://cdn.test/ADLM%20Installer%20Hub%20Setup.exe"), "");
  assert.equal(hubVersionFromUrl(""), "");

  const d = (previousUrl, nextUrl, lastAnnounced = "") => decideHubNotice({ previousUrl, nextUrl, lastAnnounced }).reason;
  assert.equal(d(HUB_102, HUB_103), "version-increased");
  assert.equal(d(HUB_102, HUB_102), "unchanged");
  assert.equal(d(HUB_103, HUB_102), "rollback");
  assert.equal(d(HUB_102, HUB_102.replace("?", "") + "?v=2"), "same-version");
  assert.equal(d(HUB_102, "https://cdn.test/latest-setup.zip"), "unversioned-file");
  assert.equal(d("", HUB_103), "first-setting");
  assert.equal(d("https://cdn.test/old-setup.zip", HUB_103), "now-versioned");
  assert.equal(d(HUB_102, HUB_103, "1.0.3"), "already-announced");
  assert.equal(d(HUB_102, ""), "removed");
});

test("a new Installation Center goes to every active licence holder once, inside the same weekly email", async () => {
  const store = memoryStore({
    hubUrl: HUB_102,
    users: [
      quivOnly(1),
      rategenOnly(2), // no RateGen release this week: the Hub alone
      person(3, { entitlements: [live("revit", { expiresAt: new Date("2026-01-01") })] }), // lapsed
      person(4, { entitlements: [live("planswift")], notifications: { productUpdates: false } }),
      person(5, { entitlements: [live("planswift"), live("mep")] }),
      person(6, { entitlements: [] }),
    ],
  });
  const ses = stubSes();
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });

  // The admin points the dashboard at the new file (routes/admin.settings.js).
  store.hub.url = HUB_103;
  const hub = await recordInstallerHubChange({ previousUrl: HUB_102, nextUrl: HUB_103, actor: "admin@test", store, log: quiet, now: at(SAT_W39) });
  assert.equal(hub.created, true);
  assert.equal(hub.key, "hub@1.0.3");
  assert.equal(store.notices.get("hub@1.0.3").kind, "hub");
  // Saving the same link again records nothing more.
  assert.equal((await recordInstallerHubChange({ previousUrl: HUB_103, nextUrl: HUB_103, store, log: quiet })).reason, "unchanged");

  await tick(store, ses, MON_W40);
  assert.deepEqual(to(ses), ["user1@firm.test", "user2@firm.test", "user5@firm.test"]);

  const [one] = mailTo(ses, "user1@firm.test");
  assert.equal(one.subject, "This week's ADLM updates: Installation Center 1.0.3, QUIV 3.1.11");
  assert.ok(one.html.indexOf("ADLM Installation Center 1.0.3") < one.html.indexOf("QUIV 3.1.11</p>"), "the Hub first");
  // The customer dashboard and its own button, which every customer sees (not
  // /manage/downloads, which is staff-only until go-live).
  assert.match(one.html, /href="https:\/\/www\.adlmstudio\.net\/dashboard"/);
  assert.match(one.text, /open your dashboard: https:\/\/www\.adlmstudio\.net\/dashboard/);
  assert.match(one.text, /Click "Download Installer Hub" near the top of your dashboard and run the setup\./);
  assert.match(one.text, /close Revit first/);

  for (const who of ["user2@firm.test", "user5@firm.test"]) {
    const [m] = mailTo(ses, who);
    assert.equal(m.subject, "A new ADLM Installation Center is ready");
    assert.match(m.html, /https:\/\/www\.adlmstudio\.net\/dashboard/);
    assert.match(m.html, />\s*Open your dashboard\s*</, "the button says where it goes");
    assert.ok(!/QUIV/.test(m.html), "no product they do not hold");
    assert.ok(m.text.includes(LEGAL_TEXT));
  }
  for (const m of ses.calls) {
    assert.ok(!/manage\/downloads|Downloads on your dashboard|Download the Installer Hub/.test(m.html + m.text), "no page or button customers cannot see");
  }
  const counts = store.digests.get("digest@2026-W40").counts;
  assert.equal(counts.sent, 3);
  assert.deepEqual(counts.skippedBy, { optedOut: 1 });
  assert.equal(store.notices.get("hub@1.0.3").status, "done");
});

test("the Installation Center item: a rollback of the link withdraws it, and an admin can add or cancel one by hand", async () => {
  const store = memoryStore({ hubUrl: HUB_102, users: [quivOnly(1)] });
  const ses = stubSes();
  store.hub.url = HUB_103;
  await recordInstallerHubChange({ previousUrl: HUB_102, nextUrl: HUB_103, store, log: quiet, now: at(SAT_W39) });

  // Back to 1.0.2 before Monday: cancelled, never mailed.
  store.hub.url = HUB_102;
  const back = await recordInstallerHubChange({ previousUrl: HUB_103, nextUrl: HUB_102, store, log: quiet });
  assert.deepEqual(back.cancelled, ["hub@1.0.3"]);
  assert.equal(back.reason, "rollback");

  // By hand: refused while the dashboard offers an older file, and for nonsense.
  await assert.rejects(
    createManualHubNotice({ version: "1.0.4", store, log: quiet }),
    (err) => err.status === 409 && err.details.code === "not-downloadable",
  );
  await assert.rejects(createManualHubNotice({ version: "soon", store, log: quiet }), (err) => err.status === 400);

  store.hub.url = "https://cdn.test/adlm/installers/ADLMInstallerHub-v1.0.4.zip";
  const made = await createManualHubNotice({ version: "1.0.4", releaseNotes: "- Clearer update list", actor: "admin@test", store, log: quiet, now: at(SAT_W39) });
  assert.equal(made.created, true);
  assert.equal(made.key, "hub@1.0.4");
  await assert.rejects(createManualHubNotice({ version: "1.0.4", store, log: quiet }), (err) => err.details?.code === "already-announced");

  const cancelled = await cancelQueuedNotice({ idOrKey: "hub@1.0.4", actor: "admin@test", store });
  assert.equal(cancelled.ok, true);
  assert.equal((await cancelQueuedNotice({ idOrKey: "hub@1.0.4", store })).status, 409);

  await tick(store, ses, MON_W40);
  assert.equal(ses.calls.length, 0, "nothing left to announce");
  assert.equal(store.digests.get("digest@2026-W40").status, "empty");
});

/* ═════════════════════════════════════════════════════ who is skipped ══ */

test("opted-out, disabled, bounced and lapsed customers are skipped, and consent is read again at send time", async () => {
  const users = [
    both(1),
    both(2, { notifications: { productUpdates: false } }),
    both(3, { disabled: true }),
    both(4, { emailUndeliverable: true }),
    person(5, { entitlements: [live("revit", { status: "expired" })] }),
    both(6),
    both(7),
    both(8, { emailVerified: false }), // bought before confirmation codes existed
  ];
  const store = memoryStore({ users });
  const ses = stubSes();
  await twoReleases(store);

  const first = await tick(store, ses, MON_W40, { limit: 1 });
  assert.equal(ses.calls.length, 1);

  // After enrolment: user6 switches product updates off, user7's licences lapse.
  users[5].notifications.productUpdates = false;
  users[6].entitlements = [live("revit", { status: "expired" }), live("rategen", { expiresAt: new Date("2026-01-01") })];
  const rest = await tick(store, ses, plus(MON_W40, 15));
  assert.equal(first.status, "sending");
  assert.equal(rest.status, "done");
  assert.deepEqual(to(ses), ["user1@firm.test", "user8@firm.test"]);
  assert.deepEqual(rest.counts.skippedBy, { optedOut: 2, undeliverable: 1, noEntitlement: 1 });
});

/* ═══════════════════════════════════════════════════ crash and resume ══ */

test("a digest that dies mid-send resumes on the next tick, and nobody is mailed twice", async () => {
  const users = Array.from({ length: 5 }, (_, i) => both(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await twoReleases(store);

  // The Lambda dies after SES accepted the 2nd email and before the ledger heard.
  let dead = false;
  let sentMarks = 0;
  const dying = new Proxy(store, {
    get(target, prop) {
      const fn = target[prop];
      if (typeof fn !== "function" || prop === "logDigestSend") return fn;
      return async (...args) => {
        if (dead) throw new Error("Task timed out after 540.00 seconds");
        if (prop === "settleDigestRow" && args[1]?.status === "sent" && ++sentMarks === 2) {
          dead = true;
          throw new Error("Task timed out after 540.00 seconds");
        }
        return fn(...args);
      };
    },
  });
  await assert.rejects(tick(dying, ses, MON_W40, { limit: 2 }), /timed out/);
  assert.equal(ses.calls.length, 2);
  assert.equal(store.digests.get("digest@2026-W40").status, "sending");

  const out = await tick(store, ses, plus(MON_W40, 15));
  assert.equal(out.continued, "digest@2026-W40");
  assert.equal(out.status, "done");
  const sent = ses.calls.map((m) => m.to[0]);
  assert.equal(sent.length, 5);
  assert.equal(new Set(sent).size, 5, "nobody twice");
  assert.equal(out.counts.sending, 1, "the in-doubt row is reported, not guessed at");

  // A later tick, even past the window, sends nothing more.
  await tick(store, ses, plus(MON_W40, 60 * 10));
  assert.equal(ses.calls.length, 5);
});

test("a digest that dies while writing its audience down finishes it on the next tick, with the same notices", async () => {
  const users = Array.from({ length: 4 }, (_, i) => both(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await twoReleases(store);

  let failOnce = true;
  const flaky = new Proxy(store, {
    get(target, prop) {
      const fn = target[prop];
      if (typeof fn !== "function") return fn;
      return async (...args) => {
        if (prop === "enrolDigest" && failOnce) {
          failOnce = false;
          throw new Error("connection reset while inserting");
        }
        return fn(...args);
      };
    },
  });
  await assert.rejects(tick(flaky, ses, MON_W40), /connection reset/);
  const d = store.digests.get("digest@2026-W40");
  assert.equal(d.status, "enrolling");
  assert.ok(d.claimedAt, "the notices were taken");

  // A release recorded meanwhile belongs to next week, not to this half-done digest.
  await deploy(store, mep("1.8.5"), { previous: mep("1.8.4"), when: plus(MON_W40, 5) });

  const out = await tick(store, ses, plus(MON_W40, 15));
  assert.equal(out.status, "done");
  assert.equal(ses.calls.length, 4);
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys.sort(), ["rategen@2.9.2", "revit@3.1.11"]);
  assert.equal(store.notices.get("mep@1.8.5").status, "pending");
});

/* ═════════════════════════════════════════════════════════ SES refusing ══ */

test("a sandboxed SES account stops the digest before a send and records why; the job does not ask again; send-now sends the queue", async () => {
  const store = memoryStore({ users: [quivOnly(1), both(2)] });
  const ses = stubSes();
  await twoReleases(store);
  let asked = 0;
  const sandbox = async () => {
    asked += 1;
    return { ...PRODUCTION, ProductionAccessEnabled: false };
  };

  const out = await tick(store, ses, MON_W40, { sesAccount: sandbox });
  assert.equal(out.stopped, true);
  assert.equal(out.code, "ses-sandbox");
  assert.equal(ses.calls.length, 0);
  const d = store.digests.get("digest@2026-W40");
  assert.equal(d.status, "failed");
  assert.match(d.error, /sandbox/);
  assert.equal(d.errorCode, "ses-sandbox");
  assert.equal(store.notices.get("revit@3.1.11").status, "pending", "nothing taken, so nothing lost");

  // The rest of the window: SES is not asked again, nothing is sent.
  for (let m = 15; m < 6 * 60; m += 15) {
    const again = await tick(store, ses, plus(MON_W40, m), { sesAccount: sandbox });
    assert.equal(again.reason, "already-failed");
  }
  assert.equal(asked, 1);

  // Production access granted; the admin previews and presses send-now. The
  // failed digest took nothing, so the preview says it will be closed and the
  // queue sent in a new send-now digest, and that is what happens.
  const later = at(plus(MON_W40, 400));
  const p = await previewSendNow({ store, now: later, schedule: SCHEDULE, log: quiet });
  assert.equal(p.action, "start");
  assert.equal(p.requiresDigestKey, false);
  assert.deepEqual(p.closes.map((c) => [c.key, c.status]), [["digest@2026-W40", "failed"]]);
  assert.deepEqual(p.updates.map((u) => u.key).sort(), ["rategen@2.9.2", "revit@3.1.11"]);
  assert.equal(p.recipients, 2);

  const resumed = await sendDigestNow({ ...opts(store, ses), now: later });
  assert.match(resumed.started, /^digest@2026-W40-now-/);
  assert.deepEqual(resumed.closed.map((c) => [c.key, c.status]), [["digest@2026-W40", "missed"]]);
  assert.equal(resumed.status, "done");
  assert.deepEqual(to(ses), ["user1@firm.test", "user2@firm.test"]);
  assert.equal(store.digests.get("digest@2026-W40").status, "missed");
  assert.equal((await tick(store, ses, plus(MON_W40, 405))).reason, "window-passed");
  assert.equal(ses.calls.length, 2);
});

test("SES refusing mid-digest (access denied) stops it, keeps the queue, and says what SES said", async () => {
  const store = memoryStore({ users: [both(1), both(2), both(3)] });
  const ses = stubSes({ failFor: () => sesErr("AccessDeniedException", "not authorized to perform ses:SendEmail", 403) });
  await twoReleases(store);

  process.env.MAIL_SEND_RATE_PER_SEC = "1"; // one at a time, so "stopped at the first" is exact
  const out = await tick(store, ses, MON_W40);
  assert.equal(out.stopped, true);
  assert.equal(ses.calls.length, 1, "stopped at the first refusal");
  const d = store.digests.get("digest@2026-W40");
  assert.equal(d.status, "failed");
  assert.equal(d.errorCode, "AccessDeniedException");
  assert.match(d.error, /not authorized to perform ses:SendEmail/);
  assert.equal(out.counts.pending, 3, "the refused row went back in the queue");
  assert.equal(out.counts.sent, 0);
});

test("SES throttling pauses the digest; the next tick carries on, even after the window", async () => {
  const store = memoryStore({ users: [both(1), both(2)] });
  let throttle = true;
  const ses = stubSes({ failFor: () => (throttle ? sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429) : null) });
  await twoReleases(store);

  const out = await tick(store, ses, MON_W40);
  assert.equal(out.retryLater, true);
  assert.equal(out.status, "sending");
  throttle = false;
  const later = await tick(store, ses, plus(MON_W40, 60 * 7)); // 16:00 WAT, window shut
  assert.equal(later.continued, "digest@2026-W40");
  assert.equal(later.status, "done");
  assert.equal(later.counts.sent, 2);
});

/* ═══════════════════════════════════════════════════════════ send-now ══ */

test("send-now sends what is queued, one email per customer, and the Monday digest does not send it again", async () => {
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2), both(3)] });
  const ses = stubSes();
  await twoReleases(store);

  const now = await sendDigestNow({ ...opts(store, ses), actor: "admin@test", now: at("2026-09-26T11:00:00.000Z") });
  assert.match(now.started, /^digest@2026-W39-now-20260926T110000Z$/);
  assert.equal(now.status, "done");
  assert.equal(ses.calls.length, 3);
  assert.equal(mailTo(ses, "user3@firm.test").length, 1);
  for (const n of store.notices.values()) assert.equal(n.status, "done");

  // Nothing new: Monday records an empty week and mails nobody.
  const monday = await tick(store, ses, MON_W40);
  assert.equal(monday.status, "empty");
  assert.equal(ses.calls.length, 3);

  // A second send-now with nothing queued creates nothing.
  const nothing = await sendDigestNow({ ...opts(store, ses), now: at(plus(MON_W40, 60)) });
  assert.equal(nothing.reason, "nothing-queued");
  assert.equal(store.digests.size, 2);

  // A release after the send-now goes in the next Monday's digest, alone.
  await deploy(store, put("3.1.12"), { when: plus(MON_W40, 120) });
  await tick(store, ses, MON_W41);
  assert.deepEqual(ses.calls.slice(3).map((m) => m.subject), [
    "QUIV 3.1.12 is ready — update from the Installation Center",
    "QUIV 3.1.12 is ready — update from the Installation Center",
  ]);
});

/* ════════════════════════════════════════ the per-release send, and holds ══ */

test("the per-release send refuses a notice a digest has taken, and a digest never takes one the per-release send started", async () => {
  const store = memoryStore({ users: Array.from({ length: 4 }, (_, i) => both(i + 1)) });
  const ses = stubSes();
  await twoReleases(store);

  // QUIV mailed on its own in an emergency (POST .../send with bypassDigest), part way.
  const direct = await sendReleaseNotice("revit@3.1.11", { ...opts(store, ses), limit: 1 });
  assert.equal(direct.sent, 1);

  const digest = await tick(store, ses, MON_W40, { limit: 1 });
  assert.equal(digest.status, "sending");
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys, ["rategen@2.9.2"], "not the one already going out");

  const refused = await sendReleaseNotice("rategen@2.9.2", { ...opts(store, ses), resume: true });
  assert.equal(refused.skipped, true);
  assert.equal(refused.reason, "in-digest");
  assert.equal(refused.digestKey, "digest@2026-W40");

  const status = await digestStatus({ store, now: at(plus(MON_W40, 5)), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.deepEqual(status.legacyInProgress, [{ key: "revit@3.1.11", status: "sending", enrolled: true }]);
  assert.match(status.legacyNote, /bypassDigest/);
});

test("a release recorded moments before the slot waits one tick for its release check; one cancelled meanwhile never goes", async () => {
  const store = memoryStore({ users: [both(1)] });
  const ses = stubSes();
  await deploy(store, put("3.1.11"), { previous: put("3.1.10"), when: plus(MON_W40, -5) });
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1"), when: plus(MON_W40, -3) });

  const held = await tick(store, ses, MON_W40, { holdMs: 10 * MIN });
  assert.equal(held.reason, "release-hold");
  assert.deepEqual(held.held.sort(), ["rategen@2.9.2", "revit@3.1.11"]);
  assert.equal(store.digests.size, 0);

  // The RateGen script's hash check fails and it cancels.
  await cancelQueuedNotice({ idOrKey: "rategen@2.9.2", actor: "publish-build.ps1", store });
  const out = await tick(store, ses, plus(MON_W40, 15), { holdMs: 10 * MIN });
  assert.equal(out.status, "done");
  assert.deepEqual(ses.calls.map((m) => m.subject), ["QUIV 3.1.11 is ready — update from the Installation Center"]);
});

/* ═══════════════════════════════════════════════ dry run, kill switch ══ */

test("DRY_RUN sends nothing and writes nothing, on the tick and on send-now", async () => {
  const store = memoryStore({ users: [quivOnly(1), both(2), both(3, { notifications: { productUpdates: false } })] });
  const ses = stubSes();
  await twoReleases(store);
  const before = store.writes.length;

  process.env.DRY_RUN = "1";
  let sesAsked = false;
  const peek = async () => {
    sesAsked = true;
    return PRODUCTION;
  };
  const { dryRun: _unused, ...noDry } = opts(store, ses, { sesAccount: peek });
  const out = await runReleaseDigestTick({ ...noDry, now: at(MON_W40) });
  const now = await sendDigestNow({ ...noDry, now: at(MON_W40) });

  assert.equal(out.dryRun, true);
  assert.equal(out.recipients, 2);
  assert.deepEqual(out.skipped, { optedOut: 1 });
  assert.equal(now.dryRun, true);
  assert.equal(ses.calls.length, 0);
  assert.equal(sesAsked, false);
  assert.equal(store.writes.length, before, "no digest, no ledger, no status change");
  assert.equal(store.digests.size, 0);
  assert.deepEqual([...store.notices.values()].map((n) => n.status), ["pending", "pending"]);
});

test("RELEASE_DIGEST_ENABLED off: the job checks nothing and sends nothing", async () => {
  assert.equal(isDigestEnabled({}), true);
  assert.equal(isDigestEnabled({ RELEASE_DIGEST_ENABLED: "true" }), true);
  for (const off of ["0", "false", "no", "OFF"]) assert.equal(isDigestEnabled({ RELEASE_DIGEST_ENABLED: off }), false);

  const store = memoryStore({ users: [quivOnly(1)] });
  const ses = stubSes();
  await twoReleases(store);
  const before = store.writes.length;
  process.env.RELEASE_DIGEST_ENABLED = "false";
  const { enabled: _unused, ...fromEnv } = opts(store, ses);
  const out = await runReleaseDigestTick({ ...fromEnv, now: at(MON_W40) });
  assert.equal(out.reason, "disabled");
  assert.equal(ses.calls.length, 0);
  assert.equal(store.writes.length, before);

  // The emergency send-now is refused too: the switch stops every digest email.
  const now = await sendDigestNow({ ...fromEnv, now: at(MON_W40) });
  assert.equal(now.disabled, true);
  assert.equal(now.code, "digest-disabled");
  assert.equal(ses.calls.length, 0);
  assert.equal(store.writes.length, before);
  assert.equal(store.digests.size, 0);
});

/* ═════════════════════════════════════════════════════════════ preview ══ */

test("the preview: counts, one customer's email as they would get it, a placeholder opt-out, and no writes", async () => {
  const store = memoryStore({ users: [quivOnly(1), rategenOnly(2), both(3), both(4, { emailUndeliverable: true })] });
  await twoReleases(store);
  const before = store.writes.length;

  const p = await previewDigest({ store, userId: "u3", log: quiet });
  assert.equal(p.recipients, 3);
  assert.deepEqual(p.skipped, { undeliverable: 1 });
  assert.deepEqual(p.perUpdate, { "revit@3.1.11": 2, "rategen@2.9.2": 2 });
  assert.equal(p.sample.to, "user3@firm.test");
  assert.equal(p.sample.subject, "This week's ADLM updates: QUIV 3.1.11, RateGen 2.9.2");
  const token = decodeURIComponent(p.sample.listUnsubscribe.split("/").pop());
  assert.equal(readTopicUnsubscribeToken("product-updates", token), "000000000000000000000000", "never a real customer's opt-out");

  const first = await previewDigest({ store, log: quiet });
  assert.equal(first.sample.to, "user1@firm.test");
  assert.equal(first.sample.subject, "QUIV 3.1.11 is ready — update from the Installation Center");

  const nobody = await previewDigest({ store, userId: "u99", log: quiet });
  assert.equal(nobody.sample, null);
  assert.match(nobody.sampleNote, /No user u99/);
  assert.equal(store.writes.length, before);
});

/* ═══════════════════════ review fixes, 22 Sep 2026: send-now sends what it showed ══ */

const TUE_W41 = "2026-10-06T08:00:00.000Z"; // Tue 6 Oct 2026, 09:00 WAT
const denyAll = () => stubSes({ failFor: () => sesErr("AccessDeniedException", "not authorized to perform ses:SendEmail", 403) });
const subjects = (calls) => calls.map((m) => [m.to[0], m.subject]);

test("a digest SES stopped in week 40 is never mailed stale: week 41 sent 3.1.12, so Tuesday's send-now closes it and sends only what its preview showed", async () => {
  const store = memoryStore({ users: [both(1), both(2)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });

  // W40: the digest takes QUIV 3.1.11, and SES refuses (AccessDenied).
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  const refused = await tick(store, denyAll(), MON_W40);
  delete process.env.MAIL_SEND_RATE_PER_SEC;
  assert.equal(refused.stopped, true);
  assert.equal(store.digests.get("digest@2026-W40").status, "failed");
  assert.equal(store.notices.get("revit@3.1.11").status, "digesting");

  // QUIV 3.1.12 ships; the W41 digest mails it to both customers.
  await deploy(store, put("3.1.12"), { when: plus(MON_W40, 60 * 24 * 3) });
  assert.equal(store.notices.get("revit@3.1.11").status, "digesting", "a digest's notice is not superseded by the PUT");
  const ses = stubSes();
  const w41 = await tick(store, ses, MON_W41);
  assert.equal(w41.started, "digest@2026-W41");
  assert.deepEqual(subjects(ses.calls), [
    ["user1@firm.test", "QUIV 3.1.12 is ready — update from the Installation Center"],
    ["user2@firm.test", "QUIV 3.1.12 is ready — update from the Installation Center"],
  ]);

  // Tuesday: RateGen 2.9.3 is recorded and the admin previews send-now.
  await deploy(store, rategen("2.9.3"), { previous: rategen("2.9.2"), when: TUE_W41 });
  const p = await previewSendNow({ store, now: at(TUE_W41), schedule: SCHEDULE, log: quiet });
  assert.equal(p.action, "start");
  assert.equal(p.requiresDigestKey, false);
  assert.deepEqual(p.updates.map((u) => u.key), ["rategen@2.9.3"]);
  assert.equal(p.recipients, 2);
  assert.equal(p.sample.subject, "RateGen 2.9.3 is ready — update from the Installation Center");
  assert.deepEqual(p.closes.map((c) => [c.key, c.status]), [["digest@2026-W40", "failed"]]);
  assert.match(p.closes[0].why, /pulled or superseded/);

  // SEND: exactly that. Nobody is told about QUIV 3.1.11.
  const now = await sendDigestNow({ ...opts(store, ses), now: at(TUE_W41) });
  assert.match(now.started, /^digest@2026-W41-now-/);
  assert.equal(now.status, "done");
  assert.deepEqual(now.closed.map((c) => [c.key, c.status]), [["digest@2026-W40", "done"]]);
  assert.deepEqual(subjects(ses.calls.slice(2)), [
    ["user1@firm.test", "RateGen 2.9.3 is ready — update from the Installation Center"],
    ["user2@firm.test", "RateGen 2.9.3 is ready — update from the Installation Center"],
  ]);
  assert.ok(!ses.calls.some((m) => /3\.1\.11/.test(m.subject + m.text)), "never the stale version");

  const w40 = store.digests.get("digest@2026-W40");
  assert.equal(w40.status, "done");
  assert.match(w40.closedReason, /Closed by send-now/);
  assert.deepEqual(w40.counts.skippedBy, { superseded: 2 });
  assert.equal(store.notices.get("revit@3.1.11").status, "superseded");
  assert.equal(store.notices.get("revit@3.1.11").supersededBy, "revit@3.1.12");

  // A script calling again, as its loop does: nothing more.
  const again = await sendDigestNow({ ...opts(store, ses), now: at(plus(TUE_W41, 1)) });
  assert.equal(again.reason, "nothing-queued");
  assert.equal(ses.calls.length, 4);
});

test("send-now finishes an unfinished digest that still holds updates only when the call names it, and says what stays queued", async () => {
  const store = memoryStore({ users: [both(1), both(2), both(3)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });

  // W40: one QUIV email out, then SES refuses.
  let n = 0;
  const partWay = stubSes({ failFor: () => (++n > 1 ? sesErr("AccessDeniedException", "not authorized", 403) : null) });
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  assert.equal((await tick(store, partWay, MON_W40)).stopped, true);
  delete process.env.MAIL_SEND_RATE_PER_SEC;
  const firstTold = partWay.calls[0].to[0];

  // Recording QUIV 3.1.11 again by hand says it is in a digest, not enrolled per release.
  await assert.rejects(
    createManualNotice({ productKey: "revit", version: "3.1.11", store, log: quiet }),
    (err) => err.details.code === "already-announced" && err.details.status === "digesting" && err.details.enrolled === false,
  );

  await deploy(store, rategen("2.9.3"), { previous: rategen("2.9.2"), when: TUE_W41 });
  const p = await previewSendNow({ store, now: at(TUE_W41), schedule: SCHEDULE, log: quiet });
  assert.equal(p.action, "resume");
  assert.equal(p.digestKey, "digest@2026-W40");
  assert.equal(p.requiresDigestKey, true);
  assert.deepEqual(p.updates.map((u) => u.key), ["revit@3.1.11"]);
  assert.equal(p.recipients, 2, "the customers still owed it, from its ledger");
  assert.notEqual(p.sample.to, firstTold);
  assert.equal(p.sample.subject, "QUIV 3.1.11 is ready — update from the Installation Center");
  assert.deepEqual(p.stillQueued, ["rategen@2.9.3"]);
  assert.match(p.plan, /"digestKey":"digest@2026-W40"/);

  const ses = stubSes();
  const unnamed = await sendDigestNow({ ...opts(store, ses), now: at(TUE_W41) });
  assert.equal(unnamed.ok, false);
  assert.equal(unnamed.code, "unfinished-digest");
  assert.equal(unnamed.digestKey, "digest@2026-W40");
  assert.match(unnamed.error, /Nothing was sent/);
  const wrong = await sendDigestNow({ ...opts(store, ses), digestKey: "digest@2026-W39", now: at(TUE_W41) });
  assert.equal(wrong.code, "digest-mismatch");
  assert.equal(ses.calls.length, 0, "nothing sent without the name");
  assert.equal(store.digests.get("digest@2026-W40").status, "failed");

  const named = await sendDigestNow({ ...opts(store, ses), digestKey: "digest@2026-W40", now: at(TUE_W41) });
  assert.equal(named.continued, "digest@2026-W40");
  assert.equal(named.status, "done");
  assert.deepEqual(named.stillQueued, ["rategen@2.9.3"]);
  assert.equal(ses.calls.length, 2);
  assert.ok(ses.calls.every((m) => m.to[0] !== firstTold && /QUIV 3\.1\.11/.test(m.subject)));

  const done = await sendDigestNow({ ...opts(store, ses), digestKey: "digest@2026-W40", now: at(plus(TUE_W41, 1)) });
  assert.equal(done.skipped, true);
  assert.equal(done.reason, "already-done");
  assert.equal(done.counts.pending, 0);

  // Then the queue, in a digest of its own, when asked.
  const rest = await sendDigestNow({ ...opts(store, ses), now: at(plus(TUE_W41, 2)) });
  assert.match(rest.started, /-now-/);
  assert.equal(ses.calls.length, 5);
  for (const u of ["user1@firm.test", "user2@firm.test", "user3@firm.test"]) {
    const quiv = [...partWay.calls.slice(0, 1), ...ses.calls].filter((m) => m.to[0] === u && /QUIV/.test(m.subject));
    assert.equal(quiv.length, 1, `${u} heard about QUIV 3.1.11 once`);
  }
});

test("a send-now digest under way is carried on by the next call without its name, so a release script can loop", async () => {
  const store = memoryStore({ users: [both(1), both(2), both(3)] });
  const ses = stubSes();
  await twoReleases(store);
  const t = "2026-09-26T11:00:00.000Z";

  const first = await sendDigestNow({ ...opts(store, ses), limit: 1, now: at(t) });
  assert.equal(first.status, "sending");
  assert.equal(first.counts.pending, 2);
  const key = first.digestKey;
  assert.equal(key, first.started);

  const p = await previewSendNow({ store, now: at(plus(t, 1)), schedule: SCHEDULE, log: quiet });
  assert.equal(p.action, "continue");
  assert.equal(p.digestKey, key);
  assert.equal(p.requiresDigestKey, false);
  assert.equal(p.recipients, 2);

  const second = await sendDigestNow({ ...opts(store, ses), limit: 1, now: at(plus(t, 1)) });
  assert.equal(second.continued, key);
  const third = await sendDigestNow({ ...opts(store, ses), limit: 1, digestKey: key, now: at(plus(t, 2)) });
  assert.equal(third.continued, key);
  assert.equal(third.status, "done");
  const fourth = await sendDigestNow({ ...opts(store, ses), digestKey: key, now: at(plus(t, 3)) });
  assert.equal(fourth.reason, "already-done");
  assert.equal(ses.calls.length, 3);
  assert.equal(new Set(ses.calls.map((m) => m.to[0])).size, 3, "nobody twice");
  assert.equal(store.digests.size, 1);
});

test("the email no longer promises 'at most once a week': send-now can mail between Mondays", () => {
  const items = [
    { kind: "product", product: productFor("revit"), version: "3.1.11" },
    { kind: "product", product: productFor("rategen"), version: "2.9.2" },
  ];
  for (const set of [items, [{ kind: "hub", product: HUB_PRODUCT, version: "1.0.3" }]]) {
    const m = buildDigestMessage({ firstName: "Ada", items: set, unsubscribeUrl: "https://x.test/u" });
    assert.ok(!/at most once a week/i.test(m.html + m.text));
    assert.match(m.html, /We usually send product updates once a week\./);
    assert.match(m.text, /We usually send product updates once a week\./);
  }
});

/* ══════════════════ a digest that never took anything does not start days late ══ */

test("SES unreachable for the whole Monday window: the digest is closed as missed, nothing goes out on Thursday, and next Monday sends the lot", async () => {
  const store = memoryStore({ users: [both(1)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });
  const ses = stubSes();
  const offline = async () => {
    throw Object.assign(new Error("getaddrinfo ENOTFOUND email.eu-west-1.amazonaws.com"), { code: "ENOTFOUND" });
  };

  for (let m = 0; m < 6 * 60; m += 15) {
    const out = await tick(store, ses, plus(MON_W40, m), { sesAccount: offline });
    assert.equal(out.retryLater, true);
  }
  const d = store.digests.get("digest@2026-W40");
  assert.equal(d.status, "enrolling");
  assert.equal(d.claimedAt, null);
  assert.equal(new Date(d.startBy).toISOString(), "2026-09-28T14:00:00.000Z", "the end of its window");

  // A RateGen release lands on Wednesday; SES is back on Thursday afternoon.
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1"), when: "2026-09-30T10:00:00.000Z" });
  const thursday = await tick(store, ses, "2026-10-01T14:00:00.000Z");
  assert.deepEqual(thursday.missed, ["digest@2026-W40"]);
  assert.equal(thursday.reason, "window-passed");
  assert.equal(ses.calls.length, 0, "not on a Thursday, and not with whatever is queued by then");
  assert.equal(store.digests.get("digest@2026-W40").status, "missed");
  assert.deepEqual([...store.notices.values()].map((n) => n.status), ["pending", "pending"]);

  const monday = await tick(store, ses, MON_W41);
  assert.equal(monday.started, "digest@2026-W41");
  assert.deepEqual(subjects(ses.calls), [["user1@firm.test", "This week's ADLM updates: QUIV 3.1.11, RateGen 2.9.2"]]);
});

test("SES unreachable at 09:00 but back at 09:15: the same digest carries on inside its window", async () => {
  const store = memoryStore({ users: [quivOnly(1)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });
  const ses = stubSes();
  const offline = async () => {
    throw Object.assign(new Error("Service Unavailable"), { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } });
  };
  assert.equal((await tick(store, ses, MON_W40, { sesAccount: offline })).retryLater, true);
  const back = await tick(store, ses, plus(MON_W40, 15));
  assert.equal(back.continued, "digest@2026-W40");
  assert.equal(back.status, "done");
  assert.equal(ses.calls.length, 1);
});

/* ═══════════════════════════════ the take is one write on the whole candidate test ══ */

test("a per-release send that starts a notice between the digest's read and its take keeps it: nobody is mailed that release twice", async () => {
  const store = memoryStore({ users: [quivOnly(1), quivOnly(2), quivOnly(3)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });

  // {bypassDigest:true} lands in the gap: mails user1, then SES refuses.
  let k = 0;
  const bypassSes = stubSes({ failFor: () => (++k > 1 ? sesErr("AccessDeniedException", "not authorized", 403) : null) });
  let raced = false;
  const racing = new Proxy(store, {
    get(target, prop) {
      const fn = target[prop];
      if (prop !== "takeNoticeForDigest") return fn;
      return async (...args) => {
        if (!raced) {
          raced = true;
          process.env.MAIL_SEND_RATE_PER_SEC = "1";
          const r = await sendReleaseNotice("revit@3.1.11", {
            store: target,
            send: bypassSes.send,
            sesAccount: async () => PRODUCTION,
            pause: noPause,
            log: quiet,
            dryRun: false,
            now: at(MON_W40),
          });
          delete process.env.MAIL_SEND_RATE_PER_SEC;
          assert.equal(r.status, "failed");
          assert.ok(target.notices.get("revit@3.1.11").enrolledAt);
        }
        return fn(...args);
      };
    },
  });

  const ses = stubSes();
  const out = await tick(racing, ses, MON_W40);
  assert.equal(raced, true);
  assert.equal(out.status, "empty", "the digest did not take it");
  assert.equal(ses.calls.length, 0);
  assert.deepEqual(bypassSes.calls.slice(0, 1).map((m) => m.to[0]), ["user1@firm.test"]);
  const n = store.notices.get("revit@3.1.11");
  assert.equal(n.status, "failed");
  assert.ok(!n.digestKey);
});

/* ════════════════════════════ a per-release run that died before enrolling ══ */

test("a notice a per-release run claimed and died on before enrolling is shown while fresh, then taken by the digest: it had mailed nobody", async () => {
  const store = memoryStore({ users: [both(1), both(2)] });
  await deploy(store, put("3.1.11"), { previous: put("3.1.10") });
  const claimAt = "2026-09-26T10:00:00.000Z";

  // The run claims it and dies writing its audience down.
  const dying = new Proxy(store, {
    get(target, prop) {
      if (prop === "enrol") return async () => {
        throw new Error("Task timed out after 60.00 seconds");
      };
      return target[prop];
    },
  });
  await assert.rejects(
    sendReleaseNotice("revit@3.1.11", {
      store: dying,
      send: stubSes().send,
      sesAccount: async () => PRODUCTION,
      pause: noPause,
      log: quiet,
      dryRun: false,
      now: at(claimAt),
    }),
    /timed out/,
  );
  const n = store.notices.get("revit@3.1.11");
  assert.equal(n.status, "sending");
  assert.equal(n.enrolledAt, null);

  const fresh = await digestStatus({ store, now: at(plus(claimAt, 5)), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.deepEqual(fresh.legacyInProgress, [{ key: "revit@3.1.11", status: "sending", enrolled: false }]);
  assert.deepEqual(fresh.queued, []);
  const stale = await digestStatus({ store, now: at(plus(claimAt, 30)), holdMs: 0, schedule: SCHEDULE, log: quiet });
  assert.deepEqual(stale.legacyInProgress, []);
  assert.deepEqual(stale.queued.map((u) => u.key), ["revit@3.1.11"]);

  // A RateGen run claimed five minutes before the slot is still somebody's: not taken.
  await deploy(store, rategen("2.9.2"), { previous: rategen("2.9.1") });
  Object.assign(store.notices.get("rategen@2.9.2"), { status: "sending", lastRunAt: new Date(plus(MON_W40, -5)) });

  const ses = stubSes();
  const out = await tick(store, ses, MON_W40);
  assert.equal(out.status, "done");
  assert.deepEqual(store.digests.get("digest@2026-W40").noticeKeys, ["revit@3.1.11"]);
  assert.deepEqual(to(ses), ["user1@firm.test", "user2@firm.test"]);
  assert.equal(store.notices.get("revit@3.1.11").status, "done");
  assert.equal(store.notices.get("rategen@2.9.2").status, "sending");
});

/* ═══════════════════════ the Installation Center: holders of software it installs ══ */

test("a new Installation Center goes to holders of software it installs, never to a course-only, BoQ-import-only or AI-only customer", async () => {
  const store = memoryStore({
    hubUrl: HUB_102,
    users: [
      quivOnly(1),
      person(2, { entitlements: [live("course-revit-quantity-takeoff")] }),
      person(3, { entitlements: [live("boq-import")] }),
      person(4, { entitlements: [live("ai")] }),
      person(5, { entitlements: [live("course-revit-quantity-takeoff"), live("rategen")] }),
    ],
  });
  store.hub.url = HUB_103;
  await recordInstallerHubChange({ previousUrl: HUB_102, nextUrl: HUB_103, store, log: quiet, now: at(SAT_W39) });

  const p = await previewDigest({ store, log: quiet });
  assert.equal(p.recipients, 2);

  const ses = stubSes();
  await tick(store, ses, MON_W40);
  assert.deepEqual(to(ses), ["user1@firm.test", "user5@firm.test"]);
  for (const m of ses.calls) assert.equal(m.subject, "A new ADLM Installation Center is ready");

  // The rule itself, and the filter that feeds it.
  const hub = store.notices.get("hub@1.0.3");
  assert.deepEqual(updatesFor(person(9, { entitlements: [live("course-x")] }), [hub]), []);
  assert.deepEqual(updatesFor(person(9, { entitlements: [live("mep")] }), [hub]).map((x) => x.key), ["hub@1.0.3"]);
  for (const k of ["revit", "mep", "planswift", "rategen", "qs-takeoff", "civil3d"]) assert.ok(HUB_AUDIENCE_KEYS.includes(k), k);
  for (const k of ["boq-import", "ai"]) assert.ok(!HUB_AUDIENCE_KEYS.includes(k), k);
  assert.deepEqual(digestAudienceFilter(null).entitlements.$elemMatch.productKey, { $in: [...HUB_AUDIENCE_KEYS] });
});

/* ═════════════════════════════ a hub notice is never sent, or cancelled, per release ══ */

test("the per-release send and its old drain leave an Installation Center notice alone; the digest sends it", async () => {
  const store = memoryStore({ hubUrl: HUB_102, users: [quivOnly(1)] });
  store.hub.url = HUB_103;
  await recordInstallerHubChange({ previousUrl: HUB_102, nextUrl: HUB_103, store, log: quiet, now: at(SAT_W39) });
  const ses = stubSes();
  const legacy = { store, send: ses.send, sesAccount: async () => PRODUCTION, pause: noPause, log: quiet, dryRun: false, now: at(SAT_W39) };

  const r = await sendReleaseNotice("hub@1.0.3", { ...legacy, resume: true });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, "hub-in-digest-only");
  await runReleaseNoticeDrain({ ...legacy, lock: false, holdMs: 0 });
  assert.equal(store.notices.get("hub@1.0.3").status, "pending", "not cancelled as a deleted deployment");
  assert.equal(ses.calls.length, 0);

  await tick(store, ses, MON_W40);
  assert.deepEqual(subjects(ses.calls), [["user1@firm.test", "A new ADLM Installation Center is ready"]]);
});

/* ══════════════════════════════════ when the digest will mail a recorded release ══ */

test("withNextDigest adds the next digest's date to a queued notice only, and never fails", async () => {
  const next = async () => ({ at: MON_W40, lagos: "Mon 28 Sep 2026, 09:00 WAT", dueNow: false });
  const queued = await withNextDigest({ key: "revit@3.1.11", status: "pending" }, { next });
  assert.equal(queued.nextDigestAt, MON_W40);
  assert.equal(queued.nextDigestLagos, "Mon 28 Sep 2026, 09:00 WAT");
  const due = await withNextDigest({ key: "revit@3.1.11", status: "pending" }, { next: async () => ({ ...(await next()), dueNow: true }) });
  assert.equal(due.nextDigestLagos, "at the next 15-minute tick");
  for (const rn of [{ key: "revit@3.1.11", status: "cancelled", reason: "already-in-digest" }, { created: false, reason: "not-higher" }, undefined]) {
    assert.deepEqual(await withNextDigest(rn, { next }), rn);
  }
  const broken = await withNextDigest({ key: "revit@3.1.11", status: "pending" }, { next: async () => { throw new Error("db down"); } });
  assert.equal(broken.nextDigestAt, undefined);
});

/* ══════════════════════════════════════════════════════ SES only, ever ══ */

test("the digest uses SES directly and never the mailer that falls back to Resend", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ["releaseDigest.js", "releaseDigestEmail.js"]) {
    const src = fs.readFileSync(path.join(here, f), "utf8");
    assert.ok(!/from\s+["']\.\/mailer\.js["']/.test(src), `${f} must not import util/mailer.js`);
    assert.ok(!/\bsendMail\s*\(/.test(src), `${f} must not call sendMail`);
    assert.ok(!/RESEND_API_KEY|nodemailer|gmail/i.test(src), `${f} must not reach another provider`);
  }
  const digest = fs.readFileSync(path.join(here, "releaseDigest.js"), "utf8");
  assert.match(digest, /import \{[^}]*\bsendViaSesOnce\b[^}]*\} from "\.\/sesTransport\.js"/);
  assert.match(digest, /send = sendViaSesOnce/);
});
