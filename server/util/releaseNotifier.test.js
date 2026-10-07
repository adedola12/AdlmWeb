// server/util/releaseNotifier.test.js
//
// The release email's send loop, driven for real against an in-memory store
// (util/releaseNotifier.memoryStore.js).
//
// The store keeps the same rules the Mongo one leans on — one notice per key,
// one ledger row per address per notice, a claim that only succeeds on a
// pending row, the deployment as customers see it — so "a crash halfway does
// not double-send", "SES refusing stops the run" and "a pulled build is never
// announced" are exercised end to end rather than asserted about a mock of
// Mongoose. SES is replaced by a stub everywhere: nothing here can send mail,
// and nothing reaches AWS.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  audienceFilter,
  classifyRecipient,
  classifySesError,
  createManualNotice,
  decideReleaseNotice,
  neverAccepted,
  noticeKeyFor,
  previewRelease,
  recordDeploymentRelease,
  recordDeploymentWithdrawn,
  releaseHoldMs,
  runReleaseNoticeDrain,
  sendReleaseNotice,
  sendWithRetry,
  sesAccountVerdict,
  wantsNotification,
  withdrawnReason,
} from "./releaseNotifier.js";
import { readTopicUnsubscribeToken } from "./campaigns.js";
import { singleAttemptSesClient } from "./sesTransport.js";
import { applyFeedback, parseFeedback } from "./mailFeedback.js";
import { User } from "../models/User.js";
import { MailEvent } from "../models/MailEvent.js";
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
delete process.env.DRY_RUN;
delete process.env.MAIL_SEND_RATE_PER_SEC;
delete process.env.RELEASE_HOLD_MS;

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const days = (n) => new Date(Date.now() + n * DAY);

const rategen = (version, extra = {}) =>
  put(version, { productKey: "rategen", displayName: "", packageUri: "https://cdn.test/r.zip", ...extra });

/**
 * What the deployment PUT does, in miniature: read the deployment it
 * replaces, write the new one, hand both to recordDeploymentRelease.
 */
async function deploy(store, item, { previous, body = {}, now } = {}) {
  const key = item.productKey;
  const before = previous !== undefined ? previous : (store.deployments.get(key) ?? null);
  store.deployments.set(key, { ...item });
  return recordDeploymentRelease({ previous: before, item, body, store, log: quiet, ...(now ? { now } : {}) });
}

/** What DELETE /admin/deployments/:productKey does. */
async function remove(store, productKey) {
  store.deployments.delete(productKey);
  return recordDeploymentWithdrawn({ productKey, reason: "Deployment deleted by admin@test", store, log: quiet });
}

async function seedNotice(store, version = "3.1.11", body = {}) {
  return deploy(store, put(version), { previous: put("3.1.10"), body });
}

const runOpts = (store, ses, extra = {}) => ({
  store,
  send: ses.send,
  sesAccount: async () => PRODUCTION,
  pause: noPause,
  log: quiet,
  dryRun: false,
  ...extra,
});

/** The fifteen-minute job with no hold, so a notice made a moment ago is due. */
const drainNow = (store, ses, extra = {}) =>
  runReleaseNoticeDrain({ ...runOpts(store, ses), lock: false, holdMs: 0, ...extra });

function applySet(doc, set) {
  for (const [p, v] of Object.entries(set)) {
    const parts = p.split(".");
    let o = doc;
    for (const k of parts.slice(0, -1)) o = o[k] ??= {};
    o[parts.at(-1)] = v;
  }
}

beforeEach(() => {
  delete process.env.DRY_RUN;
  delete process.env.RELEASE_HOLD_MS;
});

/* ═════════════════════════════════════════════════════ the trigger rule ══ */

test("only a real version increase announces itself", () => {
  const prev = put("3.1.10");
  const ok = (over, body = {}, lastAnnounced = "") =>
    decideReleaseNotice({ previous: prev, next: put("3.1.11", over), body, lastAnnounced });

  assert.deepEqual(ok({}), { notify: true, reason: "version-increased" });
  assert.equal(decideReleaseNotice({ previous: prev, next: put("3.1.10") }).reason, "same-version");
  assert.equal(decideReleaseNotice({ previous: prev, next: put("v3.1.10") }).reason, "same-version");
  assert.equal(decideReleaseNotice({ previous: prev, next: put("3.1.9") }).reason, "rollback");
  assert.equal(ok({}, { notifySubscribers: false }).reason, "notify-subscribers-false");
  assert.equal(ok({}, { notifySubscribers: "false" }).reason, "notify-subscribers-false");
  assert.equal(ok({ enabled: false }).reason, "deployment-disabled");
  assert.equal(ok({ packageUri: "" }).reason, "no-package");
  assert.equal(ok({ version: "latest" }).reason, "unreadable-version");
  assert.equal(decideReleaseNotice({ previous: null, next: put("1.0.0") }).reason, "first-deployment");
  assert.equal(decideReleaseNotice({ previous: put(""), next: put("1.0.0") }).reason, "first-deployment");
  assert.equal(decideReleaseNotice({ previous: put("July"), next: put("1.0.0") }).reason, "unreadable-previous-version");
  assert.equal(ok({}, {}, "3.1.11").reason, "already-announced");
  assert.equal(decideReleaseNotice({ previous: prev, next: put("3.1.11"), demoMode: true }).reason, "demo-mode");

  assert.equal(wantsNotification({}), true);
  assert.equal(wantsNotification({ notifySubscribers: true }), true);
  assert.equal(wantsNotification({ notifySubscribers: 0 }), false);
});

