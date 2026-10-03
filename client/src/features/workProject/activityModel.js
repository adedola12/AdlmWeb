// The labour activity schedule: who is on site, doing what, and when.
//
// WHAT A QS IS ASKING FOR HERE
//
// The Budget answers "what does the labour cost". The programme answers "when
// does the work happen". Neither answers the planning question: on any given
// week, which trades am I paying, for how long, and do two of them collide.
// That is the activity schedule — one row per labour line, carrying the work it
// belongs to, the dates it inherits from the programme, and its cost.
//
// WHAT IS REAL AND WHAT IS NOT
//
// Every figure here is measured or scheduled. There is deliberately NO man-day,
// no gang size and no output rate, because nothing in a project holds them —
// a labour budget row carries the WORK quantity (235 SQ M of wall), not the
// hours to do it. The programme page estimates gang outputs with a model and
// says so; inventing them again here, silently, beside real money, is how a
// planner comes to trust a number nobody measured. Duration comes from the
// linked task's own dates, which are real.
//
// THE JOIN
//
// A labour budget row carries `billIdentity` — the code of the bill line it was
// priced against. A programme task carries the identities of the lines it
// builds. So labour row -> bill line -> task -> dates. A row whose line no task
// covers is still listed, marked unscheduled: it is work that has to happen and
// nobody has planned it, which is the most useful thing this screen can say.

import { amountOf, identityCode } from "./billModel.js";
import { budgetColumns } from "./budgetModel.js";
import { safeNum } from "../projects/lib/projectTotals.js";

const ms = (d) => {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};
const day = 86400000;

const tasksOf = (project) => {
  const pm = project?.pm || project?.projectManagement || {};
  return Array.isArray(pm.tasks) ? pm.tasks : [];
};

/**
 * Bill-line code -> the task that builds it.
 *
 * The earliest-starting task wins when two cover the same line, which matches
 * the buy schedule's rule: the date that matters is the first time the work is
 * needed.
 */
export function taskByLineCode(tasks) {
  const map = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const start = ms(t?.startDate);
    for (const ident of t?.linkedBoqIdentities || []) {
      const code = identityCode(ident);
      if (!code) continue;
      const cur = map.get(code);
      if (!cur || (start != null && (ms(cur.startDate) == null || start < ms(cur.startDate)))) {
        map.set(code, t);
      }
    }
  }
  return map;
}

/** Whole days a task runs for, at least one. */
export function taskSpanDays(task) {
  const s = ms(task?.startDate);
  const e = ms(task?.endDate);
  if (s == null || e == null) return 0;
  return Math.max(1, Math.round((e - s) / day));
}

/**
 * One row per labour item: the activity, its trade, its money and its dates.
 *
 * Sorted by start date so the schedule reads as a programme rather than as a
 * cost list — an unscheduled row sorts last, because it is the exception a
 * planner should be looking at, not the thing they scan past.
 */
export function labourActivities(project) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const byCode = taskByLineCode(tasksOf(project));
  const lineByCode = new Map();
  items.forEach((it, index) => {
    const code = String(it?.code || "").trim().toLowerCase();
    if (code && !lineByCode.has(code)) lineByCode.set(code, { index, item: it });
  });

  const rows = budgetColumns(project).labour.map((r) => {
    const hit = r.billIdentity ? lineByCode.get(r.billIdentity) : null;
    const task = r.billIdentity ? byCode.get(r.billIdentity) || null : null;
    const start = task?.startDate || null;
    const finish = task?.endDate || null;
    return {
      index: r.index,
      trade: r.name,
      unit: r.unit,
      qty: r.qty,
      amount: r.amount,
      // What the labour is actually doing, from the bill line it was priced
      // against — "Labour" on its own tells a planner nothing.
      activity: String(hit?.item?.description || r.forLine || "").trim(),
      section: String(hit?.item?.category || "").trim(),
      lineIndex: hit?.index ?? null,
      lineValue: hit ? amountOf(hit.item) : 0,
      taskName: String(task?.name || "").trim(),
      start,
      finish,
      days: taskSpanDays(task),
      scheduled: Boolean(start && finish),
      percentComplete: Math.max(0, Math.min(100, safeNum(hit?.item?.percentComplete))),
    };
  });

  rows.sort((a, b) => {
    if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
    const as = ms(a.start);
    const bs = ms(b.start);
    if (as != null && bs != null && as !== bs) return as - bs;
    return b.amount - a.amount;
  });
  return rows;
}

/** The figures above the schedule. */
export function activityTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const scheduled = list.filter((r) => r.scheduled);
  const cost = list.reduce((a, r) => a + r.amount, 0);
  const unscheduledCost = list.filter((r) => !r.scheduled).reduce((a, r) => a + r.amount, 0);
  const starts = scheduled.map((r) => ms(r.start)).filter((n) => n != null);
  const ends = scheduled.map((r) => ms(r.finish)).filter((n) => n != null);
  return {
    count: list.length,
    scheduled: scheduled.length,
    unscheduled: list.length - scheduled.length,
    cost,
    unscheduledCost,
    from: starts.length ? Math.min(...starts) : null,
    to: ends.length ? Math.max(...ends) : null,
    // Distinct trades, because "nine activities" and "three trades" are
    // different planning facts.
    trades: new Set(list.map((r) => r.trade.toLowerCase()).filter(Boolean)).size,
  };
}

/**
 * How many activities run at once, week by week.
 *
 * The collision a planner is looking for: two trades on the same face in the
 * same week. Weeks rather than days, because a labour plan is read in weeks and
 * a two-year job is 730 columns of nothing.
 */
export function weeklyLoad(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r.scheduled);
  if (!list.length) return [];
  const starts = list.map((r) => ms(r.start));
  const ends = list.map((r) => ms(r.finish));
  const from = Math.min(...starts);
  const to = Math.max(...ends);
  const week = day * 7;
  const weeks = Math.max(1, Math.ceil((to - from) / week));
  const out = [];
  for (let i = 0; i < weeks; i += 1) {
    const a = from + i * week;
    const b = a + week;
    const live = list.filter((r) => {
      const s = ms(r.start);
      const e = ms(r.finish);
      return s < b && e >= a;
    });
    out.push({
      at: a,
      count: live.length,
      cost: live.reduce((x, r) => x + (r.days ? (r.amount / r.days) * 7 : 0), 0),
      trades: [...new Set(live.map((r) => r.trade))],
    });
  }
  return out;
}

/** The busiest week, for the KPI that says where the crunch is. */
export function peakWeek(load) {
  const list = Array.isArray(load) ? load : [];
  if (!list.length) return null;
  return list.reduce((best, w) => (w.count > best.count ? w : best), list[0]);
}
