// Server-side guard against a Naira figure saved into a USD price field.
//
// IMPORTANT: this mirrors client/src/lib/priceSanity.js — same pairs, same
// bound, same intent. The two are deliberately separate copies rather than a
// shared module (the client is a Vite app with its own package.json and cannot
// import out of server/), which means they can drift. If you change the bound
// or add a USD field to PriceSchema, change both, or the form and the API will
// disagree about what is acceptable.
//
// Why it exists: USD is an *optional override* in PriceSchema. Leave it blank
// and calcUSD converts from the Naira price; fill it in and the override is
// returned untouched (util/fx.js), so nothing downstream ever questions it.
//
// Note on provenance: this check was written in response to ADLM Time Pro
// showing $2,000/month for a ₦2,000 product, on the assumption someone had
// typed the naira figure into the USD box. That turned out to be wrong — the
// box was empty and fetchLiveFx was returning a rate of 1.0 (see util/fx.js).
// The check is kept because the hazard it describes is real and unguarded,
// but it was not the cause of that incident.
//
// The client warns before saving, but that guard only covers the two admin
// forms — this one covers the API itself, so a script or a hand-rolled request
// cannot reintroduce the same fault.

// A dollar price worth more than 1% of the Naira price beside it would mean
// pricing the dollar under ₦100. The real catalogue runs ₦670–₦2,500 to the
// dollar, so deliberate pricing clears this comfortably.
export const MIN_NGN_PER_USD = 100;

const PAIRS = [
  { usd: "monthlyUSD", ngn: "monthlyNGN", label: "monthly" },
  { usd: "sixMonthUSD", ngn: "sixMonthNGN", label: "6-month" },
  { usd: "yearlyUSD", ngn: "yearlyNGN", label: "yearly" },
  { usd: "installUSD", ngn: "installNGN", label: "install fee" },
  { usd: "discountedMonthlyUSD", ngn: "discountedMonthlyNGN", label: "discounted monthly" },
  { usd: "discountedSixMonthUSD", ngn: "discountedSixMonthNGN", label: "discounted 6-month" },
  { usd: "discountedYearlyUSD", ngn: "discountedYearlyNGN", label: "discounted yearly" },
];

/**
 * Find USD prices that look like a Naira figure in the wrong field.
 *
 * @param {object} price     the price object being written
 * @param {object} existing  the stored price, used when a PATCH sends a USD
 *                           field without its Naira counterpart — otherwise a
 *                           partial update could slip a bad figure past the
 *                           check simply by omitting the side it is measured
 *                           against.
 * @returns {Array<{field:string, label:string, usd:number, ngn:number, max:number}>}
 */
export function findImplausibleUSD(price = {}, existing = {}) {
  const found = [];

  for (const { usd, ngn, label } of PAIRS) {
    const u = Number(price?.[usd]);
    if (!Number.isFinite(u) || u <= 0) continue;

    // Prefer the Naira figure in this request; fall back to the stored one.
    const raw = price?.[ngn] ?? existing?.[ngn];
    const n = Number(raw);
    // No Naira counterpart anywhere means nothing to compare against — a
    // dollar-only price is unusual but legitimate.
    if (!Number.isFinite(n) || n <= 0) continue;

    const max = n / MIN_NGN_PER_USD;
    if (u > max) found.push({ field: usd, label, usd: u, ngn: n, max });
  }

  return found;
}

/** One-line explanation for the API error body. */
export function describeImplausibleUSD(found) {
  const parts = found.map(
    ({ label, usd, ngn, max }) =>
      `${label} is $${usd} against ₦${ngn} (expected under $${max})`,
  );
  return (
    `USD price looks like a Naira figure: ${parts.join("; ")}. ` +
    `Leave the USD field empty to convert from the Naira price automatically, ` +
    `or resend with allowUnusualPrice: true if the figure is deliberate.`
  );
}
