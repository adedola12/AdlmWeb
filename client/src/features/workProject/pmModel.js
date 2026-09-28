// The PM dashboard's arithmetic — his pm() (work-proj.js:1263-1360).
//
// WORK.md §13 is emphatic about what this is: "PM dashboard is not Time Pro.
// Tasks (created from bill sections, not one per line), risks, issues, a
// timeline with today's line, and plain-language schedule figures."
//
// HIS FIXTURE AND OUR DATA
//
// His task links to bill lines by INDEX (t.lines = [0, 3, 7]). Ours links by
// bill identity and carries a WEIGHT per link (linkedBoqIdentities +
// linkedBoqWeights), so one bill line can be split across several tasks — a
// windows line at 70% to "First fix" and 30% to "Final fix". That is more than
// his fixture could express, and the weighting is honoured here rather than
// flattened: flattening it would double-count the line in every earned-value
// figure on this page.
//
// His `today` is the string '2026-09-17', which is a fixture. Ours is the real
// one, passed in so the figures are testable.

import { safeNum } from "../projects/lib/projectTotals.js";
import { amountOf, doneOf } from "./billModel.js";

/** His three views (work-proj.js:1342). */
export const PM_VIEWS = Object.freeze([
  { key: "timeline", label: "Timeline" },
  { key: "risks", label: "Risks" },
  { key: "issues", label: "Issues" },
]);

export function resolvePmView(requested) {
  const want = String(requested || "").trim().toLowerCase();
  return PM_VIEWS.some((v) => v.key === want) ? want : "timeline";
}

const day = 86400000;

/**
 * A date as a timestamp, or null when there is not one.
 *
 * The explicit null/undefined/"" check is not belt and braces: `new Date(null)`
 * is the EPOCH, not an invalid date, so a bare Number.isFinite test reads a
 * missing projectStart as 1 January 1970 and draws a timeline fifty-six years
 * wide. Our schema defaults projectStart and projectFinish to null, so that is
 * the ordinary case, not an edge one.
 */
const at = (d) => {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};

/** His dur(): a task is at least one day long, so it can never divide by zero. */
export function taskDays(task) {
  const s = at(task?.startDate);
  const e = at(task?.endDate);
  if (s == null || e == null) return 1;
  return Math.max(1, (e - s) / day);
}

/**
 * The bill lines a task covers, with the share of each it owns.
 *
 * Ours are identities, not indexes, and a missing weight means the whole line —
 * which is what every task written before weighting shipped means by silence.
 */
export function taskLines(task, items) {
  const ids = Array.isArray(task?.linkedBoqIdentities) ? task.linkedBoqIdentities : [];
  const weights = Array.isArray(task?.linkedBoqWeights) ? task.linkedBoqWeights : [];
  const list = Array.isArray(items) ? items : [];
  const out = [];
  ids.forEach((id, n) => {
    const want = String(id || "").trim().toLowerCase();
    if (!want) return;
    const index = list.findIndex((it) => String(it?.code || "").trim().toLowerCase() === want);
    if (index < 0) return;
    const w = weights[n] == null ? 100 : safeNum(weights[n]);
    out.push({ index, weight: w, item: list[index] });
  });
  return out;
}

/**
 * How far along a task is — his taskPct (work.js:814).
 *
 * Value-weighted across the bill lines it covers, so a task is not "half done"
 * because half its lines are ticked when those lines are the cheap ones. A task
 * linked to nothing falls back to its own percentComplete, which is what a
 * manually planned or imported task has.
 */
