#!/usr/bin/env node
/**
 * Reports and repairs the Cloudflare R2 configuration the installer-upload
 * path depends on, in SSM Parameter Store.
 *
 * WHY THIS EXISTS
 *   utils/r2Upload.js isR2Configured() requires FIVE variables. Miss one and
 *   /admin/deployments/presign-package answers 503 — and that route is the
 *   only one that can accept an installer package at all, because
 *   /upload-package proxies bytes through the Lambda and dies above ~4.4 MB
 *   against a 6 MiB invocation payload cap. The MEP package is 42 MB.
 *
 *   R2_PUBLIC_BASE_URL is the one people miss. Nothing else in the codebase
 *   references it, so its absence looks like a credentials problem.
 *
 * THE CHECK THAT MATTERS
 *   R2_PUBLIC_BASE_URL becomes the packageUri InstallerHub downloads from, so
 *   it has to be publicly readable from outside your network. If it is wrong,
 *   uploads SUCCEED and every install then fails — the damage shows up on
 *   customer machines, not here. --verify fetches a known object to prove it.
 *
 * USAGE
 *   node scripts/configure-r2.mjs                      # report what is set
 *   node scripts/configure-r2.mjs --set R2_PUBLIC_BASE_URL=https://pkg.example
 *   node scripts/configure-r2.mjs --verify             # prove the URL is public
 *   node scripts/configure-r2.mjs --set R2_INSTALLERS_BUCKET=adlm-installers
 *                                                     # switch installers to
 *                                                     # private, signed delivery
 *
 * Values are never printed. Secrets are masked to a length and a 4-char tail
 * so you can tell two keys apart without exposing either.
 *
 * Needs AWS credentials with ssm:GetParametersByPath and ssm:PutParameter.
 */

import {
  SSMClient,
  GetParametersByPathCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

const PREFIX = (process.env.SSM_PREFIX || "/adlm/cloud/prod").replace(/\/+$/, "");
const REGION = process.env.AWS_REGION || "eu-west-1";

// Exactly the list isR2Configured() checks. Keep them in step.
const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
];
// R2_INSTALLERS_BUCKET is the switch for private installer delivery. Unset,
// packages sit in the public R2_BUCKET and every packageUri is a permanent,
// credential-free download link that any entitled user can pass to anyone.
// Set it to a SEPARATE non-public bucket and /me/deployments signs a
// short-lived GET per request instead. Optional because the code must be
// deployable ahead of the bucket — see utils/r2Upload.js.
const OPTIONAL = [
  "R2_S3_ENDPOINT",
  "R2_INSTALLERS_BUCKET",
  "R2_INSTALLER_URL_TTL_SECONDS",
];

// R2_PUBLIC_BASE_URL and R2_BUCKET are not secrets — a public download host
// and a bucket name. Storing them as String keeps them readable without
// kms:Decrypt, which matters when someone is debugging a failed install and
// only has read access. The installer bucket name and its TTL are no more
// secret than those: the bucket is private because of its policy, not
// because nobody knows what it is called.
const PLAINTEXT = new Set([
  "R2_PUBLIC_BASE_URL",
  "R2_BUCKET",
  "R2_S3_ENDPOINT",
  "R2_INSTALLERS_BUCKET",
  "R2_INSTALLER_URL_TTL_SECONDS",
]);

const ssm = new SSMClient({ region: REGION });

const mask = (v) =>
  !v ? "(empty)" : v.length <= 8 ? `(${v.length} chars)` : `(${v.length} chars, ...${v.slice(-4)})`;

async function readAll() {
  const out = new Map();
  let NextToken;
  do {
    const page = await ssm.send(
      new GetParametersByPathCommand({
        Path: PREFIX,
        Recursive: false,
        WithDecryption: true,
        MaxResults: 10,
        NextToken,
      }),
    );
    for (const p of page.Parameters || []) {
      out.set(p.Name.slice(p.Name.lastIndexOf("/") + 1), p.Value);
    }
    NextToken = page.NextToken;
  } while (NextToken);
  return out;
}

function normalizeBaseUrl(raw) {
  const v = String(raw || "").trim().replace(/\/+$/, "");
  if (!v) throw new Error("R2_PUBLIC_BASE_URL is empty");
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`R2_PUBLIC_BASE_URL is not a valid URL: ${v}`);
  }
  if (u.protocol !== "https:") {
    // InstallerHub downloads this over the network on customer machines.
    throw new Error(`R2_PUBLIC_BASE_URL must be https, got ${u.protocol}//`);
  }
  return v;
}

