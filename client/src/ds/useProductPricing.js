// Product pricing for the ported pages, read from the live catalogue.
//
// His product pages state the price three times over — a headline, a yearly
// figure, a saving and an install fee — all typed into the markup. They were
// accurate when written and had already drifted in one place: the Revit MEP
// page said "No install fee" while the catalogue charges ₦20,000, so a
// customer met that only at checkout.
//
// This returns the figures and the assembled sentence, in his wording, so the
// page cannot disagree with what is charged.

import React from "react";
import { API_BASE } from "../config.js";
import { CATALOGUE_FALLBACK } from "./catalogueFallback.js";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const money = (n) => NGN.format(Number(n) || 0);

function fromTable(key) {
  const p = CATALOGUE_FALLBACK[key] || { mo: 0, yr: 0, install: 0 };
  return { monthly: p.mo, yearly: p.yr, install: p.install };
}

/**
 * @param {string} key   catalogue key — revit, planswift, rategen, mep, qs-takeoff, civil3d
 * @param {{monthly:number, yearly:number, install:number}} [fallback]
 *   Used until the fetch lands and if it fails, so the page never renders a
 *   blank where a price should be. Defaults to the shared table in
 *   catalogueFallback.js; pass one only to override it.
 */
export function useProductPricing(key, fallback = fromTable(key)) {
  const [price, setPrice] = React.useState(fallback);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products/${key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const p = (raw?.product || raw)?.price || {};
        if (!alive) return;
        setPrice({
          monthly: Number(p.monthlyNGN) || fallback.monthly,
          yearly: Number(p.yearlyNGN) || fallback.yearly,
          // A zero install fee is a real value, not a missing one, so it must
          // not fall back to his figure.
          install: p.installNGN == null ? fallback.install : Number(p.installNGN),
        });
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      alive = false;
    };
    // `fallback` is fixed per key: the shared table, or a literal at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const saving = Math.max(0, price.monthly * 12 - price.yearly);

  // His sentence, rebuilt: "Or ₦500,000 a year and save ₦100,000. One-time
  // install fee of ₦25,000." — or "No install fee." where there is none.
  const priceLine =
    `Or ${money(price.yearly)} a year and save ${money(saving)}. ` +
    (price.install > 0 ? `One-time install fee of ${money(price.install)}.` : "No install fee.");

  return {
    monthly: money(price.monthly),
    yearly: money(price.yearly),
    saving: money(saving),
    install: money(price.install),
    priceLine,
    raw: price,
  };
}

export default useProductPricing;
