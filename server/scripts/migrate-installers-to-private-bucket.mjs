#!/usr/bin/env node
/**
 * Moves installer packages out of the public R2 bucket into a private one.
 *
 * WHY
 *   ProductDeployment.packageUri is stored as R2_PUBLIC_BASE_URL/<key> and
 *   /me/deployments hands it back as-is. That URL needs no credential and
 *   never expires, so any entitled user can pass it to anyone — and for HERON
 *   the payload is the proprietary takeoff template tree. utils/r2Upload.js
 *   can sign short-lived GETs instead, but only once the objects live in a
 *   bucket that is not publicly readable.
 *
 * SCOPE — adlm/installers ONLY
 *   adlm/installer-hub is deliberately left alone. That prefix holds the
 *   Installer Hub download itself, which has to stay reachable by someone who
 *   does not have an account yet. Making it private would break the front
 *   door. Same for adlm/previews, videos, certificates and mobile-app, which
 *   is also why R2_BUCKET cannot simply be closed.
 *
 * ORDER — copy first, delete LAST
 *   The steps are separate commands on purpose. Deleting the public originals
 *   before signed delivery is actually live takes every install on the
 *   platform down: the URLs already in ProductDeployment would 404 and nothing
 *   would be signing replacements yet. So:
 *
 *     1. --create-bucket     additive, safe
 *     2. --copy              additive, safe: both copies exist
 *     3. deploy the server code that signs GETs
 *     4. configure-r2.mjs --set R2_INSTALLERS_BUCKET=<name>, then let the
 *        Lambda cold-start (it reads SSM once, at start)
 *     5. --verify            proves signed downloads actually work
 *     6. --delete-originals  closes the exposure
 *
 *   --delete-originals refuses to run until it has proved 4 and 5 itself. A
 *   copy alone fixes nothing — the public originals stay downloadable — so
 *   step 6 is the one that matters, but it is only safe after step 5.
 *
 * USAGE
 *   node scripts/migrate-installers-to-private-bucket.mjs --plan
 *   node scripts/migrate-installers-to-private-bucket.mjs --create-bucket --bucket adlm-installers
 *   node scripts/migrate-installers-to-private-bucket.mjs --copy          --bucket adlm-installers
 *   node scripts/migrate-installers-to-private-bucket.mjs --verify        --bucket adlm-installers
 *   node scripts/migrate-installers-to-private-bucket.mjs --delete-originals --bucket adlm-installers --confirm
 *
 * Credentials are read from SSM and never printed. Needs AWS credentials with
 * ssm:GetParameter (with decryption) on /adlm/cloud/prod.
 */
import { execFileSync } from "node:child_process";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const SSM_PREFIX = (process.env.SSM_PREFIX || "/adlm/cloud/prod").replace(/\/+$/, "");
const AWS_REGION = process.env.AWS_REGION || "eu-west-1";
const PREFIX = "adlm/installers/";

