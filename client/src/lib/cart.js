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

// Name of the event fired whenever the cart is written.
//
// The checkout form and the order summary beside it are separate components
// reading the same localStorage key, and localStorage's own `storage` event
// only fires in OTHER tabs. Without this, dropping a not-yet-sellable line
// from the form left it sitting in the summary — the panel claiming a product
// and a price the order no longer contained.
export const CART_CHANGED = "adlm:cart-changed";

export function writeCartItems(items) {
  const safe = Array.isArray(items) ? items : [];
  localStorage.setItem("cartItems", JSON.stringify(safe));
  const totalQty = safe.reduce((sum, it) => sum + Number(it.qty || 0), 0);
  localStorage.setItem("cartCount", String(totalQty));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_CHANGED));
  }
  return totalQty;
}

export function getProductKey(p) {
  return String(p?.key || p?.slug || p?._id || "").trim();
}

/**
 * What bucket a product belongs in.
 *
 * An admin-set `category` wins when there is one. There usually is not: the
 * Product schema had no such field until now, which is why this used to return
 * the literal "General" for every product in the catalogue — the filter on
 * /products offered one option, and each card wore a badge that said nothing.
 *
 * The fallback keys off `isCourse` first, then off the product key. Mapping
 * keys in code is not where this belongs long term — set `category` on the
 * product and this table stops being consulted — but it is honest about the
 * eight products that exist, and a new product simply lands in "Software"
 * rather than breaking anything.
 */
const KEY_CATEGORIES = {
  revit: "Takeoff Software",
  civil3d: "Takeoff Software",
  planswift: "Takeoff Software",
  mep: "Takeoff Software",
  rategen: "Rates & Costing",
  "qs-takeoff": "Project Management",
};

export const getCategory = (p) => {
  const explicit = p?.metadata?.category || p?.category || p?.type;
  if (explicit) return explicit;
  if (p?.isCourse) return "Courses";
  return KEY_CATEGORIES[String(p?.key || "").trim()] || "Software";
};

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

/**
 * Everything about an order that is not a line item: which licence type it is,
 * the organisation it is for, the currency it was priced in, and any on-site
 * training class chosen.
 *
 * Purchase.jsx has carried a private copy of these two since before the
 * quotation builder existed. They live here now because a second writer —
 * "Buy these now" — has to agree with it exactly, and two private copies of
 * the same localStorage key is how they stop agreeing.
 *
 * Callers merge rather than replace: the quotation sets currency and training,
 * the purchase page sets licenseType and org, and neither should erase the
 * other's fields.
 */
export function readCartMeta() {
  try {
    const m = JSON.parse(localStorage.getItem("cartMeta") || "{}");
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
}

export function writeCartMeta(meta) {
  localStorage.setItem("cartMeta", JSON.stringify(meta || {}));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_CHANGED));
  }
  return meta;
}
