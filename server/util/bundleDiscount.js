// server/util/bundleDiscount.js
//
// The all-products bundle (owner's price list, 1 Oct 2026): take every ADLM
// desktop product and each subscription costs less. 5% off a subscription
// paid for under 12 months, 10% off one paid for 12 months or more.
//
// One rule, used by checkout (routes/purchase.js) and the auto-renewal cron
// (util/autoRenew.js), so a renewal charges what a fresh purchase would.
// Only the subscription itself is discounted: install fees, storage add-ons
// and training are charged in full. Pure, so it is tested without a database.

import { toMoney } from "./pricing.js";

/** QUIV, Revit MEP (SERVIQ), RateGen, Time Pro, HERON. CIVIQ joins once it is on sale. */
export const BUNDLE_KEYS = ["revit", "mep", "rategen", "qs-takeoff", "planswift"];

export const BUNDLE_PERCENT_MONTHLY = 5;
export const BUNDLE_PERCENT_YEARLY = 10;

const norm = (k) => String(k || "").trim().toLowerCase();

export const isBundleProduct = (key) => BUNDLE_KEYS.includes(norm(key));

/** 10% for a year or more, 5% for anything shorter. */
export function bundlePercentFor(months) {
  return Number(months) >= 12 ? BUNDLE_PERCENT_YEARLY : BUNDLE_PERCENT_MONTHLY;
}

/** True when every bundle product is among these keys. */
export function coversWholeBundle(keys = []) {
  const have = new Set([...keys].map(norm));
  return BUNDLE_KEYS.every((k) => have.has(k));
}

/**
 * The discount on a checkout. `lines` are { productKey, periods, recurring }
 * where `recurring` is the subscription amount only (no install, storage or
 * training). Returns { amount, lines: [{ productKey, percent, amount }] };
 * amount 0 when the cart does not hold the whole bundle.
 */
export function bundleDiscountForCart(lines = [], currency = "NGN") {
  if (!coversWholeBundle(lines.map((l) => l.productKey))) return { amount: 0, lines: [] };
  const out = [];
  let amount = 0;
  for (const l of lines) {
    if (!isBundleProduct(l.productKey)) continue;
    const percent = bundlePercentFor(l.periods);
    const off = toMoney((Number(l.recurring || 0) * percent) / 100, currency);
    if (!(off > 0)) continue;
    out.push({ productKey: norm(l.productKey), percent, amount: off });
    amount += off;
  }
  return { amount: toMoney(amount, currency), lines: out };
}

/**
 * The discount on one renewal: the customer still holds every bundle product.
 * A product counts while its licence is active; the one being renewed counts
 * too (it is usually at or just past its expiry when the renewal runs).
 * Returns { percent, amount }, both 0 when the bundle is not held.
 */
export function bundleDiscountForRenewal({ entitlements = [], productKey, months, recurring }) {
  if (!isBundleProduct(productKey)) return { percent: 0, amount: 0 };
  const held = entitlements
    .filter((e) => norm(e?.status) === "active" || norm(e?.productKey) === norm(productKey))
    .map((e) => e?.productKey);
  if (!coversWholeBundle(held)) return { percent: 0, amount: 0 };
  const percent = bundlePercentFor(months);
  return { percent, amount: toMoney((Number(recurring || 0) * percent) / 100, "NGN") };
}
