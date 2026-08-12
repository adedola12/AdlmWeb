// Who may import a bill. This gate decides whether an admin-granted, paid
// feature is reachable, so the cases below are the ones worth being sure of:
// no grant, grant without a subscription, subscription without a grant, an
// expired or disabled either, and the legacy key.

import test from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";

import {
  BOQ_IMPORT_ENTITLEMENT,
  BOQ_IMPORT_LEGACY_ENTITLEMENT,
  hasBoqImportGrant,
  isBoqImportEligible,
  subscribedBoqProducts,
  canImportBoqFor,
} from "./boqImportAccess.js";

const ent = (productKey, over = {}) => ({
  productKey,
  status: "active",
  expiresAt: dayjs().add(1, "year").toDate(),
  ...over,
});
const user = (...entitlements) => ({ entitlements });

const GRANT = () => ent(BOQ_IMPORT_ENTITLEMENT);
const EXPIRED = { expiresAt: dayjs().subtract(1, "day").toDate() };
const DISABLED = { status: "disabled" };

// ── the grant ───────────────────────────────────────────────────────────────

test("no grant means no access, however many products are subscribed", () => {
  const u = user(ent("revit"), ent("planswift"), ent("revitmep"));
  assert.equal(hasBoqImportGrant(u), false);
  assert.equal(canImportBoqFor(u, "revit"), false);
});

test("an expired or disabled grant does not unlock anything", () => {
  for (const over of [EXPIRED, DISABLED]) {
    const u = user(ent(BOQ_IMPORT_ENTITLEMENT, over), ent("revit"));
    assert.equal(hasBoqImportGrant(u), false);
    assert.equal(canImportBoqFor(u, "revit"), false);
  }
});

test("the pre-2026-08 quiv-boq-import key still works", () => {
  // Every grant issued before the feature covered Heron and MEP is under the
  // old key. Dropping it would silently cut off every existing customer.
  const u = user(ent(BOQ_IMPORT_LEGACY_ENTITLEMENT), ent("revit"));
  assert.equal(hasBoqImportGrant(u), true);
  assert.equal(canImportBoqFor(u, "revit"), true);
});

// ── the subscription ────────────────────────────────────────────────────────

test("a grant alone is not enough — it rides on a live subscription", () => {
  const u = user(GRANT());
  assert.equal(hasBoqImportGrant(u), true);
  assert.equal(canImportBoqFor(u, "revit"), false);
  assert.equal(isBoqImportEligible(u), false);
});

test("access is per product: you import bills for what you subscribe to", () => {
  const u = user(GRANT(), ent("planswift"));
  assert.equal(canImportBoqFor(u, "planswift"), true);
  assert.equal(canImportBoqFor(u, "revit"), false, "no QUIV sub");
  assert.equal(canImportBoqFor(u, "revitmep"), false, "no MEP sub");
});

test("access lapses on its own when the subscription does", () => {
  // The whole point of the double gate: no admin has to remember to revoke.
  const u = user(GRANT(), ent("revit", EXPIRED));
  assert.equal(hasBoqImportGrant(u), true);
  assert.equal(canImportBoqFor(u, "revit"), false);
});

test("a granted user with all three products can import all three", () => {
  const u = user(GRANT(), ent("revit"), ent("planswift"), ent("revitmep"));
  assert.deepEqual(subscribedBoqProducts(u).sort(), ["planswift", "revit", "revitmep"]);
  for (const p of ["revit", "planswift", "revitmep"]) {
    assert.equal(canImportBoqFor(u, p), true, p);
  }
});

// ── who may be granted ──────────────────────────────────────────────────────

test("eligibility needs a live QUIV, Heron or MEP subscription", () => {
  assert.equal(isBoqImportEligible(user()), false);
  assert.equal(isBoqImportEligible(user(ent("rategen"))), false, "wrong product");
  assert.equal(isBoqImportEligible(user(ent("revit", EXPIRED))), false, "expired");
  assert.equal(isBoqImportEligible(user(ent("revit", DISABLED))), false, "disabled");
  for (const p of ["revit", "planswift", "revitmep"]) {
    assert.equal(isBoqImportEligible(user(ent(p))), true, p);
  }
});

test("a non-importable product never grants import rights", () => {
  const u = user(GRANT(), ent("rategen"), ent("civil3d"));
  assert.deepEqual(subscribedBoqProducts(u), []);
  assert.equal(canImportBoqFor(u, "rategen"), false);
});

test("missing or malformed entitlements are treated as no access", () => {
  for (const u of [null, undefined, {}, { entitlements: null }, { entitlements: [null] }]) {
    assert.equal(hasBoqImportGrant(u), false);
    assert.equal(isBoqImportEligible(u), false);
    assert.equal(canImportBoqFor(u, "revit"), false);
  }
});

test("an entitlement with no expiry is perpetual, not expired", () => {
  const u = user(
    ent(BOQ_IMPORT_ENTITLEMENT, { expiresAt: null }),
    ent("revit", { expiresAt: null }),
  );
  assert.equal(canImportBoqFor(u, "revit"), true);
});
