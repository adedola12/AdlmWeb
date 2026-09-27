// A custom rate as a plain object: the draft, its arithmetic, what is wrong
// with it, and the payload the server wants.
//
// Separate from the card that edits it so the sums can be tested without
// mounting React, and so the screen and the builder cannot drift apart about
// what a rate comes to.

import { percentProblem, totalsFrom, toNum } from "./rateMath.js";

// What normalizeCustomRate() falls back to when a custom rate arrives without
// percentages and the customer has set no default for its trade
// (server/util/tradeMargins.js BUILTIN_MARGINS.custom). Shown as the
// placeholder so the figure on screen is the figure that will be stored.
export const CUSTOM_DEFAULT_OVERHEAD = 10;
export const CUSTOM_DEFAULT_PROFIT = 10;

/**
 * What a blank overhead or profit box means for a rate in this trade: the
 * customer's own trade default where they set one, else 10 / 10. Mirrors the
 * server's resolveMargins() for a new custom rate, half by half.
 *
 * `trades` is the `trades` array GET /rategen-v2/library/trade-margins sends.
 * Returns the figures and where each came from ("your-trade" | "default").
 */
export function blankDefaults(trades, sectionKey) {
  const row = (Array.isArray(trades) ? trades : []).find(
    (t) => t.sectionKey === String(sectionKey || "").trim().toLowerCase(),
  );
  const yours = row?.yours || {};
  const half = (v, builtin) =>
    v !== null && v !== undefined && Number.isFinite(Number(v))
      ? { value: Number(v), source: "your-trade" }
      : { value: builtin, source: "default" };
  return {
    overhead: half(yours.overheadPercent, CUSTOM_DEFAULT_OVERHEAD),
    profit: half(yours.profitPercent, CUSTOM_DEFAULT_PROFIT),
  };
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** The id a new custom rate is filed under: readable, and collision-proof. */
export function newCustomRateId(name) {
  const base = slugify(name) || "rate";
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

/** An empty draft. Exported so the caller can seed one before the card opens. */
export function emptyDraft({ sectionKey = "", sectionLabel = "" } = {}) {
  return {
    name: "",
    unit: "m²",
    sectionKey,
    sectionLabel,
    overhead: "",
    profit: "",
    description: "",
    lines: [],
  };
}

/** Every line, as the totals see it. */
export function draftComponents(draft) {
  return (draft.lines || []).map((l) => ({
    ...l,
    amount: Math.max(0, toNum(l.quantity)) * toNum(l.unitPrice),
  }));
}

/**
 * @param {object} draft
 * @param {object} [defaults] blankDefaults() for the draft's trade; omitted,
 *   a blank box is the built-in 10 / 10.
 */
export function draftTotals(draft, defaults = null) {
  const d = defaults || blankDefaults([], "");
  return totalsFrom(
    draftComponents(draft),
    draft.overhead === "" ? d.overhead.value : toNum(draft.overhead),
    draft.profit === "" ? d.profit.value : toNum(draft.profit),
  );
}

/** What is wrong with the draft, in the order a person would fix it. */
export function draftProblem(draft) {
  if (!String(draft.name || "").trim()) return "Give the rate a name";
  if (!String(draft.unit || "").trim()) return "Give the rate a unit";
  if (!(draft.lines || []).length)
    return "Add at least one material, labour or plant line";
  if ((draft.lines || []).some((l) => !String(l.name || "").trim()))
    return "Every line needs something on it";
  // A plant line with no hourly price would enter the rate at ₦0 and read as
  // free plant. It is refused, never priced at zero.
  const unpriced = (draft.lines || []).find(
    (l) => l.kind === "plant" && toNum(l.quantity) > 0 && !(toNum(l.unitPrice) > 0),
  );
  if (unpriced) return `Give ${unpriced.name} an hourly price, or take it off`;
  // The same rule the build-up screen applies, so a rate cannot be built at a
  // percentage that screen would refuse — or, as it used to, silently rewrite.
  const percent =
    percentProblem("Overhead", draft.overhead) || percentProblem("Profit", draft.profit);
  if (percent) return percent;
  return null;
}

/** The payload PUT /rategen-v2/library/custom-rates/:id expects. */
export function draftToPayload(draft, customRateId, customRatesBaseVersion, defaults = null) {
  const comps = draftComponents(draft);
  const totals = draftTotals(draft, defaults);
  const line = (l) => ({
    description: l.name,
    quantity: Math.max(0, toNum(l.quantity)),
    unit: l.unit || "",
    unitPrice: toNum(l.unitPrice),
    totalCost: l.amount,
    category: l.category || "",
    refSn: l.refSn ?? null,
    refName: l.name,
  });

  return {
    customRateId,
    sectionKey: draft.sectionKey || "",
    sectionLabel: draft.sectionLabel || "",
    title: draft.name.trim(),
    description: (draft.description || "").trim() || draft.name.trim(),
    unit: draft.unit.trim(),
    // materials[] and labour[] are what the desktop and the plugins read for a
    // custom rate's composition, so they are sent as well as the breakdown.
    //
    // Plant rides in materials[] with rateType "plant", the convention the
    // server's schema documents. That is what lets a Rate Gen desktop push,
    // which rebuilds this rate from its own material and labour lists and
    // knows no plant, be caught by preservePlantLines() instead of silently
    // dropping the plant line and its money. It also reaches QUIV, which reads
    // a custom rate's materials[] + labour[] and classifies each line by
    // rateType. The breakdown carries it too, with refKind "plant".
    materials: comps
      .filter((l) => l.kind === "material" || l.kind === "plant")
      .map((l) => ({ ...line(l), rateType: l.kind })),
    labour: comps.filter((l) => l.kind === "labour").map((l) => ({ ...line(l), rateType: "labour" })),
    breakdown: comps.map((l) => ({
      componentName: l.name,
      quantity: Math.max(0, toNum(l.quantity)),
      unit: l.unit || "",
      unitPrice: toNum(l.unitPrice),
      lineTotal: l.amount,
      refKind: l.kind,
      refSn: l.refSn ?? null,
      refName: l.name,
    })),
    netCost: totals.netCost,
    overheadPercent: totals.overheadPercent,
    profitPercent: totals.profitPercent,
    customRatesBaseVersion,
  };
}
