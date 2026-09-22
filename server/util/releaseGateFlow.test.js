// server/util/releaseGateFlow.test.js
//
// The release gate's "apply" (approve and emergency both call applyCandidate)
// records the customers' release notice, and since the weekly digest that
// notice waits for the digest. The approve and emergency responses carry the
// notice as applyCandidate returns it, so it must say WHEN customers are told
// (nextDigestAt, nextDigestLagos), exactly as the deployment PUT's does.
//
// No database: the deployment reads and writes are answered by a stand-in,
// and the notice is recorded in the in-memory store the notifier tests use.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCandidate } from "./releaseGateFlow.js";
import { recordDeploymentRelease } from "./releaseNotifier.js";
import { nextDigestRun, withNextDigest } from "./releaseDigest.js";
import { memoryStore, person, put, quiet } from "./releaseNotifier.memoryStore.js";

const TUESDAY = "2026-09-22T09:00:00.000Z"; // Tue 22 Sep 2026, 10:00 WAT
const at = (iso) => () => new Date(iso);

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
  };
}

test("approving a release returns its notice with the weekly digest's date, as the deployment PUT does", async () => {
  const store = memoryStore({ users: [person(1)] });
  store.deployments.set("revit", put("3.1.10"));
  const candidate = {
    productKey: "revit",
    submittedBy: "releaser@adlm.test",
    payload: put("3.1.11"),
    notifyBody: { releaseNotes: "### Fixed\n- Budget totals hold after a re-run" },
  };

  const { item, releaseNotice } = await applyCandidate(candidate, {
    actor: "approver@adlm.test",
    deployments: deploymentsFrom(store),
    record: (args) => recordDeploymentRelease({ ...args, store, log: quiet, now: at(TUESDAY) }),
    annotate: (rn) => withNextDigest(rn, { next: () => nextDigestRun({ store, now: at(TUESDAY) }) }),
  });

  assert.equal(item.version, "3.1.11");
  assert.equal(releaseNotice.key, "revit@3.1.11");
  assert.equal(releaseNotice.status, "pending");
  assert.equal(releaseNotice.deliveredBy, "weekly-digest");
  assert.equal(releaseNotice.nextDigestAt, "2026-09-28T08:00:00.000Z");
  assert.equal(releaseNotice.nextDigestLagos, "Mon 28 Sep 2026, 09:00 WAT");
  assert.equal(store.notices.get("revit@3.1.11").status, "pending", "recorded, nothing sent");
});

test("a failure to work out the date never fails the approval", async () => {
  const store = memoryStore({ users: [person(1)] });
  store.deployments.set("revit", put("3.1.10"));
  const { releaseNotice } = await applyCandidate(
    { productKey: "revit", payload: put("3.1.11"), notifyBody: {} },
    {
      actor: "approver@adlm.test",
      deployments: deploymentsFrom(store),
      record: (args) => recordDeploymentRelease({ ...args, store, log: quiet, now: at(TUESDAY) }),
      annotate: async () => {
        throw new Error("db down");
      },
    },
  );
  assert.equal(releaseNotice.key, "revit@3.1.11");
  assert.equal(releaseNotice.nextDigestAt, undefined);
});

test("by default applyCandidate dates the notice with withNextDigest, and no comment still promises a ten-minute hold", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "releaseGateFlow.js"), "utf8");
  assert.match(src, /annotate = withNextDigest/);
  assert.ok(!/ten minutes/i.test(src), "the notifier no longer holds customer mail for ten minutes");
});
