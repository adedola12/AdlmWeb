// Which tabs a project shows, and which of them are asking for attention.
//
// Richard's list, from work-proj.js:319-328. Three of the seven are
// conditional on where the project came from, because they have nothing to
// show otherwise: a PlanSwift job has drawings and no Revit model, a Revit job
// is the other way round, and RateGen projects are a library rather than a
// site so they get neither.
//
// Kept as data, away from the component, so the route shell stays about
// chrome and this stays testable without rendering anything.

/** @type {ReadonlyArray<{key: string, label: string}>} */
const BASE = [
  { key: "overview", label: "Overview" },
  { key: "bill", label: "Bill" },
  { key: "rates", label: "Rates & budget" },
  { key: "pm", label: "PM dashboard" },
  { key: "valuations", label: "Valuations" },
];

const REVIT = new Set(["revit", "mep"]);

export function tabsFor(productKey) {
  // Trimmed as well as lowercased, so this agrees with resolveTab below —
  // two normalisers that disagree is how a tab renders and then refuses to
  // open.
  const key = String(productKey || "").trim().toLowerCase();
  const tabs = [...BASE];
  // His isRevit() is origin quiv | mep; ours calls the same products revit | mep.
  if (REVIT.has(key)) tabs.push({ key: "model", label: "Model" });
  if (key === "planswift") tabs.push({ key: "drawings", label: "Drawings" });
  if (key === "revit" || key === "planswift") tabs.push({ key: "services", label: "Services" });
  return tabs;
}

/**
 * The tab a URL is asking for, falling back to Overview rather than showing
 * an empty body for a tab this project does not have — a link to ?tab=model
 * from a Revit job, opened on a PlanSwift one, should not dead-end.
 */
export function resolveTab(requested, productKey) {
  const want = String(requested || "").trim().toLowerCase();
  return tabsFor(productKey).some((t) => t.key === want) ? want : "overview";
}

/**
 * The count printed beside a tab, or null for no count.
 *
 * Only Bill carries one in his design — the others would be counting the same
 * lines a second time. Returns null rather than 0 when we genuinely do not
 * know, so the shell can print nothing instead of asserting "0 lines" about a
 * project whose summary did not include them.
 */
export function tabCount(tabKey, project) {
  if (tabKey !== "bill") return null;
  const n = project?.itemCount ?? project?.items?.length;
  return Number.isFinite(Number(n)) ? Number(n) : null;
}

/**
 * Whether a tab should show the attention dot.
 *
 * His dots come from unpriced lines, stale rates, overdue tasks, valuations
 * awaiting approval and model drift. Two of those five have no server field
 * behind them yet (rate staleness, model drift), so they can never light up
 * here and are deliberately absent rather than hardcoded to false — see the
 * adoption plan. A dot only ever appears when we can actually count it.
 */
export function tabNeedsAttention(tabKey, project) {
  if (!project) return false;
  if (tabKey === "rates") return Number(project.unpricedCount) > 0;
  if (tabKey === "valuations") return Number(project.valuationsAwaiting) > 0;
  if (tabKey === "pm") return Number(project.overdueTasks) > 0;
  return false;
}
