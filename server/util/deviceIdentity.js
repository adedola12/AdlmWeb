// server/util/deviceIdentity.js
//
// Which fingerprint recipe ("scheme") produced a device id, and who wrote a
// device row. Pure: no database, no Express, so it is unit-testable on its own.
//
// Why this exists. One PC can reach the server with TWO different ids for the
// same product, both labelled fpVersion 2, both landing in the same
// entitlement.devices[] seat pool:
//
//   hw2   SHA256(CPU|BIOS|Board). The Installer Hub, and every desktop app
//         except the shipped QUIV Revit plugin (MEP, HERON, RateGen, Time
//         Pro, Civil3D, QSApp, and the RevitPluginArch2026 QUIV lineage,
//         which says so with `x-adlm-client: revit-arch-plugin`). The
//         shipped R26 build sends no heartbeat and no takeoff telemetry, so
//         only its sign-ins mark its rows as app use; see the note in
//         util/deviceAppEvidence.js on what that leaves uncovered.
//   mgu2  SHA256("v2|" + MachineGuid + "|" + UserName). The shipped QUIV
//         Revit plugin (productKey "revit", no client header of its own,
//         User-Agent "ADLM-RevitPlugin/…").
//   v1    The legacy MAC-based ids (fpVersion 1), and the ArchiCAD client.
//
// The Hub calls POST /me/deployments/bind-device after every install/update,
// so for "revit" it took the seat with an hw2 id that the QUIV plugin can
// never present, and the customer's own PC got DEVICE_LIMIT_REACHED /
// DEVICE_MISMATCH. The rule this module serves: for each entitlement, the
// number of distinct PCs that can complete an APP sign-in stays <= seats,
// and a row written by the Hub is never app use.
//
// Kill switch. Everything that depends on this module is guarded by
// DEVICE_SCHEME_AWARE_BINDING (default ON; the literal "0" switches it off
// and restores the previous behaviour exactly). On AWS the API Lambda loads
// every parameter directly under its SSM_PREFIX (/adlm/cloud/prod, see
// infra/config.ts) into process.env at cold start, without overwriting a
// variable the function already has (server/lambda.js loadSecretsIntoEnv).
// So, to switch it off:
//   1. put a String parameter /adlm/cloud/prod/DEVICE_SCHEME_AWARE_BINDING
//      with the value 0, and
//   2. force a cold start (any change to the function's configuration does
//      it; otherwise warm containers keep the old value until recycled).
// Or, for an immediate break-glass: set DEVICE_SCHEME_AWARE_BINDING=0 on the
// function itself (Lambda console, or the `environment` block of the API
// function in infra/lib/adlm-api-stack.ts and a CDK deploy). A variable set
// on the function wins over SSM. Delete it (or set anything else) to turn
// the behaviour back on.

export const HUB_SCHEME = "hw2";
export const HUB_CLIENT = "installer-hub";
export const HUB_SOURCE = "installer-hub";
export const APP_SOURCE = "app";
export const R26_CLIENT = "revit-arch-plugin";

// Products whose desktop app does NOT present the Hub's hw2 id, so a Hub
// device row can never be that app's sign-in and must not hold its seat.
const HUB_DEFERRED_PRODUCTS = new Set(["revit", "archicad"]);

const PRODUCT_LABELS = {
  revit: "QUIV",
  archicad: "QUIV for ArchiCAD",
  mep: "ADLM MEP & HVAC",
  planswift: "HERON",
  rategen: "RateGen",
};

