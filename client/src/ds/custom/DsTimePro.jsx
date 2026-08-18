// DsTimePro — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/timepro.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "qs-takeoff"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsTimeProPage from "../pages/DsTimeProPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsTimePro() {
  const price = useProductPricing("qs-takeoff", { monthly: 2000, yearly: 20000, install: 0 });
  return (
    <DsTimeProPage
      d={{
        releases: <DsReleaseHistory slug="timepro" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
      }}
    />
  );
}
