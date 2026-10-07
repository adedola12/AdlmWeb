// server/util/releaseGateFlow.test.js
//
// The release gate's "apply" (approve and emergency both call applyCandidate),
// where three rules meet:
//
//   1. THE GATE. Nothing a customer can see happens until the approver signs
//      off, so this is the ONLY place a staged candidate becomes a customer
//      notice. A candidate sitting at /admin/releases has no notice at all, and
//      a notice is the only thing a digest can carry.
//   2. THE ROLLOUT (util/releaseRollout.js). A plain release goes to firms of
//      more than five seats first: the live row everyone else is offered is left
//      alone and the payload is kept as `earlyAccess`. A hotfix goes to
//      everyone at once.
//   3. THE WEEKLY DIGEST (util/releaseDigest.js). Nothing is mailed here: the
//      notice is recorded and the approve/emergency response says WHEN
//      customers hear (nextDigestAt, nextDigestLagos), exactly as the
//      deployment PUT's does.
//
// No database and no mail: the deployment reads and writes are answered by a
// stand-in, the notice is recorded in the in-memory store the notifier tests
// use, and the gated-setting path's recorder is a spy.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCandidate } from "./releaseGateFlow.js";
import { recordDeploymentRelease } from "./releaseNotifier.js";
import { nextDigestRun, withNextDigest } from "./releaseDigest.js";
import { ROLLOUT_EVERYONE, ROLLOUT_ORGANIZATIONS } from "./releaseRollout.js";
import { memoryStore, person, put, quiet } from "./releaseNotifier.memoryStore.js";

const TUESDAY = "2026-09-22T09:00:00.000Z"; // Tue 22 Sep 2026, 10:00 WAT
const at = (iso) => () => new Date(iso);
const here = path.dirname(fileURLToPath(import.meta.url));

/** ProductDeployment, as far as applyCandidate uses it. */
function deploymentsFrom(store) {
  return {
    findOne: ({ productKey }) => ({
      select: () => ({ lean: () => Promise.resolve(store.deployments.get(productKey) ?? null) }),
    }),
    findOneAndUpdate: async ({ productKey }, update) => {
      const item = { ...(store.deployments.get(productKey) || {}), ...update.$set, productKey };
      store.deployments.set(productKey, item);
      return item;
    },
    updateOne: async ({ productKey }, update) => {
      store.deployments.set(productKey, { ...(store.deployments.get(productKey) || {}), ...update.$set, productKey });
      return { modifiedCount: 1 };
    },
  };
}

/** applyCandidate with every outside edge answered from memory. */
const apply = (candidate, store, over = {}) =>
  applyCandidate(candidate, {
    actor: "approver@adlm.test",
    now: new Date(TUESDAY),
    deployments: deploymentsFrom(store),
    record: (args) => recordDeploymentRelease({ ...args, store, log: quiet, now: at(TUESDAY) }),
    annotate: (rn) => withNextDigest(rn, { next: () => nextDigestRun({ store, now: at(TUESDAY) }) }),
    ...over,
  });

const candidateFor = (version, over = {}) => ({
  _id: "cand1",
  productKey: "revit",
  submittedBy: "releaser@adlm.test",
  payload: put(version),
  notifyBody: { releaseNotes: "### Fixed\n- Budget totals hold after a re-run" },
  ...over,
});

test("approving a release sends it to firms first, and its notice carries the weekly digest's date", async () => {
  const store = memoryStore({ users: [person(1)] });
  store.deployments.set("revit", put("3.1.10"));

  const { item, releaseNotice, appliedTo } = await apply(candidateFor("3.1.11"), store);

  // The rollout: everyone else stays on what they have, the build waits in
  // earlyAccess, and only the firms' accounts are in the notice's audience.
  assert.equal(appliedTo, ROLLOUT_ORGANIZATIONS);
  assert.equal(item.version, "3.1.10", "the live row everyone else is offered is untouched");
  assert.equal(item.earlyAccess.version, "3.1.11");
  assert.equal(releaseNotice.key, "revit@3.1.11");
  assert.equal(store.notices.get("revit@3.1.11").audience, ROLLOUT_ORGANIZATIONS);

  // The digest: recorded, nothing sent, and the answer says when it goes.
  assert.equal(releaseNotice.status, "pending");
  assert.equal(releaseNotice.deliveredBy, "weekly-digest");
  assert.equal(releaseNotice.nextDigestAt, "2026-09-28T08:00:00.000Z");
  assert.equal(releaseNotice.nextDigestLagos, "Mon 28 Sep 2026, 09:00 WAT");
  assert.equal(store.rows.length, 0, "nobody is enrolled, so nobody can be mailed yet");
});

