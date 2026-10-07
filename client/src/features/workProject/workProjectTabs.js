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
  // The labour side of the plan: which trade is on site, doing what, when, and
  // how many of them at once. The PM dashboard is about tasks and money; this
  // is about people, which is the question a planner opens a programme with.
  { key: "activity", label: "Activity schedule" },
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
  // The bill lines themselves first, and the summary's itemCount only as a
  // fallback. They are not the same number: the rollup's count folds a
  // project's material & labour schedule in with its bill, so a 65-line bill
  // was printing 110 on the tab while the workspace beside it said 65.
  const n = project?.items?.length ?? project?.itemCount;
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

/**
 * What each tab is waiting for, in words, for the loading state.
 *
 * Here rather than passed in per tab so that a tab added to tabsFor() above has
 * exactly one place to name itself — and the test beside this file fails if it
 * does not, which is the only reason this cannot silently rot.
 */
const LOADING_NOUN = Object.freeze({
  overview: "figures",
  bill: "bill",
  rates: "rates and budget",
  pm: "programme",
  activity: "labour schedule",
  valuations: "valuations",
  model: "model",
  drawings: "drawings",
  services: "services",
});

/** The noun for a tab, falling back to something true rather than blank. */
export const loadingNoun = (tabKey) => LOADING_NOUN[String(tabKey || "")] || "details";

/** Exported for the test that pins every tab to a noun. */
export { LOADING_NOUN };

/**
 * What to store as "where this reader last was", for the Work home's first
 * three rows (lib/lastPlace.js).
 *
 * Out here rather than inline in the shell for one reason: this was DEAD. Only
 * the classic workspace ever wrote a place (ProjectOpenView.jsx), and since the
 * 5 Oct flip a customer never opens the classic workspace — so the Work home's
 * "Pick up where you left off" froze on whatever that build last recorded, and
 * for anybody who has only ever used this one it was never populated at all. The
 * section fell back to "Recently updated" for everybody and looked perfectly
 * fine doing it. A feature that dies silently should not be able to die again
 * without a test noticing.
 *
 * The tab is stored under THIS build's name for it; placeHref translates in the
 * reading direction and passes both builds' names through unchanged, so a place
 * written here and one written there are read the same way.
 *
 * @returns {null} when there is nothing worth storing yet.
 */
export function placeToRemember({ productKey, id, name = "", tab = "" } = {}) {
  if (!id || !productKey) return null;
  const key = String(productKey).trim().toLowerCase();
  return {
    productKey: key,
    key: String(id),
    name: name || "",
    tab,
    tabLabel: tabsFor(key).find((t) => t.key === tab)?.label || "",
  };
}