/** Reads one SSM parameter. The value is returned, never logged. */
function ssm(name) {
  try {
    return execFileSync(
      "aws",
      [
        "ssm",
        "get-parameter",
        "--name",
        `${SSM_PREFIX}/${name}`,
        "--with-decryption",
        "--query",
        "Parameter.Value",
        "--output",
        "text",
        "--region",
        AWS_REGION,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (err) {
    // stderr can echo the parameter name but never its value.
    throw new Error(`Could not read ${SSM_PREFIX}/${name}: ${String(err.stderr || err.message).trim()}`);
  }
}

function loadConfig() {
  const accountId = ssm("R2_ACCOUNT_ID");
  const cfg = {
    accountId,
    accessKeyId: ssm("R2_ACCESS_KEY_ID"),
    secretAccessKey: ssm("R2_SECRET_ACCESS_KEY"),
    publicBucket: ssm("R2_BUCKET"),
    publicBaseUrl: ssm("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
  for (const [k, v] of Object.entries(cfg)) {
    if (!v) throw new Error(`R2 config incomplete: ${k} is empty.`);
  }
  return cfg;
}

function makeClient(cfg) {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

async function listInstallerObjects(client, bucket, prefix = PREFIX) {
  const out = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken }),
    );
    for (const o of page.Contents || []) {
      out.push({ key: o.Key, size: o.Size, etag: String(o.ETag || "").replace(/"/g, "") });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

async function cmdPlan(client, cfg) {
  const objects = await listInstallerObjects(client, cfg.publicBucket);
  const total = objects.reduce((n, o) => n + o.size, 0);

  console.log(`\nPublic bucket : ${cfg.publicBucket}`);
  console.log(`Prefix        : ${PREFIX}`);
  console.log(`Objects       : ${objects.length}  (${mb(total)})\n`);
  for (const o of objects) console.log(`  ${mb(o.size).padStart(10)}  ${o.key}`);

  // Prove the exposure rather than asserting it.
  if (objects.length) {
    const probe = `${cfg.publicBaseUrl}/${objects[0].key.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(probe, { method: "HEAD" });
    console.log(
      `\nUnauthenticated HEAD on the first object -> ${res.status}` +
        (res.status === 200
          ? "  PUBLICLY DOWNLOADABLE, no credential required."
          : "  not publicly readable."),
    );
  }
  console.log(
    "\nadlm/installer-hub is NOT in scope: that is the Installer Hub download" +
      "\nitself, which must stay reachable without an account.\n",
  );
}

async function cmdCreateBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket "${bucket}" already exists — nothing to do.`);
    return;
  } catch (err) {
    const code = err?.$metadata?.httpStatusCode;
    if (code !== 404 && code !== 403) throw err;
  }
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 403) {
      throw new Error(
        `Access Denied creating "${bucket}".\n\n` +
          "The production R2 token is scoped to the adlm-installers bucket only —\n" +
          "ListBuckets and HeadBucket on any other bucket both answer 403, so it can\n" +
          "neither create a bucket nor write to one it does not already cover.\n\n" +
          "Create the bucket in the Cloudflare dashboard (R2 > Create bucket), leaving\n" +
          "public access OFF, then widen the R2 API token to cover BOTH buckets with\n" +
          "Object Read & Write. If editing the token preserves its Access Key ID there\n" +
          "is nothing to change in SSM; if Cloudflare mints a new key, update\n" +
          "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY with configure-r2.mjs --set.\n\n" +
          "Account-level admin is NOT needed: the dashboard makes the bucket, and the\n" +
          "copy below only needs object permissions on the two buckets.",
      );
    }
    throw err;
  }
  // R2 buckets are private on creation: public access is an explicit opt-in
  // (an r2.dev subdomain or a bound custom domain), neither of which the S3
  // API can turn on. So a bucket made here is private by construction.
  console.log(`Created "${bucket}". R2 buckets are private unless public access is`);
  console.log("explicitly enabled, so do NOT enable it on this one.");
}

async function cmdCopy(client, cfg, bucket) {
  const objects = await listInstallerObjects(client, cfg.publicBucket);
  if (!objects.length) return console.log("Nothing to copy.");

  console.log(`Copying ${objects.length} object(s) -> ${bucket}\n`);
  let copied = 0;
  let skipped = 0;

  for (const o of objects) {
    // Already there at the same size? Leave it. Makes the command re-runnable
    // after an interruption without re-shipping gigabytes.
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: o.key }));
      if (head.ContentLength === o.size) {
        console.log(`  skip  ${o.key}`);
        skipped += 1;
        continue;
      }
    } catch {
      /* not present yet */
    }

    // Server-side copy: the bytes never leave Cloudflare.
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: o.key,
        CopySource: `/${cfg.publicBucket}/${o.key}`,
      }),
    );
    console.log(`  copy  ${mb(o.size).padStart(10)}  ${o.key}`);
    copied += 1;
  }

  console.log(`\nCopied ${copied}, skipped ${skipped}.`);
  console.log("The public originals are UNTOUCHED and still downloadable — that is");
  console.log("deliberate. Nothing is fixed until --delete-originals runs, and that");
  console.log("is only safe once signed delivery is live.");
}

/**
 * Confirms every public object has a same-size twin in the private bucket, and
 * that the private bucket is genuinely not publicly readable.
 */
async function cmdVerify(client, cfg, bucket) {
  const publicObjects = await listInstallerObjects(client, cfg.publicBucket);
  const problems = [];

  for (const o of publicObjects) {
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: o.key }));
      if (head.ContentLength !== o.size) {
        problems.push(`size mismatch: ${o.key} (${head.ContentLength} vs ${o.size})`);
      }
    } catch {
      problems.push(`missing from ${bucket}: ${o.key}`);
    }
  }

  console.log(`\nChecked ${publicObjects.length} object(s) against "${bucket}".`);
  if (problems.length) {
    for (const p of problems) console.log(`  FAIL  ${p}`);
    return false;
  }
  console.log("  every object present at the same size.");

  // signedDeliveryIsLive prints the specific reason it said no — which of the
  // switch and the deploy is missing. Restating it here would only paper over
  // that with a guess.
  const live = await signedDeliveryIsLive();
  if (live) console.log("  /me/deployments should now be signing URLs.");
  return live;
}

