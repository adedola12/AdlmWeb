// Who may import an Excel bill and get a Material & Labour schedule.
//
// This is an ADMIN-GRANTED feature, not something a subscription buys on its
// own. Two conditions, both required:
//
//   1. the admin has granted the feature entitlement, AND
//   2. the user holds a live subscription to the product whose bill they are
//      importing — QUIV (revit), Heron (planswift) or MEP (revitmep).
//
// Condition 2 is what makes the grant lapse with the licence: when the product
// subscription expires the import surface closes on its own, without an admin
// having to remember to revoke anything.
//
// KEY HISTORY: the feature shipped as "quiv-boq-import", Quiv-only and
// organization-only. It now covers three products, so the canonical key is
// "boq-import" — but every existing grant is under the old key, so both are
// accepted forever. Grant the new one; never migrate the old one away.

import dayjs from "dayjs";

/** The key admins grant today. */
export const BOQ_IMPORT_ENTITLEMENT = "boq-import";

/** Grants issued before the feature covered Heron and MEP. Still honoured. */
export const BOQ_IMPORT_LEGACY_ENTITLEMENT = "quiv-boq-import";

export const BOQ_IMPORT_ENTITLEMENTS = Object.freeze([
  BOQ_IMPORT_ENTITLEMENT,
  BOQ_IMPORT_LEGACY_ENTITLEMENT,
]);

/** Products whose bills can be imported, keyed by the entitlement required. */
export const BOQ_IMPORT_PRODUCTS = Object.freeze({
  revit: { label: "QUIV", route: "revit" },
  planswift: { label: "Heron", route: "planswift" },
  revitmep: { label: "MEP", route: "mep" },
});

export const BOQ_IMPORT_PRODUCT_KEYS = Object.freeze(Object.keys(BOQ_IMPORT_PRODUCTS));

function isActive(e, now = dayjs()) {
  if (!e || e.status !== "active") return false;
  return !e.expiresAt || dayjs(e.expiresAt).isAfter(now);
}

function entitlementsOf(user) {
  return Array.isArray(user?.entitlements) ? user.entitlements : [];
}

/** True when an admin has granted the feature and the grant is still live. */
export function hasBoqImportGrant(user) {
  const now = dayjs();
  return entitlementsOf(user).some(
    (e) => BOQ_IMPORT_ENTITLEMENTS.includes(e?.productKey) && isActive(e, now),
  );
}

/** The importable products this user currently subscribes to. */
export function subscribedBoqProducts(user) {
  const now = dayjs();
  return entitlementsOf(user)
    .filter((e) => BOQ_IMPORT_PRODUCT_KEYS.includes(e?.productKey) && isActive(e, now))
    .map((e) => e.productKey);
}

/**
 * Can this user be GRANTED the feature? They must already subscribe to at
 * least one of the three products — the grant is an add-on to a licence, not a
 * licence of its own. Enforced server-side so no grant path can bypass it.
 */
export function isBoqImportEligible(user) {
  return subscribedBoqProducts(user).length > 0;
}

/** Can this user import a bill for this specific product right now? */
export function canImportBoqFor(user, productKey) {
  if (!hasBoqImportGrant(user)) return false;
  return subscribedBoqProducts(user).includes(productKey);
}
