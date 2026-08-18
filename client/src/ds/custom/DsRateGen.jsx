// DsRateGen — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/rategen.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "rategen"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsRateGenPage from "../pages/DsRateGenPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsRateGen() {
  const price = useProductPricing("rategen", { monthly: 8000, yearly: 70000, install: 0 });
  return (
    <DsRateGenPage
      d={{
        releases: <DsReleaseHistory slug="rategen" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
      }}
    />
  );
}