test("a build staged switched off is announced when it is switched on at the same version, and only once", async () => {
  const off = put("3.1.11", { enabled: false });
  assert.deepEqual(decideReleaseNotice({ previous: off, next: put("3.1.11") }), { notify: true, reason: "now-downloadable" });
  assert.equal(
    decideReleaseNotice({ previous: put("3.1.11", { packageUri: "" }), next: put("3.1.11") }).reason,
    "now-downloadable",
    "a record saved before its package was uploaded is the same case",
  );
  assert.equal(decideReleaseNotice({ previous: off, next: put("3.1.11"), lastAnnounced: "3.1.11" }).reason, "already-announced");
  assert.equal(decideReleaseNotice({ previous: off, next: put("3.1.10"), lastAnnounced: "3.1.11" }).reason, "already-announced");

  // End to end, the way publish-build.ps1 (which carries `enabled` over) and
  // the admin UI's switch do it.
  const store = memoryStore({ users: [person(1), person(2)] });
  const ses = stubSes();
  store.deployments.set("revit", put("3.1.10"));
  const staged = await deploy(store, put("3.1.11", { enabled: false }));
  assert.equal(staged.reason, "deployment-disabled");
  assert.equal(store.notices.size, 0);

  const on = await deploy(store, put("3.1.11"));
  assert.equal(on.created, true);
  assert.equal(on.reason, "now-downloadable");
  assert.equal(on.key, "revit@3.1.11");
  await drainNow(store, ses);
  assert.equal(ses.calls.length, 2);

  // Switched off and on again after everyone has heard: nobody is told twice.
  await deploy(store, put("3.1.11", { enabled: false }));
  const again = await deploy(store, put("3.1.11"));
  assert.equal(again.reason, "already-announced");
  await drainNow(store, ses);
  assert.equal(ses.calls.length, 2);
});

test("a version bump records exactly one notice, and a retried PUT does not add a second", async () => {
  const store = memoryStore();
  const a = await seedNotice(store);
  assert.equal(a.created, true);
  assert.equal(a.key, "revit@3.1.11");
  assert.equal(a.status, "pending");

  // The script's retry: same before, same after.
  const b = await seedNotice(store);
  assert.equal(b.created, false);
  assert.equal(store.notices.size, 1);
});

test("a re-PUT of the same version, a rollback, or notifySubscribers:false records nothing", async () => {
  const store = memoryStore();
  const same = await recordDeploymentRelease({ previous: put("3.1.11"), item: put("3.1.11"), store, log: quiet });
  const back = await recordDeploymentRelease({ previous: put("3.1.11"), item: put("3.1.10"), store, log: quiet });
  const quietBump = await recordDeploymentRelease({
    previous: put("3.1.11"),
    item: put("3.1.12"),
    body: { notifySubscribers: false },
    store,
    log: quiet,
  });
  const demo = await recordDeploymentRelease({ previous: put("3.1.11"), item: put("3.1.12"), demoMode: true, store, log: quiet });

  assert.equal(same.reason, "same-version");
  assert.equal(back.reason, "rollback");
  assert.equal(quietBump.reason, "notify-subscribers-false");
  assert.equal(demo.reason, "demo-mode");
  assert.equal(store.notices.size, 0);
  assert.ok([same, back, quietBump, demo].every((r) => r.created === false));
});

test("a rollback cancels an unfinished announcement of the pulled version, and re-releasing it reopens it", async () => {
  const store = memoryStore();
  await seedNotice(store, "3.1.11");
  const back = await deploy(store, put("3.1.10"));
  assert.deepEqual(back.cancelled, ["revit@3.1.11"]);
  assert.equal(store.notices.get("revit@3.1.11").status, "cancelled");

  const again = await deploy(store, put("3.1.11"));
  assert.equal(again.created, false);
  assert.equal(again.status, "pending");
  assert.equal(store.notices.size, 1);
});

test("a newer version supersedes an older one nobody has finished hearing about", async () => {
  const store = memoryStore();
  await seedNotice(store, "3.1.11");
  const next = await deploy(store, put("3.1.12"));
  assert.equal(next.created, true);
  assert.deepEqual(next.superseded, ["revit@3.1.11"]);
  assert.equal(store.notices.get("revit@3.1.11").status, "superseded");
  assert.equal(store.notices.get("revit@3.1.11").supersededBy, "revit@3.1.12");
});

test("notes come from the PUT first, then What's New for exactly this version, then one generic line", async () => {
  const changelogs = {
    quiv: { releases: [{ version: "3.1.11", title: "From What's New", changes: [{ type: "new", items: ["cl item"] }] }] },
  };

  const given = await seedNotice(memoryStore({ changelogs }), "3.1.11", { releaseNotes: "### Fixed\n- from the script" });
  assert.equal(given.notesSource, "request");

  const s2 = memoryStore({ changelogs });
  const fromCl = await seedNotice(s2, "3.1.11");
  assert.equal(fromCl.notesSource, "changelog");
  assert.equal(s2.notices.get("revit@3.1.11").notes.title, "From What's New");

  const generic = await seedNotice(memoryStore({ changelogs }), "3.1.12");
  assert.equal(generic.notesSource, "generic");
});

/* ═════════════════════════════════════════ one notice per version, ever ══ */

test("one notice per version however it is spelt: '3.2' after '3.2.0' mails nobody twice", async () => {
  assert.equal(noticeKeyFor("revit", "3.2"), noticeKeyFor("revit", "3.2.0"));
  assert.equal(noticeKeyFor("REVIT", "v3.2.0.0"), "revit@3.2.0");
  assert.equal(noticeKeyFor("planswift", "2.5"), "planswift@2.5.0");
  assert.equal(noticeKeyFor("revit", "3.1.11"), "revit@3.1.11");

  const store = memoryStore({ users: [person(1), person(2), person(3)] });
  const ses = stubSes();
  store.deployments.set("revit", put("3.1.11"));
  const rec = await deploy(store, put("3.2.0"));
  assert.equal(rec.key, "revit@3.2.0");
  await sendReleaseNotice(rec.key, runOpts(store, ses));
  assert.equal(ses.calls.length, 3);

  // An admin announcing it by hand, typed the other way: refused, not re-sent.
  await assert.rejects(
    createManualNotice({ productKey: "revit", version: "3.2", store, log: quiet }),
    (err) => err.status === 409 && err.details.code === "already-announced" && err.details.key === "revit@3.2.0",
  );
  // An older version than one already announced is refused the same way.
  await assert.rejects(createManualNotice({ productKey: "revit", version: "3.1.12", store, log: quiet }), (err) => err.status === 409);
  assert.equal(store.notices.size, 1);

  await drainNow(store, ses);
  assert.equal(ses.calls.length, 3, "three people, three emails");
});