test("a hotfix goes to everyone at once, and is still only mailed in the digest", async () => {
  const store = memoryStore({ users: [person(1)] });
  store.deployments.set("revit", put("3.1.10"));

  const { item, releaseNotice, appliedTo } = await apply(candidateFor("3.1.11"), store, { rollout: "everyone" });

  assert.equal(appliedTo, ROLLOUT_EVERYONE);
  assert.equal(item.version, "3.1.11", "a hotfix is live for everybody");
  assert.equal(store.notices.get("revit@3.1.11").audience, "everyone");
  assert.equal(releaseNotice.deliveredBy, "weekly-digest");
  assert.equal(releaseNotice.nextDigestLagos, "Mon 28 Sep 2026, 09:00 WAT");
});

test("a first release has nothing to hold firms back from, so it goes to everyone", async () => {
  const store = memoryStore({ users: [person(1)] });
  const { item, appliedTo, releaseNotice } = await apply(candidateFor("1.0.0"), store);
  assert.equal(appliedTo, ROLLOUT_EVERYONE, "holding it back would leave single users with nothing");
  assert.equal(item.version, "1.0.0");
  // A first deployment is not an update, so it announces nothing, as before.
  assert.equal(releaseNotice.created, false);
  assert.equal(releaseNotice.reason, "first-deployment");
  assert.equal(store.notices.size, 0);
});

test("approving a new Installation Center is what queues it; staging it queues nothing", async () => {
  const store = memoryStore({ users: [person(1)] });
  const asked = [];
  const candidate = {
    _id: "cand2",
    kind: "setting",
    settingField: "installerHubUrl",
    settingPrevious: "https://cdn.test/ADLMInstallerHub-v1.0.2.zip",
    productKey: "installer-hub",
    payload: { installerHubUrl: "https://cdn.test/ADLMInstallerHub-v1.0.3.zip" },
  };

  const { releaseNotice, appliedTo } = await apply(candidate, store, {
    recordHub: async (o) => {
      asked.push(o);
      return { created: true, key: "hub@1.0.3", status: "pending", deliveredBy: "weekly-digest" };
    },
    // applySettingCandidate itself writes the Setting; the write is not what
    // this test is about, so it is answered without a database.
    applySetting: async () => ({ setting: { installerHubUrl: candidate.payload.installerHubUrl } }),
  });

  assert.equal(appliedTo, "everyone", "a Hub link reaches every customer at once");
  assert.equal(asked.length, 1, "the hub notice is queued exactly once, on approval");
  assert.equal(asked[0].previousUrl, candidate.settingPrevious);
  assert.equal(asked[0].nextUrl, candidate.payload.installerHubUrl);
  assert.equal(releaseNotice.key, "hub@1.0.3");
  assert.equal(releaseNotice.nextDigestLagos, "Mon 28 Sep 2026, 09:00 WAT");

  // The staging side of the same change records nothing: the route has no
  // digest recorder at all, so an unapproved Hub link cannot reach a digest.
  const route = fs.readFileSync(path.join(here, "..", "routes", "admin.settings.js"), "utf8");
  assert.ok(!/releaseDigest/.test(route), "routes/admin.settings.js must not queue customer mail");
  assert.match(route, /stageSettingChange\(/);
});

test("a failure to work out the date never fails the approval", async () => {
  const store = memoryStore({ users: [person(1)] });
  store.deployments.set("revit", put("3.1.10"));
  const { releaseNotice } = await apply(candidateFor("3.1.11"), store, {
    annotate: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(releaseNotice.key, "revit@3.1.11");
  assert.equal(releaseNotice.nextDigestAt, undefined);
});

test("by default applyCandidate dates the notice with withNextDigest, and no comment promises a ten-minute hold", () => {
  const src = fs.readFileSync(path.join(here, "releaseGateFlow.js"), "utf8");
  assert.match(src, /annotate = withNextDigest/);
  assert.match(src, /recordHub = recordInstallerHubChange/);
  assert.ok(!/ten minutes/i.test(src), "the notifier no longer holds customer mail for ten minutes");
});

// The gate's other half: a PUT that needs sign-off must answer 202 and return
// BEFORE anything records a customer notice, so a staged build is never in a
// digest. Read from the source because the route itself needs a database.
test("the gated deployment PUT returns before it could record a notice", () => {
  const src = fs.readFileSync(path.join(here, "..", "routes", "admin.deployments.js"), "utf8");
  const gate = src.indexOf("isGatedChange(current, normalized)");
  const staged202 = src.indexOf("pendingApproval: true", gate);
  const records = src.indexOf("await recordDeploymentRelease(", gate);
  assert.ok(gate > 0, "the gate is still in the PUT");
  assert.ok(staged202 > gate, "it answers 202 pendingApproval");
  assert.ok(records > staged202, "and it does that before anything records a notice");
  // The staged answer itself carries no notice, so nothing to mail is created.
  const stagedAnswer = src.slice(staged202, src.indexOf("});", staged202));
  assert.ok(!/releaseNotice/.test(stagedAnswer), "no releaseNotice on the staged answer");
});
