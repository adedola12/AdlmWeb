// server/scheduled.js
// ----------------------------------------------------------------------------
// Lambda entry point for the two daily jobs that node-cron used to run inside
// the long-lived Render process. One EventBridge Scheduler rule per job, each
// passing { "job": "<name>" } as its payload.
//
// Deliberately a SEPARATE function from lambda.js:
//   * reserved concurrency 1, so two runs can never overlap
//   * a much longer timeout than a web request should ever have
//   * its own alarms — a failed nightly batch is a different problem from a
//     failing API, and should not be lost in the API's error rate
//
// Both jobs take a Mongo-backed lock and are safe to retry. EventBridge
// Scheduler is at-least-once, never exactly-once, so that lock is the thing
// standing between a retry and a double charge — see util/autoRenew.js.
// ----------------------------------------------------------------------------

import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const SSM_PREFIX = process.env.SSM_PREFIX || "";
const ssm = SSM_PREFIX ? new SSMClient({}) : null;

let _readyPromise = null;

async function loadSecretsIntoEnv() {
  if (!SSM_PREFIX) return;

  const path = SSM_PREFIX.endsWith("/") ? SSM_PREFIX.slice(0, -1) : SSM_PREFIX;
  let nextToken;

  do {
    const page = await ssm.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: false,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken,
      }),
    );
    for (const p of page.Parameters || []) {
      const key = p.Name.slice(p.Name.lastIndexOf("/") + 1);
      if (process.env[key] === undefined) process.env[key] = p.Value;
    }
    nextToken = page.NextToken;
  } while (nextToken);
}

/**
 * Connect once per container and reuse. Imports are deferred until after the
 * secrets are in process.env, for the same reason as lambda.js.
 */
function ready() {
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    await loadSecretsIntoEnv();
    const { connectDB } = await import("./db.js");
    await connectDB(process.env.MONGO_URI);
    const [
      { runExpiryNotifier },
      { runAutoRenewals },
      { runVideoPoll },
      { runOpsDigest },
      { runReleaseNoticeDrain },
      { runFreeLibraryAuto },
      { FreeVideo },
      { Setting },
    ] = await Promise.all([
      import("./util/expiryNotifier.js"),
      import("./util/autoRenew.js"),
      import("./util/videoNotifier.js"),
      import("./util/opsDigest.js"),
      import("./util/releaseNotifier.js"),
      import("./util/freeLibraryAuto.js"),
      import("./models/Learn.js"),
      import("./models/Setting.js"),
    ]);
    // R02/R10: new uploads onto the free lesson shelves, from the channel's
    // public feed (no API key), skipping videos staff have deleted.
    const runFreeLibrary = () =>
      runFreeLibraryAuto({
        FreeVideo,
        ignoredIds: () =>
          Setting.findOne({ key: "global" })
            .select("freeLibraryIgnored")
            .lean()
            .then((s) => s?.freeLibraryIgnored || []),
      });
    return {
      runExpiryNotifier,
      runAutoRenewals,
      runVideoPoll,
      runOpsDigest,
      runReleaseNoticeDrain,
      runFreeLibrary,
    };
  })().catch((err) => {
    _readyPromise = null;
    throw err;
  });

  return _readyPromise;
}

/**
 * When the release drain must stop: five minutes at most, and always a minute
 * before this invocation's own timeout, so a batch is never cut off mid-send.
 */
function drainDeadline(context) {
  const budget = Number(process.env.RELEASE_DRAIN_BUDGET_MS || 5 * 60 * 1000);
  const remaining =
    typeof context?.getRemainingTimeInMillis === "function"
      ? context.getRemainingTimeInMillis()
      : 9 * 60 * 1000;
  return Date.now() + Math.max(0, Math.min(budget, remaining - 60 * 1000));
}

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  const job = String(event?.job || "").trim();

  // Validate BEFORE connecting: a misconfigured rule should fail immediately
  // and cheaply rather than after an SSM fetch and an Atlas handshake.
  // Throwing sends the event to the scheduler's dead-letter queue, where the
  // DLQ-depth alarm surfaces it. Silently succeeding would hide a broken rule
  // until someone noticed nobody had been renewed.
  const KNOWN = ["expiry-notifier", "auto-renew", "video-poll", "ops-digest", "release-notices"];
  if (!KNOWN.includes(job)) {
    throw new Error(`Unknown job "${job}". Expected one of: ${KNOWN.join(", ")}.`);
  }

  const jobs = await ready();
  return runJob(job, jobs, context);
}

/**
 * One job, with the functions it calls passed in: the handler passes the real
 * ones (ready()), the tests (scheduled.test.js) pass stand-ins, so what rides
 * on what, and which error surfaces, is testable without SSM or a database.
 */
