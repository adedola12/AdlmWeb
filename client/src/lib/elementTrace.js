// What one model element costs, and which bill lines say so.
//
// WHY THIS IS ITS OWN MODULE
//
// Two screens answer "I clicked this element — what is it?": the classic
// ModelViewer's side panel, and the project workspace's Model tab in the ported
// design. The arithmetic is the same arithmetic and it computes MONEY, so it
// gets one home rather than a copy each. Two copies of a cost calculation is
// how the same element comes to be worth two different figures on two screens,
// and whichever one somebody quotes to a client is the one that matters.
//
// Pure: no React, no network, no formatting. Formatting belongs to whichever
// screen is doing the rendering, because they do not agree on it and should not.

/**
 * This element's share of a bill line's quantity.
 *
 * An exact figure where the takeoff recorded one per element, and an even split
 * of the line across its elements where it did not. `estimated` says which, and
 * every caller is expected to show it — a split figure presented as measured is
 * a number somebody will put in a valuation.
 *
 * @returns {{qty: number, estimated: boolean}}
 */
export function elementQtyFor(it, id) {
  const eqs = it?.elementQuantities;
  if (Array.isArray(eqs) && eqs.length) {
    const hit = eqs.find((e) => Number(e?.id) === Number(id));
    if (hit && Number.isFinite(Number(hit.qty))) {
      return { qty: Number(hit.qty), estimated: !!it.elementQuantitiesEstimated };
    }
  }
  const ids = it?.elementIds || [];
  // `|| 1` guards the division, not the data: a line with no element ids should
  // not have matched this element in the first place.
  const n = ids.length || 1;
  return { qty: (Number(it?.qty) || 0) / n, estimated: true };
}

/**
 * This element's cost on one line: its quantity share times the line's rate.
 *
 * Returns 0 when the rate is absent OR masked. A collaborator without rate
 * access is served rate 0 by the server (see the project share rules), so money
 * simply does not render for them rather than needing a second code path — and
 * a caller must therefore treat 0 as "no figure to show", never as "free".
 */
export function elementCostFor(it, id) {
  const { qty } = elementQtyFor(it, id);
  return qty * (Number(it?.rate) || 0);
}

/** The lines in `items` that reference this element. */
export function linesForElement(items, id) {
  if (!id) return [];
  return (Array.isArray(items) ? items : []).filter((it) =>
    (it?.elementIds || []).some((n) => Number(n) === Number(id)),
  );
}

/** What to call a line on screen. */
export function itemLabel(it) {
  const takeoff = String(it?.takeoffLine || "").trim();
  const mat = String(it?.materialName || "").trim();
  const joined = [takeoff, mat].filter(Boolean).join(" — ");
  return joined || String(it?.description || "").trim() || "(unnamed item)";
}

/**
 * Everything one screen needs about a clicked element, in one pass.
 *
 * `bill` are the takeoff lines it appears on and `materials` its material and
 * labour breakdown; the two totals are the sums over each. Returns null for no
 * selection so a caller can render nothing without a second condition.
 */
export function traceForElement({ id, items, materialItems }) {
  if (!id) return null;
  const bill = linesForElement(items, id);
  const materials = linesForElement(materialItems, id);
  const sum = (rows) => rows.reduce((a, it) => a + elementCostFor(it, id), 0);
  return {
    id,
    bill,
    materials,
    billCost: sum(bill),
    materialCost: sum(materials),
    // True when the element is in the model but nothing was measured from it.
    // Worth saying out loud: it is the answer to "why is this not in my bill".
    unreferenced: bill.length === 0 && materials.length === 0,
    // True when ANY figure shown is a split rather than a measurement.
    anyEstimated: [...bill, ...materials].some((it) => elementQtyFor(it, id).estimated),
  };
}
