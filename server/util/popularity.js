// Which products are actually popular, measured by how many people hold a live
// licence for them.
//
// The product page used to decide this on the client with
//
//     typeof p.isPopular === "boolean" ? p.isPopular : (p.sort ?? 99) <= 1
//
// and `isPopular` is not a field on the Product schema, so it always fell
// through to the `sort` test — and every product carries sort: 0. The result
// was a "Popular" ribbon on every card at once, which tells a visitor nothing
// and quietly costs the badge its meaning.
//
// WHAT IS DELIBERATELY NOT RETURNED: the counts themselves. How many active
// subscribers each product has is a commercial figure, and `GET /products` is
// public and unauthenticated. Only the boolean leaves the server.

import mongoose from "mongoose";

// Recomputed at most this often. The set of popular products moves over weeks,
// not seconds, and this aggregation walks every user's entitlements — running
// it per request would put a collection scan behind the busiest public page.
const TTL_MS = 10 * 60 * 1000;

// A product needs at least this many live licences before the badge means
// anything. Without it, a catalogue where the leader has 2 users would badge
// everything with 1.
const MIN_ACTIVE = 5;

// ...and at least this share of the leader's count. Relative rather than a
// fixed cut-off so the rule keeps working as the business grows.
const SHARE_OF_LEADER = 0.5;

let cache = { at: 0, keys: new Set() };

/** Active-licence holders per product key, lowercased. Uncached. */
async function countActiveByProduct() {
  const now = new Date();
  const rows = await mongoose.connection
    .collection("users")
    .aggregate([
      { $unwind: "$entitlements" },
      {
        $match: {
          "entitlements.status": "active",
          $or: [
            { "entitlements.expiresAt": null },
            { "entitlements.expiresAt": { $exists: false } },
            { "entitlements.expiresAt": { $gt: now } },
          ],
        },
      },
      // addToSet, not $sum: one person holding two seats of the same product is
      // one user of it, and organisation licences would otherwise dominate.
      {
        $group: {
          _id: { $toLower: "$entitlements.productKey" },
          users: { $addToSet: "$_id" },
        },
      },
      { $project: { _id: 0, key: "$_id", n: { $size: "$users" } } },
    ])
    .toArray();

  const out = new Map();
  for (const r of rows) if (r.key) out.set(r.key, r.n);
  return out;
}

/**
 * The set of product keys (lowercased) that count as popular right now.
 * Never throws: popularity is decoration, and the catalogue must render
 * without it.
 */
export async function popularProductKeys({ force = false } = {}) {
  if (!force && Date.now() - cache.at < TTL_MS) return cache.keys;
  try {
    const counts = await countActiveByProduct();
    const leader = Math.max(0, ...counts.values());
    const floor = Math.max(MIN_ACTIVE, leader * SHARE_OF_LEADER);
    const keys = new Set();
    for (const [key, n] of counts) if (n >= floor) keys.add(key);
    cache = { at: Date.now(), keys };
    return keys;
  } catch {
    // Keep serving the last good answer rather than un-badging the catalogue
    // because one aggregation timed out.
    return cache.keys;
  }
}

/** Stamp `isPopular` onto one product document. */
export function markPopular(product, keys) {
  if (!product) return product;
  const key = String(product.key || "").toLowerCase();
  return { ...product, isPopular: keys.has(key) };
}

/** Stamp `isPopular` onto a list of product documents. */
export async function attachPopularity(items) {
  const list = Array.isArray(items) ? items : [];
  const keys = await popularProductKeys();
  return list.map((p) => markPopular(p, keys));
}
