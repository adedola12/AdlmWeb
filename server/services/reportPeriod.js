// What happened on ONE project between two dates.
//
// WHY THIS EXISTS
//
// The Project and PM reports answer "where does the job stand today". The
// question a QS is actually asked at month end is different: "what moved in
// September" — how much work was valued, what was certified, what was bought,
// which variations came in, what the site recorded. Every one of those facts is
// already on the project with a date beside it; nothing ever read them by date.
//
// So this reads them by date. It does not invent a field: each figure below
// names the stored date it filters on, and a project that never recorded one
// (an old project from before partial valuation, say) simply reports nothing
// for that heading rather than an estimate.
//
//   valuationEvents[].markedAt     progress valued in the window (amount is
//                                  the value delta of that tick, so the sum is
//                                  "work done this period")
//   items[].completedAt            lines signed off as complete
//   items[].actualRecordedAt /
//   items[].actualUpdatedAt        actual costs recorded — planned vs actual
//   certificates[].date            interim certificates issued
//   variations[].issuedAt          variations raised
//   variations[].decidedAt         variations approved / rejected
//   budgetItems[].procuredAt       materials bought
//   projectManagement.tasks[]      tasks finished (actualEndDate) and tasks
//                                  due (endDate) but not finished
//   projectManagement.risks/issues risks raised, issues opened / resolved
//   ActivityLog (passed in)        the project's own activity trail
//
// THE DAY IS A LAGOS DAY
//
// Every user is in Nigeria (WAT, UTC+1, no daylight saving). "1 to 30
// September" means from midnight on the 1st to the last millisecond of the
// 30th IN LAGOS, so the boundaries are built at +01:00, not at UTC — otherwise
// anything recorded between midnight and 1am WAT lands in the wrong month.
//
// Pure: no database, no clock unless one is passed. The route and Ada's tool
// load the project and the activity rows and hand them in.

const DAY_MS = 86400000;
// Five years is more than any job runs; anything wider is a typo.
const MAX_SPAN_DAYS = 366 * 5;

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(safeNum(v) * 100) / 100;
}

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(v) {
  const d = asDate(v);
  return d ? d.toISOString() : null;
}

/** Today's date in Lagos as YYYY-MM-DD. Ada needs it to read "last month". */
export function watToday(now = new Date()) {
  return new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
}

/**
 * A from/to pair as typed by a person or a model, as two instants.
 *
 * Accepts YYYY-MM-DD (a full ISO timestamp is cut to its date). Either side may
 * be left out: no `from` means "from the start of the project", no `to` means
 * "to today". Returns { error } rather than throwing so the caller can say
 * what was wrong in its own words.
 *
 * @returns {{from: Date|null, to: Date|null, fromDay: string, toDay: string} | {error: string}}
 */
export function parseReportRange(fromRaw, toRaw, { now = new Date() } = {}) {
  const day = (raw) => String(raw || "").trim().slice(0, 10);
  const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  const fromDay = day(fromRaw);
  const toDay = day(toRaw) || (fromDay ? watToday(now) : "");
  if (!fromDay && !toDay) return { from: null, to: null, fromDay: "", toDay: "" };

  if (fromDay && !valid(fromDay)) return { error: `"${fromRaw}" is not a date. Use YYYY-MM-DD.` };
  if (toDay && !valid(toDay)) return { error: `"${toRaw}" is not a date. Use YYYY-MM-DD.` };

  // Midnight and the last millisecond of the day, both in Lagos.
  const from = fromDay ? asDate(`${fromDay}T00:00:00.000+01:00`) : null;
  const to = toDay ? asDate(`${toDay}T23:59:59.999+01:00`) : null;
  if ((fromDay && !from) || (toDay && !to)) return { error: "That date does not exist." };
  // "2026-02-31" parses in some engines by rolling into March. Refuse it: the
  // person meant a date that is not there, and silently moving it is worse.
  // Reading the instant back as a Lagos day catches the roll-over.
  if (from && watToday(from) !== fromDay) return { error: `${fromDay} is not a real date.` };
  if (to && watToday(to) !== toDay) return { error: `${toDay} is not a real date.` };

  if (from && to && from > to) return { error: "The start date is after the end date." };
  if (from && to && (to - from) / DAY_MS > MAX_SPAN_DAYS) {
    return { error: "That range is longer than five years. Pick a shorter one." };
  }
  return { from, to, fromDay, toDay };
}

