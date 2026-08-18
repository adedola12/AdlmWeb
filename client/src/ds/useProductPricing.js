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

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const money = (n) => NGN.format(Number(n) || 0);

/**
 * @param {string} key   catalogue key — revit, planswift, rategen, mep, qs-takeoff, civil3d
 * @param {{monthly:number, yearly:number, install:number}} fallback
 *   His own figures, used until the fetch lands and if it fails. The page must
 *   never render a blank where a price should be.
 */
export function useProductPricing(key, fallback) {
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
        // Keep the fallback — his figures.
      }
    })();
    return () => {
      alive = false;
    };
    // `fallback` is a literal defined at the call site and never changes.
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
