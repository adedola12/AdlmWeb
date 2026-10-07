// The catalogue's prices, as a floor for the pages that state them.
//
// Every page that shows a price reads it from GET /products. This table is
// what they show until that answers, and if it never does. It used to be typed
// out separately in each page — the product pages, the pricing page and the
// quote builder — and when the catalogue moved, two of those copies were
// missed: /pricing and the quote builder kept HERON at ₦12,000, RateGen at
// ₦8,000, Revit MEP at ₦18,000 and Time Pro at ₦2,000 for anyone whose fetch
// was slow or failed, and the builder would have priced a quotation at them.
//
// So there is one copy, here. When a price changes in the catalogue, change it
// here too. Figures as returned by GET /products on 7 Oct 2026.
//
// Shape: mo = monthlyNGN, yr = yearlyNGN, install = installNGN (0 = none).

export const CATALOGUE_FALLBACK = {
  revit: { mo: 50000, yr: 500000, install: 25000 }, // QUIV
  planswift: { mo: 25000, yr: 250000, install: 15000 }, // HERON
  rategen: { mo: 20000, yr: 200000, install: 0 },
  mep: { mo: 45000, yr: 450000, install: 20000 }, // SERVIQ (Revit MEP)
  "qs-takeoff": { mo: 5000, yr: 50000, install: 0 }, // Time Pro
  civil3d: { mo: 70000, yr: 700000, install: 40000 }, // CIVIQ, indicative until release
  bimbld: { mo: 0, yr: 125000, install: 0 }, // course: BIM for Building Works
  BIMMEP: { mo: 0, yr: 105000, install: 0 }, // course: BIM for MEP & HVAC
};

export default CATALOGUE_FALLBACK;
