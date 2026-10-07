// server/util/openIntent.js
//
// "Open in QUIV / HERON" (work board r2-open-in-quiv-heron).
//
// The web page asks the API for a short-lived ticket, then hands the browser an
// adlm:// link. The Installer Hub's handler writes that link into a request
// file, and the desktop product redeems the ticket with ITS OWN signed-in
// session. The ticket is not a credential:
//
//   - It is signed with a key derived from JWT_ACCESS_SECRET, never the secret
//     itself, so it can never verify as an access token (verifyAccess does not
//     look at scope, which is why the step-up token's "scope" guard would not
//     be enough here).
//   - It names one user, one project and one product, and lives 10 minutes.
//   - Redeeming it needs a Bearer token for that same user, and the project is
//     loaded through the normal owner / collaborator check at redeem time.
//   - It is single-use: the jti is burned in OpenIntent on first redeem.
//
// Anyone who lifts a ticket out of browser history holds nothing they can use.
import crypto from "crypto";
import jwt from "jsonwebtoken";

export const OPEN_INTENT_TTL_SECONDS = 10 * 60;
const AUDIENCE = "adlm-open-intent";
const ISSUER = "adlm-api";

// The URL speaks product names; the database speaks bucket keys. Only the two
// products that have a desktop entry point are listed. MEP, CIVIQ and ArchiCAD
// are left out on purpose until their plugins can take a request.
export const OPEN_PRODUCTS = Object.freeze({
  quiv: Object.freeze({ productKey: "revit", label: "QUIV", host: "Revit" }),
  heron: Object.freeze({ productKey: "planswift", label: "HERON", host: "PlanSwift" }),
});

export function openProductForKey(productKey) {
  const key = String(productKey || "").trim().toLowerCase();
  for (const [product, def] of Object.entries(OPEN_PRODUCTS)) {
    if (def.productKey === key) return product;
  }
  return null;
}

const OBJECT_ID = /^[a-f0-9]{24}$/;
export function isObjectIdString(v) {
  return typeof v === "string" && OBJECT_ID.test(v);
}

function signingKey() {
  const root = process.env.JWT_ACCESS_SECRET;
  if (!root) throw new Error("JWT_ACCESS_SECRET is not set");
  // Domain-separated: a different key for a different purpose.
  return crypto.createHmac("sha256", root).update("adlm-open-intent/v1").digest();
}

export function newJti() {
  return crypto.randomBytes(16).toString("base64url");
}

export function signOpenIntent({ userId, projectId, product, jti }) {
  return jwt.sign(
    { pid: String(projectId), prd: String(product) },
    signingKey(),
    {
      algorithm: "HS256",
      subject: String(userId),
      audience: AUDIENCE,
      issuer: ISSUER,
      jwtid: jti,
      expiresIn: OPEN_INTENT_TTL_SECONDS,
    },
  );
}

// Throws on a bad signature, wrong audience, expiry or a malformed payload.
export function verifyOpenIntent(ticket) {
  const decoded = jwt.verify(String(ticket || ""), signingKey(), {
    algorithms: ["HS256"],
    audience: AUDIENCE,
    issuer: ISSUER,
  });
  if (
    !decoded ||
    !isObjectIdString(decoded.sub) ||
    !isObjectIdString(decoded.pid) ||
    !OPEN_PRODUCTS[decoded.prd] ||
    typeof decoded.jti !== "string" ||
    !decoded.jti
  ) {
    throw new Error("Malformed open ticket");
  }
  return decoded;
}

// The link the browser hands to Windows. Only a product, a project id and the
// ticket. Nothing that signs anyone in.
export function buildOpenUrl({ product, projectId, ticket }) {
  const q = new URLSearchParams({ v: "1", product, project: String(projectId), ticket });
  return `adlm://open?${q.toString()}`;
}
