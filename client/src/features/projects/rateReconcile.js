// Does a bill line's rate agree with its Budget build-up?
//
// The owner's rule (23 Sep 2026): when a QS picks a rate out of Rate Gen, or
// types one into the rate cell, THAT is the line's rate — the server stops
// re-deriving it from the Budget (server/util/deriveBillRates.js, isRateApplied).
//
// That is the right answer for the money, but it leaves the Budget saying
// something different from the Bill until the Budget-writing work lands. So the
// screen has to say so rather than quietly showing two numbers that disagree.
// Everything here is read-only arithmetic over data the page already has; it
// writes nothing and creates no budget rows.
//
// Pure — no React, no network. Unit-tested in rateReconcile.test.js.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Mirrors server/util/deriveBillRates.js isRateApplied, and must keep mirroring
// it: the screen may not claim a line is locked when the server would still
// re-derive it. The stamp is rateLockedAt and only rateLockedAt — appliedRateKey
// is the Revit plugin's provenance ("which library rate priced this"), which
// QUIV has always sent and which says nothing about whose rate it is. A line
// written before this shipped carries no stamp, so it reports false and keeps
// behaving exactly as it always has.
export function isRateApplied(item) {
  if (!item) return false;
  const at = item.rateLockedAt;
  if (at == null || at === "") return false;
  const d = at instanceof Date ? at : new Date(at);
  return !Number.isNaN(d.getTime());
}

// Group the budget rows by their bill code, lowercased — the same keying
// deriveBillRates.js uses, so the two never disagree about which rows belong
// to a line.
export function groupBudgetByBillCode(budgetItems) {
  const byCode = new Map();
  for (const b of Array.isArray(budgetItems) ? budgetItems : []) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }
  return byCode;
}

// The rate this line's build-up would produce, or null when nothing in it is
// priced. Same formula as the server's deriveLineRate: net × (1 + O&P) / qty,
// with O&P taken as the max across the group.
export function buildUpRate(billQty, lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const net = rows.reduce((a, l) => a + num(l?.qty) * num(l?.rate), 0);
  if (net <= 0) return null;
  let overheadPercent = 0;
  let profitPercent = 0;
  for (const l of rows) {
    overheadPercent = Math.max(overheadPercent, num(l?.overheadPercent));
    profitPercent = Math.max(profitPercent, num(l?.profitPercent));
  }
  const amount = net * (1 + (overheadPercent + profitPercent) / 100);
  const qty = num(billQty);
  const rate = qty > 0 ? amount / qty : amount;
  return Math.round(rate * 100) / 100;
}

// Two rates agree when they are within half a percent, or within a kobo on a
// line too small for a percentage to mean anything. Rounding through the
// build-up and back must not read as a discrepancy.
function agrees(rate, budgetRate) {
  const tolerance = Math.max(0.01, Math.abs(rate) * 0.005);
  return Math.abs(rate - budgetRate) <= tolerance;
}

/**
 * What to say about one bill line, or null when there is nothing to say.
 *
 * Returns:
 *   { state: "differs", budgetRate, difference } — the QS applied this rate,
 *       the Budget prices the same line, and the two figures disagree. That is
 *       a real contradiction on screen and the line says so.
 *   null — anything else.
 *
 * "Anything else" deliberately includes a line with NO priced build-up. There
 * is nothing to reconcile against, so there is nothing to report: a project
 * with no Budget at all would otherwise flag every rate the QS ever applied,
 * which is noise on exactly the projects where a disagreement cannot exist.
 * A missing Budget is a fact of the project, not a fault of the line.
 */
export function reconcileAppliedRate(item, budgetLines) {
  if (!isRateApplied(item)) return null;
  const rate = num(item?.rate);
  if (rate <= 0) return null;
  const budgetRate = buildUpRate(item?.qty, budgetLines);
  if (budgetRate == null) return null;
  if (agrees(rate, budgetRate)) return null;
  return {
    state: "differs",
    budgetRate,
    difference: Math.round((rate - budgetRate) * 100) / 100,
  };
}

/**
 * The whole bill at once: a Map from item index to the note for that line.
 * Only lines with something to say are in the map, so an untouched project
 * yields an empty map and the table renders exactly as it does today.
 */
export function reconcileBill(items, budgetItems) {
  const out = new Map();
  const byCode = groupBudgetByBillCode(budgetItems);
  const rows = Array.isArray(items) ? items : [];
  for (let i = 0; i < rows.length; i += 1) {
    const it = rows[i];
    const code = String(it?.code || "").trim().toLowerCase();
    const note = reconcileAppliedRate(it, code ? byCode.get(code) : null);
    if (note) out.set(i, note);
  }
  return out;
}
