// server/util/releaseRollout.test.js
//
// Firms with more than 5 seats get a build first; everyone else three months
// later, when the approver presses the button. Hotfixes go to everyone.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLLOUT_EVERYONE,
  ROLLOUT_ORGANIZATIONS,
  bigOrgKeys,
  canReleaseToEveryone,
  earlyAccessFor,
  earlyAccessStillAhead,
  inEarlyRing,
  newestOffered,
  normalizeRollout,
  stageFor,
  unlockDate,
  withEarlyAccess,
} from "./releaseRollout.js";
import { memoryStore, stubSes, PRODUCTION, noPause, quiet } from "./releaseNotifier.memoryStore.js";
import { recordDeploymentRelease, sendReleaseNotice, widenReleaseNotice, cancelEarlyNotices } from "./releaseNotifier.js";

process.env.API_BASE_URL = "https://api.adlmstudio.net";
delete process.env.DRY_RUN;
delete process.env.RELEASE_HOLD_MS;

const NOW = new Date(Date.UTC(2026, 8, 26, 12));
const org = (name, seats, extra = {}) => ({
  productKey: "revit",
  status: "active",
  licenseType: "organization",
  organizationName: name,
  seats,
  ...extra,
});
const user = (id, entitlements, extra = {}) => ({ _id: id, email: `${id}@x.com`, entitlements, ...extra });

const live = { version: "3.1.11", enabled: true, packageUri: "https://r2/v3111.zip" };
const next = { version: "4.0.0", enabled: true, packageUri: "https://r2/v400.zip" };

test("rollout: hotfix spellings mean everyone, anything else firms first", () => {
  assert.equal(normalizeRollout({}), ROLLOUT_ORGANIZATIONS);
  assert.equal(normalizeRollout({ rollout: "organizations" }), ROLLOUT_ORGANIZATIONS);
  assert.equal(normalizeRollout({ rollout: "everyone" }), ROLLOUT_EVERYONE);
  assert.equal(normalizeRollout({ rollout: "Hotfix" }), ROLLOUT_EVERYONE);
  assert.equal(normalizeRollout({ hotfix: true }), ROLLOUT_EVERYONE);
  assert.equal(normalizeRollout({ hotfix: "true" }), ROLLOUT_EVERYONE);
  assert.equal(normalizeRollout({ hotfix: "false" }), ROLLOUT_ORGANIZATIONS);
});

test("stage: a newer build over a live one goes to firms first", () => {
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live, payload: next }), ROLLOUT_ORGANIZATIONS);
});

test("stage: hotfix, first release, switched-off live, same version and rollback go to everyone", () => {
  assert.equal(stageFor({ rollout: ROLLOUT_EVERYONE, live, payload: next }), ROLLOUT_EVERYONE);
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live: null, payload: next }), ROLLOUT_EVERYONE);
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live: { ...live, enabled: false }, payload: next }), ROLLOUT_EVERYONE);
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live, payload: { ...next, version: "3.1.11" } }), ROLLOUT_EVERYONE);
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live, payload: { ...next, version: "3.1.10" } }), ROLLOUT_EVERYONE);
  assert.equal(stageFor({ rollout: ROLLOUT_ORGANIZATIONS, live, payload: { ...next, version: "banana" } }), ROLLOUT_EVERYONE);
});

test("seats: more than 5, added up across products and accounts of the same firm", () => {
  const users = [
    user("ys", [org("Y.S. Associates Ltd", 8)]), // 8: in
    user("itb", [org("ITB Nigeria Limited", 5, { productKey: "planswift" }), org("ITB Nigeria Limited", 1, { productKey: "rategen" })]), // 6: in
    user("cl1", [org("Cost-Link", 2), org("Cost-Link", 2, { productKey: "mep" })]),
    user("cl2", [org("  cost-link ", 2, { productKey: "planswift" })]), // 6 across two accounts: in
    user("five", [org("Exactly Five", 5)]), // 5: not more than 5
    user("gone", [org("Lapsed Big", 9, { expiresAt: new Date(Date.UTC(2026, 7, 1)) })]), // expired
    user("off", [org("Inactive Big", 9, { status: "inactive" })]),
    user("solo", [{ productKey: "revit", status: "active", licenseType: "personal", seats: 9 }]),
  ];
  const big = bigOrgKeys(users, NOW);
  assert.deepEqual([...big].sort(), ["cost-link", "itb nigeria limited", "y.s. associates ltd"]);
  assert.equal(inEarlyRing(users[0], big, NOW), true);
  assert.equal(inEarlyRing(users[3], big, NOW), true);
  assert.equal(inEarlyRing(users[4], big, NOW), false);
  assert.equal(inEarlyRing(users[7], big, NOW), false);
  assert.equal(inEarlyRing(users[0], new Set(), NOW), false);
});

test("three months: the button unlocks on the date, not before", () => {
  const started = new Date(Date.UTC(2026, 8, 26));
  const unlocks = unlockDate(started);
  assert.equal(unlocks.toISOString().slice(0, 10), "2026-12-26");
  assert.equal(canReleaseToEveryone({ unlocksAt: unlocks }, new Date(Date.UTC(2026, 11, 25))), false);
  assert.equal(canReleaseToEveryone({ unlocksAt: unlocks }, unlocks), true);
  assert.equal(canReleaseToEveryone(null, NOW), false);
});

