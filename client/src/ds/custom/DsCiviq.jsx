// CIVIQ — Richard's page, supplied with live data.
//
// The page itself is his, generated verbatim from src/civiq.html: the
// `light-art` hero on bg-civiq.jpg, his eyebrow, his lede, "Join the waitlist"
// and "See pricing", the pulse note, the compatibility band, the FAQ and the
// waitlist form. Nothing about the design is re-authored here.
//
// This wrapper exists only to fill the values that would otherwise go stale.
// The generated component takes a `d` prop, and the @@tokens@@ in his markup
// (see PAGE_EDITS in scripts/port-ds-html.mjs) render from it:
//
//   d.monthly / d.yearly / d.saving   GET /products/civil3d, via useProductPricing
//
// An earlier version of this file rewrote his hero from scratch — different
// image, different eyebrow, different CTAs, no pulse note. That was wrong: the
// brief is his design with our data, not our design with his data.

import React from "react";
import DsCiviqPage from "../pages/DsCiviqPage.jsx";
import DsReleaseHistory from "../DsReleaseHistory.jsx";
import DsRecommendedVideos from "../DsRecommendedVideos.jsx";
import { useProductPricing } from "../useProductPricing.js";

export default function DsCiviq() {
  // His copy reads "₦70,000 a month" and "₦700,000 a year and save ₦140,000".
  // The fallback is the shared table (../catalogueFallback.js), which holds the
  // catalogue's figures, so the page never shows a blank if the fetch fails.
  // His sentence carries no install fee ("Pricing indicative until release"),
  // so only monthly / yearly / saving are used here.
  const price = useProductPricing("civil3d");

  const d = {
    monthly: price.monthly,
    yearly: price.yearly,
    saving: price.saving,
    // Renders his "Nothing shipped yet" card today, and becomes a real list
    // the day the first CIVIQ release lands in the changelog.
    releases: <DsReleaseHistory slug="civiq" />,
    // Free walkthroughs flagged for this product, above the releases.
    videos: <DsRecommendedVideos product="civil3d" name="CIVIQ" />,
  };

  return <DsCiviqPage d={d} />;
}
