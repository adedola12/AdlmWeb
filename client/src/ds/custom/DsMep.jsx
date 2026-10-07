// DsMep — his page, with the figures that go stale drawn from live sources.
//
// The page itself is generated verbatim from his src/mep.html. Two things are
// swapped, and nothing else:
//
//   d.releases    the release list, from src/data/changelogs.js (What's New)
//   d.monthly     the price headline, from GET /products key "mep"
//   d.priceLine   his yearly / saving / install sentence, rebuilt from the same
//   d.latest      the hero's version line, from ../productBuilds.js
//
// The fallback is the shared table in ../catalogueFallback.js, so the page
// reads correctly before the fetch lands and if it fails.

import React from "react";
import DsMepPage from "../pages/DsMepPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import DsRecommendedVideos from "../DsRecommendedVideos.jsx";
import { useProductPricing } from "../useProductPricing.js";
import { latestLabel } from "../productBuilds.js";

export default function DsMep() {
  // The fallback is the CATALOGUE value (../catalogueFallback.js), not his
  // page's. His said "No install fee" while the catalogue charges ₦20,000.
  const price = useProductPricing("mep");
  return (
    <DsMepPage
      d={{
        releases: <DsReleaseHistory slug="mep" />,
        // Free walkthroughs flagged for this product, above the releases.
        videos: <DsRecommendedVideos product="mep" name="SERVIQ" />,
        monthly: price.monthly,
        priceLine: price.priceLine,
        // "QUIV 4.0, build 4.0.2610.1" in place of his "Latest v3.1.7".
        latest: latestLabel("mep"),
      }}
    />
  );
}
