// server/util/jwks.js
// ----------------------------------------------------------------------------
// RSA signing key management for the license JWT.
//
// The private key lives in the JWT_LICENSE_PRIVATE_KEY environment variable,
// stored as a single line with \n literal escapes (so the same value works in
// .env via dotenv and in Render's secret UI). This module:
//
//   - Decodes the escaped PEM on first use.
//   - Caches the parsed KeyObject so we're not re-parsing per request.
//   - Derives the public JWK (n, e, kid) — JWKS clients fetch this via
//     /.well-known/jwks.json on the Website and use it to verify license JWTs.
//   - Computes a stable `kid` (SHA-256 of the DER public key, first 16 hex
//     chars) so key rotation is just "add a second key, server puts new kid
//     in fresh tokens, plugins pick the right key from the JWKS by kid".
//
// Nothing in this module is request-specific — safe to require() wherever.
// ----------------------------------------------------------------------------

import crypto from "crypto";

let cachedPrivateKey = null;
let cachedPublicKey = null;
let cachedJwk = null;
let cachedKid = null;

function decodeEscapedPem(value) {
  // Accept either a real multi-line PEM (dotenv can hold multi-line values
  // inside quotes) or a single-line one with \n literal escapes (Render's
  // env UI needs this form). Either way we end up with real newlines so
  // crypto.createPrivateKey() parses it.
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function base64UrlFromBuffer(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Lazy-parse the signing private key from JWT_LICENSE_PRIVATE_KEY.
 * Returns null if not configured so callers can gracefully fall back
 * to HS256 during the rollout window.
 */
export function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  const raw = process.env.JWT_LICENSE_PRIVATE_KEY;
  if (!raw) return null;

  const pem = decodeEscapedPem(raw);
  try {
    cachedPrivateKey = crypto.createPrivateKey(pem);
    return cachedPrivateKey;
  } catch (err) {
    // Wrong format, typo in env — log once and return null so the signing
    // path falls back to HS256 instead of crashing the login endpoint.
    console.error(
      "[jwks] JWT_LICENSE_PRIVATE_KEY is set but could not be parsed as PEM:",
      err.message,
    );
    cachedPrivateKey = null;
    return null;
  }
}

export function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  const priv = getPrivateKey();
  if (!priv) return null;
  cachedPublicKey = crypto.createPublicKey(priv);
  return cachedPublicKey;
}

/**
 * Compute a stable key ID. We use the first 16 hex chars of SHA-256 over the
 * DER-encoded SPKI. Same bytes in, same kid out — so the server puts it in
 * the JWT header and the plugin's JWKS fetcher finds the matching key.
 */
export function getKid() {
  if (cachedKid) return cachedKid;
  const pub = getPublicKey();
  if (!pub) return null;
  const der = pub.export({ type: "spki", format: "der" });
  cachedKid = crypto.createHash("sha256").update(der).digest("hex").slice(0, 16);
  return cachedKid;
}

/**
 * Public JWK (JSON Web Key) suitable for returning from /.well-known/jwks.json.
 * Shape: { kty, alg, use, kid, n, e } — standard RFC 7517.
 */
export function getPublicJwk() {
  if (cachedJwk) return cachedJwk;
  const pub = getPublicKey();
  if (!pub) return null;

  // The Node crypto API exposes a JWK exporter since v15 — use it so we
  // don't hand-roll ASN.1 parsing for the modulus. Result shape:
  //   { kty: 'RSA', n: '<base64url>', e: '<base64url>' }
  const base = pub.export({ format: "jwk" });
  cachedJwk = {
    kty: base.kty,
    alg: "RS256",
    use: "sig",
    kid: getKid(),
    n: base.n,
    e: base.e,
  };
  return cachedJwk;
}

/**
 * Reset the in-memory cache. Useful for tests and for post-rotation reloads
 * (once we add a second key). Not used by production traffic.
 */
export function _resetCacheForTests() {
  cachedPrivateKey = null;
  cachedPublicKey = null;
  cachedJwk = null;
  cachedKid = null;
}
