// server/scheduled.test.js
//
// What rides on what in the scheduled Lambda (scheduled.js). The jobs are
// stand-ins passed to runJob, the way the handler passes the real ones: no
// SSM, no database, no mail.
//
// Pinned: the release-email drain runs after every video poll, even when the
// poll fails, and the poll's own error is still what the invocation throws
// (so the retries, the dead-letter queue and the alarms see exactly what they
// saw before); a failing drain never fails the poll; and the drain never runs
// on the daily jobs, whose function has reserved concurrency 1.
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
      runReleaseNoticeDrain: job("release-notices", { ok: true, open: 0, results: [] }),
      runUnconfirmedSweep: job("unconfirmed-sweep"),
      runIndexSync: job("sync-indexes", { ok: true, models: 82, built: 82, failed: [] }),
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

test("video-poll: the release drain runs after it, with a deadline inside the function's timeout", async () => {
  const { jobs, calls } = fakeJobs();
  const t0 = Date.now();
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["video-poll", "release-notices"]);
  const { deadlineAt } = calls[1].arg;
  assert.ok(deadlineAt > t0 && deadlineAt <= t0 + 5 * 60 * 1000 + 1000, "five minutes at most");
  assert.deepEqual(out.releaseNotices, { ok: true, open: 0, results: [] });
});

test("video-poll failing: the drain still runs, and the poll's own error is what is thrown", async () => {
  const pollError = new Error("YouTube quota exceeded");
  const { jobs, calls } = fakeJobs({
    runVideoPoll: async () => {
      calls.push({ name: "video-poll" });
      throw pollError;
    },
  });
  await quietly(() => assert.rejects(runJob("video-poll", jobs, context), (err) => err === pollError));
  assert.deepEqual(calls.map((c) => c.name), ["video-poll", "release-notices"]);
});

test("the drain failing never fails the poll, and both failing still throws the poll's error", async () => {
  const drainError = new Error("SES exploded");
  const { jobs } = fakeJobs({
    runReleaseNoticeDrain: async () => {
      throw drainError;
    },
  });
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.equal(out.ok, true);
  assert.deepEqual(out.releaseNotices, { ok: false, error: "SES exploded" });

  const pollError = new Error("poll down");
  const both = fakeJobs({
    runVideoPoll: async () => {
      throw pollError;
    },
    runReleaseNoticeDrain: async () => {
      throw drainError;
    },
  });
  await quietly(() => assert.rejects(runJob("video-poll", both.jobs, context), (err) => err === pollError));
});

test("the daily jobs never run the drain, and their errors are thrown as before", async () => {
  for (const job of ["auto-renew", "expiry-notifier", "ops-digest"]) {
    const { jobs, calls } = fakeJobs();
    await quietly(() => runJob(job, jobs, context));
    assert.ok(!calls.some((c) => c.name === "release-notices"), job);
  }

  const { jobs, calls } = fakeJobs();
  await quietly(() => runJob("expiry-notifier", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), [
    "expiry-notifier",
    "ops-digest",
    "unconfirmed-sweep",
    "sync-indexes",
  ]);

  const renewError = new Error("card declined storm");
  const failing = fakeJobs({
    runAutoRenewals: async () => {
      throw renewError;
    },
  });
  await quietly(() => assert.rejects(runJob("auto-renew", failing.jobs, context), (err) => err === renewError));
  assert.ok(!failing.calls.some((c) => c.name === "release-notices"));
});

test("release-notices by hand runs the drain alone", async () => {
  const { jobs, calls } = fakeJobs();
  await quietly(() => runJob("release-notices", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["release-notices"]);
  assert.ok(calls[0].arg.deadlineAt > Date.now());
});

test("an unknown job is refused before anything connects", async () => {
  await assert.rejects(handler({ job: "mail-everyone" }, {}), /Unknown job "mail-everyone"/);
});

test("video-poll: new uploads are filed on the free shelves first, then the poll, then the drain", async () => {
  const { jobs, calls } = fakeJobs();
  jobs.runFreeLibrary = async () => {
    calls.push({ name: "free-library" });
    return { ok: true, added: 2 };
  };
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["free-library", "video-poll", "release-notices"]);
  assert.deepEqual(out.freeLibrary, { ok: true, added: 2 });
});

