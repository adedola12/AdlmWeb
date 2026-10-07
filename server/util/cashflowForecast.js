// The cashflow forecast: money in, money out, month by month.
//
// WHAT A QS IS ASKING
//
// Not "what does the job cost" — the budget answers that. The question here is
// "when do I run out of money", and it has three parts a QS cannot get from any
// other screen:
//
//   * money IN is not what you certify, it is what you are PAID. A valuation
//     certified at the end of March, less retention, arrives in April. The lag
//     is the whole point: a job can be profitable and still fail in month four.
//   * money OUT is not spread evenly. A material is paid for when it is bought,
//     which is before the work it belongs to (the lead time), while labour is
//     paid across the work itself.
//   * the answer is the CUMULATIVE line, not the monthly one. A single bad
//     month is survivable; the low point of the running balance is the
//     overdraft the contractor actually has to arrange.
//
// WHERE EACH FIGURE COMES FROM
//
//   income     the programme. A task earns its linked bill value evenly across
//              its own span — the same rule as pmCompute's burndown and the
//              full workspace, deliberately, so three screens cannot disagree.
//   materials  the buy schedule. A material row falls in the month it has to be
//              BOUGHT (its task's start less the lead days), not the month it is
//              built into.
//   labour     the programme, spread across the task like the income.
//   prelims    spread evenly across the whole job, which is what a preliminaries
//              pool is.
//
// WHAT IT IS NOT
//
// It is a forecast, not a ledger. It does not know what has actually been paid;
// it knows what the programme and the bill say should happen. Where a project
// has real certificates issued, those replace the forecast income for the months
// they fall in, so the early months are fact and the later ones are forecast —
// and the sheet says which is which.

const DAY = 86400000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asDate = (d) => {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d);
  return Number.isFinite(t.getTime()) ? t : null;
};

/** The first day of the month a date falls in, in UTC. */
export const monthStart = (d) => {
  const t = asDate(d);
  if (!t) return null;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
};

/** "Mar 2026" — the column heading a QS expects. */
export const monthLabel = (d) => {
  const t = asDate(d);
  if (!t) return "";
  return t.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

const addMonths = (d, n) => {
  const t = new Date(d);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1));
};

/** Carry the table on past the programme, so the last payment has a column. */
function extendMonths(months, extra) {
  if (!months.length || extra <= 0) return months;
  const out = [...months];
  for (let i = 0; i < extra; i += 1) out.push(addMonths(out[out.length - 1], 1));
  return out;
}

const tasksOf = (project) => {
  const pm = project?.pm || project?.projectManagement || {};
  return Array.isArray(pm.tasks) ? pm.tasks : [];
};

/** The bill identity's code — a task links by whole identity, not bare code. */
export const identityCode = (identity) => {
  const raw = String(identity || "").trim();
  if (!raw) return "";
  const parts = raw.split("::");
  return (parts.length > 1 ? parts[1] : parts[0]).trim().toLowerCase();
};

/**
 * Every month the job touches, first to last.
 *
 * Returns [] when the programme has no dates — there is no cashflow without a
 * time axis, and saying so beats drawing twelve empty columns.
 */
