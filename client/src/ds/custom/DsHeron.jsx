// DsHeron — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/heron.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "planswift"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsHeronPage from "../pages/DsHeronPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsHeron() {
  const price = useProductPricing("planswift", { monthly: 12000, yearly: 120000, install: 15000 });
  return (
    <DsHeronPage
      d={{
        releases: <DsReleaseHistory slug="heron" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
      }}
    />
  );
}
