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
    const [{ runExpiryNotifier }, { runAutoRenewals }] = await Promise.all([
      import("./util/expiryNotifier.js"),
      import("./util/autoRenew.js"),
    ]);
    return { runExpiryNotifier, runAutoRenewals };
  })().catch((err) => {
    _readyPromise = null;
    throw err;
  });

  return _readyPromise;
}

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  const job = String(event?.job || "").trim();

  // Validate BEFORE connecting: a misconfigured rule should fail immediately
  // and cheaply rather than after an SSM fetch and an Atlas handshake.
  // Throwing sends the event to the scheduler's dead-letter queue, where the
  // DLQ-depth alarm surfaces it. Silently succeeding would hide a broken rule
  // until someone noticed nobody had been renewed.
  const KNOWN = ["expiry-notifier", "auto-renew"];
  if (!KNOWN.includes(job)) {
    throw new Error(`Unknown job "${job}". Expected one of: ${KNOWN.join(", ")}.`);
  }

  const jobs = await ready();
  const run =
    job === "auto-renew" ? jobs.runAutoRenewals : jobs.runExpiryNotifier;

  const startedAt = Date.now();
  console.log(`[scheduled] ${job} starting`);

  const out = await run();

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