test("a version cancelled by a rollback and re-released under another spelling reopens the same notice", async () => {
  const store = memoryStore({ users: [person(1), person(2), person(3)] });
  const ses = stubSes();
  store.deployments.set("revit", put("3.1.11"));
  await deploy(store, put("3.2.0"));
  await sendReleaseNotice("revit@3.2.0", runOpts(store, ses, { limit: 1 }));
  assert.equal(ses.calls.length, 1);

  const back = await deploy(store, put("3.1.11"));
  assert.deepEqual(back.cancelled, ["revit@3.2.0"]);

  const again = await deploy(store, put("3.2"));
  assert.equal(again.key, "revit@3.2.0");
  assert.equal(again.created, false);
  assert.equal(again.status, "pending");
  assert.equal(store.notices.size, 1);

  await drainNow(store, ses);
  const to = ses.calls.map((m) => m.to[0]);
  assert.equal(to.length, 3);
  assert.equal(new Set(to).size, 3, "nobody twice");
});

test("a manual announcement: refused for a build customers cannot download, and reopens a cancelled one", async () => {
  const store = memoryStore({ users: [person(1)] });
  const make = (version) => createManualNotice({ productKey: "revit", version, store, log: quiet });

  await assert.rejects(make("3.1.11"), (err) => err.status === 409 && err.details.code === "not-downloadable");
  store.deployments.set("revit", put("3.1.11", { enabled: false }));
  await assert.rejects(make("3.1.11"), /switched off/);
  store.deployments.set("revit", put("3.1.11"));
  await assert.rejects(make("3.2.0"), /below 3\.2\.0/, "a build not published yet");
  await assert.rejects(make("latest"), (err) => err.status === 400);

  const made = await make("v3.1.11");
  assert.equal(made.created, true);
  assert.equal(made.key, "revit@3.1.11");

  await store.setNotice("revit@3.1.11", { status: "cancelled" });
  const reopened = await make("3.1.11.0");
  assert.equal(reopened.created, false);
  assert.equal(reopened.status, "pending");
  assert.equal(store.notices.size, 1);
});

/* ════════════════════════════════════════════ a pulled build is not sent ══ */

test("a build switched off, or left with no package, before its email went out is not announced", async () => {
  const store = memoryStore({ users: [person(1), person(2), person(3)] });
  const ses = stubSes();
  await seedNotice(store, "3.1.11");

  const off = await deploy(store, put("3.1.11", { enabled: false }));
  assert.deepEqual(off.cancelled, ["revit@3.1.11"]);
  assert.equal(store.notices.get("revit@3.1.11").status, "cancelled");
  assert.match(store.notices.get("revit@3.1.11").cancelledReason, /switched off/);
  assert.equal((await drainNow(store, ses)).open, 0);
  assert.equal(ses.calls.length, 0, "disable, then drain: nothing");

  // Switched back on: the same notice reopens.
  const back = await deploy(store, put("3.1.11"));
  assert.equal(back.created, false);
  assert.equal(back.status, "pending");

  const noPkg = await deploy(store, put("3.1.11", { packageUri: "" }));
  assert.equal(noPkg.reason, "no-package");
  assert.deepEqual(noPkg.cancelled, ["revit@3.1.11"]);
  await drainNow(store, ses);
  assert.equal(ses.calls.length, 0);

  await deploy(store, put("3.1.11"));
  await drainNow(store, ses);
  assert.equal(ses.calls.length, 3);
});

test("a deleted deployment is not announced", async () => {
  const store = memoryStore({ users: [person(1), person(2)] });
  const ses = stubSes();
  await seedNotice(store);

  assert.deepEqual(await remove(store, "revit"), ["revit@3.1.11"]);
  const out = await drainNow(store, ses);
  assert.equal(out.open, 0);
  assert.equal(ses.calls.length, 0, "delete, then drain: nothing");
  assert.match(store.notices.get("revit@3.1.11").cancelledReason, /deleted/);
  assert.deepEqual(await recordDeploymentWithdrawn({ productKey: "revit", demoMode: true, store, log: quiet }), []);
});

test("the send reads the deployment itself, so a missed hook cannot let a pulled build out", async () => {
  for (const [label, change, why] of [
    ["switched off", (s) => s.deployments.set("revit", put("3.1.11", { enabled: false })), /switched off/],
    ["no package", (s) => s.deployments.set("revit", put("3.1.11", { packageUri: "" })), /no package/],
    ["deleted", (s) => s.deployments.delete("revit"), /deleted/],
    ["rolled back", (s) => s.deployments.set("revit", put("3.1.10")), /below 3\.1\.11/],
    ["unreadable version", (s) => s.deployments.set("revit", put("latest")), /cannot be read/],
  ]) {
    const store = memoryStore({ users: [person(1), person(2)] });
    const ses = stubSes();
    await seedNotice(store);
    change(store); // behind the PUT and DELETE hooks' backs

    const out = await drainNow(store, ses);
    assert.equal(ses.calls.length, 0, label);
    assert.equal(out.results[0].reason, "deployment-withdrawn", label);
    const n = store.notices.get("revit@3.1.11");
    assert.equal(n.status, "cancelled", label);
    assert.match(n.cancelledReason, why, label);
  }

  // An admin pressing Send gets the same answer.
  const store = memoryStore({ users: [person(1)] });
  const ses = stubSes();
  await seedNotice(store);
  store.deployments.delete("revit");
  const pressed = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses, { resume: true }));
  assert.equal(pressed.skipped, true);
  assert.equal(pressed.status, "cancelled");
  assert.equal(ses.calls.length, 0);

  assert.equal(withdrawnReason(put("3.1.12"), "3.1.11"), "", "a newer build still delivers what the notice promised");
});