/**
 * True only when the RUNNING API can actually sign installer URLs.
 *
 * Checking that R2_INSTALLERS_BUCKET is set in SSM is not enough, and the
 * first run of this script proved it: the parameter was set before the
 * signing code was deployed, so an SSM-only guard would have green-lit a
 * delete while the live API was still handing out public URLs — an outage
 * across every product.
 *
 * The API Lambda reads SSM once, at cold start. So the parameter must not
 * only exist, it must be OLDER than the Lambda's last modification: if the
 * function has not been redeployed since the switch was set, the running
 * container cannot have seen it.
 *
 * Both facts come from AWS rather than from the operator's memory of what
 * they did in which order.
 */
async function signedDeliveryIsLive() {
  let bucketParam;
  try {
    bucketParam = JSON.parse(
      execFileSync(
        "aws",
        ["ssm", "get-parameter", "--name", `${SSM_PREFIX}/R2_INSTALLERS_BUCKET`,
         "--query", "Parameter.{v:Value,t:LastModifiedDate}", "--output", "json",
         "--region", AWS_REGION],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
  } catch {
    console.log("  R2_INSTALLERS_BUCKET is not set in SSM — signed delivery is not live.");
    return false;
  }

  if (!bucketParam?.v || bucketParam.v === "None") {
    console.log("  R2_INSTALLERS_BUCKET is empty — signed delivery is not live.");
    return false;
  }

  const setAt = new Date(bucketParam.t);
  const fnName = process.env.API_LAMBDA_NAME || (await findApiLambda());
  if (!fnName) {
    console.log("  Could not identify the API Lambda; set API_LAMBDA_NAME to check it.");
    return false;
  }

  let deployedAt;
  try {
    const cfgJson = execFileSync(
      "aws",
      ["lambda", "get-function-configuration", "--function-name", fnName,
       "--query", "LastModified", "--output", "text", "--region", AWS_REGION],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    deployedAt = new Date(cfgJson);
  } catch (err) {
    console.log(`  Could not read ${fnName}: ${String(err.stderr || err.message).trim()}`);
    return false;
  }

  console.log(`  R2_INSTALLERS_BUCKET set   ${setAt.toISOString()}`);
  console.log(`  ${fnName} deployed  ${deployedAt.toISOString()}`);

  if (deployedAt <= setAt) {
    console.log(
      "  The API has NOT been deployed since the switch was set, so the running\n" +
        "  container never read it and is still serving public URLs.",
    );
    return false;
  }

  console.log("  API deployed after the switch was set: signing should be live.");
  return true;
}

/** Finds the API Lambda by its stack-generated name. */
async function findApiLambda() {
  try {
    const names = execFileSync(
      "aws",
      ["lambda", "list-functions", "--query", "Functions[].FunctionName",
       "--output", "text", "--region", AWS_REGION],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
      .trim()
      .split(/\s+/);
    return names.find((n) => /^AdlmApi-ApiFn/i.test(n)) || null;
  } catch {
    return null;
  }
}

async function cmdDeleteOriginals(client, cfg, bucket, confirmed) {
  const ok = await cmdVerify(client, cfg, bucket);
  if (!ok) {
    console.log(
      "\nREFUSING to delete. Every packageUri in ProductDeployment still points at" +
        "\nthe public bucket, so removing those objects now would 404 every install" +
        "\non the platform — HERON, RateGen, QUIV, MEP, Time Pro alike." +
        "\n\nFinish steps 3 and 4 first (deploy the signing code, set" +
        "\nR2_INSTALLERS_BUCKET, let the Lambda cold-start), then run this again.\n",
    );
    process.exit(1);
  }
  if (!confirmed) {
    console.log("\nAll checks passed. Re-run with --confirm to delete the public originals.\n");
    return;
  }

  const objects = await listInstallerObjects(client, cfg.publicBucket);
  for (let i = 0; i < objects.length; i += 1000) {
    const batch = objects.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: cfg.publicBucket,
        Delete: { Objects: batch.map((o) => ({ Key: o.key })) },
      }),
    );
    for (const o of batch) console.log(`  deleted  ${o.key}`);
  }
  console.log(`\nRemoved ${objects.length} public original(s). The exposure is closed.`);
}

async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const valueOf = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const cfg = loadConfig();
  const client = makeClient(cfg);
  const bucket = valueOf("--bucket");

  if (has("--create-bucket") || has("--copy") || has("--verify") || has("--delete-originals")) {
    if (!bucket) throw new Error("--bucket <name> is required for this command.");
  }

  if (has("--create-bucket")) return cmdCreateBucket(client, bucket);
  if (has("--copy")) return cmdCopy(client, cfg, bucket);
  if (has("--verify")) {
    const ok = await cmdVerify(client, cfg, bucket);
    process.exit(ok ? 0 : 1);
  }
  if (has("--delete-originals")) return cmdDeleteOriginals(client, cfg, bucket, has("--confirm"));
  return cmdPlan(client, cfg);
}

main().catch((e) => {
  console.error(`\n${e?.message || e}\n`);
  process.exit(1);
});