/** Is `v` a date inside [from, to]? Open ends are open. */
export function inRange(v, from, to) {
  const d = asDate(v);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const lineLabel = (it) =>
  String(it?.description || it?.materialName || it?.takeoffLine || "").trim().slice(0, 160);

/**
 * The period summary.
 *
 * @param {object} project              a loaded TakeoffProject (lean or hydrated)
 * @param {object} opts
 * @param {Date|null} opts.from
 * @param {Date|null} opts.to
 * @param {Array}  [opts.activity]      ActivityLog rows for this project (any
 *                                      range; filtered again here)
 * @param {boolean}[opts.canSeeMoney]   false zeroes every money figure, the same
 *                                      rule the reports apply to a collaborator
 *                                      without RateGen
 */
export function buildPeriodSummary(
  project,
  { from = null, to = null, activity = [], canSeeMoney = true } = {},
) {
  const m = (v) => (canSeeMoney ? round2(v) : 0);
  const within = (v) => inRange(v, from, to);

  const items = Array.isArray(project?.items) ? project.items : [];

  // ── Progress valued in the window ──
  // An 'amount' is the value a tick moved (negative when somebody wound a line
  // back), so gross forward work and reversals are reported apart, and the net
  // is what the period added.
  const events = (Array.isArray(project?.valuationEvents) ? project.valuationEvents : []).filter(
    (e) => within(e?.markedAt),
  );
  let valuedGross = 0;
  let reversed = 0;
  const linesMoved = new Set();
  for (const e of events) {
    const a = safeNum(e?.amount);
    if (a >= 0) valuedGross += a;
    else reversed += a;
    linesMoved.add(String(e?.itemKey || e?.itemSn || e?.description || ""));
  }

  // ── Lines signed off as complete ──
  const completed = items.filter((it) => it?.completed && within(it?.completedAt));
  const completedValue = completed.reduce((s, it) => s + safeNum(it?.qty) * safeNum(it?.rate), 0);

  // ── Actual cost recorded — planned vs actual on those lines ──
  // Same arithmetic as pmCompute: a recorded actualQty / actualRate replaces
  // the planned one, otherwise the planned one stands.
  const actualLines = items.filter(
    (it) => within(it?.actualRecordedAt) || within(it?.actualUpdatedAt),
  );
  let actualPlanned = 0;
  let actualSpent = 0;
  const actualRows = actualLines.map((it) => {
    const planned = safeNum(it?.qty) * safeNum(it?.rate);
    const aQty = it?.actualQty != null ? safeNum(it.actualQty) : safeNum(it?.qty);
    const aRate = it?.actualRate != null ? safeNum(it.actualRate) : safeNum(it?.rate);
    const actual = aQty * aRate;
    actualPlanned += planned;
    actualSpent += actual;
    return {
      code: String(it?.code || ""),
      description: lineLabel(it),
      planned: m(planned),
      actual: m(actual),
      variance: m(actual - planned),
    };
  });
  actualRows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  // ── Certificates issued ──
  const certs = (Array.isArray(project?.certificates) ? project.certificates : [])
    .filter((c) => within(c?.date))
    .map((c) => ({
      number: safeNum(c?.number),
      date: iso(c?.date),
      thisCertificate: m(c?.thisCertificate),
      netPayable: m(c?.netPayable),
      status: c?.status || "draft",
    }))
    .sort((a, b) => a.number - b.number);
  const certified = certs
    .filter((c) => c.status !== "draft")
    .reduce((s, c) => s + safeNum(c.thisCertificate), 0);
  const paid = certs.filter((c) => c.status === "paid").reduce((s, c) => s + safeNum(c.netPayable), 0);

  // ── Variations ──
  const variations = Array.isArray(project?.variations) ? project.variations : [];
  const raised = variations.filter((v) => within(v?.issuedAt));
  const decided = variations.filter((v) => within(v?.decidedAt));
  const varValue = (list) => list.reduce((s, v) => s + safeNum(v?.qty) * safeNum(v?.rate), 0);
  const approved = decided.filter((v) => v?.status === "approved");
  const rejected = decided.filter((v) => v?.status === "rejected");

  // ── Procurement ──
  const bought = (Array.isArray(project?.budgetItems) ? project.budgetItems : []).filter(
    (b) => within(b?.procuredAt),
  );
  const boughtValue = bought.reduce((s, b) => s + safeNum(b?.qty) * safeNum(b?.rate), 0);

  // ── Programme ──
  const pm = project?.projectManagement || {};
  const tasks = (Array.isArray(pm.tasks) ? pm.tasks : []).filter((t) => !t?.isSummary);
  const finished = tasks.filter((t) => within(t?.actualEndDate));
  const dueNotDone = tasks.filter(
    (t) => within(t?.endDate) && safeNum(t?.percentComplete) < 100 && !t?.actualEndDate,
  );
  const risksRaised = (Array.isArray(pm.risks) ? pm.risks : []).filter((r) => within(r?.createdAt));
  const issuesOpened = (Array.isArray(pm.issues) ? pm.issues : []).filter((i) => within(i?.openedAt));
  const issuesResolved = (Array.isArray(pm.issues) ? pm.issues : []).filter((i) =>
    within(i?.resolvedAt),
  );

  // ── Activity trail ──
  const trail = (Array.isArray(activity) ? activity : [])
    .filter((a) => within(a?.createdAt))
    .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
  const byCategory = {};
  for (const a of trail) {
    const k = String(a?.category || "other");
    byCategory[k] = (byCategory[k] || 0) + 1;
  }

  const summary = {
    from: iso(from),
    to: iso(to),
    moneyMasked: !canSeeMoney,
    progress: {
      events: events.length,
      linesMoved: linesMoved.size,
      valued: m(valuedGross),
      reversed: m(reversed),
      net: m(valuedGross + reversed),
      completedLines: completed.length,
      completedValue: m(completedValue),
    },
    actuals: {
      lines: actualRows.length,
      planned: m(actualPlanned),
      actual: m(actualSpent),
      variance: m(actualSpent - actualPlanned),
      top: actualRows.slice(0, 10),
    },
    certificates: {
      list: certs,
      certified: m(certified),
      paid: m(paid),
    },
    variations: {
      raised: raised.length,
      raisedValue: m(varValue(raised)),
      approved: approved.length,
      approvedValue: m(varValue(approved)),
      rejected: rejected.length,
    },
    procurement: {
      lines: bought.length,
      value: m(boughtValue),
    },
    programme: {
      finished: finished.length,
      dueNotDone: dueNotDone.length,
      dueNotDoneNames: dueNotDone.slice(0, 8).map((t) => String(t?.name || "").slice(0, 120)),
      risksRaised: risksRaised.length,
      issuesOpened: issuesOpened.length,
      issuesResolved: issuesResolved.length,
    },
    activity: {
      total: trail.length,
      byCategory,
      recent: trail.slice(0, 40).map((a) => ({
        at: iso(a?.createdAt),
        summary: String(a?.summary || "").slice(0, 200),
        category: String(a?.category || ""),
        by: String(a?.actorName || ""),
      })),
    },
  };
  summary.quiet = periodIsQuiet(summary);
  return summary;
}

/** Nothing at all recorded in the window — said plainly rather than as a page of zeros. */
export function periodIsQuiet(s) {
  return (
    !s.progress.events &&
    !s.progress.completedLines &&
    !s.actuals.lines &&
    !s.certificates.list.length &&
    !s.variations.raised &&
    !s.variations.approved &&
    !s.variations.rejected &&
    !s.procurement.lines &&
    !s.programme.finished &&
    !s.programme.dueNotDone &&
    !s.programme.risksRaised &&
    !s.programme.issuesOpened &&
    !s.programme.issuesResolved &&
    !s.activity.total
  );
}