test("a build pulled halfway through a mailshot stops it before the next batch", async () => {
  const users = Array.from({ length: 12 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes({
    failFor: (_m, n) => {
      if (n === 1) store.deployments.set("revit", put("3.1.11", { enabled: false }));
      return null;
    },
  });
  await seedNotice(store);

  // One at a time, in batches of ten.
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  try {
    const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
    assert.equal(ses.calls.length, 10, "the batch in hand finishes; the next never starts");
    assert.equal(out.status, "cancelled");
    assert.equal(out.cancelled, true);
    assert.equal(out.counts.pending, 2);
    assert.equal(store.notices.get("revit@3.1.11").status, "cancelled");
  } finally {
    delete process.env.MAIL_SEND_RATE_PER_SEC;
  }
});

/* ══════════════════════════════════════════════════ the ten-minute hold ══ */

test("the fifteen-minute job holds a new notice for ten minutes, so a failed release check can cancel it first", async () => {
  assert.equal(releaseHoldMs(), 10 * MIN);
  process.env.RELEASE_HOLD_MS = "0";
  assert.equal(releaseHoldMs(), 0);
  process.env.RELEASE_HOLD_MS = "90000";
  assert.equal(releaseHoldMs(), 90000);
  process.env.RELEASE_HOLD_MS = "soon";
  assert.equal(releaseHoldMs(), 10 * MIN);
  delete process.env.RELEASE_HOLD_MS;

  const t0 = new Date();
  const at = (min) => () => new Date(t0.getTime() + min * MIN);
  const drainAt = (store, ses, min) => runReleaseNoticeDrain({ ...runOpts(store, ses), lock: false, now: at(min) });

  // Nothing goes inside the hold; everything goes after it.
  const store = memoryStore({ users: [person(1), person(2)] });
  const ses = stubSes();
  store.deployments.set("revit", put("3.1.10"));
  await deploy(store, put("3.1.11"), { now: at(0) });
  const early = await drainAt(store, ses, 9);
  assert.deepEqual(early.held, ["revit@3.1.11"]);
  assert.equal(ses.calls.length, 0);
  const late = await drainAt(store, ses, 11);
  assert.deepEqual(late.held, []);
  assert.equal(ses.calls.length, 2);

  // The script's hash check fails inside the hold and it cancels: never sent.
  const s2 = memoryStore({ users: [person(1)] });
  const ses2 = stubSes();
  s2.deployments.set("revit", put("3.1.10"));
  await deploy(s2, put("3.1.11"), { now: at(0) });
  await drainAt(s2, ses2, 5);
  await s2.setNotice("revit@3.1.11", { status: "cancelled" }, ["pending", "sending", "failed"]);
  await drainAt(s2, ses2, 30);
  assert.equal(ses2.calls.length, 0);

  // Reopened later, the hold starts again from the reopening.
  await deploy(s2, put("3.1.11", { enabled: false }), { now: at(40) });
  await deploy(s2, put("3.1.11"), { now: at(41) });
  assert.deepEqual((await drainAt(s2, ses2, 45)).held, ["revit@3.1.11"]);
  await drainAt(s2, ses2, 52);
  assert.equal(ses2.calls.length, 1);

  // A notice somebody has already started by hand is not held.
  const s3 = memoryStore({ users: [person(1), person(2)] });
  const ses3 = stubSes();
  s3.deployments.set("revit", put("3.1.10"));
  await deploy(s3, put("3.1.11"), { now: at(0) });
  await sendReleaseNotice("revit@3.1.11", runOpts(s3, ses3, { limit: 1, now: at(1) }));
  await drainAt(s3, ses3, 2);
  assert.equal(ses3.calls.length, 2);
});

/* ════════════════════════════════════════════════════════ who gets it ══ */

test("recipients: live licence for THIS product, deliverable, not disabled, not opted out; confirmed or not", () => {
  const keys = ["revit"];
  const c = (over) => classifyRecipient(person(1, over), { productKeys: keys });

  assert.equal(c({}), "send");
  assert.equal(c({ notifications: undefined }), "send", "accounts from before the switch are opted in");
  assert.equal(c({ notifications: { productUpdates: false } }), "opted-out");
  // A paying customer from before confirmation codes (1 Sep 2026) is
  // unconfirmed by default. The licence is the proof the address works.
  assert.equal(c({ emailVerified: false }), "send");
  assert.equal(c({ emailVerified: undefined }), "send");
  assert.equal(c({ emailUndeliverable: true }), "undeliverable");
  assert.equal(c({ disabled: true }), "disabled");
  assert.equal(c({ email: "" }), "no-address");
  assert.equal(c({ email: "not-an-address" }), "no-address");
  assert.equal(c({ entitlements: [live("rategen")] }), "no-entitlement", "another product's licence does not count");
  assert.equal(c({ entitlements: [live("revit", { status: "expired" })] }), "no-entitlement");
  assert.equal(c({ entitlements: [live("revit", { status: "inactive" })] }), "no-entitlement");
  assert.equal(c({ entitlements: [live("revit", { expiresAt: days(-2) })] }), "no-entitlement", "expired licence");
  assert.equal(c({ entitlements: [live("revit", { expiresAt: new Date() })] }), "send", "good through the end of its expiry day");
  assert.equal(c({ entitlements: [live("revit", { expiresAt: days(30) })] }), "send");
  // The marketing switch is not this list's switch.
  assert.equal(c({ emailPrefs: { marketing: false } }), "send");
});

test("the Mongo audience filter keeps licence, status and expiry on the SAME entitlement", () => {
  const now = new Date("2026-09-19T10:00:00Z");
  const q = audienceFilter(["revit"], now);
  assert.deepEqual(q.disabled, { $ne: true });
  assert.deepEqual(q.email, { $exists: true, $ne: "" });
  assert.deepEqual(Object.keys(q.entitlements), ["$elemMatch"]);
  const m = q.entitlements.$elemMatch;
  assert.deepEqual(m.productKey, { $in: ["revit"] });
  assert.equal(m.status, "active");
  assert.equal(m.$or.length, 2);
  assert.deepEqual(m.$or[0], { expiresAt: null });
  assert.ok(m.$or[1].expiresAt.$gte instanceof Date);
  assert.ok(m.$or[1].expiresAt.$gte <= now);
});

test("a send reaches exactly the eligible licence holders, once each, over SES with a working opt-out", async () => {
  const users = [
    person(1),
    person(2),
    person(3, { entitlements: [live("revit", { expiresAt: days(-3) })] }), // expired
    person(4, { disabled: true }),
    person(5, { emailVerified: false }), // bought before confirmation codes existed
    person(6, { notifications: { productUpdates: false } }),
    person(7, { entitlements: [live("mep")] }), // other product
    person(8, { emailUndeliverable: true }),
    person(9, { entitlements: [live("mep"), live("revit")] }),
  ];
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));

  assert.equal(out.ok, true);
  assert.equal(out.status, "done");
  assert.deepEqual(ses.calls.map((m) => m.to[0]).sort(), [
    "user1@firm.test",
    "user2@firm.test",
    "user5@firm.test",
    "user9@firm.test",
  ]);
  assert.equal(out.counts.sent, 4);
  assert.deepEqual(out.counts.skippedBy, { optedOut: 1, undeliverable: 1 });

  const m = ses.calls[0];
  assert.match(m.from, /^ADLM Studio </);
  assert.equal(m.subject, "QUIV 3.1.11 is ready — update from the Installation Center");
  assert.match(m.listUnsubscribe, /^https:\/\/api\.adlmstudio\.net\/api\/email\/unsubscribe\/product-updates\//);
  const token = decodeURIComponent(m.listUnsubscribe.split("/").pop());
  assert.ok(["u1", "u2", "u5", "u9"].includes(readTopicUnsubscribeToken("product-updates", token)));
  assert.ok(m.html.includes(m.listUnsubscribe.replace(/&/g, "&amp;")));
  assert.equal(m.tracked, undefined, "release mail is not open/click tracked");

  assert.equal(store.sendLog.filter((e) => e.ok).length, 4);
  assert.equal(store.notices.get("revit@3.1.11").status, "done");

  // Calling it again finds nothing to do and sends nothing.
  const again = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(again.skipped, true);
  assert.equal(ses.calls.length, 4);
});

test("consent is read again at send time: somebody who opts out after enrolment is skipped", async () => {
  const users = [person(1), person(2), person(3)];
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  await sendReleaseNotice("revit@3.1.11", runOpts(store, ses, { limit: 1 }));
  assert.equal(ses.calls.length, 1);

  users[1].notifications.productUpdates = false;
  users[2].entitlements = [live("revit", { status: "expired" })];
  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(ses.calls.length, 1);
  assert.equal(out.status, "done");
  assert.deepEqual(out.counts.skippedBy, { optedOut: 1, noEntitlement: 1 });
});

test("somebody who marks any of our mail as spam gets no more release emails", async () => {
  const users = [person(1), person(2)];
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  // The real complaint handler (util/mailFeedback.js), with the three model
  // calls it makes stood in by the in-memory users.
  const writes = [];
  User.findOne = (q) => ({ select: () => ({ lean: async () => users.find((u) => u.email === q.email) || null }) });
  User.updateOne = async (filter, update) => {
    writes.push({ filter, update });
    return { modifiedCount: 1 };
  };
  MailEvent.create = async () => ({});
  try {
    const [ev] = parseFeedback({
      eventType: "Complaint",
      mail: { messageId: "0100-release-mail" },
      complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "User2@Firm.test" }] },
    });
    const r = await applyFeedback(ev, { log: quiet });
    assert.equal(r.action, "opted out of all non-essential mail");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].update.$set["notifications.productUpdates"], false);
    applySet(users.find((u) => u._id === writes[0].filter._id), writes[0].update.$set);
  } finally {
    delete User.findOne;
    delete User.updateOne;
    delete MailEvent.create;
  }

  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.deepEqual(ses.calls.map((m) => m.to[0]), ["user1@firm.test"]);
  assert.deepEqual(out.counts.skippedBy, { optedOut: 1 });
});

