#!/usr/bin/env node
/**
 * Copy every environment variable from a Render service into AWS SSM Parameter
 * Store as SecureStrings, ready for the Lambda to read at cold start.
 *
 * Hand-copying ~50 secrets out of a dashboard is slow and it is the step where
 * a single transposed character produces a failure that looks like something
 * else entirely — a wrong MONGO_URI reads as "database down", a wrong
 * JWT_LICENSE_SECRET reads as "every plugin licence is invalid".
 *
 * Values are never printed. Only key names and value lengths are logged.
 *
 * USAGE
 *   # 1. Render dashboard -> account menu -> Account Settings -> API Keys
 *   $env:RENDER_API_KEY    = "rnd_..."         # PowerShell
 *   $env:RENDER_SERVICE_ID = "srv-d35q9jodl3ps7395a3f0"
 *   $env:AWS_PROFILE       = "adlm-deploy"
 *
 *   # 2. Dry run FIRST — writes nothing, shows exactly what would happen
 *   node scripts/render-env-to-ssm.mjs
 *
 *   # 3. Apply
 *   node scripts/render-env-to-ssm.mjs --apply
 *
 * Re-runnable: every write is an overwrite, so running it again after fixing a
 * value in Render just re-syncs.
 */

import {
  SSMClient,
  PutParameterCommand,
  GetParametersByPathCommand,
} from "@aws-sdk/client-ssm";

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const SERVICE_ID = process.env.RENDER_SERVICE_ID;
const REGION = process.env.AWS_REGION || "eu-west-1";
const PREFIX = (process.env.SSM_PREFIX || "/adlm/cloud/prod").replace(/\/$/, "");
const APPLY = process.argv.includes("--apply");

/**
 * Set by the CDK stack's Lambda environment, which must win. Copying Render's
 * values for these would either re-enable node-cron inside Lambda (every warm
 * container scheduling its own copy of a job that CHARGES REAL CARDS) or
 * override settings the stack is responsible for.
 */
const STACK_MANAGED = new Set([
  "NODE_ENV",
  "PORT",
  "SERVE_CLIENT",
  "ENABLE_EXPIRY_CRON",
  "ENABLE_RENEWAL_CRON",
  "SSM_PREFIX",
  "MONGO_MAX_POOL",
  "NODE_OPTIONS",
  // Lambda injects its own credentials; a copied static key would both
  // override them and be a needless long-lived secret.
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
]);

/** Values that mean something different on Lambda than they did on Render. */
const NEEDS_ATTENTION = {
  AWS_CLOUDFRONT_PRIVATE_KEY:
    "was a FILE PATH on Render; Lambda has no disk. Store the PEM contents " +
    "themselves (see Render -> Secret Files).",
  MPXJ_API_URL:
    "points at the Render MPXJ service, which is also down. .mpp import will " +
    "fail with the existing friendly error until that service is replaced.",
  CORS_ORIGINS:
    "the stack sets this too; the stack's value wins at runtime. Harmless.",
};

function die(msg) {
  console.error(`\n  ERROR: ${msg}\n`);
  process.exit(1);
}

if (!RENDER_API_KEY) die("RENDER_API_KEY is not set.");
if (!SERVICE_ID) die("RENDER_SERVICE_ID is not set (e.g. srv-xxxxxxxxxxxx).");

/** Render paginates with an opaque cursor. */
async function fetchRenderEnv() {
  const out = new Map();
  let cursor = "";

  for (;;) {
    const url =
      `https://api.render.com/v1/services/${SERVICE_ID}/env-vars?limit=100` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${RENDER_API_KEY}`,
        accept: "application/json",
      },
    });

    if (res.status === 401) die("Render rejected the API key (401).");
    if (res.status === 404)
      die(`Render has no service "${SERVICE_ID}" (404). Check the ID in the dashboard URL.`);
    if (!res.ok) die(`Render API returned ${res.status}: ${await res.text()}`);

    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;

    for (const row of page) {
      const ev = row?.envVar ?? row;
      if (ev?.key) out.set(ev.key, ev.value ?? "");
    }

    cursor = page[page.length - 1]?.cursor || "";
    if (!cursor) break;
  }

  return out;
}

/** Best-effort: secret files hold things like the CloudFront signing PEM. */
async function fetchRenderSecretFiles() {
  try {
    const res = await fetch(
      `https://api.render.com/v1/services/${SERVICE_ID}/secret-files`,
      {
        headers: {
          authorization: `Bearer ${RENDER_API_KEY}`,
          accept: "application/json",
        },
      },
    );
    if (!res.ok) return [];
    const page = await res.json();
    return (Array.isArray(page) ? page : [])
      .map((r) => r?.secretFile ?? r)
      .filter((f) => f?.name);
  } catch {
    return [];
  }
}

