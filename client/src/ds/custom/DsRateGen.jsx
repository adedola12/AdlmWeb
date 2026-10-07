// DsRateGen — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/rategen.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "rategen"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//   d.latest      the hero's version line, from ../productBuilds.js
//
// The fallbacks are his own published figures, so the page reads correctly
// before the fetch lands and if it fails.

import React from "react";
import DsRateGenPage from "../pages/DsRateGenPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import DsRecommendedVideos from "../DsRecommendedVideos.jsx";
import { useProductPricing } from "../useProductPricing.js";
import { latestLabel, PRODUCT_BUILDS } from "../productBuilds.js";

export default function DsRateGen() {
  const price = useProductPricing("rategen", { monthly: 20000, yearly: 200000, install: 0 });
  return (
    <DsRateGenPage
      d={{
        releases: <DsReleaseHistory slug="rategen" />,
        // Free walkthroughs flagged for this product, above the releases.
        videos: <DsRecommendedVideos product="rategen" name="RateGen" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
        // "QUIV 4.0, build 4.0.2610.1" in place of his "Latest v3.1.7".
        latest: latestLabel("rategen"),
        version: PRODUCT_BUILDS.rategen.version,
      }}
    />
  );
}
