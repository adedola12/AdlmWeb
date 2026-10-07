// QUIV measures, ADLM Cloud prices (owner, 1 and 4 Oct 2026).
//
// QUIV sends its material and labour schedule as quantities, measured from the
// model and updated on every save, with no prices on them. The cloud adds the
// rates, for an account that has RateGen:
//
//   1. a row with no price gets one from the same sources the Material &
//      Labour schedule builder uses (the user's RateGen library over the ADLM
//      master list for materials; the Labour constants for labour, on the bill
//      line's own quantity and unit),
//   2. a bill line whose rows were priced here and carry no overhead / profit
//      gets the Markup constants, so its derived bill rate is a selling rate,
//      not bare cost (the builder prices an unpriced bill line the same way),
//   3. a bill line QUIV gave no rows at all is built by generateMlSchedule,
//      which never touches lines that already have rows.
//
// A row that already has a price (typed on the website, restored by
// preserveBudgetUserEdits, or from an older plugin save) is never changed.
// Pure: the caller supplies the context from buildMlScheduleContext.

import { classifyWork, generateMlSchedule, labourRateFor, measureBasis, normalizeUnit } from "./mlSchedule.js";
import { MC } from "./materialConstants.js";

export const CLOUD_PRICE_SOURCE = "cloud-price";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const codeOf = (v) => String(v ?? "").trim().toLowerCase();

/**
 * @param {object[]} items        bill lines
 * @param {object[]} budgetItems  the budget after the plugin's rows were merged (not mutated)
 * @param {object}   ctx          { K, priceFor, ... } from buildMlScheduleContext
 * @returns {{ budgetItems: object[], priced: number, generated: number, covered: number }}
 */
export function priceBudgetFromCloud(items, budgetItems, ctx) {
  const bill = Array.isArray(items) ? items : [];
  const K = ctx?.K;
  const priceFor = typeof ctx?.priceFor === "function" ? ctx.priceFor : () => 0;
  const billByCode = new Map();
  for (const it of bill) {
    const c = codeOf(it?.code);
    if (c && !billByCode.has(c)) billByCode.set(c, it);
  }

  const rows = (Array.isArray(budgetItems) ? budgetItems : []).map((b) => ({ ...b }));
  const pricedCodes = new Set();
  let priced = 0;

  for (const b of rows) {
    if (num(b?.rate) > 0) continue;
    const kind = String(b?.componentKind || "Material");
    let rate = 0;

    if (kind === "Material") {
      rate = num(priceFor(b?.materialName || b?.description || "", b?.unit || ""));
    } else if (kind === "Labour" && K) {
      // Labour sits on its bill line's quantity and unit; price it the way the
      // schedule builder does, and only when the units really match.
      const item = billByCode.get(codeOf(b?.billIdentity));
      if (item && normalizeUnit(item.unit) === normalizeUnit(b?.unit)) {
        const work = classifyWork(item, K);
        if (work !== "unknown" && work !== "lumpsum" && !String(work).startsWith("mep-")) {
          rate = num(labourRateFor(item, work, K)) * num(measureBasis(item, K)?.factor || 1);
        }
      }
    }

    if (rate > 0) {
      b.rate = round(rate, 4);
      b.rateSource = CLOUD_PRICE_SOURCE;
      priced += 1;
      const c = codeOf(b?.billIdentity);
      if (c) pricedCodes.add(c);
    }
  }

  // Markup for the lines priced here, unless the QS already set one on the group.
  if (K && pricedCodes.size) {
    const overhead = num(K.get(MC.MarkupOverheadPercent));
    const profit = num(K.get(MC.MarkupProfitPercent));
    for (const code of pricedCodes) {
      const group = rows.filter((b) => codeOf(b?.billIdentity) === code);
      if (group.some((b) => num(b?.overheadPercent) > 0 || num(b?.profitPercent) > 0)) continue;
      for (const b of group) {
        b.overheadPercent = overhead;
        b.profitPercent = profit;
      }
    }
  }

  // Lines QUIV did not cover at all: the builder fills them, and leaves every
  // line that has rows alone.
  let out = rows;
  let generated = 0;
  let covered = 0;
  if (K) {
    const gen = generateMlSchedule(bill, rows, K, ctx);
    out = gen.budgetItems;
    generated = gen.generated;
    covered = gen.covered;
  }

  return { budgetItems: out, priced, generated, covered };
}

export default priceBudgetFromCloud;
