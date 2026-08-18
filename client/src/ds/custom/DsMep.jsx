// DsMep — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/mep.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "mep"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsMepPage from "../pages/DsMepPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsMep() {
  // The fallback is the CATALOGUE value, not his page's. His said "No install
  // fee" while the catalogue charges ₦20,000; falling back to his figure would
  // reprint that wrong price every time the API is unreachable.
  const price = useProductPricing("mep", { monthly: 18000, yearly: 180000, install: 20000 });
  return (
    <DsMepPage
      d={{
        releases: <DsReleaseHistory slug="mep" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
      }}
    />
  );
}
