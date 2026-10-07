// server/prospectingJob.js
// ----------------------------------------------------------------------------
// Lambda entry point for outbound prospecting's daily run: the prospect finder
// then the email writer. Fired once a day by EventBridge Scheduler from its
// own stack (infra/lib/adlm-prospecting-stack.ts), never from AdlmApi.
//
// OFF UNTIL SWITCHED ON. The run does nothing unless the SSM parameter
// PROSPECTING_ENABLED (under the stack's SSM prefix) is "true". Deploying the
// stack therefore spends nothing and contacts no API until someone decides
// to, and switching it off again is one parameter, no deploy.
//
// Nothing here sends mail. Drafts wait in the review queue as pending_review.
//
// A Mongo job lock stops two runs overlapping (EventBridge Scheduler is
// at-least-once), with a TTL longer than the function's timeout so a run that
// dies mid-way cannot leave the lock held forever.
// ----------------------------------------------------------------------------

import "./models/tenancy.bootstrap.js";
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const LOCK_ID = "prospecting_daily_v1";
const LOCK_TTL_MINUTES = 20; // the function times out at 14

/** Same loader as scheduled.js: every parameter under the prefix into env. */
async function loadSecretsIntoEnv() {
  const prefix = process.env.SSM_PREFIX || "";
  if (!prefix) return;
  const ssm = new SSMClient({});
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  let NextToken;
  do {
    const page = await ssm.send(new GetParametersByPathCommand({ Path: p, Recursive: false, WithDecryption: true, MaxResults: 10, NextToken }));
    for (const prm of page.Parameters || []) {
      const key = prm.Name.slice(prm.Name.lastIndexOf("/") + 1);
      if (process.env[key] === undefined) process.env[key] = prm.Value;
    }
    NextToken = page.NextToken;
  } while (NextToken);
}

export async function acquireLock(col, id, ttlMinutes, now = new Date()) {
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const taken = await col.findOneAndUpdate(
    { _id: id, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }] },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );
  if (taken) return true;
  try {
    await col.insertOne({ _id: id, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false;
  }
}

/**
 * The run itself, with everything it touches passed in, so the tests can
 * drive it without SSM, Mongo or any API.
 */
export async function runProspecting({ enabled, lock, unlock, find, draft, log = console.log }) {
  if (!enabled) {
    log("[prospecting] PROSPECTING_ENABLED is not \"true\"; nothing to do.");
    return { ok: true, skipped: "disabled" };
  }
  if (!(await lock())) {
    log("[prospecting] another run holds the lock; skipping.");
    return { ok: true, skipped: "lock-held" };
  }
  try {
    const finder = await find();
    const drafter = await draft();
    const summary = {
      ok: true,
      day: finder.day,
      added: finder.added,
      costUsd: finder.costUsd,
      drafted: drafter.drafted.length,
      draftSkipped: drafter.skipped.length,
      draftFailed: drafter.failed.length,
      errors: finder.errors,
    };
    log(`[prospecting] ${JSON.stringify(summary)}`);
    return { ...summary, finder, drafter };
  } finally {
    await unlock();
  }
}

export async function handler(event, context) {
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  await loadSecretsIntoEnv();

  // Checked before connecting to anything: a disabled run costs one SSM read.
  const enabled = String(process.env.PROSPECTING_ENABLED || "").trim().toLowerCase() === "true";
  if (!enabled) return runProspecting({ enabled });

  const [{ default: mongoose }, { connectDB }] = await Promise.all([import("mongoose"), import("./db.js")]);
  await connectDB(process.env.MONGO_URI);
  const col = mongoose.connection.collection("job_locks");

  const [{ runProspectFinder, runFailed }, { runDraftWriter }, store, { researchCompanies }, { domainSearch }, { loadBriefs }, { createMessage }, { flushAiUsage }, { IdealCustomerProfile }, { dailyCap }] =
    await Promise.all([
      import("./util/prospecting/finder.js"),
      import("./util/prospecting/drafter.js"),
      import("./util/prospecting/store.js").then((m) => m.default),
      import("./util/prospecting/research.js"),
      import("./util/prospecting/hunter.js"),
      import("./util/prospecting/writer.js"),
      import("./services/aiClient.js"),
      import("./services/aiUsage.js"),
      import("./models/IdealCustomerProfile.js"),
      import("./util/prospecting/guards.js"),
    ]);

  try {
    const out = await runProspecting({
      enabled,
      lock: () => acquireLock(col, LOCK_ID, LOCK_TTL_MINUTES),
      unlock: () => col.deleteOne({ _id: LOCK_ID }).catch(() => {}),
      find: () =>
        runProspectFinder({
          store,
          loadProfiles: () => IdealCustomerProfile.find({ active: true }).lean(),
          research: (a) => researchCompanies({ ...a, mode: "live" }),
          findContacts: (d) => domainSearch(d, { mode: "live" }),
          runId: context?.awsRequestId || `run-${Date.now()}`,
        }),
      // Only products whose brief is marked "Status: ready" get drafts.
      draft: () => runDraftWriter({ store, briefs: loadBriefs(), create: createMessage, limit: dailyCap(), requireReady: true }),
    });

    // Every profile failing at the research step (no key, no credit, the API
    // down) is a failed run: throw so the error alarm fires. A partial run
    // did useful work and reports its errors in the log instead.
    if (out.finder && runFailed(out.finder)) {
      throw new Error(`Prospect finder failed for every profile: ${JSON.stringify(out.finder.errors).slice(0, 800)}`);
    }
    return { ok: out.ok, skipped: out.skipped, added: out.added, drafted: out.drafted };
  } finally {
    await flushAiUsage();
  }
}