async function verifyPublic(baseUrl, bucketHint) {
  console.log(`\nVerifying ${baseUrl} is publicly readable...`);
  // A HEAD on the root usually 404s even when correctly configured — R2 has no
  // index. What we are proving is that the HOST resolves, serves TLS, and is
  // answering as a bucket rather than, say, a parked domain or a 403 from
  // public access being off.
  let res;
  try {
    res = await fetch(`${baseUrl}/__adlm_probe_${Date.now()}`, { method: "GET", redirect: "manual" });
  } catch (err) {
    console.log(`  UNREACHABLE: ${err?.message || err}`);
    console.log("  InstallerHub would fail to download every package from this host.");
    return false;
  }

  if (res.status === 404) {
    console.log("  OK — host answers and returns 404 for a missing object, which is what a");
    console.log("       correctly configured public bucket does.");
    return true;
  }
  if (res.status === 403) {
    console.log("  403 FORBIDDEN — the host resolves but will not serve objects.");
    console.log("  Public access is off for this bucket, or the custom domain is not bound to it.");
    console.log("  Uploads would succeed and every customer install would then fail.");
    return false;
  }
  if (res.status >= 200 && res.status < 400) {
    console.log(`  ${res.status} — host answers. Unusual for a missing key, but not a failure.`);
    return true;
  }
  console.log(`  ${res.status} — unexpected. Check the bucket's public access settings.`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const doVerify = args.includes("--verify");
  const sets = args
    .map((a, i) => (a === "--set" ? args[i + 1] : null))
    .filter(Boolean)
    .map((kv) => {
      const idx = kv.indexOf("=");
      if (idx < 1) throw new Error(`--set expects KEY=value, got: ${kv}`);
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1)];
    });

  console.log(`\nSSM path : ${PREFIX}`);
  console.log(`Region   : ${REGION}`);

  for (const [key, rawValue] of sets) {
    if (!REQUIRED.includes(key) && !OPTIONAL.includes(key)) {
      throw new Error(`${key} is not an R2 parameter. Expected one of: ${[...REQUIRED, ...OPTIONAL].join(", ")}`);
    }
    const value = key === "R2_PUBLIC_BASE_URL" ? normalizeBaseUrl(rawValue) : String(rawValue).trim();
    const type = PLAINTEXT.has(key) ? "String" : "SecureString";
    await ssm.send(
      new PutParameterCommand({
        Name: `${PREFIX}/${key}`,
        Value: value,
        Type: type,
        Overwrite: true,
      }),
    );
    console.log(`  set ${key} as ${type} ${mask(value)}`);
  }

  const params = await readAll();
  console.log("\nR2 configuration");
  let missing = 0;
  for (const key of REQUIRED) {
    const v = params.get(key);
    if (!v || !String(v).trim()) {
      missing += 1;
      console.log(`  MISSING  ${key}`);
    } else {
      console.log(`  ok       ${key}  ${PLAINTEXT.has(key) ? v : mask(v)}`);
    }
  }
  for (const key of OPTIONAL) {
    const v = params.get(key);
    if (v) console.log(`  ok       ${key}  ${v}   (optional)`);
  }

  if (missing) {
    console.log(
      `\n${missing} parameter(s) missing. /admin/deployments/presign-package will answer 503,` +
        `\nand that is the only route that can accept an installer package over ~4.4 MB.` +
        `\n\nSet one with:\n  node scripts/configure-r2.mjs --set R2_PUBLIC_BASE_URL=https://your-host\n`,
    );
    process.exit(1);
  }

  console.log("\nAll five present.");

  // Say which delivery mode is live before --verify runs, because the check
  // below means different things in each. With a private installers bucket,
  // R2_PUBLIC_BASE_URL no longer serves packages at all — it is still the
  // host for site media, so it must stay public, but a 403 there would no
  // longer be the "every customer install fails" emergency the message says.
  const installersBucket = String(params.get("R2_INSTALLERS_BUCKET") || "").trim();
  if (installersBucket) {
    console.log(
      `\nInstaller delivery: PRIVATE (bucket "${installersBucket}").` +
        "\n  /me/deployments signs a short-lived GET per request; no packageUri" +
        "\n  works without a credential. --verify below checks R2_PUBLIC_BASE_URL," +
        "\n  which now serves only site media — NOT installers.",
    );
  } else {
    console.log(
      "\nInstaller delivery: PUBLIC — every packageUri is a permanent," +
        "\n  credential-free download link, handed to every entitled user by" +
        "\n  /me/deployments and usable by anyone they pass it to." +
        "\n  Close this by moving adlm/installers into a separate non-public" +
        "\n  bucket and setting R2_INSTALLERS_BUCKET. MOVE the objects, do not" +
        "\n  copy: a copy leaves the public originals downloadable.",
    );
  }

  if (doVerify) {
    const ok = await verifyPublic(normalizeBaseUrl(params.get("R2_PUBLIC_BASE_URL")));
    if (!ok) process.exit(1);
  } else {
    console.log("\nRun again with --verify to prove the public host actually serves objects.");
  }

  console.log(
    "\nThe Lambda reads SSM at COLD START, so a change here does not reach warm" +
      "\ncontainers. Redeploy, or wait for them to cycle, before uploading.\n",
  );
}

main().catch((e) => {
  console.error(`\n  ERROR: ${e?.message || e}\n`);
  process.exit(1);
});
