// What POST /library/rate-items/resolve and GET /library/rate-items/search
// hand back for one matched rate.
//
// This lived inline in the route, which meant the exact shape the client reads
// could only be checked by running the endpoint against Mongo. It is pure, so
// it is pinned by tests instead: every field a caller already depends on is
// asserted by name, and the build-up that used to be parsed and then thrown
// away now rides along with it.
//
// Additive rule: nothing here may rename, retype or drop a field that was
// returned before. A desktop plugin reading this response must not notice.
import { compositionSubtotals } from "./rategenUserRates.js";

// How many best matches in ONE bulk resolve may carry their full build-up.
// A six-component build-up is ~1.4 KB of JSON and the resolve response
// serialises each best match twice (ratesByKey and results[].best), so 2000
// bill lines would add ~5.4 MB and push the response past Lambda's 6 MB
// ceiling — breaking the bulk auto-fill that works today. A resolve for a
// single line, which is what picking a rate does, is always under the cap.
export const MAX_RESOLVE_COMPOSITIONS = 250;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One candidate in the pool a caller chooses from.
 *
 * Carries the per-unit split by resource class and the rate's own id, but NOT
 * the build-up: a bulk resolve returns up to 20 candidates for each of up to
 * 2000 bill lines. The build-up rides on the best match only.
 */
export function projectRateCandidate(c = {}) {
  const subtotals = c.subtotals || compositionSubtotals(c.composition);
  return {
    description: c.description,
    unit: c.unit,
    totalCost: c.totalCost,
    netCost: c.netCost,
    sectionKey: c.sectionKey,
    sectionLabel: c.sectionLabel,
    source: c.source,
    score: Number(num(c.score).toFixed(4)),
    rateId: c.rateId || null,
    materialCost: subtotals.materialCost,
    labourCost: subtotals.labourCost,
    plantCost: subtotals.plantCost,
    otherCost: subtotals.otherCost,
  };
}

/**
 * The best match for one requested bill line.
 *
 * `includeComposition` false means this response has spent its composition
 * budget — the result then says `compositionOmitted: true`, because "the cap
 * was reached, ask again for this one line" and "this rate has no build-up at
 * all" must not look the same to a caller.
 */
export function projectBestRate(best, { includeComposition = true } = {}) {
  if (!best) return null;
  const subtotals = best.subtotals || compositionSubtotals(best.composition);
  const out = {
    description: best.description,
    unit: best.unit,
    totalCost: best.totalCost,
    sectionLabel: best.sectionLabel,
    source: best.source,
    score: Number(num(best.score).toFixed(4)),
    rateId: best.rateId || null,
    netCost: best.netCost,
    materialCost: subtotals.materialCost,
    labourCost: subtotals.labourCost,
    plantCost: subtotals.plantCost,
    otherCost: subtotals.otherCost,
    composition: includeComposition ? best.composition || null : null,
  };
  if (!includeComposition && best.composition) out.compositionOmitted = true;
  return out;
}

/**
 * Hands out the per-response composition budget. Only a best match that
 * actually HAS a build-up spends from it, so a bill full of headline-only
 * rates never starves the ones that carry a real build-up.
 */
export function makeCompositionBudget(max = MAX_RESOLVE_COMPOSITIONS) {
  let returned = 0;
  let omitted = 0;
  return {
    take(best) {
      if (!best?.composition) return true;
      if (returned < max) {
        returned += 1;
        return true;
      }
      omitted += 1;
      return false;
    },
    get stats() {
      return {
        compositionsReturned: returned,
        compositionsOmitted: omitted,
        maxCompositions: max,
      };
    },
  };
}
