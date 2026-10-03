// A proposed rate for every unpriced line on a bill, shaped for Ada's confirm
// card.
//
// ADA PROPOSES, THE QS DISPOSES
//
// Ada never writes a price. This builds a LIST: for each line with no rate, the
// best rate from the QS's own merged RateGen library (master + their overrides
// + their custom rates), with the reason it matched. The chat shows it as a
// card with a tick box per line; nothing changes until the QS presses Apply,
// and Apply posts only WHICH rate goes on WHICH line — the price-many endpoint
// re-reads every rate from the caller's own library server-side, exactly as
// the single-line price-from-rate does. So the model cannot put a number on a
// bill even if it tried: the figure here is for reading, not for writing.
//
// THE MATCHING IS NOT NEW
//
// suggestionMapForBill (util/rateSuggestions.js) is what the Rates tab already
// shows as "suggested rate": unit as a hard gate, a similarity floor, the QS's
// own rate first on a tie, lowercased codes. This only turns its map back into
// rows in bill order, with the quantity and the amount it would add, and counts
// what it could not match so the card can say so.
//
// Pure: the caller loads the project and the merged rate set.

import { suggestionMapForBill, needsRate } from "./rateSuggestions.js";

/** The most lines one Apply can carry — the price-many endpoint's ceiling. */
export const MAX_PROPOSAL_LINES = 500;

const str = (v) => String(v || "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round(num(v) * 100) / 100;

/**
 * @param {Array} items   the project's bill
 * @param {Array} rates   the caller's merged rate set
 * @param {object} [opts]
 * @param {number} [opts.max]  most lines to propose
 * @returns {{
 *   lines: Array<{code, description, qty, unit, rateId, rateDescription,
 *                 rateUnit, unitPrice, amount, why, own, score}>,
 *   unpricedCount: number, matchedCount: number, unmatchedCount: number,
 *   noCodeCount: number, truncated: boolean, totalToAdd: number,
 *   libraryCount: number
 * }}
 */
export function buildPricingProposal(items, rates, { max = MAX_PROPOSAL_LINES } = {}) {
  const bill = Array.isArray(items) ? items : [];
  const unpriced = bill.filter(needsRate);
  // The map's own cap is a little above ours so `truncated` below reflects
  // what the CARD drops, not what the matcher skipped.
  const found = suggestionMapForBill(bill, rates, { cap: Math.max(max, 600) });

  const lines = [];
  const seen = new Set();
  let noCode = 0;
  for (const item of unpriced) {
    const code = str(item?.code);
    if (!code) {
      // The apply endpoint addresses a line by its code; a line without one
      // cannot be priced from here, only from its own panel.
      noCode += 1;
      continue;
    }
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const best = found.byCode[key];
    if (!best) continue;
    const qty = num(item?.qty);
    lines.push({
      code,
      description: str(item?.description || item?.takeoffLine || item?.materialName).slice(0, 200),
      qty,
      unit: str(item?.unit),
      rateId: str(best.rateId),
      rateDescription: str(best.description).slice(0, 200),
      rateUnit: str(best.unit),
      unitPrice: round2(best.unitPrice),
      amount: round2(qty * num(best.unitPrice)),
      why: str(best.why),
      own: Boolean(best.own),
      score: num(best.score),
    });
  }

  const truncated = lines.length > max;
  const kept = lines.slice(0, Math.max(0, max));
  return {
    lines: kept,
    unpricedCount: unpriced.length,
    matchedCount: lines.length,
    unmatchedCount: Math.max(0, unpriced.length - lines.length - noCode),
    noCodeCount: noCode,
    truncated,
    totalToAdd: round2(kept.reduce((s, l) => s + l.amount, 0)),
    libraryCount: Array.isArray(rates) ? rates.length : 0,
  };
}