// Indexes are built here, not by every API container at cold start
// (util/indexSync.js): a deploy's wave of cold containers each queueing ~324
// createIndex/createCollection commands was the post-deploy 503 burst.
test("the daily expiry job builds indexes last, and a failure there fails nothing", async () => {
  const { jobs } = fakeJobs();
  const out = await quietly(() => runJob("expiry-notifier", jobs, context));
  assert.deepEqual(out.indexes, { ok: true, models: 82, built: 82, failed: [] });

  const failing = fakeJobs({
    runIndexSync: async () => {
      throw new Error("Atlas said no");
    },
  });
  const out2 = await quietly(() => runJob("expiry-notifier", failing.jobs, context));
  assert.equal(out2.ok, true);
  assert.deepEqual(out2.indexes, { ok: false, error: "Atlas said no" });
});

test("sync-indexes by hand runs the index build alone", async () => {
  const { jobs, calls } = fakeJobs();
  await quietly(() => runJob("sync-indexes", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["sync-indexes"]);
});

test("a failing channel feed never stops the poll or the drain", async () => {
  const { jobs, calls } = fakeJobs();
  jobs.runFreeLibrary = async () => {
    throw new Error("feed timed out");
  };
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.deepEqual(calls.map((c) => c.name), ["video-poll", "release-notices"]);
  assert.deepEqual(out.freeLibrary, { ok: false, error: "feed timed out" });
});

/* The campaign sweep (util/campaignSend.js): the safety net for a marketing
   send the API could not finish. It rides on EVERY scheduled invocation, last,
   with a budget inside the function's timeout, and never fails the job. */

function withSweep(sweep) {
  const f = fakeJobs();
  f.jobs.runCampaignSweep = async (arg) => {
    f.calls.push({ name: "campaign-sweep", arg });
    return sweep ? sweep(arg) : { ok: true, checked: 0, results: [] };
  };
  return f;
}

test("the campaign sweep runs last on every job, with a budget a minute inside the time left", async () => {
  for (const [job, before] of [
    ["video-poll", ["video-poll", "release-notices"]],
    ["auto-renew", ["auto-renew"]],
    ["expiry-notifier", ["expiry-notifier", "ops-digest", "unconfirmed-sweep", "sync-indexes"]],
    ["release-notices", ["release-notices"]],
  ]) {
    const { jobs, calls } = withSweep();
    const out = await quietly(() => runJob(job, jobs, context));
    assert.deepEqual(calls.map((c) => c.name), [...before, "campaign-sweep"], job);
    const { deadlineMs } = calls.at(-1).arg;
    assert.ok(deadlineMs > 0 && deadlineMs <= 5 * 60 * 1000, `${job}: five minutes at most`);
    assert.deepEqual(out.campaignSweep, { ok: true, checked: 0, results: [] });
  }

  const { jobs, calls } = withSweep();
  await quietly(() => runJob("auto-renew", jobs, { getRemainingTimeInMillis: () => 3 * 60 * 1000 }));
  assert.ok(calls.at(-1).arg.deadlineMs <= 2 * 60 * 1000, "a minute short of what is left");
});

test("the campaign sweep failing never fails the job", async () => {
  const { jobs } = withSweep(() => {
    throw new Error("Mongo went away");
  });
  const out = await quietly(() => runJob("video-poll", jobs, context));
  assert.equal(out.ok, true);
  assert.deepEqual(out.campaignSweep, { ok: false, error: "Mongo went away" });
});

test("a failing video poll still runs the campaign sweep, and still throws the poll's error", async () => {
  const pollError = new Error("YouTube quota exceeded");
  const { jobs, calls } = withSweep();
  jobs.runVideoPoll = async () => {
    throw pollError;
  };
  await quietly(() => assert.rejects(runJob("video-poll", jobs, context), (err) => err === pollError));
  assert.equal(calls.at(-1).name, "campaign-sweep");
});

test("with under a minute and a quarter left, the sweep is skipped rather than started", async () => {
  const { jobs, calls } = withSweep();
  const out = await quietly(() => runJob("auto-renew", jobs, { getRemainingTimeInMillis: () => 70 * 1000 }));
  assert.ok(!calls.some((c) => c.name === "campaign-sweep"));
  assert.equal(out.campaignSweep.skipped, true);
});
