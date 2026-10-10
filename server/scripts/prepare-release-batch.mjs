// server/scripts/prepare-release-batch.mjs
//
// Prepare a release batch from the command line.
//
//   node scripts/prepare-release-batch.mjs --file batch.json --from-ssm [--apply]
//
// WHY THIS EXISTS WHEN THERE IS ALREADY A ROUTE
//
// POST /admin/releases/batch does this, and it is the normal way. It needs a
// signed-in staff session, which a script does not have and must not fake by
// handling anybody's password. So this writes the same document, supersedes the
// same batches and records the same audit event — it is the same operation
// through the other door, not a different one.
//
// WHAT IT DELIBERATELY CANNOT DO
//
// It cannot approve. Preparing a batch only ASKS the approver to test a commit;
// the gate still refuses every merge until he presses Approve on
// /admin/releases and his approval is pinned to that exact sha. Nothing here
// shortens that, and nothing here should ever be extended to.
//
// Without --apply it is a dry run that prints what it would write.

import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { ReleaseBatch } from "../models/ReleaseBatch.js";
import { recordGateEvent } from "../util/releaseGate.js";

const APPLY = process.argv.includes("--apply");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : "";
};

const say = (...a) => console.log(...a);

async function connect() {
  let uri = process.env.MONGO_URI;
  if (!uri && process.argv.includes("--from-ssm")) {
    const region = process.env.AWS_REGION || "eu-west-1";
    const ssm = new SSMClient({ region });
    const r = await ssm.send(
      new GetParameterCommand({ Name: "/adlm/cloud/prod/MONGO_URI", WithDecryption: true }),
    );
    uri = r.Parameter?.Value || "";
    if (!process.env.AUTH_DB) {
      try {
        const a = await ssm.send(
          new GetParameterCommand({ Name: "/adlm/cloud/prod/AUTH_DB", WithDecryption: true }),
        );
        if (a.Parameter?.Value) process.env.AUTH_DB = a.Parameter.Value;
      } catch {
        /* default below matches db.js */
      }
    }
  }
  if (!uri) {
    console.error("prepare-release-batch: MONGO_URI is not set. Pass --from-ssm.");
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName: process.env.AUTH_DB || "adlmWeb" });
  say(`database: ${mongoose.connection.name}`);
}

async function main() {
  const file = arg("--file");
  if (!file) {
    console.error("--file batch.json is required");
    process.exit(1);
  }
  const p = JSON.parse(fs.readFileSync(file, "utf8"));

  const title = String(p.title || "").trim();
  const headSha = String(p.headSha || "").trim().toLowerCase();
  if (!title) {
    console.error("A batch needs a title.");
    process.exit(1);
  }
  // Same check the route makes. A short sha would silently never match the
  // commit the gate asks about, and the batch would look prepared and do
  // nothing.
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    console.error("headSha must be the full 40-character commit.");
    process.exit(1);
  }

  await connect();

  const superseding = await ReleaseBatch.countDocuments({
    status: { $in: ["testing", "changes-requested"] },
  });

  say(`\ntitle      : ${title}`);
  say(`headSha    : ${headSha}`);
  say(`sheet      : ${p.sheetUrl || "(none)"}`);
  say(`branch     : ${p.fromBranch || "release"} -> ${p.toBranch || "main"}`);
  say(`preparedBy : ${p.preparedBy || "(none)"}`);
  say(`items      : ${(p.items || []).length}`);
  say(`supersedes : ${superseding} batch(es) still being tested`);

  if (!APPLY) {
    say("\nDry run. Re-run with --apply to prepare it.");
    await mongoose.disconnect();
    return;
  }

  // One batch at a time, exactly as the route does it: a new one supersedes
  // whatever was still being tested. An ALREADY APPROVED batch is left alone —
  // withdrawing an approval a merge may be relying on right now is not this
  // script's business.
  await ReleaseBatch.updateMany(
    { status: { $in: ["testing", "changes-requested"] } },
    { $set: { status: "superseded" } },
  );

  const batch = await ReleaseBatch.create({
    title,
    headSha,
    sheetUrl: String(p.sheetUrl || "").trim(),
    fromBranch: String(p.fromBranch || "release").trim(),
    toBranch: String(p.toBranch || "main").trim(),
    items: Array.isArray(p.items) ? p.items : [],
    preparedBy: String(p.preparedBy || "").trim().toLowerCase(),
  });

  // The audit trail the route writes. A batch that appears with no record of
  // who prepared it is the thing the gate's audit bucket exists to prevent.
  try {
    await recordGateEvent("batch.prepared", {
      batchId: String(batch._id),
      title,
      headSha,
      actor: String(p.preparedBy || "system").toLowerCase(),
      via: "scripts/prepare-release-batch.mjs",
    });
  } catch (e) {
    console.error(`audit record failed (the batch IS prepared): ${e?.message || e}`);
  }

  say(`\nPrepared ${batch._id}.`);
  say("It is now waiting on the approver at /admin/releases. Nothing merges until he approves.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* already down */
  }
  process.exitCode = 1;
});
