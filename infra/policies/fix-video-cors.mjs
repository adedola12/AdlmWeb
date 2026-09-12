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
// The delivery bucket has no CORS configuration and the distribution runs the
// managed CachingOptimized cache policy with no origin-request policy, so
// `Origin` is never forwarded and S3 never emits those headers. The browser
// blocks every fetch with a bare "Failed to fetch". Native HLS on iOS Safari is
// unaffected, because assigning the playlist to video.src is not an XHR — which
// is exactly why this went unnoticed for so long.
//
// WHY A RESPONSE HEADERS POLICY RATHER THAN BUCKET CORS
//
// Bucket CORS would also need `Origin` forwarded to the origin, and the
// CachingOptimized cache key does not include it — so one viewer's cached
// response could be served to another origin carrying the wrong header. A
// response headers policy is applied by CloudFront on every response, cache
// hits included, and it picks the matching origin per request. One moving part
// instead of two, and correct on a cache hit.
//
// Drives the AWS CLI rather than the SDK, because the CLI is already installed
// and authenticated here and this needs no new dependency.
//
// Safe to re-run: it reuses the policy if it exists and only updates the
// distribution when the policy is not already attached.
//
//   node infra/policies/fix-video-cors.mjs            # show what it would do
//   node infra/policies/fix-video-cors.mjs --apply    # do it

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const DISTRIBUTION_ID = process.env.VIDEO_DISTRIBUTION_ID || "E2TP40XUX0CRW4";
const POLICY_NAME = "adlm-video-cors";

// Explicit origins, never "*": a credentialed request is rejected by the
// browser when the allowed origin is a wildcard.
const ORIGINS = ["https://www.adlmstudio.net", "https://adlmstudio.net"];

function aws(args) {
  const out = execFileSync("aws", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return out.trim() ? JSON.parse(out) : null;
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

// Deterministic, so a dry run and an apply in the same second do not collide
// on a random name. Not security-relevant.
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function findPolicy() {
  const list = aws(["cloudfront", "list-response-headers-policies", "--type", "custom", "--output", "json"]);
  const items = list?.ResponseHeadersPolicyList?.Items || [];
  const hit = items.find((i) => i?.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name === POLICY_NAME);
  return hit?.ResponseHeadersPolicy?.Id || null;
}

function createPolicy() {
  const config = {
    Name: POLICY_NAME,
    Comment: "CORS for HLS playback by hls.js with signed cookies",
    CorsConfig: {
      AccessControlAllowOrigins: { Quantity: ORIGINS.length, Items: ORIGINS },
      // Explicit, not "*". CloudFront refuses a wildcard in either the origin
      // list or the header list while AccessControlAllowCredentials is true,
      // and it is right to: the browser would refuse the response anyway.
      // Only `Range` here actually provokes a preflight — hls.js uses it for
      // byte-range segments, and it is not a CORS-safelisted request header.
      // The rest are listed so a preflight never fails on a header the player
      // happens to add.
      AccessControlAllowHeaders: {
        Quantity: 4,
        Items: ["Origin", "Range", "Accept", "Content-Type"],
      },
      AccessControlAllowMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
      AccessControlAllowCredentials: true,
      // What the player is allowed to READ off the response. Without
      // Content-Range and Content-Length a byte-range fetch cannot be
      // interpreted.
      AccessControlExposeHeaders: {
        Quantity: 4,
        Items: ["Content-Length", "Content-Range", "ETag", "Date"],
      },
      AccessControlMaxAgeSec: 3600,
      // Set the headers even if the origin sent its own, so this does not
      // depend on the bucket's configuration staying absent.
      OriginOverride: true,
    },
  };
  return withTempJson(config, (ref) => {
    const out = aws([
      "cloudfront", "create-response-headers-policy",
      "--response-headers-policy-config", ref,
      "--output", "json",
    ]);
    return out?.ResponseHeadersPolicy?.Id;
  });
}

const existing = findPolicy();
let policyId = existing;
if (existing) {
  console.log(`response headers policy "${POLICY_NAME}" exists: ${existing}`);
} else if (APPLY) {
  policyId = createPolicy();
  console.log(`created response headers policy: ${policyId}`);
} else {
  console.log(`would CREATE response headers policy "${POLICY_NAME}" for ${ORIGINS.join(", ")}`);
}

const cfg = aws(["cloudfront", "get-distribution-config", "--id", DISTRIBUTION_ID, "--output", "json"]);
const current = cfg.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId || "(none)";
console.log(`distribution ${DISTRIBUTION_ID} response-headers policy: ${current} -> ${policyId || "(pending create)"}`);

if (!APPLY) {
  console.log("\ndry run. re-run with --apply");
  process.exit(0);
}
if (current === policyId) {
  console.log("already attached — nothing to do");
  process.exit(0);
}

cfg.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId = policyId;
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
console.log("CloudFront takes a few minutes to propagate to every edge.");