export function monthsOf(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const starts = list.map((t) => asDate(t?.startDate)).filter(Boolean);
  const ends = list.map((t) => asDate(t?.endDate)).filter(Boolean);
  if (!starts.length || !ends.length) return [];
  let cursor = monthStart(new Date(Math.min(...starts.map((d) => d.getTime()))));
  const last = monthStart(new Date(Math.max(...ends.map((d) => d.getTime()))));
  const out = [];
  // 120 months is ten years; a programme longer than that is a data fault, not
  // a forecast, and must not spin here.
  for (let guard = 0; guard < 120 && cursor <= last; guard += 1) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/**
 * How much of a span falls inside a month, as a share of the whole span.
 *
 * This is what spreads a task's value across the months it runs through, rather
 * than dropping the lot in the month it starts.
 */
export function shareInMonth(start, end, month) {
  const s = asDate(start);
  const e = asDate(end);
  const m = asDate(month);
  if (!s || !e || !m) return 0;
  const mEnd = addMonths(m, 1);
  const from = Math.max(s.getTime(), m.getTime());
  const to = Math.min(e.getTime(), mEnd.getTime());
  if (to <= from) return 0;
  const span = e.getTime() - s.getTime();
  // A same-day task belongs wholly to its own month.
  if (span <= 0) return s >= m && s < mEnd ? 1 : 0;
  return (to - from) / span;
}

/** What one task is worth, from the bill lines it builds. */
export function taskValue(task, itemsByCode) {
  const ids = Array.isArray(task?.linkedBoqIdentities) ? task.linkedBoqIdentities : [];
  const weights = Array.isArray(task?.linkedBoqWeights) ? task.linkedBoqWeights : [];
  let total = 0;
  ids.forEach((id, i) => {
    const item = itemsByCode.get(identityCode(id));
    if (!item) return;
    const w = weights[i] == null ? 100 : num(weights[i]);
    total += num(item.qty) * num(item.rate) * (w / 100);
  });
  return total;
}

/**
 * The forecast.
 *
 * @param {object} project
 * @param {object} [opts]
 * @param {number} [opts.retentionPercent]  withheld from each certificate
 * @param {number} [opts.paymentLagDays]    certified to paid
 * @param {number} [opts.leadDays]          order to delivery, for materials
 * @param {number} [opts.prelimPercent]     preliminaries as % of measured work
 * @returns {{months, rows, assumptions, lowPoint, hasProgramme}}
 */
export function buildCashflowForecast(project, opts = {}) {
  const retentionPercent = num(opts.retentionPercent ?? project?.contract?.retentionPercent ?? 5);
  const paymentLagDays = num(opts.paymentLagDays ?? 30);
  const leadDays = num(opts.leadDays ?? 14);
  const items = Array.isArray(project?.items) ? project.items : [];
  const budget = Array.isArray(project?.budgetItems) ? project.budgetItems : [];
  const tasks = tasksOf(project);
  // The table runs to FINAL PAYMENT, not to practical completion. The last
  // month's work is certified at the end of it and paid a lag later, so a table
  // that stopped at the programme's end would show the job finishing with money
  // still in the air — which is the opposite of what a cashflow is read for.
  const lagMonths = Math.max(0, Math.round(num(opts.paymentLagDays ?? 30) / 30));
  const months = extendMonths(monthsOf(tasks), lagMonths);

  const itemsByCode = new Map();
  for (const it of items) {
    const c = String(it?.code || "").trim().toLowerCase();
    if (c && !itemsByCode.has(c)) itemsByCode.set(c, it);
  }

  const zero = () => months.map(() => 0);
  const certified = zero();
  const materials = zero();
  const labour = zero();
  const plant = zero();

  // ── Income: each task earns its value across its own span ──
  for (const t of tasks) {
    const value = taskValue(t, itemsByCode);
    if (!value) continue;
    months.forEach((m, i) => {
      certified[i] += value * shareInMonth(t.startDate, t.endDate, m);
    });
  }

  // ── Outgoings ──
  // A material is paid for when it is BOUGHT: the start of the earliest task
  // that needs it, less the lead time. Labour and plant are spread across the
  // task, because that is when the gang is on site.
  const startByCode = new Map();
  for (const t of tasks) {
    const s = asDate(t?.startDate);
    if (!s) continue;
    for (const ident of t?.linkedBoqIdentities || []) {
      const c = identityCode(ident);
      if (!c) continue;
      const cur = startByCode.get(c);
      if (!cur || s < cur.start) startByCode.set(c, { start: s, end: asDate(t?.endDate) || s });
    }
  }

  for (const row of budget) {
    const amount = num(row?.qty) * (num(row?.budgetRate) || num(row?.rate));
    if (!amount) continue;
    const kind = String(row?.componentKind || "").trim().toLowerCase();
    const link = startByCode.get(String(row?.billIdentity || "").trim().toLowerCase());
    if (kind === "labour" || kind === "labor") {
      if (!link) continue;
      months.forEach((m, i) => {
        labour[i] += amount * shareInMonth(link.start, link.end, m);
      });
    } else if (kind === "plant") {
      if (!link) continue;
      months.forEach((m, i) => {
        plant[i] += amount * shareInMonth(link.start, link.end, m);
      });
    } else {
      // Bought, in one go, ahead of the work.
      if (!link) continue;
      const buyBy = new Date(link.start.getTime() - leadDays * DAY);
      const bm = monthStart(buyBy);
      const idx = months.findIndex((m) => m.getTime() === bm?.getTime());
      // A buy that falls before the programme starts is pulled into month one:
      // it still has to be paid for, and hiding it understates the worst month.
      materials[idx >= 0 ? idx : 0] += amount;
    }
  }

  // ── Preliminaries: a pool spread evenly across the job ──
  const measured = items.reduce((a, it) => a + num(it.qty) * num(it.rate), 0);
  const prelimPercent = num(
    opts.prelimPercent ?? project?.preliminaryPercent ?? project?.prelims ?? 0,
  );
  const prelimPool = (measured * prelimPercent) / 100;
  const prelims = months.map(() => (months.length ? prelimPool / months.length : 0));

  // ── Certificates already issued replace the forecast for their month ──
  const issued = Array.isArray(project?.certificates) ? project.certificates : [];
  const actualByMonth = new Map();
  for (const c of issued) {
    const m = monthStart(c?.issuedAt || c?.date || c?.createdAt);
    if (!m) continue;
    const k = m.getTime();
    actualByMonth.set(k, (actualByMonth.get(k) || 0) + num(c?.thisCertificate ?? c?.amount));
  }
  const isActual = months.map((m) => actualByMonth.has(m.getTime()));
  const valueCertified = months.map((m, i) =>
    actualByMonth.has(m.getTime()) ? actualByMonth.get(m.getTime()) : certified[i],
  );

  const retention = valueCertified.map((v) => (v * retentionPercent) / 100);
  const netCertified = valueCertified.map((v, i) => v - retention[i]);

  // ── Paid: the lag, in whole months ──
  const received = zero();
  netCertified.forEach((v, i) => {
    const at = i + lagMonths;
    if (at < received.length) received[at] += v;
    // Money certified in the last months arrives after the programme ends. It
    // is not dropped — the tail row says what is still owed at completion.
  });
  const afterCompletion = netCertified.reduce(
    (a, v, i) => (i + lagMonths >= received.length ? a + v : a),
    0,
  );

  const outgoings = months.map((_, i) => materials[i] + labour[i] + plant[i] + prelims[i]);
  const net = months.map((_, i) => received[i] - outgoings[i]);
  let running = 0;
  const cumulative = net.map((v) => (running += v));
  let runIn = 0;
  const cumIn = received.map((v) => (runIn += v));
  let runOut = 0;
  const cumOut = outgoings.map((v) => (runOut += v));

  const lowIdx = cumulative.reduce((best, v, i) => (v < cumulative[best] ? i : best), 0);

  // ── The cash Gantt: one row per activity, its cost across the months ──
  //
  // This is the shape the practice's own forecasts use ("Project Cash Gantt
  // Chart"): the activity down the left with its total in brackets, the months
  // across, and the cost spread into the months it runs through. It answers the
  // question a category table cannot — WHICH activity drives a bad month.
  const activities = tasks
    .map((t) => {
      const cost = taskValue(t, itemsByCode);
      const spread = months.map((m) => cost * shareInMonth(t.startDate, t.endDate, m));
      return {
        name: String(t?.name || "Untitled activity"),
        wbs: String(t?.wbs || ""),
        start: asDate(t?.startDate),
        finish: asDate(t?.endDate),
        durationDays: num(t?.durationDays),
        cost,
        spread,
      };
    })
    .filter((a) => a.start && a.finish)
    .sort((a, b) => a.start - b.start);

  return {
    activities,
    hasProgramme: months.length > 0,
    months: months.map((m) => ({ at: m, label: monthLabel(m), actual: isActual[months.indexOf(m)] })),
    rows: {
      valueCertified,
      retention,
      netCertified,
      received,
      materials,
      labour,
      plant,
      prelims,
      outgoings,
      net,
      cumulative,
      cumIn,
      cumOut,
    },
    totals: {
      valueCertified: valueCertified.reduce((a, b) => a + b, 0),
      retention: retention.reduce((a, b) => a + b, 0),
      received: received.reduce((a, b) => a + b, 0),
      outgoings: outgoings.reduce((a, b) => a + b, 0),
      afterCompletion,
      measured,
    },
    // The number the forecast exists to produce: the worst the running balance
    // gets, and when. That is the overdraft to arrange.
    lowPoint: months.length
      ? { month: monthLabel(months[lowIdx]), amount: cumulative[lowIdx] }
      : null,
    assumptions: { retentionPercent, paymentLagDays, leadDays, prelimPercent },
  };
}

export default buildCashflowForecast;
