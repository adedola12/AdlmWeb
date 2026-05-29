// server/util/profitMargin.js
//
// Proposed-vs-actual profit margin (QUIV material-rate upgrade spec §5).
//
// The Revit plugin computes these in ProfitMarginCalculator; we mirror the
// same maths server-side so the website BoQ shows identical numbers.
//
// Per takeoff line:
//   proposed revenue = sellRate × qty                  (sellRate = line.rate)
//   proposed cost    = netUnitCost × (1 + overhead%/100) × qty
//   proposed profit  = revenue − cost
//   margin %         = profit / revenue
//
//   actual revenue   = (actualRate ?? rate) × (actualQty ?? qty)
//   actual cost      = Σ attached material/labour lines
//                        (actualRate ?? rate) × (actualQty ?? qty),
//                      inflated by overhead %
//   profit variance  = actual profit − proposed profit
//
// "Cost" here is net + overhead (profit is the margin we earn). Revenue is the
// headline sell total, which already embeds overhead + profit. When derived
// material/labour lines are attached to a takeoff line (matched by
// MaterialItemDto.sourceTakeoffCode == TakeoffItemDto.code) we cost the line
// from those rows; otherwise we fall back to the line's own netUnitCost; if
// neither is present the line's cost is unknown and only its revenue counts.

function num(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

// Treat null / undefined / "" as "not re-measured" and fall back to the
// proposed value. A real 0 (e.g. actualQty === 0) is honoured.
function pickActual(actualVal, proposedVal) {
  if (actualVal === null || actualVal === undefined || String(actualVal).trim() === "") {
    return proposedVal;
  }
  const n = num(actualVal, NaN);
  return Number.isFinite(n) ? n : proposedVal;
}

// True only when a real numeric value is present. Guards against num()'s
// empty-string coercion (Number("") === 0), so missing fields (null /
// undefined / "") are correctly treated as absent rather than zero.
function hasNumber(v) {
  if (v === null || v === undefined || String(v).trim() === "") return false;
  return Number.isFinite(num(v, NaN));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Compute the proposed/actual margin for a single takeoff line.
 *
 * @param {object} line       a TakeoffItem (rate = sell rate, qty, actuals…)
 * @param {object[]} attached derived material/labour lines for this line
 */
export function computeLineMargin(line = {}, attached = []) {
  const rows = Array.isArray(attached) ? attached : [];

  const sellRate = num(line.rate);
  const qty = num(line.qty);
  const actualQty = pickActual(line.actualQty, qty);
  const actualRate = pickActual(line.actualRate, sellRate);

  const proposedRevenue = sellRate * qty;
  const actualRevenue = actualRate * actualQty;

  // Overhead %: prefer the takeoff line's own value, else a representative
  // value carried on the attached component rows (they share one rate's %).
  let overheadPercent = hasNumber(line.overheadPercent)
    ? num(line.overheadPercent)
    : null;

  let proposedCost = 0;
  let actualCost = 0;
  let costKnown = false;

  if (rows.length) {
    if (overheadPercent === null) {
      const ohs = rows.filter((m) => hasNumber(m.overheadPercent)).map((m) => num(m.overheadPercent));
      overheadPercent = ohs.length ? ohs[0] : 0;
    }
    const ohMult = 1 + overheadPercent / 100;
    let proposedNet = 0;
    let actualNet = 0;
    for (const m of rows) {
      const mRate = num(m.rate);
      const mQty = num(m.qty);
      proposedNet += mRate * mQty;
      actualNet += pickActual(m.actualRate, mRate) * pickActual(m.actualQty, mQty);
    }
    proposedCost = proposedNet * ohMult;
    actualCost = actualNet * ohMult;
    costKnown = true;
  } else if (hasNumber(line.netUnitCost)) {
    if (overheadPercent === null) overheadPercent = 0;
    const ohMult = 1 + overheadPercent / 100;
    const netUnit = num(line.netUnitCost);
    proposedCost = netUnit * ohMult * qty;
    actualCost = netUnit * ohMult * actualQty;
    costKnown = true;
  } else if (overheadPercent === null) {
    overheadPercent = 0;
  }

  const proposedProfit = proposedRevenue - proposedCost;
  const actualProfit = actualRevenue - actualCost;

  return {
    code: String(line.code || ""),
    description: String(line.description || line.materialName || ""),
    overheadPercent,
    costKnown,
    attachedCount: rows.length,
    proposed: {
      revenue: round2(proposedRevenue),
      cost: round2(proposedCost),
      profit: round2(proposedProfit),
      margin: proposedRevenue ? round2((proposedProfit / proposedRevenue) * 100) : 0,
    },
    actual: {
      revenue: round2(actualRevenue),
      cost: round2(actualCost),
      profit: round2(actualProfit),
      margin: actualRevenue ? round2((actualProfit / actualRevenue) * 100) : 0,
    },
    profitVariance: round2(actualProfit - proposedProfit),
  };
}

/**
 * Compute proposed-vs-actual margins across a takeoff project and its
 * (optional) attached derived-materials project.
 *
 * @param {object} input
 * @param {object[]} input.takeoffItems  TakeoffItem[] (carry the sell rate)
 * @param {object[]} input.materialItems MaterialItem[] (derived; carry cost)
 * @returns {{ summary: object, lines: object[] }}
 */
export function computeProjectMargin({ takeoffItems = [], materialItems = [] } = {}) {
  const takeoff = Array.isArray(takeoffItems) ? takeoffItems : [];
  const materials = Array.isArray(materialItems) ? materialItems : [];

  // Group derived material/labour lines by the takeoff line they belong to.
  const byCode = new Map();
  let unlinkedMaterialCount = 0;
  for (const m of materials) {
    const code = String(m?.sourceTakeoffCode || "").trim();
    if (!code) {
      unlinkedMaterialCount += 1;
      continue;
    }
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(m);
  }

  const lines = [];
  const totals = {
    proposed: { revenue: 0, cost: 0, profit: 0 },
    actual: { revenue: 0, cost: 0, profit: 0 },
  };
  let linesWithCost = 0;

  for (const t of takeoff) {
    const code = String(t?.code || "").trim();
    const attached = code && byCode.has(code) ? byCode.get(code) : [];
    const lm = computeLineMargin(t, attached);
    lines.push(lm);

    totals.proposed.revenue += lm.proposed.revenue;
    totals.proposed.cost += lm.proposed.cost;
    totals.proposed.profit += lm.proposed.profit;
    totals.actual.revenue += lm.actual.revenue;
    totals.actual.cost += lm.actual.cost;
    totals.actual.profit += lm.actual.profit;
    if (lm.costKnown) linesWithCost += 1;
  }

  const summary = {
    proposed: {
      revenue: round2(totals.proposed.revenue),
      cost: round2(totals.proposed.cost),
      profit: round2(totals.proposed.profit),
      margin: totals.proposed.revenue
        ? round2((totals.proposed.profit / totals.proposed.revenue) * 100)
        : 0,
    },
    actual: {
      revenue: round2(totals.actual.revenue),
      cost: round2(totals.actual.cost),
      profit: round2(totals.actual.profit),
      margin: totals.actual.revenue
        ? round2((totals.actual.profit / totals.actual.revenue) * 100)
        : 0,
    },
    profitVariance: round2(totals.actual.profit - totals.proposed.profit),
    lineCount: takeoff.length,
    linesWithCost,
    linesWithoutCost: takeoff.length - linesWithCost,
    unlinkedMaterialCount,
  };

  return { summary, lines };
}

export default computeProjectMargin;
