// server/scheduled.test.js
//
// What rides on what in the scheduled Lambda (scheduled.js). The jobs are
// stand-ins passed to runJob, the way the handler passes the real ones: no
// SSM, no database, no mail.
//
// Pinned: the weekly release digest's tick (util/releaseDigest.js) runs after
// every video poll, even when the poll fails, and the poll's own error is
// still what the invocation throws (so the retries, the dead-letter queue and
// the alarms see exactly what they saw before); a failing tick never fails the
// poll; the tick never runs on the daily jobs, whose function has reserved
// concurrency 1; and the per-release drain, which mailed each release on its
// own, is no longer called by the schedule at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handler, runJob } from "./scheduled.js";

delete process.env.SSM_PREFIX;

function fakeJobs(over = {}) {
  const calls = [];
  const job = (name, result = { ok: true, name }) => async (arg) => {
    calls.push({ name, arg });
    return typeof result === "function" ? result() : result;
  };
  return {
    calls,
    jobs: {
      runAutoRenewals: job("auto-renew"),
      runExpiryNotifier: job("expiry-notifier"),
      runVideoPoll: job("video-poll"),
      runOpsDigest: job("ops-digest"),
      runReleaseDigestTick: job("release-digest", { ok: true, skipped: true, reason: "window-passed" }),
      // Not something the schedule may call any more: present only so a test
      // can prove it is never called.
      runReleaseNoticeDrain: job("per-release-drain"),
      runUnconfirmedSweep: job("unconfirmed-sweep"),
      ...over,
    },
  };
}

const context = { getRemainingTimeInMillis: () => 9 * 60 * 1000 };
const quietly = async (fn) => {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
};

test("video-poll: the digest tick runs after it, with a deadline inside the function's timeout, and no per-release drain", async () => {
  const { jobs, calls } = fakeJobs();
  const t0 = Date.now();
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["video-poll", "release-digest"]);
  const { deadlineAt } = calls[1].arg;
  assert.ok(deadlineAt > t0 && deadlineAt <= t0 + 5 * 60 * 1000 + 1000, "five minutes at most");
  assert.deepEqual(out.releaseDigest, { ok: true, skipped: true, reason: "window-passed" });
  assert.equal(out.releaseNotices, undefined);
});

test("video-poll failing: the digest tick still runs, and the poll's own error is what is thrown", async () => {
  const pollError = new Error("YouTube quota exceeded");
  const { jobs, calls } = fakeJobs({
    runVideoPoll: async () => {
      calls.push({ name: "video-poll" });
      throw pollError;
    },
  });
  await quietly(() => assert.rejects(runJob("video-poll", jobs, context), (err) => err === pollError));
  assert.deepEqual(calls.map((c) => c.name), ["video-poll", "release-digest"]);
});

test("the digest tick failing never fails the poll, and both failing still throws the poll's error", async () => {
  const drainError = new Error("SES exploded");
  const { jobs } = fakeJobs({
    runReleaseDigestTick: async () => {
      throw drainError;
    },
  });
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.equal(out.ok, true);
  assert.deepEqual(out.releaseDigest, { ok: false, error: "SES exploded" });

  const pollError = new Error("poll down");
  const both = fakeJobs({
    runVideoPoll: async () => {
      throw pollError;
    },
    runReleaseDigestTick: async () => {
      throw drainError;
    },
  });
  await quietly(() => assert.rejects(runJob("video-poll", both.jobs, context), (err) => err === pollError));
});

test("the daily jobs never run the digest tick, and their errors are thrown as before", async () => {
  for (const job of ["auto-renew", "expiry-notifier", "ops-digest"]) {
    const { jobs, calls } = fakeJobs();
    await quietly(() => runJob(job, jobs, context));
    assert.ok(!calls.some((c) => c.name === "release-digest" || c.name === "per-release-drain"), job);
  }

  const { jobs, calls } = fakeJobs();
  await quietly(() => runJob("expiry-notifier", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["expiry-notifier", "ops-digest", "unconfirmed-sweep"]);

  const renewError = new Error("card declined storm");
  const failing = fakeJobs({
    runAutoRenewals: async () => {
      throw renewError;
    },
  });
  await quietly(() => assert.rejects(runJob("auto-renew", failing.jobs, context), (err) => err === renewError));
  assert.ok(!failing.calls.some((c) => c.name === "release-digest"));
});

test("release-digest by hand (and the old name, release-notices) runs one digest tick alone, never the per-release drain", async () => {
  for (const name of ["release-digest", "release-notices"]) {
    const { jobs, calls } = fakeJobs();
    await quietly(() => runJob(name, jobs, context));
    assert.deepEqual(calls.map((c) => c.name), ["release-digest"], name);
    assert.ok(calls[0].arg.deadlineAt > Date.now());
  }
});

test("an unknown job is refused before anything connects", async () => {
  await assert.rejects(handler({ job: "mail-everyone" }, {}), /Unknown job "mail-everyone"/);
});
