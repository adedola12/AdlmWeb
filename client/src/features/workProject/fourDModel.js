// The full workspace: what a project looks like ON A GIVEN DATE.
//
// WHY THIS IS A DATE AND NOT A VIEW
//
// Every tab on the project page answers "what is true now". The full workspace
// answers "what is true on the 14th of March" — which line is being built, what
// has to have been bought by then, what it should have cost by then, and what
// it actually has. One date drives the model highlight, the bar chart, the
// procurement panel and the cost curve together, so they cannot disagree.
//
// WHERE THE DATES COME FROM, AND WHY THE PROGRAMME IS THE SPINE
//
// A bill line has no date. Nothing on `items[]` says when a line is built. The
// only dated thing in a project is a programme task (PmTaskSchema startDate /
// endDate), which links back to bill lines through `linkedBoqIdentities`. So
// the whole screen is empty until a programme exists — and it says so, rather
// than inventing dates from "today plus three days a line", which is what makes
// a plan look real when it is not.
//
// THE ARITHMETIC IS THE SERVER'S
//
// Planned value spreads a task's linked bill value evenly across its own span,
// which is exactly what the server's burndown does (services/pmCompute.js,
// buildBurndown). Deliberately the same rule rather than a second one: a
// forecast on this screen that disagreed with the PM report would be worse than
// no forecast.

import { safeNum } from "../projects/lib/projectTotals.js";
import { amountOf, doneOf } from "./billModel.js";
import { taskLines, taskProgress } from "./pmModel.js";

const day = 86400000;

/** ms for anything date-ish, or null. `new Date(null)` is the epoch, not NaN. */
export const ms = (d) => {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};

const tasksOf = (project) => {
  const pm = project?.pm || project?.projectManagement || {};
  return Array.isArray(pm.tasks) ? pm.tasks : [];
};

/**
 * The span the scrubber runs over: first task start to last task finish.
 *
 * Returns null when nothing is dated, which is the signal to show the empty
 * state instead of a slider over one millisecond.
 */
export function scrubRange(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const starts = list.map((t) => ms(t?.startDate)).filter((n) => n != null);
  const ends = list.map((t) => ms(t?.endDate)).filter((n) => n != null);
  if (!starts.length || !ends.length) return null;
  const from = Math.min(...starts);
  const to = Math.max(...ends);
  if (to <= from) return { from, to: from + day, days: 1 };
  return { from, to, days: Math.max(1, Math.round((to - from) / day)) };
}

/** A fraction of the span (0-1) as a date. The scrubber's position -> a date. */
export function dateAt(range, fraction) {
  if (!range) return null;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return new Date(range.from + (range.to - range.from) * f);
}

/** A date as a fraction of the span, for putting today's marker on the bar. */
export function fractionOf(range, date) {
  const t = ms(date);
  if (!range || t == null || range.to === range.from) return 0;
  return Math.max(0, Math.min(1, (t - range.from) / (range.to - range.from)));
}

/** Tasks running on that date — started, not yet finished. */
export function tasksAt(tasks, date) {
  const t = ms(date);
  if (t == null) return [];
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    const s = ms(task?.startDate);
    const e = ms(task?.endDate);
    if (s == null || e == null) return false;
    return s <= t && t <= e;
  });
}

/** Tasks finished on or before that date. */
export function tasksDoneBy(tasks, date) {
  const t = ms(date);
  if (t == null) return [];
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    const e = ms(task?.endDate);
    return e != null && e <= t;
  });
}

