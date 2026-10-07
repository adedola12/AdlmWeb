// Hiding money on the ArchiCAD BoQ from a reader who may not see it.
//
// A collaborator without RateGen is served zeroed rates everywhere else —
// routes/projects.js has masked them since the sharing feature shipped. The
// ArchiCAD surface never did: the same reader was handed every unit rate,
// every line amount and the grand total, plus the XLSX and the PDF.
//
// The BoQ line is deliberately `Mixed` in the model, because the costing
// engine is the single authority on its shape and a strict schema would drop
// contract fields as they evolve. That rules out an allowlist here — it would
// silently stop covering a field the day one is added, and the failure would
// be a privacy leak nobody notices. So this denies by pattern instead: any
// key that reads like money goes, whatever it is called next year.
//
// Quantities, descriptions, units and element ids stay. The reader is meant to
// see WHAT was measured; it is the pricing they are not entitled to.

// Written out rather than guessed at. The first version of this list missed
// `vat` and a test caught it holding ₦2.5m in plain sight, which is the whole
// argument for denying by pattern AND checking the pattern.
//
// `budget` was the second gap: the BoQ document carries the owner's
// targetBudget at its top level, and nothing above matched it.
//
// `net` and `gross` are deliberately absent: netCost / grossAmount already
// match through cost and amount, while bare `net` would also catch `network`.
const MONEY_KEY =
  /(rate|cost|amount|total|price|margin|profit|overhead|subtotal|vat|tax|retention|contingency|prelim|provisional|discount|fee|sum|budget)/i;

// Keys that match the pattern but carry no money and are worth keeping, so a
// masked reader's screen still knows where a rate came from.
const KEEP = new Set(["rateId", "rateSource", "rateKind", "rateRef"]);

function maskValue(value) {
  if (Array.isArray(value)) return value.map(maskValue);
  if (value && typeof value === "object") return maskObject(value);
  return value;
}

function maskObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (KEEP.has(key)) {
      out[key] = value;
      continue;
    }
    if (MONEY_KEY.test(key)) {
      // Zero rather than delete: the client renders these cells and a missing
      // key reads as a broken row, where 0 reads as "hidden" — which is what
      // the rest of the product already does for a masked collaborator.
      out[key] = typeof value === "number" ? 0 : value && typeof value === "object" ? maskValue(value) : value;
      continue;
    }
    out[key] = maskValue(value);
  }
  return out;
}

/**
 * Strip the money from a BoQ document for a reader who may not see rates.
 * Returns a new object; the stored document is never touched.
 */
export function maskArchicadMoney(doc, canSeeRates) {
  if (canSeeRates || !doc || typeof doc !== "object") return doc;
  return { ...maskObject(doc), ratesMasked: true };
}

export default maskArchicadMoney;