export function isSchemeAwareBindingEnabled(env = process.env) {
  return String(env?.DEVICE_SCHEME_AWARE_BINDING ?? "").trim() !== "0";
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function fpVersionOf(value) {
  return Number(value) || 1;
}

/**
 * The scheme of the id THIS REQUEST carries. Per request, not per product:
 * two QUIV lineages sign in to "revit" with different recipes.
 */
export function clientScheme({ productKey, clientHeader, userAgent, fpVersion } = {}) {
  void userAgent; // kept in the signature for diagnostics; the header decides
  if (fpVersionOf(fpVersion) < 2) return "v1";
  const key = norm(productKey);
  if (key === "revit") return norm(clientHeader) === R26_CLIENT ? HUB_SCHEME : "mgu2";
  if (key === "archicad") return "v1";
  return HUB_SCHEME;
}

/** False when the Hub's id is never the product app's id (revit, archicad). */
export function hubSharesAppIdentity(productKey) {
  return !HUB_DEFERRED_PRODUCTS.has(norm(productKey));
}

/** The scheme an app row of this product was written with, when unrecorded. */
export function defaultAppScheme(productKey) {
  const key = norm(productKey);
  if (key === "revit") return "mgu2";
  if (key === "archicad") return "v1";
  return HUB_SCHEME;
}

/**
 * Who wrote a device row. Rows carry `source` from this change on; for older
 * rows, only bind-device ever wrote a non-empty name, so a named v2 row is a
 * Hub row. A named v1 row may be a live old QUIV (or an /entitlements/activate
 * row) and is never treated as the Hub's.
 */
export function rowOrigin(d) {
  if (d?.source) return String(d.source);
  const name = typeof d?.name === "string" ? d.name.trim() : "";
  if (name && fpVersionOf(d?.fpVersion) >= 2) return HUB_SOURCE;
  return APP_SOURCE;
}

export function rowScheme(d, productKey) {
  if (d?.scheme) return String(d.scheme);
  if (fpVersionOf(d?.fpVersion) < 2) return "v1";
  if (rowOrigin(d) === HUB_SOURCE) return HUB_SCHEME;
  return defaultAppScheme(productKey);
}

/**
 * A short, non-identifying label for the calling client, stored on rows for
 * triage: the x-adlm-client header, else the User-Agent's product token
 * ("ADLM-RevitPlugin/3.0.1"), else "".
 */
export function clientLabel({ clientHeader, userAgent } = {}) {
  const header = norm(clientHeader);
  if (header) return header.slice(0, 64);
  const token = String(userAgent ?? "").trim().split(/\s+/)[0] || "";
  return token.slice(0, 64);
}

export function productLabel(productKey) {
  return PRODUCT_LABELS[norm(productKey)] || "ADLM";
}

// Device-row fields added by this change (models/User.js DeviceBindingSchema).
// They are for the seat rules and for support, not for clients.
export const DEVICE_PROVENANCE_FIELDS = Object.freeze([
  "source",
  "scheme",
  "client",
  "installerFingerprint",
  "installerName",
  "adoptedAt",
  "appSeenAt",
]);

/**
 * `entitlements` as routes/auth.js buildAuthPayload hands them out (inside the
 * access-token JWT, so on every request's Authorization header, and in the
 * login / refresh `user` body), minus DEVICE_PROVENANCE_FIELDS on each device
 * row. Nothing reads those from the token or the body, and a stamped row is
 * ~100 bytes bigger (~270 once adopted), so an organisation account with many
 * seats would grow every token by KBs. Without them the output is exactly
 * what `user.entitlements` serialised to before this change.
 *
 * Takes a Mongoose document array (login) or lean plain objects (refresh).
 */
export function entitlementsWithoutDeviceProvenance(entitlements) {
  if (!Array.isArray(entitlements)) return entitlements || [];
  return Array.from(entitlements, (raw) => {
    // A subdocument goes through toJSON, as JSON.stringify (jwt.sign,
    // res.json) did before; a lean entitlement is already plain.
    const ent = raw && typeof raw.toJSON === "function" ? raw.toJSON() : raw;
    if (!ent || typeof ent !== "object" || !Array.isArray(ent.devices)) return ent;
    return {
      ...ent,
      devices: ent.devices.map((d) => {
        if (!d || typeof d !== "object") return d;
        const row = { ...d };
        for (const key of DEVICE_PROVENANCE_FIELDS) delete row[key];
        return row;
      }),
    };
  });
}

/**
 * Human label for "which app holds this seat". Never a fingerprint. A Hub row
 * an app has since signed in on is that app's seat, not the Hub's.
 */
export function holderAppLabel(d, productKey) {
  if (rowOrigin(d) === HUB_SOURCE && !d?.appSeenAt) return "ADLM Installer Hub";
  const key = norm(productKey);
  return PRODUCT_LABELS[key] ? `${PRODUCT_LABELS[key]} app` : "ADLM app";
}