export function taskProgress(task, items) {
  const lines = taskLines(task, items);
  if (!lines.length) return Math.max(0, Math.min(100, safeNum(task?.percentComplete)));
  let total = 0;
  let done = 0;
  for (const { item, weight } of lines) {
    // `|| 1` is his: an unpriced line still counts as work, or a task made
    // entirely of unpriced lines would read 0% for ever.
    const value = (amountOf(item) || 1) * (weight / 100);
    total += value;
    done += (value * doneOf(item)) / 100;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

/** His planned-by-today fraction for one task: 0 before it starts, 1 after it ends. */
function plannedFraction(task, nowMs) {
  const s = at(task?.startDate);
  const e = at(task?.endDate);
  if (s == null || e == null || e <= s) return nowMs >= (e ?? s ?? nowMs) ? 1 : 0;
  if (nowMs <= s) return 0;
  if (nowMs >= e) return 1;
  return (nowMs - s) / (e - s);
}

/** Past its end date and not finished. His overdue() (work-proj.js:78). */
export function overdueTasks(tasks, items, now = new Date()) {
  const nowMs = now.getTime();
  return (Array.isArray(tasks) ? tasks : []).filter((t) => {
    const e = at(t?.endDate);
    return e != null && e < nowMs && taskProgress(t, items) < 100;
  });
}

const openish = (status, closed) => !closed.includes(String(status || "").toLowerCase());

/** His openRisks() (:82) — anything not closed off. */
export const openRisks = (risks) =>
  (Array.isArray(risks) ? risks : []).filter((r) => openish(r?.status, ["closed", "accepted"]));

/** His openIssues() (:83). */
export const openIssues = (issues) =>
  (Array.isArray(issues) ? issues : []).filter((i) => openish(i?.status, ["resolved", "closed"]));

/** Risks that are both likely and costly — his "N likely and costly". */
export const likelyAndCostly = (risks) =>
  openRisks(risks).filter(
    (r) =>
      String(r?.probability || "").toLowerCase() === "high" &&
      String(r?.impact || "").toLowerCase() !== "low",
  );

/** His severity dot: hi / md / lo. */
export function riskSeverity(risk) {
  const p = String(risk?.probability || "").toLowerCase();
  const i = String(risk?.impact || "").toLowerCase();
  if (p === "high" && i === "high") return "hi";
  if (p === "high" || i === "high") return "md";
  return "lo";
}

export function issueSeverity(issue) {
  const s = String(issue?.severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "hi";
  if (s === "medium") return "md";
  return "lo";
}

/**
 * The five figures across the top of his dashboard.
 *
 * `spi` is work done ÷ work planned — his own plain-language gloss, and the
 * reason the tile says "12% behind" rather than "SPI 0.88".
 */
export function pmKpis({ tasks, items, risks, issues, now = new Date() }) {
  const list = Array.isArray(tasks) ? tasks : [];
  const nowMs = now.getTime();

  const totalDays = list.reduce((a, t) => a + taskDays(t), 0);
  const complete = totalDays
    ? list.reduce((a, t) => a + (taskDays(t) * taskProgress(t, items)) / 100, 0) / totalDays * 100
    : 0;
  const planned = totalDays
    ? list.reduce((a, t) => a + taskDays(t) * plannedFraction(t, nowMs), 0) / totalDays * 100
    : 0;
  const spi = planned ? complete / planned : 1;

  // Bill lines no task covers, and what they are worth. His `unl` / `unlV`.
  const covered = new Set();
  list.forEach((t) => taskLines(t, items).forEach((l) => covered.add(l.index)));
  const rows = Array.isArray(items) ? items : [];
  const uncoveredIndexes = rows.map((_, i) => i).filter((i) => !covered.has(i));
  const uncoveredValue = uncoveredIndexes.reduce((a, i) => a + amountOf(rows[i]), 0);

  return {
    complete,
    planned,
    spi,
    behindPercent: Math.round((1 - spi) * 100),
    onTime: spi >= 0.98,
    scheduleWarn: spi < 0.95,
    uncoveredIndexes,
    uncoveredValue,
    overdue: overdueTasks(list, items, now),
    openRisks: openRisks(risks),
    openIssues: openIssues(issues),
    likelyAndCostly: likelyAndCostly(risks),
  };
}

/**
 * The timeline's geometry: where the bars and the month ticks sit, 0-100.
 *
 * Returns null when there is nothing to draw — no tasks, or no dates on them —
 * so the caller shows the empty state rather than a bar chart of one pixel.
 */
export function timelineScale(tasks, { start, finish, now = new Date() } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const starts = list.map((t) => at(t?.startDate)).filter((n) => n != null);
  const ends = list.map((t) => at(t?.endDate)).filter((n) => n != null);
  const from = at(start) ?? (starts.length ? Math.min(...starts) : null);
  const to = at(finish) ?? (ends.length ? Math.max(...ends) : null);
  if (from == null || to == null) return null;

  const span = Math.max(1, (to - from) / day);
  const pos = (d) => {
    const t = at(d);
    if (t == null) return 0;
    return Math.max(0, Math.min(100, ((t - from) / day / span) * 100));
  };

  // One tick per month that falls inside the span.
  const months = [];
  const cursor = new Date(from);
  cursor.setDate(1);
  // Never run away on a nonsense span.
  for (let guard = 0; guard < 600; guard += 1) {
    const ms = cursor.getTime();
    if (ms > to) break;
    if (ms >= from) {
      months.push({
        label: cursor.toLocaleDateString("en-GB", { month: "short" }),
        left: pos(cursor),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { from, to, span, pos, months, today: pos(now) };
}

/** Late on the timeline: past its end and not finished. */
export function taskIsLate(task, items, now = new Date()) {
  const e = at(task?.endDate);
  return e != null && e < now.getTime() && taskProgress(task, items) < 100;
}

/** The sections a "create tasks from the bill" would make — his [data-gen]. */
export function sectionsForTasks(items, sectionOf) {
  const seen = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    const s = sectionOf(it);
    if (s && !seen.includes(s)) seen.push(s);
  });
  return seen;
}
