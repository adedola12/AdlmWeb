// Verifying who somebody is when Google, Microsoft or Autodesk vouches for them.
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
//   * The email is marked verified where the provider reports it. Without that,
//     somebody registers an address they do not own at the provider and walks
//     into the ADLM account that belongs to it.
//
// Google keeps its own library, which is already a dependency and purpose-built
// for this. Microsoft and Autodesk are both plain OIDC providers and share one
// verifier below — Node builds a public key straight from a JWK, so the most
// security-sensitive code here needs no PEM conversion and no new dependency.

import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const MS_TENANT = () => process.env.MICROSOFT_TENANT || "common";

export const googleClientId = () => String(process.env.GOOGLE_CLIENT_ID || "").trim();
export const microsoftClientId = () => String(process.env.MICROSOFT_CLIENT_ID || "").trim();
export const autodeskClientId = () => String(process.env.AUTODESK_CLIENT_ID || "").trim();

// Where each OIDC provider publishes its metadata. Discovery is used rather
// than hardcoded key URLs, so a provider moving its JWKS does not break sign-in.
const DISCOVERY = {
  microsoft: () =>
    `https://login.microsoftonline.com/${MS_TENANT()}/v2.0/.well-known/openid-configuration`,
  autodesk: () => "https://developer.api.autodesk.com/.well-known/openid-configuration",
};

/** Every provider this app understands, and the User field each is stored on. */
export const PROVIDER_FIELD = {
  google: "googleId",
  microsoft: "microsoftId",
  autodesk: "autodeskId",
};

/**
 * Which providers are configured, and the ids the browser needs to talk to
 * them.
 *
 * A client id is public by design: it names the application, it authorises
 * nothing, and Google's own button embeds it in the page. The half that must
 * stay secret is the client SECRET, which is not used here at all — these are
 * ID token flows, verified against the providers' published public keys.
 */
export function configuredProviders() {
  const google = googleClientId();
  const microsoft = microsoftClientId();
  const autodesk = autodeskClientId();
  const tenant = MS_TENANT();

  // The browser runs the same authorization-code + PKCE flow against all three,
  // so each needs its endpoints. Publishing them here rather than hardcoding
  // them in the client keeps one source, and means a tenant change is a
  // server-side setting rather than a rebuild.
  return {
    google: !!google,
    microsoft: !!microsoft,
    autodesk: !!autodesk,
    endpoints: {
      google: google && {
        clientId: google,
        authorize: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
      },
      microsoft: microsoft && {
        clientId: microsoft,
        authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        scope: "openid email profile",
      },
      autodesk: autodesk && {
        clientId: autodesk,
        authorize: "https://developer.api.autodesk.com/authentication/v2/authorize",
        token: "https://developer.api.autodesk.com/authentication/v2/token",
        // Autodesk needs a resource scope alongside openid or it declines to
        // issue a profile; user-profile:read is the narrowest that works.
        scope: "openid user-profile:read",
      },
    },
  };
}

// ── JWKS, cached per provider ──────────────────────────────────────────────
//
// Keys rotate, so they cannot be baked in; refetching per sign-in would put a
// third party in the path of every login, so they are cached. A `kid` that is
// not in the cache forces one refetch — that is exactly what a rotation looks
// like — and a miss after that is a genuine failure rather than a retry loop.

const KEY_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // provider -> { keys: Map, at: number, issuer: string }

async function loadKeys(provider, force = false) {
  const held = cache.get(provider);
  if (held && !force && Date.now() - held.at < KEY_TTL_MS) return held;

  const meta = await fetch(DISCOVERY[provider]()).then((r) => {
    if (!r.ok) throw new Error(`${provider} discovery failed: HTTP ${r.status}`);
    return r.json();
  });
  const jwks = await fetch(meta.jwks_uri).then((r) => {
    if (!r.ok) throw new Error(`${provider} JWKS failed: HTTP ${r.status}`);
    return r.json();
  });

  const entry = {
    keys: new Map((jwks.keys || []).map((k) => [k.kid, k])),
    at: Date.now(),
    issuer: String(meta.issuer || ""),
  };
  cache.set(provider, entry);
  return entry;
}

