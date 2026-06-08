// Bill → Budget cascade (one-way).
//
// When a Bill (BoQ) line's quantity is edited on the website, the linked Budget
// (the "revit-materials" sibling project's derived material/labour lines) must
// follow. Because a derived line's quantity is LINEAR in the bill quantity
// (material qty = perUnitFactor × billQty, labour qty = billQty), the new
// quantity is just a proportional scale of the old one:
//
//     newBudgetQty = oldBudgetQty × (newBillQty / oldBillQty)
//
// Rates and per-unit factors (netUnitCost / overheadPercent / profitPercent) are
// per-unit and therefore unchanged; amount (qty × rate) follows automatically.
// This needs no plugin change and no schema change — the link already exists via
// MaterialItem.sourceTakeoffCode === BillItem.code.
//
// These functions are pure (no DB / mongoose), so they unit-test trivially.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compare previous vs next bill items (by `code`) and return the qty changes
 * that can be cascaded.
 *
 * @param {Array<{code?:string, qty?:number}>} prevBillItems  bill items before the edit
 * @param {Array<{code?:string, qty?:number}>} nextBillItems  bill items after the edit
 * @returns {{ changes: Map<string,{oldQty:number,newQty:number}>, skippedZeroQty: string[] }}
 *   - changes: code → {oldQty,newQty} for lines whose qty changed and oldQty > 0
 *   - skippedZeroQty: codes whose old qty was 0 (ratio undefined — can't scale)
 */
export function buildBillQtyChanges(prevBillItems, nextBillItems) {
  const oldByCode = new Map();
  for (const it of prevBillItems || []) {
    const code = String(it?.code || "").trim();
    if (code) oldByCode.set(code, num(it?.qty));
  }

  const changes = new Map();
  const skippedZeroQty = [];
  for (const it of nextBillItems || []) {
    const code = String(it?.code || "").trim();
    if (!code || !oldByCode.has(code)) continue;
    const oldQty = oldByCode.get(code);
    const newQty = num(it?.qty);
    if (oldQty === newQty) continue;
    if (oldQty <= 0) {
      skippedZeroQty.push(code); // can't infer the per-unit factor from a 0 baseline
      continue;
    }
    changes.set(code, { oldQty, newQty });
  }
  return { changes, skippedZeroQty };
}

/**
 * Apply the bill qty changes to the linked budget (material) lines.
 * Returns a NEW plain-object items array (safe to assign to a mongoose array)
 * plus the count of lines scaled. Only `qty` is touched; everything else
 * (rate, per-unit factors, status, elementIds, …) is preserved.
 *
 * @param {Map<string,{oldQty:number,newQty:number}>} changes  from buildBillQtyChanges
 * @param {Array} materialItems  the budget project's items (mongoose docs or plain)
 * @returns {{ items: Array, updatedLines: number }}
 */
export function cascadeBillQtyToMaterials(changes, materialItems) {
  let updatedLines = 0;
  const items = (materialItems || []).map((mat) => {
    const obj = mat && typeof mat.toObject === "function" ? mat.toObject() : { ...mat };
    const src = String(obj.sourceTakeoffCode || "").trim();
    if (src && changes && changes.has(src)) {
      const { oldQty, newQty } = changes.get(src);
      if (oldQty > 0) {
        obj.qty = num(obj.qty) * (newQty / oldQty);
        updatedLines += 1;
      }
    }
    return obj;
  });
  return { items, updatedLines };
}
