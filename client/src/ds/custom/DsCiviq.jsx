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
//   d.monthly / d.yearly / d.saving   GET /products -> key "civil3d"
//
// An earlier version of this file rewrote his hero from scratch — different
// image, different eyebrow, different CTAs, no pulse note. That was wrong: the
// brief is his design with our data, not our design with his data.

import React from "react";
import DsCiviqPage from "../pages/DsCiviqPage.jsx";
import { API_BASE } from "../../config.js";
import DsReleaseHistory from "../DsReleaseHistory.jsx";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

// His copy reads "₦70,000 a month" and "₦700,000 a year and save ₦140,000".
// Those exact figures are what the catalogue holds today, so the fallbacks
// match his page rather than showing an em dash if the fetch fails — the page
// must never look broken just because the API is slow.
const FALLBACK = { monthly: 70000, yearly: 700000 };

export default function DsCiviq() {
  const [price, setPrice] = React.useState(FALLBACK);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products/civil3d`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const p = (raw?.product || raw)?.price || {};
        const monthly = Number(p.monthlyNGN) || FALLBACK.monthly;
        const yearly = Number(p.yearlyNGN) || FALLBACK.yearly;
        if (alive) setPrice({ monthly, yearly });
      } catch {
        // Keep the fallback: his figures, which are the catalogue's figures.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // "save ₦140,000" is twelve months at the monthly rate minus the yearly one,
  // which is exactly how his sentence reads.
  const saving = Math.max(0, price.monthly * 12 - price.yearly);

  const d = {
    monthly: NGN.format(price.monthly),
    yearly: NGN.format(price.yearly),
    saving: NGN.format(saving),
    // Renders his "Nothing shipped yet" card today, and becomes a real list
    // the day the first CIVIQ release lands in the changelog.
    releases: <DsReleaseHistory slug="civiq" />,
  };

  return <DsCiviqPage d={d} />;
}
