// Learn — his page, with the real course prices from the catalogue.
//
// Two of the three course cards are catalogue rows (bimbld, BIMMEP) and read
// their per-seat price from GET /products. The third, "Rates & 2D Takeoff" at
// ₦85,000, is left exactly as he wrote it: there is no catalogue row because
// the course does not exist. His own notes record its name, price and syllabus
// as provisional, so it stays visibly hardcoded rather than being dressed up
// as live data. It is on docs/richard-snag-list.md as content to confirm or pull.

import React from "react";
import DsLearnPage from "../pages/DsLearnPage.jsx";
import { API_BASE } from "../../config.js";
import DsFreeLessons from "../DsFreeLessons.jsx";
import DsCourseLinks from "../DsCourseLinks.jsx";

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
    // His free-lesson tiles are static markup with no destination. The wrapper
    // matches each one to a real video and makes it play, without altering his
    // thumbnails or layout.
    <DsCourseLinks>
      <DsFreeLessons>
        <DsLearnPage
        d={{
          bimbld: { yearly: money(prices.bimbld) },
          bimmep: { yearly: money(prices.BIMMEP) },
        }}
        />
      </DsFreeLessons>
    </DsCourseLinks>
  );
}
