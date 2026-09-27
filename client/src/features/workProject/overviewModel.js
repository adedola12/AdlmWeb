// The Overview tab's arithmetic, kept out of the markup.
//
// Richard's overview() (work-proj.js:586-681) computes six things before it
// draws anything: the stage rail, the two donuts, the estimated/actual
// comparison, what needs a decision, value by section, and the source log.
// His versions read a fixture; these read a real project.
//
// The money is NOT recomputed here. projectTotals() in features/projects/lib
// is the agreed single source for a project's figures and the Bill screen
// already reads it — a second implementation is how two screens end up
// disagreeing about a contract sum, which is the exact failure docs/
// RICHARD-SEP18.md decision 1 was written about.

import { projectTotals, safeNum } from "../projects/lib/projectTotals.js";
// His fixture calls a line's progress `done`; ours is `percentComplete`, and
// doneOf is the one place that difference lives. Reading `it.done` here meant
// the Complete donut and the value-by-section bars were 0 on every real
// project, because no line has ever had that field.
import { doneOf } from "./billModel.js";

/** His six, in order (work.js:323-330). */
export const STAGES = [
  { id: "takeoff", name: "Takeoff" },
  { id: "priced", name: "Priced" },
  { id: "tendered", name: "Tendered" },
  { id: "locked", name: "Contract locked" },
  { id: "valuing", name: "Valuations" },
  { id: "final", name: "Final account" },
];

/**
 * Where a project sits on the rail.
 *
 * Falls back to Takeoff rather than -1 for an unknown or missing stage: a
 * project whose stage was never set is at the beginning, and a rail with no
 * "now" step reads as broken rather than as new.
 */
export function stageIndex(project) {
  const want = String(project?.stage || "").trim().toLowerCase();
  const i = STAGES.findIndex((s) => s.id === want);
  return i < 0 ? 0 : i;
}

export function nextStage(project) {
  return STAGES[stageIndex(project) + 1] || null;
}

/** Priced vs unpriced bill lines. A line is priced when it has a rate. */
export function pricedSplit(items) {
  const list = Array.isArray(items) ? items : [];
  const priced = list.filter((it) => safeNum(it?.rate) > 0);
  return { priced, unpriced: list.filter((it) => safeNum(it?.rate) <= 0), total: list.length };
}

export function pricedPercent(items) {
  const { priced, total } = pricedSplit(items);
  return total ? Math.round((priced.length / total) * 100) : 0;
}

/**
 * How much of the work is done, weighted by value — his `progress`.
 *
 * Weighted, not counted: fifteen cheap items finished and one expensive one
 * outstanding is not 94% of a contract. Returns 0 before the contract is
 * locked, which is his rule and ours — nothing is "complete" against a
 * contract that does not exist yet.
 */
export function completePercent(project) {
  if (stageIndex(project) < 3) return 0;
  const items = Array.isArray(project?.items) ? project.items : [];
  let value = 0;
  let done = 0;
  for (const it of items) {
    const v = safeNum(it?.qty) * safeNum(it?.rate);
    value += v;
    done += (v * doneOf(it)) / 100;
  }
  return value > 0 ? Math.round((done / value) * 100) : 0;
}

/** Every figure in his breakdown list, from the one module that owns them. */
export function totalsFor(project) {
  return projectTotals({
    items: project?.items,
    provisionalSums: project?.provisionalSums,
    preliminaryPercent: project?.preliminaryPercent ?? project?.prelims,
    contingencyPercent: project?.contingencyPercent ?? project?.contingency,
    taxPercent: project?.taxPercent ?? project?.vat,
    variations: project?.variations,
    // linkedSummaries, NOT linkedProjects. The raw array carries ObjectIds and
    // snapshot money, and routes/projects.js deletes it from every payload, so
    // reading it here made a project with linked services total LESS than the
    // Services tab on the same page said it did.
    linkedSummaries: project?.linkedSummaries,
  });
}

/**
 * Value by section, biggest first — his `secs`.
 *
 * Grouped on the trade/section a line already carries. A line with none is
 * "Uncategorised" rather than dropped, because a section bar that silently
 * omits work makes the page add up to less than the bill.
 */
export function valueBySection(items) {
  const list = Array.isArray(items) ? items : [];
  const byName = new Map();
  for (const it of list) {
    const name = String(it?.category || it?.trade || it?.section || "").trim() || "Uncategorised";
    const row = byName.get(name) || { name, value: 0, done: 0, count: 0 };
    const v = safeNum(it?.qty) * safeNum(it?.rate);
    row.value += v;
    row.done += (v * doneOf(it)) / 100;
    row.count += 1;
    byName.set(name, row);
  }
  const rows = [...byName.values()].sort((a, b) => b.value - a.value);
  const max = rows.length ? rows[0].value : 0;
  return rows.map((r) => ({
    ...r,
    // Percent of the biggest section, for the bar width. Zero when nothing is
    // priced, so unpriced sections draw an empty track rather than a full one.
    valuePercent: max > 0 ? (r.value / max) * 100 : 0,
    donePercent: max > 0 ? (r.done / max) * 100 : 0,
  }));
}

/**
 * "Needs a decision" — his `att`, each entry pointing at the tab that
 * resolves it.
 *
 * Two of his six are absent rather than faked: model drift and rate-library
 * staleness have no server field behind them yet, so they can never be
 * counted here. An entry that cannot appear is better than one that always
 * reads zero.
 */
export function decisions(project) {
  const out = [];
  const { unpriced } = pricedSplit(project?.items);
  if (unpriced.length) {
    out.push({
      tone: "",
      text: `${unpriced.length} item${unpriced.length > 1 ? "s" : ""} still need a rate`,
      tab: "rates",
      action: "Price them",
    });
  }

  const awaiting = (Array.isArray(project?.valuations) ? project.valuations : []).filter(
    (v) => String(v?.status || "").toLowerCase() === "awaiting",
  );
  if (awaiting.length) {
    out.push({
      tone: "",
      text: `Valuation ${awaiting[0].no ?? awaiting[0].number ?? ""}`.trim() + " is awaiting approval",
      tab: "valuations",
      action: "Open",
    });
  }

  const now = Date.parse(project?.today || "") || null;
  const tasks = Array.isArray(project?.pm?.tasks) ? project.pm.tasks : project?.tasks;
  const overdue = (Array.isArray(tasks) ? tasks : []).filter((t) => {
    const end = Date.parse(t?.end || t?.endDate || "");
    if (!Number.isFinite(end) || now == null) return false;
    return end < now && safeNum(t?.percentComplete ?? t?.done) < 100;
  });
  if (overdue.length) {
    out.push({
      tone: "warn",
      text: `${overdue.length} task${overdue.length > 1 ? "s are" : " is"} past its end date`,
      tab: "pm",
      action: "See tasks",
    });
  }

  return out;
}
