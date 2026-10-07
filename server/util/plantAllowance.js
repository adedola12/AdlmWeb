// The per-bill-unit plant allowance the Material & Labour schedule engine
// asks for (generateMlSchedule opts.plantFor, util/mlSchedule.js).
//
// That hook had no caller, so every generated schedule priced plant from the
// Plant constants, which ship at 0, and the whole plant share of a bill rate
// landed in the back-solved overhead and profit. The figure is now read off
// the Rate Gen rate that priced the line, when the line names one.
//
// WHICH RATE: the bill line's appliedRateKey, the exact Rate Gen description
// the plugin priced it with, looked up in this customer's merged library
// (their own copies and rates over ADLM's).
//
// ONLY IN THE SAME UNIT. A rate's plant subtotal is per unit of the RATE. A
// line billed in a different unit would need a conversion only the QS knows,
// so it gets 0 here and the Plant constants decide, exactly as before.
//
// What it moves: the cost/profit SPLIT of a generated schedule, on a
// regenerate or an import the QS runs. The bill total cannot move: the engine
// back-solves overhead and profit to the bill rate.
//
// Pure: the caller passes the merged rates in.

import { buildRateComposition, compositionSubtotals } from "./rategenUserRates.js";

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * @param {object[]} mergedRates  mergeRatesWithUserData() output
 * @param {(a:string,b:string)=>boolean} sameUnit
 * @returns {(item:object)=>number}  plant cost per bill unit, 0 when unknown
 */
export function makePlantFor(mergedRates, sameUnit) {
  const byDesc = new Map();
  for (const r of Array.isArray(mergedRates) ? mergedRates : []) {
    const k = norm(r?.description);
    if (!k) continue;
    if (!byDesc.has(k)) byDesc.set(k, []);
    byDesc.get(k).push(r);
  }
  return (item) => {
    const k = norm(item?.appliedRateKey);
    if (!k) return 0;
    const candidates = (byDesc.get(k) || []).filter((r) => sameUnit(r?.unit, item?.unit));
    // Two rates with the same description and unit that disagree on plant is
    // not a figure to guess between.
    const figures = new Set(
      candidates.map((r) => {
        const comp = r.composition || buildRateComposition(r);
        return comp ? Math.round(compositionSubtotals(comp).plantCost * 100) / 100 : 0;
      }),
    );
    if (figures.size !== 1) return 0;
    const [plant] = figures;
    return plant > 0 ? plant : 0;
  };
}
