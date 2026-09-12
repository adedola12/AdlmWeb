// infra/policies/fix-video-cors.mjs
//
// Lets a browser actually fetch the HLS stream from video.adlmstudio.net.
//
// WHY THIS IS NEEDED
//
// hls.js fetches the manifest and every segment with XHR, cross-origin, and
// with credentials (the CloudFront signed cookies). A cross-origin credentialed
// request needs the response to carry:
//
//   Access-Control-Allow-Origin: <the exact site origin, never *>
//   Access-Control-Allow-Credentials: true
//
// The delivery bucket had no CORS configuration and the distribution forwards
// no Origin header, so neither was ever sent and the browser blocked every
// fetch with a bare "Failed to fetch". Native HLS on iOS Safari was unaffected,
// because assigning the playlist to video.src is not an XHR — which is exactly
// why this went unnoticed.
//
// WHY NOT A RESPONSE HEADERS POLICY
//
// That was the first attempt and it is the textbook answer, but this account is
// on CloudFront's Pro pricing plan, which rejects it outright:
//
//   Distributions with the Pro pricing plan can't have the following
//   features: Custom response headers policy
//
// The managed CORS policies are allowed but all four of them send
// `Access-Control-Allow-Origin: *`, and a browser refuses a wildcard on a
// credentialed request. So the headers have to come from S3 instead.
//
// WHAT THIS DOES INSTEAD
//
// 1. Puts a CORS rule on the delivery bucket. S3 answers a matching request
//    with the exact origin AND `Access-Control-Allow-Credentials: true`
//    (verified against the archive bucket, which already had such a rule).
//
// 2. Puts `Origin` in the distribution's CACHE KEY, using a custom cache
//    policy. Headers in the cache key are forwarded to the origin, so this
//    does both jobs with one policy rather than needing a separate
//    origin-request policy.
//
// WHY ORIGIN MUST BE IN THE CACHE KEY, NOT MERELY FORWARDED
//
// Forwarding alone is a trap. A request that arrives without an Origin header
// — a native iOS player, a curl, a warm-up — gets a response from S3 with no
// CORS headers at all, and CloudFront would cache THAT under the same key and
// then serve it to a browser. The stream would work until the first non-browser
// request touched an edge, then break there and nowhere else. Keying on Origin
// keeps the two answers in separate cache entries.
//
// Only one origin is allowed, `https://www.adlmstudio.net`, because the apex
// 307-redirects to www so the app never runs anywhere else. Keeping the list
// to one value also keeps the cache honest.
//
// Drives the AWS CLI rather than the SDK: the CLI is already installed and
// authenticated here, and this needs no new dependency.
//
// Safe to re-run.
//
//   node infra/policies/fix-video-cors.mjs            # show what it would do
//   node infra/policies/fix-video-cors.mjs --apply    # do it

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const DISTRIBUTION_ID = process.env.VIDEO_DISTRIBUTION_ID || "E2TP40XUX0CRW4";
const DELIVERY_BUCKET = process.env.VIDEO_DELIVERY_BUCKET || "adlm-course-delivery";

const SITE_ORIGIN = "https://www.adlmstudio.net";