/* ═══════════════════════════════════════════════ resume, never double ══ */

test("a partial run resumes where it stopped, and nobody is mailed twice", async () => {
  const users = Array.from({ length: 7 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  const first = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses, { limit: 3 }));
  assert.equal(first.sent, 3);
  assert.equal(first.status, "sending");
  assert.equal(first.counts.pending, 4);

  const second = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(second.sent, 4);
  assert.equal(second.status, "done");

  const to = ses.calls.map((m) => m.to[0]);
  assert.equal(to.length, 7);
  assert.equal(new Set(to).size, 7, "every address exactly once");
});

test("a run that dies mid-send leaves the in-flight row alone: it is never re-sent on a guess", async () => {
  const users = Array.from({ length: 5 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  // The Lambda dies after SES accepted the 2nd message and before the ledger
  // heard about it: the write that would mark it sent never happens, and
  // nothing after that point runs at all.
  let dead = false;
  let sentMarks = 0;
  const dying = new Proxy(store, {
    get(target, prop) {
      const fn = target[prop];
      if (typeof fn !== "function" || prop === "logSend") return fn;
      return async (...args) => {
        if (dead) throw new Error("Task timed out after 60.00 seconds");
        if (prop === "settle" && args[1]?.status === "sent" && ++sentMarks === 2) {
          dead = true;
          throw new Error("Task timed out after 60.00 seconds");
        }
        return fn(...args);
      };
    },
  });
  await assert.rejects(sendReleaseNotice("revit@3.1.11", runOpts(dying, ses, { limit: 2 })), /timed out/);
  assert.equal(ses.calls.length, 2);
  assert.equal(store.rows.filter((r) => r.status === "sending").length, 1, "one row is in doubt");

  // The next run sends to everybody still owed, and not to the row in doubt.
  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  const to = ses.calls.map((m) => m.to[0]);
  assert.equal(to.length, 5);
  assert.equal(new Set(to).size, 5, "nobody twice");
  assert.equal(out.counts.sending, 1, "the in-doubt row is reported, not guessed at");
  assert.equal(out.status, "done");
});

test("two runs at the same moment still mail each address once", async () => {
  const users = Array.from({ length: 20 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);

  await Promise.all([
    sendReleaseNotice("revit@3.1.11", runOpts(store, ses)),
    sendReleaseNotice("revit@3.1.11", runOpts(store, ses)),
  ]);
  const to = ses.calls.map((m) => m.to[0]);
  assert.equal(to.length, 20);
  assert.equal(new Set(to).size, 20);
});

/* ════════════════════════════ sent again only when SES certainly refused ══ */

test("only a send SES certainly refused is sent again; one whose answer was lost never is", async () => {
  const attempts = async (err) => {
    let n = 0;
    const r = await sendWithRetry(
      async () => {
        n += 1;
        throw err;
      },
      {},
      { pause: noPause },
    );
    assert.equal(r.ok, false);
    return n;
  };
  const withCode = (message, code) => Object.assign(new Error(message), { code });

  // Refused at the door: SES took nothing, so trying again cannot duplicate.
  assert.equal(await attempts(sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429)), 3);
  assert.equal(await attempts(sesErr("ThrottlingException", "Rate exceeded")), 3);
  assert.equal(await attempts(withCode("connect ECONNREFUSED", "ECONNREFUSED")), 3);
  assert.equal(await attempts(withCode("getaddrinfo ENOTFOUND", "ENOTFOUND")), 3);
  // The request may have gone out and been accepted: once, and no more.
  assert.equal(await attempts(sesErr("InternalFailure", "Internal error", 500)), 1);
  assert.equal(await attempts(sesErr("ServiceUnavailable", "down", 503)), 1);
  assert.equal(await attempts(Object.assign(new Error("Request timed out"), { name: "TimeoutError" })), 1);
  assert.equal(await attempts(withCode("socket hang up", "ECONNRESET")), 1);
  assert.equal(await attempts(withCode("read ETIMEDOUT", "ETIMEDOUT")), 1);
  // Not transient at all.
  assert.equal(await attempts(sesErr("BadRequestException", "Illegal address")), 1);
  assert.equal(await attempts(sesErr("LimitExceededException", "Daily message quota exceeded.")), 1);

  assert.equal(neverAccepted(sesErr("TooManyRequestsException", "x", 429)), true);
  assert.equal(neverAccepted(sesErr("ServiceUnavailable", "down", 503)), false);
  assert.equal(neverAccepted(Object.assign(new Error("t"), { name: "TimeoutError" })), false);
});

test("the release mail client makes one request per send: the SDK's own retries are off", async () => {
  const client = singleAttemptSesClient();
  assert.equal(await client.config.maxAttempts(), 1);
  assert.equal(singleAttemptSesClient(), client, "one client for the life of the container");
});

test("SES not answering (5xx) leaves those rows in flight, never re-sent, and pauses without failing the notice", async () => {
  const users = Array.from({ length: 12 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  let down = true;
  const ses = stubSes({ failFor: () => (down ? sesErr("ServiceUnavailable", "Service Unavailable", 503) : null) });
  await seedNotice(store);

  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(out.ok, true);
  assert.equal(out.status, "sending", "an outage is not a refusal");
  assert.equal(out.stopped, undefined);
  assert.equal(out.paused, true);
  assert.equal(out.retryLater, true);
  assert.equal(out.code, "ses-unavailable");
  assert.doesNotMatch(out.error, /refused|AllSendsRefused/);
  assert.equal(out.counts.failed, 0, "nobody is written off");
  const inDoubt = ses.calls.length;
  assert.ok(inDoubt >= 1 && inDoubt <= 10, `${inDoubt} sends before the pool stopped`);
  assert.equal(out.inDoubt, inDoubt);
  assert.equal(out.counts.sending, inDoubt, "each unanswered send is left in flight");
  assert.equal(new Set(ses.calls.map((m) => m.to[0])).size, inDoubt, "and was asked once");
  assert.equal(store.notices.get("revit@3.1.11").status, "sending");
  assert.equal(store.notices.get("revit@3.1.11").errorCode, "ses-unavailable");

  // SES recovers: the next run sends everybody else, and not the rows in doubt.
  down = false;
  await drainNow(store, ses);
  const to = ses.calls.map((m) => m.to[0]);
  assert.equal(to.length, 12);
  assert.equal(new Set(to).size, 12, "nobody twice");
  assert.equal(store.notices.get("revit@3.1.11").status, "done");
  assert.equal((await store.counts("revit@3.1.11")).sending, inDoubt, "the rows in doubt are left for an admin");
});

test("still throttled after every attempt: the row goes back in the queue, the run pauses, the next run sends it", async () => {
  const store = memoryStore({ users: [person(1), person(2)] });
  let throttle = true;
  const ses = stubSes({
    failFor: () => (throttle ? sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429) : null),
  });
  await seedNotice(store);

  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  try {
    const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
    assert.equal(ses.calls.length, 3, "one row, three attempts, then the run pauses");
    assert.equal(out.status, "sending");
    assert.equal(out.retryLater, true);
    assert.equal(out.code, "ses-throttled");
    assert.equal(out.counts.failed, 0);
    assert.equal(out.counts.pending, 2);

    throttle = false;
    const drained = await drainNow(store, ses);
    assert.equal(drained.open, 1, "the fifteen-minute job finds it again");
    assert.equal(store.notices.get("revit@3.1.11").status, "done");
    assert.equal((await store.counts("revit@3.1.11")).sent, 2);
  } finally {
    delete process.env.MAIL_SEND_RATE_PER_SEC;
  }
});

/* ═══════════════════════════════════════════════════ SES says no: stop ══ */

test("a sandboxed SES account stops the run before a single send, and records why", async () => {
  const store = memoryStore({ users: [person(1), person(2)] });
  const ses = stubSes();
  await seedNotice(store);

  const out = await sendReleaseNotice(
    "revit@3.1.11",
    runOpts(store, ses, { sesAccount: async () => ({ ...PRODUCTION, ProductionAccessEnabled: false }) }),
  );
  assert.equal(out.ok, false);
  assert.equal(out.stopped, true);
  assert.equal(out.code, "ses-sandbox");
  assert.equal(ses.calls.length, 0, "nothing attempted, and no other provider");
  const n = store.notices.get("revit@3.1.11");
  assert.equal(n.status, "failed");
  assert.match(n.error, /sandbox/);

  // The fifteen-minute job leaves a failed notice alone...
  const drained = await drainNow(store, ses);
  assert.equal(drained.open, 0);
  assert.equal(ses.calls.length, 0);

  // ...and an admin's resume, once SES is out of the sandbox, sends it.
  const resumed = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses, { resume: true }));
  assert.equal(resumed.status, "done");
  assert.equal(ses.calls.length, 2);
});

test("SES unreadable before the run: nothing is taken, and the answer says to come back, with the counts", async () => {
  const store = memoryStore({ users: [person(1)] });
  const ses = stubSes();
  await seedNotice(store);
  const out = await sendReleaseNotice(
    "revit@3.1.11",
    runOpts(store, ses, {
      sesAccount: async () => {
        throw sesErr("TooManyRequestsException", "Rate exceeded", 429);
      },
    }),
  );
  assert.equal(out.ok, false);
  assert.equal(out.retryLater, true);
  assert.equal(out.code, "ses-account-unreachable");
  assert.ok(out.counts, "counts, so a caller looping on counts.pending does not stop");
  assert.equal(store.notices.get("revit@3.1.11").status, "pending");
  assert.equal(ses.calls.length, 0);
});

test("SES refusing mid-run (unverified identity) stops the run, keeps the queue, and says what SES said", async () => {
  const users = Array.from({ length: 6 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes({
    failFor: (_m, n) =>
      n === 3
        ? sesErr(
            "MessageRejected",
            "Email address is not verified. The following identities failed the check in region EU-WEST-1: user3@firm.test",
          )
        : null,
  });
  await seedNotice(store);

  // One at a time, so "stopped after the third" is exact.
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  try {
    const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
    assert.equal(out.stopped, true);
    assert.equal(out.status, "failed");
    assert.match(out.error, /not verified/);
    assert.equal(ses.calls.length, 3, "nothing sent after the refusal");
    assert.equal(out.counts.sent, 2);
    assert.equal(out.counts.failed, 0, "the refused row is not blamed on the recipient");
    assert.equal(out.counts.pending, 4, "the refused row and the rest wait in the queue");
    assert.equal(store.notices.get("revit@3.1.11").status, "failed");
    assert.match(store.notices.get("revit@3.1.11").error, /MessageRejected/);
  } finally {
    delete process.env.MAIL_SEND_RATE_PER_SEC;
  }
});

test("access denied from SES is an account refusal too", async () => {
  const store = memoryStore({ users: [person(1), person(2)] });
  const ses = stubSes({ failFor: () => sesErr("AccessDeniedException", "not authorized to perform ses:SendEmail", 403) });
  await seedNotice(store);
  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(out.stopped, true);
  assert.equal(store.notices.get("revit@3.1.11").status, "failed");
  assert.equal(out.counts.sent, 0);
});

test("throttling is retried; a bad address fails alone and the run carries on", async () => {
  const users = [person(1), person(2), person(3)];
  const store = memoryStore({ users });
  let throttled = false;
  const ses = stubSes({
    failFor: (m) => {
      if (m.to[0] === "user1@firm.test" && !throttled) {
        throttled = true;
        return sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429);
      }
      if (m.to[0] === "user2@firm.test") return sesErr("BadRequestException", "Illegal address");
      return null;
    },
  });
  await seedNotice(store);

  const out = await sendReleaseNotice("revit@3.1.11", runOpts(store, ses));
  assert.equal(out.counts.sent, 2);
  assert.equal(out.counts.failed, 1);
  assert.equal(out.status, "done");
  assert.equal(ses.calls.filter((m) => m.to[0] === "user1@firm.test").length, 2, "retried once");
  assert.equal(ses.calls.filter((m) => m.to[0] === "user2@firm.test").length, 1, "not retried");
  assert.match(store.rows.find((r) => r.email === "user2@firm.test").error, /Illegal address/);
});

test("the daily quota pauses the run without failing the notice", async () => {
  const users = Array.from({ length: 30 }, (_, i) => person(i + 1));
  const store = memoryStore({ users });
  const ses = stubSes();
  await seedNotice(store);
  const out = await sendReleaseNotice(
    "revit@3.1.11",
    runOpts(store, ses, {
      sesAccount: async () => ({ ...PRODUCTION, SendQuota: { MaxSendRate: 14, Max24HourSend: 30, SentLast24Hours: 5 } }),
    }),
  );
  assert.equal(ses.calls.length, 15, "30 - 5 already used - 10 kept in hand");
  assert.equal(out.paused, true);
  assert.equal(out.status, "sending");
  assert.equal(out.counts.pending, 15);
});

test("SES error classification", () => {
  assert.equal(classifySesError(sesErr("MessageRejected", "Email address is not verified.")), "account");
  assert.equal(classifySesError(sesErr("AccessDeniedException", "denied", 403)), "account");
  assert.equal(classifySesError(sesErr("SendingPausedException", "paused")), "account");
  assert.equal(classifySesError(sesErr("AccountSuspendedException", "suspended")), "account");
  assert.equal(classifySesError(sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429)), "retry");
  assert.equal(classifySesError(sesErr("ServiceUnavailable", "down", 503)), "retry");
  assert.equal(classifySesError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })), "retry");
  assert.equal(classifySesError(Object.assign(new Error("no route"), { code: "EHOSTUNREACH" })), "retry");
  assert.equal(classifySesError(sesErr("LimitExceededException", "Daily message quota exceeded.")), "pause");
  assert.equal(classifySesError(sesErr("BadRequestException", "Illegal address")), "recipient");
  assert.equal(classifySesError(sesErr("MessageRejected", "Message content rejected")), "recipient");
});

