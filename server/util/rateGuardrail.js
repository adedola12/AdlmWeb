// server/util/rateGuardrail.js
//
// Composite-rate guardrail (QUIV material-rate upgrade spec §2).
//
// Rule: a rate's headline total must equal Material + Labour + Overhead +
// Profit and must NOT exceed it:
//
//     totalCost ≈ netCost + overheadAmount + profitAmount
//
// within a tolerance of max(1.0, 0.5% × expected). The plugin
// (RateCompositionValidator) flags overstated rates (headline > build-up —
// disallowed) and understated rates, and clamps a stated total down to the
// build-up when it exceeds it. We enforce the same on the server so invalid
// rates never reach the plugin.

function num(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Validate a stated headline total against its build-up.
 *
 * @param {object} input
 * @param {number} input.netCost          sum of component rows (pre OH&P)
 * @param {number} input.overheadAmount   overhead value (absolute)
 * @param {number} input.profitAmount     profit value (absolute)
 * @param {number} input.totalCost        stated headline total
 * @param {number} [input.tolerance]      override the computed tolerance
 * @returns {{
 *   ok: boolean,            // true when within tolerance (not overstated)
 *   status: "ok"|"overstated"|"understated",
 *   expected: number,       // net + overhead + profit
 *   stated: number,
 *   difference: number,     // stated − expected
 *   tolerance: number,
 *   clampedTotal: number    // stated clamped down to expected when overstated
 * }}
 */
export function validateRateComposition({
  netCost,
  overheadAmount,
  profitAmount,
  totalCost,
  tolerance,
} = {}) {
  const net = num(netCost);
  const overhead = num(overheadAmount);
  const profit = num(profitAmount);
  const stated = num(totalCost);

  const expected = net + overhead + profit;
  const tol = Number.isFinite(tolerance)
    ? tolerance
    : Math.max(1.0, 0.005 * Math.abs(expected));

  const difference = stated - expected;

  let status = "ok";
  if (difference > tol) status = "overstated";
  else if (difference < -tol) status = "understated";

  return {
    ok: status !== "overstated",
    status,
    expected,
    stated,
    difference,
    tolerance: tol,
    // Overstated rates are clamped down to the build-up; everything else is
    // left as stated.
    clampedTotal: status === "overstated" ? expected : stated,
  };
}

export default validateRateComposition;