function aws(args, { allowFail = false } = {}) {
  try {
    const out = execFileSync("aws", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (e) {
    const said = String(e.stderr || e.stdout || e.message || "").trim();
    if (allowFail) return { __error: said };
    // execFileSync throws a stack trace that buries the one line that matters.
    // An earlier version of this script created a policy, failed here, and the
    // reason scrolled past unread — so print what AWS actually said, and
    // nothing else.
    console.error(`\n  aws ${args.slice(0, 2).join(" ")} failed:\n`);
    for (const line of said.split("\n").slice(0, 6)) console.error("    " + line);
    console.error("");
    process.exit(1);
  }
}

function withTempJson(value, fn) {
  const file = path.join(os.tmpdir(), `adlm-cf-${process.pid}-${Math.abs(hash(JSON.stringify(value)))}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  try {
    return fn(`file://${file.replace(/\\/g, "/")}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ------------------------------------------------ 1. the bucket's CORS ---- */

const CORS = {
  CORSRules: [
    {
      AllowedOrigins: [SITE_ORIGIN],
      // GET and HEAD are all a player does. Range is the only request header
      // that provokes a preflight — hls.js uses byte-range segments and Range
      // is not CORS-safelisted.
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["Origin", "Range", "Accept", "Content-Type"],
      // Without Content-Range and Content-Length a byte-range response cannot
      // be interpreted by the player.
      ExposeHeaders: ["Content-Length", "Content-Range", "ETag", "Date"],
      MaxAgeSeconds: 3600,
    },
  ],
};

function bucketCorsMatches() {
  const got = aws(["s3api", "get-bucket-cors", "--bucket", DELIVERY_BUCKET, "--output", "json"], { allowFail: true });
  if (got?.__error) return false;
  const rule = (got?.CORSRules || [])[0];
  return !!rule && (rule.AllowedOrigins || []).includes(SITE_ORIGIN);
}

if (bucketCorsMatches()) {
  console.log(`bucket ${DELIVERY_BUCKET}: CORS already allows ${SITE_ORIGIN}`);
} else if (APPLY) {
  withTempJson(CORS, (ref) =>
    aws(["s3api", "put-bucket-cors", "--bucket", DELIVERY_BUCKET, "--cors-configuration", ref]),
  );
  console.log(`bucket ${DELIVERY_BUCKET}: CORS set for ${SITE_ORIGIN}`);
} else {
  console.log(`would SET CORS on ${DELIVERY_BUCKET} for ${SITE_ORIGIN}`);
}

/* ------------------------------------- 2. Origin in the cache key ---- */

// A MANAGED policy, because this account's plan rejects custom ones:
//
//   Distributions with the Pro pricing plan can't have the following
//   features: Custom cache policy
//
// Managed-Elemental-MediaPackage is the only managed cache policy that keys on
// `origin`, and apart from that it is the same shape as the CachingOptimized
// policy this distribution already ran: MinTTL 0, DefaultTTL 24h, MaxTTL a
// year. Its name is about where AWS expected it to be used, not a constraint —
// what matters here is the cache key.
const MANAGED_CACHE_POLICY_ID = "08627262-05a9-4f76-9ded-b50ca2e3a84f";
const policyId = MANAGED_CACHE_POLICY_ID;
console.log(`cache policy: Managed-Elemental-MediaPackage (${policyId}) — keys on Origin`);

const cfg = aws(["cloudfront", "get-distribution-config", "--id", DISTRIBUTION_ID, "--output", "json"]);
const current = cfg.DistributionConfig.DefaultCacheBehavior.CachePolicyId;
console.log(`distribution ${DISTRIBUTION_ID} cache policy: ${current} -> ${policyId || "(pending create)"}`);

if (!APPLY) {
  console.log("\ndry run. re-run with --apply");
  process.exit(0);
}

if (current !== policyId) {
  cfg.DistributionConfig.DefaultCacheBehavior.CachePolicyId = policyId;
  withTempJson(cfg.DistributionConfig, (ref) => {
    const res = aws([
      "cloudfront", "update-distribution",
      "--id", DISTRIBUTION_ID,
      "--if-match", cfg.ETag,
      "--distribution-config", ref,
      "--output", "json",
    ]);
    console.log("distribution updated. status:", res?.Distribution?.Status);
  });
}

/* ------------------------------------------------------- 3. verify ---- */

// Read it back rather than trusting the call. Creating a policy and failing to
// attach it looks like success from console output alone, and that is exactly
// what happened on an earlier run.
const after = aws(["cloudfront", "get-distribution", "--id", DISTRIBUTION_ID, "--output", "json"]);
const attached = after?.Distribution?.DistributionConfig?.DefaultCacheBehavior?.CachePolicyId;
if (attached !== policyId) {
  console.error(`\n  NOT ATTACHED. distribution still reports: ${attached || "(none)"}`);
  process.exit(1);
}
console.log(`verified: cache policy ${policyId} is on the distribution`);
console.log(`bucket CORS present: ${bucketCorsMatches()}`);
console.log("\nCloudFront takes a few minutes to propagate. Then check for the two headers:");
console.log(`  curl -sI -H "Origin: ${SITE_ORIGIN}" https://video.adlmstudio.net/<a real key> | grep -i access-control`);