export async function runJob(job, jobs, context) {
  const run = {
    "auto-renew": () => jobs.runAutoRenewals(),
    "expiry-notifier": () => jobs.runExpiryNotifier(),
    // Shares this ENTRY POINT with the daily jobs, but NOT their Lambda
    // function. It runs every fifteen minutes and a big send takes minutes, so
    // on a reserved-concurrency-1 function it would eventually still be
    // running at 08:00 and throttle the auto-renewal into its dead-letter
    // queue. Cards not being charged because a tutorial announcement was busy
    // is not a trade anybody would make, so infra points a second function
    // (VideoPollFn) at this same file — one copy of the code, two concurrency
    // budgets.
    // R02/R10: new uploads onto the free lesson shelves first (runFreeLibrary,
    // from ready()), with its own try/catch so a feed hiccup never stops the
    // announcement poll, and the other way round.
    "video-poll": async () => {
      let freeLibrary;
      try {
        if (jobs.runFreeLibrary) freeLibrary = await jobs.runFreeLibrary();
      } catch (err) {
        console.error("[scheduled] free-library failed:", err?.message || err);
        freeLibrary = { ok: false, error: String(err?.message || err) };
      }
      const poll = await jobs.runVideoPoll();
      return { ...(poll && typeof poll === "object" ? poll : { poll }), freeLibrary };
    },
    // Normally rides on expiry-notifier below; listed so it can be invoked by
    // hand with { "job": "ops-digest" } to resend a morning report.
    "ops-digest": () => jobs.runOpsDigest(),
    // Normally rides on video-poll below; listed so the release emails can be
    // pushed by hand with { "job": "release-notices" }.
    "release-notices": () => jobs.runReleaseNoticeDrain({ deadlineAt: drainDeadline(context) }),
  }[job];
  if (!run) throw new Error(`Unknown job "${job}".`);

  const startedAt = Date.now();
  console.log(`[scheduled] ${job} starting`);

  // video-poll is caught here, not left to throw, only so the release drain
  // below still runs when YouTube has a bad quarter of an hour. The error is
  // rethrown after it, so the retries, the DLQ and the alarms see exactly what
  // they saw before.
  let out;
  let runError = null;
  try {
    out = await run();
  } catch (err) {
    if (job !== "video-poll") throw err;
    runError = err;
  }

  // "QUIV 3.1.11 is ready" emails (util/releaseNotifier.js) ride on the
  // fifteen-minute video poll, for the same reason the ops digest rides on the
  // expiry job: no new schedule, so no change to the shared AdlmApi stack. Own
  // lock, own try/catch, and a deadline inside this function's timeout, so a
  // slow mailshot can never fail the poll or be killed mid-batch.
  if (job === "video-poll") {
    let releaseNotices;
    try {
      releaseNotices = await jobs.runReleaseNoticeDrain({ deadlineAt: drainDeadline(context) });
    } catch (err) {
      console.error("[scheduled] release-notices failed:", err?.message || err);
      releaseNotices = { ok: false, error: String(err?.message || err) };
    }
    if (runError) {
      console.log("[scheduled] release-notices:", JSON.stringify(releaseNotices));
      throw runError;
    }
    if (out && typeof out === "object") out.releaseNotices = releaseNotices;
  }

  // The morning operations report (util/opsDigest.js) runs straight after the
  // daily expiry job instead of on a schedule of its own. A new schedule would
  // mean changing the shared AdlmApi stack, and that stack deletes resources
  // when deployed from the wrong checkout. Its own lock and its own try/catch
  // mean a failed report can never fail the expiry run, and vice versa.
  if (job === "expiry-notifier" && out && typeof out === "object") {
    try {
      out.opsDigest = await jobs.runOpsDigest();
    } catch (err) {
      console.error("[scheduled] ops-digest failed:", err?.message || err);
      out.opsDigest = { ok: false, error: String(err?.message || err) };
    }
    // Close accounts that were given 14 days to confirm their email and did
    // not (util/unconfirmedSweep.js). Same daily slot, own try/catch.
    try {
      const runUnconfirmedSweep =
        jobs.runUnconfirmedSweep ?? (await import("./util/unconfirmedSweep.js")).runUnconfirmedSweep;
      out.unconfirmedSweep = await runUnconfirmedSweep();
    } catch (err) {
      console.error("[scheduled] unconfirmed sweep failed:", err?.message || err);
      out.unconfirmedSweep = { ok: false, error: String(err?.message || err) };
    }
    // Tell the release approver when a build that went to firms first can go
    // to everyone (util/releaseRollout.js). Same daily slot, own try/catch.
    try {
      const runRolloutUnlockReminders =
        jobs.runRolloutUnlockReminders ?? (await import("./util/releaseRollout.js")).runRolloutUnlockReminders;
      out.rolloutReminders = await runRolloutUnlockReminders();
    } catch (err) {
      console.error("[scheduled] rollout reminders failed:", err?.message || err);
      out.rolloutReminders = { ok: false, error: String(err?.message || err) };
    }
  }

  console.log(
    `[scheduled] ${job} done in ${Date.now() - startedAt}ms:`,
    JSON.stringify(out),
  );

  // A skipped run is not a failure — a lock held by an overlapping run is the
  // system working — but it must be visible, because a lock wrongly stuck
  // would otherwise look exactly like a quiet, healthy night.
  if (out?.skipped) {
    console.warn(`[scheduled] ${job} SKIPPED: ${out.reason || "unknown"}`);
  }

  return out;
}

export default handler;
