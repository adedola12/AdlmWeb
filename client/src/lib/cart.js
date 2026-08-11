// Cart state lives in localStorage so it survives a reload and a login round
// trip. Extracted from Products.jsx because the product detail page needs the
// same behaviour, and a second copy of the GA4 payload would be worse than the
// duplication looks: `add_to_cart` only populates GA4's standard ecommerce
// report if the shape matches exactly, so a page with its own slightly
// different version reports nothing and looks fine while doing it.

import { trackEvent } from "../ga";

export function readCartItems() {
  try {
    const arr = JSON.parse(localStorage.getItem("cartItems") || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeCartItems(items) {
  const safe = Array.isArray(items) ? items : [];
  localStorage.setItem("cartItems", JSON.stringify(safe));
  const totalQty = safe.reduce((sum, it) => sum + Number(it.qty || 0), 0);
  localStorage.setItem("cartCount", String(totalQty));
  return totalQty;
}

export function getProductKey(p) {
  return String(p?.key || p?.slug || p?._id || "").trim();
}

export const getCategory = (p) =>
  p?.metadata?.category || p?.category || p?.type || "General";

/**
 * Add `months` of a product to the cart and report it to GA4.
 * Returns the new total quantity so the caller can update its badge.
 */
export function addProductToCart(p, months = 1) {
  const productKey = getProductKey(p);
  if (!productKey) return null;

  const items = readCartItems();
  const i = items.findIndex((it) => String(it.productKey) === productKey);
  if (i >= 0) {
    items[i].qty = Math.max(parseInt(items[i].qty || 0, 10), 0) + months;
  } else {
    items.push({ productKey, qty: months, firstTime: false });
  }
  const totalQty = writeCartItems(items);

  const unitPrice =
    (p.billingInterval === "yearly"
      ? p.price?.discountedYearlyNGN || p.price?.yearlyNGN
      : p.price?.discountedMonthlyNGN || p.price?.monthlyNGN) || 0;

  trackEvent("add_to_cart", {
    currency: "NGN",
    value: Number(unitPrice) * months,
    items: [
      {
        item_id: productKey,
        item_name: p.name || productKey,
        item_category: getCategory(p),
        price: Number(unitPrice),
        quantity: months,
      },
    ],
  });

  return totalQty;
}
