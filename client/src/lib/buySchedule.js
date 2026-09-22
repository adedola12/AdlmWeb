// Buy-schedule arithmetic, kept pure so it can be tested without a DOM.
//
// A material's buy-by date is the start of the earliest Program-of-Works task
// linked to its bill line, less the procurement lead time. A line whose bill
// line is in no task has no date at all — it is "not scheduled", never a
// guessed one.

const DAY = 86400000;

export function clampLeadDays(value, fallback = 14) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(120, Math.round(n)));
}

/** Buy-by = need-on-site minus the lead time. No need-by, no buy-by. */
export function buyByDate(needBy, leadDays) {
  if (!(needBy instanceof Date) || Number.isNaN(needBy.getTime())) return null;
  return new Date(needBy.getTime() - clampLeadDays(leadDays) * DAY);
}

/** Midnight today, so "late" means the day has passed, not the hour. */
export function startOfDay(now = new Date()) {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The three groups the KPI row counts, against a real "now":
 *   late        — dated before today and not yet bought
 *   week        — dated from today to seven days out, not yet bought
 *   unscheduled — no date at all (its bill line is in no task)
 * A row already bought is late in nothing.
 */
export function buyScheduleGroups(rows, now = new Date()) {
  const today = startOfDay(now);
  const weekEnd = new Date(today.getTime() + 7 * DAY);
  const late = [];
  const week = [];
  const unscheduled = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.buyBy) {
      unscheduled.push(r);
      continue;
    }
    if (r.done) continue;
    if (r.buyBy < today) late.push(r);
    else if (r.buyBy <= weekEnd) week.push(r);
  }
  const sum = (list) =>
    list.reduce((a, r) => {
      const n = Number(r?.amount);
      return a + (Number.isFinite(n) ? n : 0);
    }, 0);
  return {
    late,
    week,
    unscheduled,
    lateValue: sum(late),
    weekValue: sum(week),
    today,
  };
}
