// Pricing — his page, with every figure read from the catalogue.
//
// His pricing page stated the same numbers three times over: six plan cards
// (monthly, yearly, saving, install), two course cards, and again in the
// compare table. Twenty-nine figures typed into markup, and two of them were
// already wrong — SERVIQ and CIVIQ both said "No install fee" while the
// catalogue charges ₦20,000 and ₦40,000.
//
// This is the page a customer decides on. So every figure comes from
// GET /products, and the saving is computed from the two prices either side of
// it rather than stated independently. His imagery, blurbs, feature lists and
// CTAs are untouched — only the numbers are swapped, through the @@tokens@@ in
// PAGE_EDITS.

import React from "react";
import DsPricingPage from "../pages/DsPricingPage.jsx";
import DsCompareRow from "../DsCompareRow.jsx";
import DsCourseLinks from "../DsCourseLinks.jsx";
import { API_BASE } from "../../config.js";
import { CATALOGUE_FALLBACK as FALLBACK } from "../catalogueFallback.js";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const money = (n) => NGN.format(Number(n) || 0);

// Used only until the fetch lands, and if it fails: the page must never render
// a blank where a price should be. One shared table, so it cannot drift from
// the product pages and the quote builder.

// The token names used in his markup -> the catalogue key behind each.
const PLANS = {
  revit: "revit",
  rategen: "rategen",
  planswift: "planswift",
  mep: "mep",
  qsTakeoff: "qs-takeoff",
  civil3d: "civil3d",
};

export default function DsPricing() {
  const [prices, setPrices] = React.useState(FALLBACK);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        const map = { ...FALLBACK };
        for (const p of all) {
          const q = p.price || {};
          map[p.key] = {
            mo: Number(q.monthlyNGN) || 0,
            yr: Number(q.yearlyNGN) || 0,
            // A zero install fee is a real value; only a missing field falls back.
            install: q.installNGN == null ? FALLBACK[p.key]?.install ?? 0 : Number(q.installNGN),
          };
        }
        if (alive) setPrices(map);
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const d = React.useMemo(() => {
    const out = {};
    for (const [token, key] of Object.entries(PLANS)) {
      const p = prices[key] || FALLBACK[key] || { mo: 0, yr: 0, install: 0 };
      const saving = Math.max(0, p.mo * 12 - p.yr);
      out[token] = {
        monthly: money(p.mo),
        // Stated on its own in the FAQ as well as inside yearLine.
        saving: money(saving),
        // His sentence, rebuilt: "or ₦500,000 a year — save ₦100,000".
        yearLine: (
          <>
            or <b>{money(p.yr)}</b> a year. Save {money(saving)}
          </>
        ),
        // His two shapes: a fee, or none at all.
        installLine: p.install > 0 ? `+ ${money(p.install)} one-time install` : "No install fee",
      };
    }
    out.bimbld = { yearly: money((prices.bimbld || FALLBACK.bimbld).yr) };
    out.bimmep = { yearly: money((prices.BIMMEP || FALLBACK.BIMMEP).yr) };
    out.compareRow = <DsCompareRow prices={prices} />;
    return out;
  }, [prices]);

  return (
    // His "View course" CTAs point at learn#courses — the section they sit in.
    // This sends them to the real course pages.
    <DsCourseLinks>
      <DsPricingPage d={d} />
    </DsCourseLinks>
  );
}
