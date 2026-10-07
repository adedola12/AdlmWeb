// server/util/mepfLibrary.js
//
// The MEPF (mechanical, electrical, plumbing, fire) library behind RateGen's
// building-services rates: assets/rategen/mepf-library.json. Each item is one of
//   in-master    already sold in the RateGen master library; its price stands
//   researched   a Nigerian market price found online (3 Oct 2026), with sources,
//                waiting for ADLM's price team: never published until checked
//   needs-price  no credible source; the price team prices it
// The owner's choices (3 Oct 2026): prices researched and checked by the team;
// the library goes to the master now, SERVIQ's auto-pricing comes in a later release.

import fs from "node:fs";

const LIB = JSON.parse(fs.readFileSync(new URL("../assets/rategen/mepf-library.json", import.meta.url), "utf8"));

export const MEPF_AS_OF = LIB.asOf;
export const MEPF_ITEMS = LIB.items;

const byCatalogue = new Map(LIB.items.map((i) => [i.catalogueName, i]));
const byName = new Map(LIB.items.map((i) => [i.name.toLowerCase(), i]));

/** The library's name for a build-up line (the master's own name where it sells it). */
export const mepfName = (catalogueName) => byCatalogue.get(catalogueName)?.name || catalogueName;

export const mepfItem = (name) => byName.get(String(name || "").toLowerCase()) || byCatalogue.get(name) || null;

/**
 * The price of an item, or null.
 *   basis "published": checked by the price team, else the master's own price
 *   basis "preview":   as published, else the researched price (never shown to users)
 */
export function mepfPrice(name, { basis = "published" } = {}) {
  const it = mepfItem(name);
  if (!it) return null;
  if (it.checkedPrice > 0) return it.checkedPrice;
  if (it.inMaster && it.masterPrice > 0) return it.masterPrice;
  if (basis === "preview" && it.researched?.price > 0) return it.researched.price;
  return null;
}

/** Items the price team must look at before anything is published, most doubtful first. */
export function mepfReviewList() {
  const gap = (i) => {
    const r = i.researched?.price;
    return i.masterPrice > 0 && r > 0 ? Math.abs(Math.log(r / i.masterPrice)) : 0;
  };
  const rank = { "needs-price": 0, researched: 1, "in-master": 2 };
  return [...LIB.items]
    .filter((i) => !(i.checkedPrice > 0))
    .map((i) => ({ ...i, gap: gap(i) }))
    .sort((a, b) => b.gap - a.gap || rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}