test("a newer build during the window keeps the original clock", () => {
  const first = earlyAccessFor({ existing: null, candidate: { _id: "c1", payload: next }, actor: "r", now: NOW });
  assert.equal(first.version, "4.0.0");
  const later = new Date(Date.UTC(2026, 10, 1));
  const fix = earlyAccessFor({ existing: first, candidate: { _id: "c2", payload: { ...next, version: "4.0.1" } }, actor: "r", now: later });
  assert.equal(fix.version, "4.0.1");
  assert.equal(fix.candidateId, "c2");
  assert.equal(fix.firstVersion, "4.0.0");
  assert.equal(fix.startedAt.getTime(), first.startedAt.getTime());
  assert.equal(fix.unlocksAt.getTime(), first.unlocksAt.getTime());
});

test("a hotfix that catches up with the firms' build ends the early stage", () => {
  const early = { version: "4.0.0" };
  assert.equal(earlyAccessStillAhead(early, "3.1.12"), true);
  assert.equal(earlyAccessStillAhead(early, "4.0.0"), false);
  assert.equal(earlyAccessStillAhead(early, "4.0.1"), false);
});

test("/me/deployments: firms get the early build, everyone else the live one, and nobody gets the record", () => {
  const row = {
    productKey: "revit",
    ...live,
    envVars: { A: "1" },
    earlyAccess: { version: "4.0.0", payload: { ...next, envVars: { A: "2" } } },
  };
  const firm = withEarlyAccess(row, { inRing: true });
  assert.equal(firm.version, "4.0.0");
  assert.equal(firm.packageUri, next.packageUri);
  assert.equal(firm.earlyAccess, true);
  assert.equal(firm.generalVersion, "3.1.11");
  assert.equal(firm.envVars.A, "2");

  const single = withEarlyAccess(row, { inRing: false });
  assert.equal(single.version, "3.1.11");
  assert.equal("earlyAccess" in single, false);

  // An early build that everyone has caught up with is ignored.
  const caughtUp = withEarlyAccess({ ...row, version: "4.0.0" }, { inRing: true });
  assert.equal(caughtUp.earlyAccess, undefined);
});

test("the release email is checked against the newest build offered", () => {
  const d = { ...live, earlyAccess: { version: "4.0.0", payload: next } };
  assert.equal(newestOffered(d).version, "4.0.0");
  assert.equal(newestOffered({ ...live }).version, "3.1.11");
  assert.equal(newestOffered(null), null);
});

/* ─────────────────────────────────────────────── emails follow the rollout ── */

test("mail: a firms-first build is announced to firms only, then widened without mailing anyone twice", async () => {
  const users = [
    user("ys", [org("Y.S. Associates Ltd", 8)]),
    user("solo", [{ productKey: "revit", status: "active", licenseType: "personal", seats: 1 }]),
  ];
  const store = memoryStore({
    users,
    deployments: { revit: { productKey: "revit", ...live, earlyAccess: { version: "4.0.0", payload: next } } },
  });

  const rec = await recordDeploymentRelease({
    previous: live,
    item: { productKey: "revit", ...next },
    audience: ROLLOUT_ORGANIZATIONS,
    store,
    log: quiet,
  });
  assert.equal(rec.created, true);
  const notice = store.notices.get(rec.key);
  assert.equal(notice.audience, ROLLOUT_ORGANIZATIONS);

  // The firms' run enrols only firm accounts.
  const ses = stubSes();
  const opts = { store, send: ses.send, sesAccount: async () => PRODUCTION, pause: noPause, log: quiet, dryRun: false };
  const r1 = await sendReleaseNotice(rec.key, opts);
  assert.equal(r1.status, "done", JSON.stringify(r1));
  assert.deepEqual(store.rows.map((r) => r.email), ["ys@x.com"]);

  // Released to everyone: the notice reopens for the rest.
  const w = await widenReleaseNotice({ productKey: "revit", version: "4.0.0", store, log: quiet });
  assert.equal(w.widened, true);
  assert.equal(store.notices.get(rec.key).status, "pending");
  store.deployments.set("revit", { productKey: "revit", ...next, earlyAccess: null });
  const r2 = await sendReleaseNotice(rec.key, opts);
  assert.equal(r2.status, "done", JSON.stringify(r2));
  const byEmail = Object.fromEntries(store.rows.map((r) => [r.email, r.status]));
  assert.deepEqual(byEmail, { "ys@x.com": "sent", "solo@x.com": "sent" });
  assert.equal(r2.sent, 1, "the firm account is not mailed again");
});

test("mail: a hotfix for everyone still goes out while a newer build is with firms", async () => {
  const store = memoryStore({ users: [], deployments: {} });
  await recordDeploymentRelease({ previous: live, item: { productKey: "revit", ...next }, audience: ROLLOUT_ORGANIZATIONS, store, log: quiet });
  const hot = await recordDeploymentRelease({
    previous: live,
    item: { productKey: "revit", ...live, version: "3.1.12" },
    store,
    log: quiet,
  });
  assert.equal(hot.created, true, hot.reason);
  // And the firms' notice is not superseded by it, nor the other way round.
  assert.equal(store.notices.get("revit@4.0.0").status, "pending");
  assert.equal(store.notices.get("revit@3.1.12").status, "pending");
});

test("mail: taking a build back from firms cancels only the firms' notice", async () => {
  const store = memoryStore({ users: [], deployments: {} });
  await recordDeploymentRelease({ previous: live, item: { productKey: "revit", ...next }, audience: ROLLOUT_ORGANIZATIONS, store, log: quiet });
  await recordDeploymentRelease({ previous: live, item: { productKey: "revit", ...live, version: "3.1.12" }, store, log: quiet });
  const cancelled = await cancelEarlyNotices({ productKey: "revit", store });
  assert.deepEqual(cancelled, ["revit@4.0.0"]);
  assert.equal(store.notices.get("revit@3.1.12").status, "pending");
});
