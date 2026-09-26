// Learn — his page, with the real course prices from the catalogue.
//
// Both course cards are catalogue rows (bimbld, BIMMEP) and read their
// per-seat price from GET /products. There is no third price to fetch: his
// fourth card, "Rates & 2D Takeoff" at ₦85,000, was a course that does not
// exist, and it is now removed by port-ds-html.mjs rather than carried into
// the build. The card beside them, "On-site training", is a service and asks
// for a quote, so it has no per-seat price either.

import React from "react";
import DsLearnPage from "../pages/DsLearnPage.jsx";
import { API_BASE } from "../../config.js";
import DsCourseLinks from "../DsCourseLinks.jsx";
import DsLessonGrid from "../DsLessonGrid.jsx";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const money = (n) => NGN.format(Number(n) || 0);

// His published figures, which match the catalogue today.
const FALLBACK = { bimbld: 125000, BIMMEP: 105000 };

export default function DsLearn() {
  const [prices, setPrices] = React.useState(FALLBACK);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        const next = { ...FALLBACK };
        for (const p of all) {
          if (p.key in next) next[p.key] = Number(p.price?.yearlyNGN) || next[p.key];
        }
        if (alive) setPrices(next);
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <DsCourseLinks>
      <DsLearnPage
        d={{
          bimbld: { yearly: money(prices.bimbld) },
          bimmep: { yearly: money(prices.BIMMEP) },
          // R02: his filters, tiles and "Show more", on the whole YouTube
          // library, in place of his nine demo tiles (port-ds-html.mjs slot).
          lessons: <DsLessonGrid />,
        }}
      />
    </DsCourseLinks>
  );
}