test("the account verdict: sandbox and paused stop; production gives a rate and a daily allowance", () => {
  assert.equal(sesAccountVerdict({ ProductionAccessEnabled: false }).code, "ses-sandbox");
  assert.equal(sesAccountVerdict({}).code, "ses-sandbox", "not proven production is treated as the sandbox");
  assert.equal(sesAccountVerdict({ ...PRODUCTION, SendingEnabled: false }).code, "ses-paused");
  const v = sesAccountVerdict(PRODUCTION);
  assert.equal(v.ok, true);
  assert.equal(v.ratePerSecond, 12);
  assert.equal(v.remaining24h, 49988);
});

/* ════════════════════════════════════════════════════ dry run, preview ══ */

test("DRY_RUN sends nothing and writes nothing", async () => {
  const store = memoryStore({ users: [person(1), person(2), person(3, { notifications: { productUpdates: false } })] });
  const ses = stubSes();
  await seedNotice(store);
  const before = store.writes.length;

  process.env.DRY_RUN = "1";
  let sesAsked = false;
  const out = await sendReleaseNotice("revit@3.1.11", {
    store,
    send: ses.send,
    sesAccount: async () => {
      sesAsked = true;
      return PRODUCTION;
    },
    log: quiet,
    pause: noPause,
  });
  delete process.env.DRY_RUN;

  assert.equal(out.dryRun, true);
  assert.equal(out.recipients, 2);
  assert.deepEqual(out.skipped, { optedOut: 1 });
  assert.equal(ses.calls.length, 0);
  assert.equal(sesAsked, false);
  assert.equal(store.writes.length, before, "no ledger, no status change");
  assert.equal(store.rows.length, 0);
  assert.equal(store.notices.get("revit@3.1.11").status, "pending");
});

