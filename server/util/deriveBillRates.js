// Derive each bill line's rate from its material + labour build-up.
//
//   Bill Rate (per unit) = net × (1 + (overhead% + profit%) / 100) / billQty
//   where net = Σ (budgetLine.qty × budgetLine.rate) over the line's
//   material + labour (+ plant/consumable) rows.
//
// When a bill line has a PRICED build-up in budgetItems[] (net > 0), its rate
// is derived here so the BoQ rate, valuation, certificates and EVM all follow
// what the QS priced on the Budget tab. Lines with no priced build-up are left
// untouched (a manually-entered rate is preserved), and so are lines the QS
// priced himself from Rate Gen — see isRateApplied below. Pure (no DB /
// mongoose).

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Group budget lines by their bill code (billIdentity), lowercased — matches
// the keying in reconcileItemsFromBudget so the two stay consistent.
function groupByBill(budgetItems) {
  const byCode = new Map();
  for (const b of Array.isArray(budgetItems) ? budgetItems : []) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }
  return byCode;
}

// The group's overhead / profit %: the max of each across its lines. The Budget
// UI stamps one O&P per bill-item group onto every line; max tolerates a
// partially-filled group.
function groupMarkup(lines) {
  let overheadPercent = 0;
  let profitPercent = 0;
  for (const l of lines) {
    overheadPercent = Math.max(overheadPercent, num(l?.overheadPercent));
    profitPercent = Math.max(profitPercent, num(l?.profitPercent));
  }
  return { overheadPercent, profitPercent };
}

// ── A rate the QS applied himself outranks the derived one ──────────
//
// The owner's rule (23 Sep 2026): when a QS picks a rate out of Rate Gen, or
// types one into the rate cell, THAT is the line's rate. It must survive the
// save and the lazy budget heal instead of being quietly re-derived from a
// build-up that never saw it.
//
// ONE stamp marks such a line, and it is one this platform writes itself:
//   • rateLockedAt — when the QS applied the rate, set by the website's rate
//     cell (a Rate Gen pick or a typed figure) and by nothing else. Optional,
//     null by default, absent on every document written before this shipped.
//
// It is deliberately NOT keyed off appliedRateKey. That field is the Revit
// plugin's provenance — "the exact RateGen library description that priced
// this line" — and QUIV has always sent it, so treating its presence as a lock
// would silently stop re-deriving thousands of lines on projects nobody has
// touched, and a rate a customer already sees could change without anyone
// asking for it. appliedRateKey therefore means exactly what it always meant:
// where the figure came from, never whose figure it is.
//
// Because rateLockedAt is absent on every stored row and on every plugin
// payload, an existing project derives exactly as it did before: this
// predicate can only ever return false for them, so no stored figure moves.
// Nothing here re-classes or rewrites a budget row.
export function isRateApplied(item) {
  if (!item) return false;
  const at = item.rateLockedAt;
  if (at == null || at === "") return false;
  const d = at instanceof Date ? at : new Date(at);
  return !Number.isNaN(d.getTime());
}

// Compute a single bill line's derived rate from its budget lines, or null when
// there is no priced build-up. Exposed for unit testing.
export function deriveLineRate(billQty, lines) {
  const net = (Array.isArray(lines) ? lines : []).reduce(
    (a, l) => a + num(l?.qty) * num(l?.rate),
    0,
  );
  if (net <= 0) return null;
  const { overheadPercent, profitPercent } = groupMarkup(lines);
  const amount = net * (1 + (overheadPercent + profitPercent) / 100);
  const qty = num(billQty);
  const rate = qty > 0 ? amount / qty : amount;
  return {
    rate: Math.round(rate * 100) / 100,
    netUnitCost: qty > 0 ? net / qty : net,
    overheadPercent,
    profitPercent,
  };
}

// Mutate project.items in place: every bill item with a priced build-up gets
// its rate derived; netUnitCost / overhead% / profit% are stored for
// transparency. Returns { updated, skipped } — skipped counts the lines whose
// rate the QS applied himself and which were therefore left alone.
export function deriveBillRatesFromBudget(project) {
  try {
    if (!project) return { updated: 0, skipped: 0 };
    const budget = Array.isArray(project.budgetItems) ? project.budgetItems : [];
    if (!budget.length) return { updated: 0, skipped: 0 };
    const byCode = groupByBill(budget);
    if (byCode.size === 0) return { updated: 0, skipped: 0 };
    let updated = 0;
    let skipped = 0;
    for (const it of project.items || []) {
      const code = String(it?.code || "").trim().toLowerCase();
      const lines = code ? byCode.get(code) : null;
      if (!lines || !lines.length) continue;
      // The QS applied this rate himself — leave it exactly as he set it.
      // (skipped is reported so callers can tell "nothing to do" from
      // "deliberately left alone".)
      if (isRateApplied(it)) {
        skipped += 1;
        continue;
      }
      const derived = deriveLineRate(it.qty, lines);
      if (!derived) continue;
      // Only count a real change so callers that save-on-change stay idempotent.
      if (num(it.rate) === derived.rate) continue;
      it.rate = derived.rate;
      it.netUnitCost = derived.netUnitCost;
      it.overheadPercent = derived.overheadPercent;
      it.profitPercent = derived.profitPercent;
      updated += 1;
    }
    if (updated > 0 && typeof project.markModified === "function") {
      project.markModified("items");
    }
    return { updated, skipped };
  } catch (e) {
    console.error("deriveBillRatesFromBudget failed:", e?.message || e);
    return { updated: 0, skipped: 0 };
  }
}
