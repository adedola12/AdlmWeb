// Only CloudFront may reach the API (owner item 0c, 2026-09-26).
//
// The Lambda Function URL is public (auth NONE), so a request sent straight to
// *.lambda-url.eu-west-1.on.aws skips CloudFront and can say anything it likes
// in X-Forwarded-For, which is what the sign-up cap keys a visitor on.
//
// Why not Function URL auth AWS_IAM + CloudFront OAC, the textbook fix: OAC
// needs every POST/PUT to carry an x-amz-content-sha256 hash of its body, and
// it signs with its own Authorization header. Our browsers and seven desktop
// plugins send neither the hash nor anything but "Authorization: Bearer", so
// OAC would break every write and every signed-in call.
//
// Instead CloudFront adds a secret origin header (it replaces any viewer copy
// of the same name) and this middleware checks it. The secret is generated in
// Secrets Manager; CloudFront gets it through a CloudFormation dynamic
// reference and the Lambda fetches it at cold start (lambda.js,
// loadOriginVerifySecret), so its value is in no env var, template or log.
// If that fetch fails the check is OFF for the container, with an error in
// the log: a Secrets Manager hiccup must not take the API down for every
// plugin. Three modes, from ORIGIN_VERIFY_MODE:
//   off      no check (local dev, or no secret configured)
//   report   log what arrives without the header, let it through
//   enforce  refuse it with 403
// Roll out as report first: the log shows whether anything legitimate (a
// webhook registered against the raw Function URL, a monitor) calls direct.

import crypto from "node:crypto";

export const ORIGIN_VERIFY_HEADER = "x-adlm-origin-verify";

function sameSecret(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function originVerifyMode(env = process.env) {
  const mode = String(env.ORIGIN_VERIFY_MODE || "").trim().toLowerCase();
  if (!String(env.ORIGIN_VERIFY_SECRET || "").trim()) return "off";
  return mode === "enforce" || mode === "report" ? mode : "off";
}

export function originVerify({ env = process.env, log = console } = {}) {
  return function originVerifyMiddleware(req, res, next) {
    const mode = originVerifyMode(env);
    const given = req.headers[ORIGIN_VERIFY_HEADER];
    // Never let the secret travel further into the app, its logs or an echo.
    delete req.headers[ORIGIN_VERIFY_HEADER];
    if (mode === "off") return next();
    if (sameSecret(given, env.ORIGIN_VERIFY_SECRET)) return next();

    log.warn(
      `[origin-verify] ${mode === "enforce" ? "refused" : "would refuse"} ` +
        `${req.method} ${req.path} host=${req.headers.host || ""} ` +
        `header=${given ? "wrong" : "missing"} ua=${String(req.headers["user-agent"] || "").slice(0, 80)}`,
    );
    if (mode === "enforce") return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}
