// A custom rate as a plain object: the draft, its arithmetic, what is wrong
// with it, and the payload the server wants.
//
// Separate from the card that edits it so the sums can be tested without
// mounting React, and so the screen and the builder cannot drift apart about
// what a rate comes to.

import { percentProblem, totalsFrom, toNum } from "./rateMath.js";

// What normalizeCustomRate() falls back to when a custom rate arrives without
// percentages (server/util/rategenUserRates.js). Shown as the placeholder so
// the figure on screen is the figure that will be stored.
export const CUSTOM_DEFAULT_OVERHEAD = 10;
export const CUSTOM_DEFAULT_PROFIT = 10;

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

export function draftTotals(draft) {
  return totalsFrom(
    draftComponents(draft),
    draft.overhead === "" ? CUSTOM_DEFAULT_OVERHEAD : toNum(draft.overhead),
    draft.profit === "" ? CUSTOM_DEFAULT_PROFIT : toNum(draft.profit),
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
  // The same rule the build-up screen applies, so a rate cannot be built at a
  // percentage that screen would refuse — or, as it used to, silently rewrite.
  const percent =
    percentProblem("Overhead", draft.overhead) || percentProblem("Profit", draft.profit);
  if (percent) return percent;
  return null;
}

/** The payload PUT /rategen-v2/library/custom-rates/:id expects. */
export function draftToPayload(draft, customRateId, customRatesBaseVersion) {
  const comps = draftComponents(draft);
  const totals = draftTotals(draft);
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
    materials: comps.filter((l) => l.kind === "material").map((l) => ({ ...line(l), rateType: "material" })),
    labour: comps.filter((l) => l.kind === "labour").map((l) => ({ ...line(l), rateType: "labour" })),
    // Plant has no master library of its own (deferred), so a plant line lives
    // in the breakdown with refKind "plant" — the same shape the classifier
    // already reads on master rates.
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
