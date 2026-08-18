// DsQuiv — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/quiv.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "revit"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsQuivPage from "../pages/DsQuivPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsQuiv() {
  const price = useProductPricing("revit", { monthly: 50000, yearly: 500000, install: 25000 });
  return (
    <DsQuivPage
      d={{
        releases: <DsReleaseHistory slug="quiv" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
      }}
    />
  );
}