test("the preview counts the audience and renders the mail for a placeholder, without writing", async () => {
  const store = memoryStore({ users: [person(1), person(2, { notifications: { productUpdates: false } })] });
  const p = await previewRelease({ productKey: "revit", version: "3.1.11", releaseNotes: "- One fix", store, log: quiet });
  assert.equal(p.recipients, 1);
  assert.deepEqual(p.skipped, { optedOut: 1 });
  assert.equal(p.key, "revit@3.1.11");
  assert.equal(p.notesSource, "request");
  assert.match(p.subject, /^QUIV 3\.1\.11 is ready/);
  assert.match(p.html, /One fix/);
  assert.ok(!p.html.includes("user1@firm.test"), "no real customer in the preview");
  assert.equal(store.writes.length, 0);
});

/* ══════════════════════════════════════════════════════════ the drain ══ */

test("the drain works through every open notice past its hold", async () => {
  const store = memoryStore({ users: [person(1), person(2, { entitlements: [live("rategen")] })] });
  const ses = stubSes();
  await seedNotice(store, "3.1.11");
  await deploy(store, rategen("2.9.1"), { previous: rategen("2.9.0") });

  const out = await drainNow(store, ses);
  assert.equal(out.open, 2);
  assert.deepEqual(ses.calls.map((m) => m.to[0]).sort(), ["user1@firm.test", "user2@firm.test"]);
  assert.match(ses.calls.find((m) => m.to[0] === "user2@firm.test").subject, /^RateGen 2\.9\.1 is ready/);
});

