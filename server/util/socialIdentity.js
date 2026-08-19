// Verifying who somebody is when Google or Microsoft vouches for them.
//
// The browser hands us an ID token. That token is the ONLY thing trusted here:
// the email, name and picture the client sends alongside it are ignored
// entirely, because anything a client can send, a client can forge. Every
// field used below is read out of the verified token.
//
// What "verified" has to mean, in full — skipping any one of these turns the
// sign-in button into an open door:
//
//   * The signature checks out against the provider's current public keys.
//   * `aud` is OUR client id. A token minted for a different application is a
//     valid Google token and still must not sign anyone in here: any developer
//     can obtain one from a user of their own app and replay it against us.
//   * `iss` is the provider we think we are talking to.
//   * `exp` has not passed.
//   * The email is marked verified. Without it, somebody can register an
//     account at a provider claiming an address they do not own, and walk into
//     the ADLM account that belongs to that address.

import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// Microsoft's OIDC metadata. "common" accepts both work/school accounts and
// personal Microsoft accounts, which is what a "Continue with Microsoft"
// button implies to the person clicking it.
const MS_TENANT = () => process.env.MICROSOFT_TENANT || "common";
const MS_DISCOVERY = () =>
  `https://login.microsoftonline.com/${MS_TENANT()}/v2.0/.well-known/openid-configuration`;

export const googleClientId = () =>
  String(process.env.GOOGLE_CLIENT_ID || "").trim();
export const microsoftClientId = () =>
  String(process.env.MICROSOFT_CLIENT_ID || "").trim();

/**
 * Which providers are configured, and the ids the browser needs to talk to
 * them.
 *
 * A client id is public by design: it names the application, it authorises
 * nothing. Google's own button embeds it in the page. The half that must stay
 * secret is the client SECRET, which is not used here at all — this is an ID
 * token flow, and the token is verified against the provider's public keys.
 */
export function configuredProviders() {
  const google = googleClientId();
  const microsoft = microsoftClientId();
  return {
    google: !!google,
    microsoft: !!microsoft,
    googleClientId: google || null,
    microsoftClientId: microsoft || null,
    microsoftTenant: MS_TENANT(),
  };
}

// ── Microsoft: JWKS, cached ────────────────────────────────────────────────
//
// Keys rotate, so they cannot be baked in; refetching per sign-in would put a
// third party in the path of every login, so they are cached. A `kid` that is
// not in the cache forces one refetch — that is exactly what a rotation looks
// like — and a miss after that is a genuine failure rather than a retry loop.

let msKeys = null;
let msKeysAt = 0;
const KEY_TTL_MS = 60 * 60 * 1000;

async function loadMicrosoftKeys(force = false) {
  const fresh = msKeys && Date.now() - msKeysAt < KEY_TTL_MS;
  if (fresh && !force) return msKeys;

  const meta = await fetch(MS_DISCOVERY()).then((r) => {
    if (!r.ok) throw new Error(`Microsoft discovery failed: HTTP ${r.status}`);
    return r.json();
  });
  const jwks = await fetch(meta.jwks_uri).then((r) => {
    if (!r.ok) throw new Error(`Microsoft JWKS failed: HTTP ${r.status}`);
    return r.json();
  });

  msKeys = new Map((jwks.keys || []).map((k) => [k.kid, k]));
  msKeysAt = Date.now();
  return msKeys;
}

async function microsoftKeyFor(kid) {
  let keys = await loadMicrosoftKeys();
  if (!keys.has(kid)) keys = await loadMicrosoftKeys(true);
  const jwk = keys.get(kid);
  if (!jwk) throw new Error("Unknown signing key");
  // Node can build a verifier straight from a JWK, so no PEM conversion and no
  // extra dependency for something this security-sensitive.
  return createPublicKey({ key: jwk, format: "jwk" });
}

/**
 * The issuer for a multi-tenant Microsoft app is per-tenant — it carries the
 * tenant's own id — so it cannot be compared to one fixed string. The check is
 * that it is a Microsoft issuer and, when a specific tenant is configured,
 * that it is that tenant's.
 */
function microsoftIssuerOk(iss, tid) {
  if (!/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0\/?$/.test(iss)) {
    return false;
  }
  const configured = MS_TENANT();
  if (configured !== "common" && configured !== "organizations" && configured !== "consumers") {
    return iss.includes(configured) || tid === configured;
  }
  return true;
}

// ── the two verifiers ──────────────────────────────────────────────────────

let googleClient = null;

async function verifyGoogle(credential) {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in is not configured.");

  // google-auth-library is already a dependency and is purpose-built for this
  // check: signature, aud, iss and exp, against keys it manages itself.
  googleClient = googleClient || new OAuth2Client(clientId);
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });
  const p = ticket.getPayload();
  if (!p) throw new Error("Google returned no profile.");
  if (!GOOGLE_ISSUERS.includes(String(p.iss))) throw new Error("Unexpected issuer.");
  if (!p.email) throw new Error("Google did not return an email address.");
  if (p.email_verified === false) {
    throw new Error("That Google account's email address is not verified.");
  }

  return {
    provider: "google",
    subject: String(p.sub),
    email: String(p.email).trim().toLowerCase(),
    firstName: String(p.given_name || "").trim(),
    lastName: String(p.family_name || "").trim(),
  };
}

async function verifyMicrosoft(credential) {
  const clientId = microsoftClientId();
  if (!clientId) throw new Error("Microsoft sign-in is not configured.");

  const decoded = jwt.decode(credential, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error("That Microsoft token is malformed.");

  const key = await microsoftKeyFor(kid);
  const p = jwt.verify(credential, key, {
    algorithms: ["RS256"],
    audience: clientId,
    clockTolerance: 60,
  });

  if (!microsoftIssuerOk(String(p.iss || ""), String(p.tid || ""))) {
    throw new Error("Unexpected issuer.");
  }

  // Microsoft puts the address in different claims depending on the account
  // type: `email` for personal accounts and for work accounts that publish
  // one, `preferred_username` otherwise. Both are only usable when the token
  // actually carries an address — never invent one from the display name.
  const email = String(p.email || p.preferred_username || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Microsoft did not return an email address.");
  }

  const name = String(p.name || "").trim();
  const [first, ...restOfName] = name.split(/\s+/).filter(Boolean);

  return {
    provider: "microsoft",
    subject: String(p.oid || p.sub),
    email,
    firstName: String(p.given_name || first || "").trim(),
    lastName: String(p.family_name || restOfName.join(" ") || "").trim(),
  };
}

/**
 * Verify an ID token and return the identity it proves.
 *
 * @param {"google"|"microsoft"} provider
 * @param {string} credential  the ID token from the provider
 * @returns {Promise<{provider: string, subject: string, email: string, firstName: string, lastName: string}>}
 * @throws  when the token cannot be trusted, for any reason
 */
export async function verifySocialIdentity(provider, credential) {
  const token = String(credential || "").trim();
  if (!token) throw new Error("No sign-in token was supplied.");

  if (provider === "google") return verifyGoogle(token);
  if (provider === "microsoft") return verifyMicrosoft(token);
  throw new Error("Unknown sign-in provider.");
}

export default verifySocialIdentity;