async function keyFor(provider, kid) {
  let entry = await loadKeys(provider);
  if (!entry.keys.has(kid)) entry = await loadKeys(provider, true);
  const jwk = entry.keys.get(kid);
  if (!jwk) throw new Error("Unknown signing key");
  return { key: createPublicKey({ key: jwk, format: "jwk" }), issuer: entry.issuer };
}

/**
 * Verify an ID token from a plain OIDC provider.
 *
 * @param {"microsoft"|"autodesk"} provider
 * @param {string} token
 * @param {string} audience   our client id with that provider
 * @param {(iss: string, claims: object, discovered: string) => boolean} issuerOk
 */
async function verifyOidc(provider, token, audience, issuerOk) {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error("That sign-in token is malformed.");

  const { key, issuer } = await keyFor(provider, kid);
  const claims = jwt.verify(token, key, {
    algorithms: ["RS256"],
    audience,
    clockTolerance: 60,
  });

  if (!issuerOk(String(claims.iss || ""), claims, issuer)) {
    throw new Error("Unexpected issuer.");
  }
  return claims;
}

// ── the providers ──────────────────────────────────────────────────────────

let googleClient = null;

async function verifyGoogle(credential) {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in is not configured.");

  googleClient = googleClient || new OAuth2Client(clientId);
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
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

/**
 * A multi-tenant Microsoft app has a per-tenant issuer — it carries the
 * tenant's own id — so it cannot be compared to one fixed string. The check is
 * that it is a Microsoft issuer and, when a specific tenant is configured,
 * that it is that tenant's.
 */
function microsoftIssuerOk(iss, claims) {
  if (!/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0\/?$/.test(iss)) return false;
  const configured = MS_TENANT();
  if (!["common", "organizations", "consumers"].includes(configured)) {
    return iss.includes(configured) || String(claims.tid || "") === configured;
  }
  return true;
}

async function verifyMicrosoft(credential) {
  const clientId = microsoftClientId();
  if (!clientId) throw new Error("Microsoft sign-in is not configured.");

  const p = await verifyOidc("microsoft", credential, clientId, microsoftIssuerOk);

  // Microsoft puts the address in different claims depending on the account
  // type: `email` for personal accounts and for work accounts that publish
  // one, `preferred_username` otherwise. Only usable when the token actually
  // carries an address — never invented from the display name.
  const email = String(p.email || p.preferred_username || "").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Microsoft did not return an email address.");

  const [first, ...rest] = String(p.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    provider: "microsoft",
    subject: String(p.oid || p.sub),
    email,
    firstName: String(p.given_name || first || "").trim(),
    lastName: String(p.family_name || rest.join(" ") || "").trim(),
  };
}

async function verifyAutodesk(credential) {
  const clientId = autodeskClientId();
  if (!clientId) throw new Error("Autodesk sign-in is not configured.");

  // Autodesk publishes one fixed issuer, so this is an equality check against
  // what discovery itself reported rather than a pattern.
  const p = await verifyOidc(
    "autodesk",
    credential,
    clientId,
    (iss, _claims, discovered) => iss === discovered,
  );

  const email = String(p.email || "").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Autodesk did not return an email address.");
  // Autodesk reports email_verified as a boolean or a string depending on the
  // account; a false either way carries the same risk, so it is refused.
  if (p.email_verified === false || p.email_verified === "false") {
    throw new Error("That Autodesk account's email address is not verified.");
  }

  const [first, ...rest] = String(p.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    provider: "autodesk",
    subject: String(p.userid || p.sub),
    email,
    firstName: String(p.given_name || first || "").trim(),
    lastName: String(p.family_name || rest.join(" ") || "").trim(),
  };
}

/**
 * Verify an ID token and return the identity it proves.
 *
 * @param {"google"|"microsoft"|"autodesk"} provider
 * @param {string} credential  the ID token from the provider
 * @returns {Promise<{provider: string, subject: string, email: string, firstName: string, lastName: string}>}
 * @throws  when the token cannot be trusted, for any reason
 */
export async function verifySocialIdentity(provider, credential) {
  const token = String(credential || "").trim();
  if (!token) throw new Error("No sign-in token was supplied.");

  if (provider === "google") return verifyGoogle(token);
  if (provider === "microsoft") return verifyMicrosoft(token);
  if (provider === "autodesk") return verifyAutodesk(token);
  throw new Error("Unknown sign-in provider.");
}

export default verifySocialIdentity;
