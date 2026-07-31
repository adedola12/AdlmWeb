/**
 * CloudFront signed cookies for HLS playback.
 *
 * Signed COOKIES rather than signed URLs, deliberately: an HLS stream is a
 * manifest plus hundreds of segment requests, and a signed URL would have to
 * be minted for every one of them. One cookie set covers the whole prefix.
 *
 * The consequence is a DNS constraint: the cookies have to be readable by the
 * CloudFront domain, so CloudFront must run on a subdomain of the site (e.g.
 * video.adlmstudio.net) and the cookies are scoped to the parent domain.
 * A raw *.cloudfront.net domain will not work.
 */
import fs from "node:fs";
import { getSignedCookies } from "@aws-sdk/cloudfront-signer";
import { courseEnv } from "./awsS3.js";

// Through courseEnv, like the S3 and MediaConvert clients: the rest of this
// pipeline is configured with COURSE_-prefixed names, and reading only the
// bare ones here meant a fully configured distribution looked unconfigured —
// which downgrades playback to the raw master instead of failing loudly.
function requiredEnv(name) {
  const value = courseEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: COURSE_${name} (or ${name})`);
  }
  return value;
}

export function cloudfrontDomain() {
  return requiredEnv("AWS_CLOUDFRONT_DOMAIN").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function privateKey() {
  const raw = requiredEnv("AWS_CLOUDFRONT_PRIVATE_KEY");
  // Either the PEM itself (newlines may arrive escaped from a dashboard) or a
  // path to it on disk.
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  return fs.readFileSync(raw, "utf8");
}

/** Public URL of an object behind the distribution. */
export function cdnUrl(key) {
  return `https://${cloudfrontDomain()}/${String(key).replace(/^\/+/, "")}`;
}

/**
 * Grants access to one lecture's HLS directory for a limited window.
 *
 * @param {string} keyPrefix  e.g. "hls/bim-bld-arch/2025/w1d1/"
 * @param {number} ttlSec     how long the grant lasts
 * @param {string} ip         optional: pin the grant to one address
 */
export function signPlaybackCookies({ keyPrefix, ttlSec = 4 * 60 * 60, ip = "" }) {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const resource = `https://${cloudfrontDomain()}/${String(keyPrefix).replace(/^\/+/, "")}*`;

  const condition = {
    DateLessThan: { "AWS:EpochTime": expires },
  };
  // Pinning to an IP is the strongest anti-sharing measure available here, but
  // it breaks the moment a student moves between wifi and mobile data — so it
  // is opt-in rather than the default.
  if (ip && courseEnv("AWS_CLOUDFRONT_PIN_IP") === "true") {
    condition.IpAddress = { "AWS:SourceIp": `${ip}/32` };
  }

  const policy = JSON.stringify({
    Statement: [{ Resource: resource, Condition: condition }],
  });

  const cookies = getSignedCookies({
    keyPairId: requiredEnv("AWS_CLOUDFRONT_KEY_PAIR_ID"),
    privateKey: privateKey(),
    policy,
  });

  return { cookies, expiresAt: new Date(expires * 1000) };
}

/** Cookie options that let the CDN subdomain read what the API sets. */
export function playbackCookieOptions(expiresAt) {
  const parent = String(process.env.COOKIE_DOMAIN || "").trim();
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    expires: expiresAt,
    ...(parent ? { domain: parent } : {}),
    path: "/",
  };
}