async function listExisting(ssm) {
  const names = new Set();
  let NextToken;
  do {
    const page = await ssm.send(
      new GetParametersByPathCommand({
        Path: PREFIX,
        Recursive: false,
        WithDecryption: false,
        MaxResults: 10,
        NextToken,
      }),
    );
    for (const p of page.Parameters || [])
      names.add(p.Name.slice(p.Name.lastIndexOf("/") + 1));
    NextToken = page.NextToken;
  } while (NextToken);
  return names;
}

const main = async () => {
  console.log(`\nRender service : ${SERVICE_ID}`);
  console.log(`SSM prefix     : ${PREFIX}  (${REGION})`);
  console.log(`Mode           : ${APPLY ? "APPLY — will write" : "DRY RUN — writes nothing"}\n`);

  const env = await fetchRenderEnv();
  if (env.size === 0) die("Render returned no environment variables.");

  const ssm = new SSMClient({ region: REGION });
  let existing = new Set();
  try {
    existing = await listExisting(ssm);
  } catch (e) {
    if (APPLY) die(`Could not read SSM: ${e.message}`);
    console.warn(`  (could not read existing SSM parameters: ${e.message})\n`);
  }

  const toWrite = [];
  const skipped = [];

  for (const [key, value] of [...env].sort(([a], [b]) => a.localeCompare(b))) {
    if (STACK_MANAGED.has(key)) {
      skipped.push(key);
      continue;
    }
    toWrite.push([key, value]);
  }

  console.log(`Found ${env.size} variables on Render.`);
  console.log(`  ${toWrite.length} to copy, ${skipped.length} skipped (stack-managed).\n`);

  for (const [key, value] of toWrite) {
    const mark = existing.has(key) ? "update" : "create";
    const len = String(value).length;
    console.log(`  ${APPLY ? mark : `would ${mark}`.padEnd(13)} ${key}  (${len} chars)`);

    if (!APPLY) continue;

    if (!String(value).length) {
      console.log(`      ^ empty on Render — skipping rather than storing ""`);
      continue;
    }

    await ssm.send(
      new PutParameterCommand({
        Name: `${PREFIX}/${key}`,
        Value: String(value),
        Type: "SecureString", // standard tier is free; never Advanced
        Overwrite: true,
      }),
    );
  }

  if (skipped.length) {
    console.log(`\nSkipped (the CDK stack sets these itself):\n  ${skipped.join(", ")}`);
  }

  const flagged = toWrite.map(([k]) => k).filter((k) => NEEDS_ATTENTION[k]);
  if (flagged.length) {
    console.log(`\nCopied, but these need a human decision:`);
    for (const k of flagged) console.log(`  ${k}\n      ${NEEDS_ATTENTION[k]}`);
  }

  const files = await fetchRenderSecretFiles();
  if (files.length) {
    console.log(`\nRender also has ${files.length} SECRET FILE(S) — NOT copied:`);
    for (const f of files) console.log(`  ${f.name}`);
    console.log(
      `  Lambda has no filesystem. Anything here that the app reads from disk\n` +
        `  (the CloudFront signing PEM especially) must be stored as an SSM\n` +
        `  parameter holding the file's CONTENTS.`,
    );
  }

  const criticals = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing = criticals.filter((k) => !env.has(k));
  if (missing.length) {
    console.log(
      `\n  WARNING: not present on Render: ${missing.join(", ")}\n` +
        `  The Lambda exits on cold start without these.`,
    );
  }

  console.log(
    APPLY
      ? `\nDone. Verify:\n  aws ssm get-parameters-by-path --region ${REGION} --path ${PREFIX} --query 'length(Parameters)'\n`
      : `\nNothing was written. Re-run with --apply to perform the copy.\n`,
  );
};

main().catch((e) => die(e?.message || String(e)));