test("the drain stops at the first SES refusal or pause instead of asking once per notice", async () => {
  const users = [person(1), person(2, { entitlements: [live("rategen")] })];
  const twoNotices = async () => {
    const store = memoryStore({ users });
    await seedNotice(store, "3.1.11");
    await deploy(store, rategen("2.9.1"), { previous: rategen("2.9.0") });
    return store;
  };

  // A sandboxed account: asked once, and the second notice is not touched.
  const s1 = await twoNotices();
  const ses1 = stubSes();
  let asked = 0;
  const out1 = await drainNow(s1, ses1, {
    sesAccount: async () => {
      asked += 1;
      return { ...PRODUCTION, ProductionAccessEnabled: false };
    },
  });
  assert.equal(out1.open, 2);
  assert.equal(out1.results.length, 1);
  assert.equal(out1.results[0].stopped, true);
  assert.equal(asked, 1, "SES asked once, not once per notice");
  assert.equal(ses1.calls.length, 0);
  assert.equal(s1.notices.get("revit@3.1.11").status, "failed");
  assert.equal(s1.notices.get("rategen@2.9.1").status, "pending");

  // Access denied on the first send: one send, and the second notice waits.
  const s2 = await twoNotices();
  const ses2 = stubSes({ failFor: () => sesErr("AccessDeniedException", "not authorized to perform ses:SendEmail", 403) });
  const out2 = await drainNow(s2, ses2);
  assert.equal(out2.results.length, 1);
  assert.equal(out2.results[0].stopped, true);
  assert.equal(ses2.calls.length, 1);
  assert.equal(s2.notices.get("rategen@2.9.1").status, "pending");

  // Throttled past every attempt: the drain pauses too, not just the notice.
  const s3 = await twoNotices();
  const ses3 = stubSes({ failFor: () => sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429) });
  const out3 = await drainNow(s3, ses3);
  assert.equal(out3.results.length, 1);
  assert.equal(out3.results[0].retryLater, true);
  assert.equal(ses3.calls.length, 3);
  assert.equal(s3.notices.get("rategen@2.9.1").status, "pending");
});

/* ══════════════════════════════════════════════════════ SES only, ever ══ */

test("the release mail path uses SES directly and never the mailer that falls back to Resend", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ["releaseNotifier.js", "releaseEmail.js"]) {
    const src = fs.readFileSync(path.join(here, f), "utf8");
    assert.ok(!/from\s+["']\.\/mailer\.js["']/.test(src), `${f} must not import util/mailer.js`);
    assert.ok(!/\bsendMail\s*\(/.test(src), `${f} must not call sendMail`);
    assert.ok(!/RESEND_API_KEY|nodemailer/i.test(src), `${f} must not reach another provider`);
  }
  const notifier = fs.readFileSync(path.join(here, "releaseNotifier.js"), "utf8");
  assert.match(notifier, /import \{[^}]*\bsendViaSesOnce\b[^}]*\} from "\.\/sesTransport\.js"/);
  assert.match(notifier, /send = sendViaSesOnce/);
});
