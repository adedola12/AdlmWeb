// What the QS owns on a budget line, and how it survives a rebuild.
//
// A budget row has two kinds of field on it. Most are DERIVED — quantity,
// the material name, the component kind — and are rebuilt from whatever the
// plugin last sent. A few are the QS's own work and exist nowhere else:
//
//   procured / procuredAt / procuredPercent   what has actually been bought
//   targetDate / supplier / notes             the forward buy-schedule slot
//   rate / overheadPercent / profitPercent    a price typed on the website
//
// Three code paths rebuild budgetItems from scratch, and each one has to put
// those back or the QS's work is gone. Two of them did it, each with its own
// key and its own idea of which fields count:
//
//   GET heal            routes/projects.js  keyed on sn, kept the prices
//   Excel re-import     routes/projects.js  keyed on billIdentity, kept the
//                                           procurement, not the prices
//   plugin saveProjectFull                  kept NOTHING
//
// The third is the bug this file exists for. `saveProjectFull` assigned
// `budgetItems = ensureBillItemCoverage(...)` outright, so a QUIV or HERON
// re-save silently destroyed every procurement mark and every typed budget
// rate on the project. It was unrecoverable rather than merely annoying: the
// GET heal rebuilds its own edit map FROM budgetItems, so by the next open the
// evidence it needed had already been overwritten. And because
// deriveBillRatesFromBudget runs straight after, a wiped budget rate moved the
// BILL rate too — the QS's pricing quietly reverted to the plugin's.
//
// ── the key ───────────────────────────────────────────────────────────────
// Two keys, tried in order, because the two callers face different hazards.
//
// `billIdentity` anchors a budget row to its bill line and does not move when
// a model is re-measured, so it is tried first. It is what the plugin path
// needs: there we are matching rows the QS edited against rows the plugin has
// just re-sent, and `sn` is a sequence the plugin re-issues — one inserted
// item and every row after it would match the wrong line, which is worse than
// matching nothing.
//
// `sn` is the fallback, and it is what the heal has always used. Rows written
// before billIdentity was backfilled do not carry one, so dropping the sn key
// would quietly stop restoring edits on exactly the oldest projects. Keeping
// both means this can only ever match MORE than each path matched before.
//
// componentKind is in both keys on purpose. It is part of every merge key in
// this codebase (projects.js, mlSchedule.js) because re-classing a row from
// Labour to Plant orphans the QS's edits — see docs/PLANT-IN-BUDGET.md.

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** Anchored to the bill line: survives re-measurement and re-sequencing. */
function identityKey(b) {
  const id = norm(b?.billIdentity);
  if (!id) return "";
  return ["id", id, norm(b?.materialName || b?.description), norm(b?.unit), norm(b?.componentKind)].join("|");
}

/** What the GET heal has always keyed on. Kept so its matches do not change. */
function sequenceKey(b) {
  return ["sn", Number(b?.sn) || 0, norm(b?.materialName || b?.description), norm(b?.unit), norm(b?.componentKind)].join("|");
}

/**
 * Index the rows a rebuild is about to replace, under both keys.
 * @param {Array} previous the stored budgetItems, before they are overwritten
 */
export function collectBudgetEdits(previous) {
  const byKey = new Map();
  for (const b of Array.isArray(previous) ? previous : []) {
    if (!b) continue;
    const id = identityKey(b);
    // First writer wins: a duplicate key means two rows the caller cannot tell
    // apart, and picking the later one silently would move somebody's money.
    if (id && !byKey.has(id)) byKey.set(id, b);
    const sn = sequenceKey(b);
    if (!byKey.has(sn)) byKey.set(sn, b);
  }
  return byKey;
}

/**
 * Put the QS's own fields back onto a freshly rebuilt list, in place.
 *
 * Only ever writes a field the QS actually set — a falsy previous value is
 * left alone so this cannot un-buy material or zero a rate that the rebuild
 * got right. Returns what it restored, so a caller can decide whether the
 * document needs saving.
 *
 * @param {Array} fresh   the rebuilt budgetItems (mutated)
 * @param {Map}   edits   from collectBudgetEdits(previous)
 */
export function reapplyBudgetEdits(fresh, edits) {
  let matched = 0;
  let procurement = 0;
  let pricing = 0;

  for (const b of Array.isArray(fresh) ? fresh : []) {
    if (!b) continue;
    const prev = edits.get(identityKey(b)) || edits.get(sequenceKey(b));
    if (!prev) continue;
    matched += 1;

    if (prev.procured) {
      b.procured = true;
      b.procuredAt = prev.procuredAt || b.procuredAt;
      procurement += 1;
    }
    if (Number(prev.procuredPercent)) {
      b.procuredPercent = prev.procuredPercent;
      procurement += 1;
    }
    // The forward buy-schedule slot. The heal never carried these and the
    // Excel re-import did; a plugin re-save dropped them either way.
    if (prev.targetDate) b.targetDate = prev.targetDate;
    if (prev.supplier) b.supplier = prev.supplier;
    if (!b.notes && prev.notes) b.notes = prev.notes;

    // A price the QS typed on the website outranks the rebuilt one. This is
    // the heal's existing rule, and the reason it matters on the plugin path
    // too: deriveBillRatesFromBudget reads these straight afterwards, so
    // losing them does not just blank a cell, it moves the bill.
    if (Number(prev.rate)) {
      b.rate = prev.rate;
      pricing += 1;
    }
    if (Number(prev.overheadPercent)) b.overheadPercent = prev.overheadPercent;
    if (Number(prev.profitPercent)) b.profitPercent = prev.profitPercent;
  }

  return { matched, procurement, pricing };
}

/** Collect + reapply in one call, for the paths that rebuild and replace. */
export function preserveBudgetUserEdits(previous, fresh) {
  return reapplyBudgetEdits(fresh, collectBudgetEdits(previous));
}

export default preserveBudgetUserEdits;