/** The bill lines the tasks running on that date are building. */
export function linesAt(tasks, items, date) {
  const seen = new Set();
  for (const task of tasksAt(tasks, date)) {
    for (const { index } of taskLines(task, items)) seen.add(index);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The model elements to light up for that date.
 *
 * QUIV writes the Revit element IDs behind each line; HERON does not, so this
 * is empty on a PlanSwift project and the viewport simply does not highlight.
 * That is the honest outcome — a HERON job has no geometry to point at.
 */
export function elementIdsAt(tasks, items, date) {
  const list = Array.isArray(items) ? items : [];
  const out = new Set();
  for (const index of linesAt(tasks, items, date)) {
    for (const id of list[index]?.elementIds || []) {
      const n = Number(id);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out];
}

/** What one task is worth: its share of every bill line it covers. */
export function taskValue(task, items) {
  return taskLines(task, items).reduce(
    (a, { item, weight }) => a + amountOf(item) * (safeNum(weight) / 100 || 1),
    0,
  );
}

/**
 * Planned value at a date — the S-curve's planned line.
 *
 * A task earns its value evenly across its own span, so on a date halfway
 * through it, half of it counts. Same rule as the server's burndown.
 */
export function plannedValueAt(tasks, items, date) {
  const t = ms(date);
  if (t == null) return 0;
  return (Array.isArray(tasks) ? tasks : []).reduce((a, task) => {
    const s = ms(task?.startDate);
    const e = ms(task?.endDate);
    const value = taskValue(task, items);
    if (!value) return a;
    if (s == null || e == null) return a;
    if (t <= s) return a;
    if (t >= e) return a + value;
    return a + (value * (t - s)) / (e - s);
  }, 0);
}

/**
 * Earned value — what has actually been built, from line progress.
 *
 * Not date-dependent: progress is recorded against a line, not against a day,
 * so this is one number for the project as it stands. It is drawn as a flat
 * reference against the planned curve, which is what makes a slip visible.
 */
export function earnedValue(tasks, items) {
  return (Array.isArray(tasks) ? tasks : []).reduce(
    (a, task) => a + (taskValue(task, items) * taskProgress(task, items)) / 100,
    0,
  );
}

/**
 * The procurement picture on a date, from the buy schedule's own rows.
 *
 *   bought    — marked procured, whenever it was
 *   dueBy     — should have been bought by then
 *   overdue   — due by then and not bought
 *   toBuy     — not bought, whatever its date
 *   next      — the soonest unbought row after that date, which is the answer
 *               to "what is the next thing I have to pay for"
 */
export function procurementAt(rows, date) {
  const t = ms(date);
  const list = Array.isArray(rows) ? rows : [];
  let bought = 0;
  let dueBy = 0;
  let overdue = 0;
  let toBuy = 0;
  let next = null;
  for (const r of list) {
    const amount = safeNum(r?.amount);
    const by = ms(r?.buyBy);
    if (r?.done) {
      bought += amount;
      continue;
    }
    toBuy += amount;
    if (by != null && t != null && by <= t) {
      dueBy += amount;
      overdue += amount;
    } else if (by != null && t != null && by > t) {
      if (!next || by < ms(next.buyBy)) next = r;
    } else if (by == null && !next) {
      // Undated rows are not "next" while anything dated is, but a project with
      // no programme has only undated rows and still deserves an answer.
      next = next || null;
    }
  }
  return { bought, dueBy, overdue, toBuy, next };
}

/**
 * The cost curve: planned value and committed spend across the whole span.
 *
 * `steps` points, not one per day — a two-year programme is 730 days and the
 * chart is 300px wide, so a point per pixel is wasted arithmetic.
 */
export function costSeries(tasks, items, rows, { steps = 48 } = {}) {
  const range = scrubRange(tasks);
  if (!range) return [];
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const at = range.from + ((range.to - range.from) * i) / steps;
    const planned = plannedValueAt(tasks, items, at);
    // Committed spend: everything that had to be bought by then.
    const spend = list.reduce((a, r) => {
      const by = ms(r?.buyBy);
      return by != null && by <= at ? a + safeNum(r?.amount) : a;
    }, 0);
    out.push({ at, planned, spend });
  }
  return out;
}

/**
 * Everything the panels need for one date, in one pass.
 *
 * The components take this rather than each reaching into the project, so a
 * figure cannot be computed two ways on one screen.
 */
export function snapshotAt(project, date, { rows = [] } = {}) {
  const tasks = tasksOf(project);
  const items = Array.isArray(project?.items) ? project.items : [];
  const running = tasksAt(tasks, date);
  const lines = linesAt(tasks, items, date);
  const planned = plannedValueAt(tasks, items, date);
  const earned = earnedValue(tasks, items);
  return {
    date,
    tasks: running,
    lineIndexes: lines,
    elementIds: elementIdsAt(tasks, items, date),
    linesValue: lines.reduce((a, i) => a + amountOf(items[i]), 0),
    planned,
    earned,
    // Positive = ahead of the plan in value terms, negative = behind.
    variance: earned - planned,
    done: tasksDoneBy(tasks, date).length,
    total: tasks.length,
    procurement: procurementAt(rows, date),
    progressOfLines: lines.length
      ? Math.round(lines.reduce((a, i) => a + doneOf(items[i]), 0) / lines.length)
      : 0,
  };
}
