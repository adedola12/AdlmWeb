import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_KEYS,
  bundlePercentFor,
  coversWholeBundle,
  bundleDiscountForCart,
  bundleDiscountForRenewal,
} from "./bundleDiscount.js";

const cart = (periods, extra = []) => [
  { productKey: "revit", periods, recurring: 50000 * periods },
  { productKey: "mep", periods, recurring: 45000 * periods },
  { productKey: "rategen", periods, recurring: 20000 * periods },
  { productKey: "qs-takeoff", periods, recurring: 5000 * periods },
  { productKey: "planswift", periods, recurring: 25000 * periods },
  ...extra,
];

test("the bundle is the five desktop products", () => {
  assert.deepEqual(BUNDLE_KEYS, ["revit", "mep", "rategen", "qs-takeoff", "planswift"]);
});

test("5% under a year, 10% for a year or more", () => {
  assert.equal(bundlePercentFor(1), 5);
  assert.equal(bundlePercentFor(6), 5);
  assert.equal(bundlePercentFor(11), 5);
  assert.equal(bundlePercentFor(12), 10);
  assert.equal(bundlePercentFor(24), 10);
});

test("all five monthly: 5% off each subscription", () => {
  const d = bundleDiscountForCart(cart(1));
  assert.equal(d.amount, 7250); // 5% of 145,000
  assert.equal(d.lines.length, 5);
  assert.ok(d.lines.every((l) => l.percent === 5));
});

test("all five yearly: 10% off each subscription", () => {
  const yearly = [
    { productKey: "revit", periods: 12, recurring: 500000 },
    { productKey: "mep", periods: 12, recurring: 450000 },
    { productKey: "rategen", periods: 12, recurring: 200000 },
    { productKey: "qs-takeoff", periods: 12, recurring: 50000 },
    { productKey: "planswift", periods: 12, recurring: 250000 },
  ];
  assert.equal(bundleDiscountForCart(yearly).amount, 145000); // 10% of 1,450,000
});

test("four of the five: no discount", () => {
  const four = cart(1).filter((l) => l.productKey !== "qs-takeoff");
  assert.equal(bundleDiscountForCart(four).amount, 0);
  assert.equal(coversWholeBundle(four.map((l) => l.productKey)), false);
});

test("something else in the cart is not discounted", () => {
  const d = bundleDiscountForCart(cart(1, [{ productKey: "bimbld", periods: 1, recurring: 100000 }]));
  assert.equal(d.amount, 7250);
  assert.ok(!d.lines.some((l) => l.productKey === "bimbld"));
});

test("mixed periods: each line at its own rate", () => {
  const mixed = cart(1).map((l) => (l.productKey === "revit" ? { ...l, periods: 12, recurring: 500000 } : l));
  // 10% of 500,000 + 5% of (45,000 + 20,000 + 5,000 + 25,000)
  assert.equal(bundleDiscountForCart(mixed).amount, 50000 + 4750);
});

test("USD keeps cents", () => {
  const d = bundleDiscountForCart([
    { productKey: "revit", periods: 1, recurring: 33.33 },
    { productKey: "mep", periods: 1, recurring: 30 },
    { productKey: "rategen", periods: 1, recurring: 13.33 },
    { productKey: "qs-takeoff", periods: 1, recurring: 3.33 },
    { productKey: "planswift", periods: 1, recurring: 16.67 },
  ], "USD");
  assert.equal(d.amount, 4.84);
});

const held = (except = null, status = "active") =>
  BUNDLE_KEYS.filter((k) => k !== except).map((productKey) => ({ productKey, status }));

test("renewal: holding all five gets the bundle rate", () => {
  const d = bundleDiscountForRenewal({ entitlements: held(), productKey: "revit", months: 1, recurring: 50000 });
  assert.deepEqual(d, { percent: 5, amount: 2500 });
  const y = bundleDiscountForRenewal({ entitlements: held(), productKey: "mep", months: 12, recurring: 450000 });
  assert.deepEqual(y, { percent: 10, amount: 45000 });
});

test("renewal: the product being renewed counts even when it has just expired", () => {
  const ents = [...held("rategen"), { productKey: "rategen", status: "expired" }];
  assert.equal(bundleDiscountForRenewal({ entitlements: ents, productKey: "rategen", months: 1, recurring: 20000 }).amount, 1000);
});

test("renewal: another product lapsed means no bundle", () => {
  const ents = [...held("planswift"), { productKey: "planswift", status: "expired" }];
  assert.equal(bundleDiscountForRenewal({ entitlements: ents, productKey: "revit", months: 1, recurring: 50000 }).amount, 0);
});

test("renewal: a product outside the bundle is never discounted", () => {
  assert.equal(bundleDiscountForRenewal({ entitlements: held(), productKey: "bimbld", months: 1, recurring: 9000 }).amount, 0);
});
