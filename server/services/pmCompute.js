// PM dashboard compute service.
//
// Pure functions that take a TakeoffProject document (lean or hydrated) and
// derive the dashboard payload the client renders:
//   • the 6 headline tiles (Progress, Budget Used, Overdue, CPI, SPI, Tasks Done)
//   • Tasks donut buckets
//   • Budget bars (Planned vs Actual)
//   • Overdue bars (by priority)
//   • Burndown points (planned remaining vs actual remaining over time)
//
// EVM math:
//   PV (Planned Value)   = sum of baselineCost across tasks that should be
//                          underway/done by "today" per their baselineEnd.
//   EV (Earned Value)    = sum of baselineCost × percentComplete (per task).
//   AC (Actual Cost)     = sum of actualCost (with fallback to EV when no
//                          actuals tracked).
//   CPI = EV / AC        (>1 = under budget)
//   SPI = EV / PV        (>1 = ahead of schedule)
//
// Tasks linked to BoQ items inherit their baselineCost from those items.
// Tasks with no baselineCost contribute 0 to the EVM math but still count
// toward Tasks Done %.

const MS_DAY = 24 * 60 * 60 * 1000;

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isFiniteDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isFiniteDate(d) ? d : null;
}

function isoDay(d) {
  if (!isFiniteDate(d)) return "";
  return d.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function itemIdentity(item, index) {
  const sn = safeNum(item?.sn) || index + 1;
  return [
    sn,
    String(item?.code || "").trim().toLowerCase(),
    String(item?.description || "").trim().toLowerCase(),
    String(item?.takeoffLine || "").trim().toLowerCase(),
    String(item?.materialName || "").trim().toLowerCase(),
    String(item?.unit || "").trim().toLowerCase(),
  ].join("::");
}

// Build a map of identity → { plannedAmount, actualAmount, completed,
// percentComplete } so the task layer can pull cost data from the BoQ
// when linkedBoqIdentities is set. The actualAmount uses the partial
// factor (binary ratified → 1, else percentComplete / 100) so the PM
// dashboard reflects partial progress, not just fully-signed-off lines.
function buildItemIndex(project) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const isMaterials = String(project?.productKey || "").includes("materials");
  const statusField = isMaterials ? "purchased" : "completed";
  const map = new Map();
  items.forEach((item, idx) => {
    const key = itemIdentity(item, idx);
    const qty = safeNum(item?.qty);
    const rate = safeNum(item?.rate);
    const planned = qty * rate;
    const aQty = item?.actualQty != null ? safeNum(item?.actualQty) : qty;
    const aRate = item?.actualRate != null ? safeNum(item?.actualRate) : rate;
    const ratified = Boolean(item?.[statusField]);
    const pct = clamp(safeNum(item?.percentComplete), 0, 100);
    const factor = ratified ? 1 : pct / 100;
    map.set(key, {
      plannedAmount: planned,
      actualAmount: aQty * aRate * factor,
      completed: ratified,
      percentComplete: ratified ? 100 : pct,
      valuationFactor: factor,
    });
  });
  return map;
}

function hydrateTaskCost(task, itemIndex) {
  const links = Array.isArray(task?.linkedBoqIdentities)
    ? task.linkedBoqIdentities
    : [];
  if (!links.length) {
    return {
      baselineCost: safeNum(task?.baselineCost),
      derivedActualCost: safeNum(task?.actualCost),
    };
  }
  let planned = 0;
  let actual = 0;
  for (const id of links) {
    const entry = itemIndex.get(id);
    if (!entry) continue;
    planned += entry.plannedAmount;
    actual += entry.actualAmount;
  }
  // If the task also has a manually entered actualCost, prefer the larger
  // (so users can override BoQ-derived actuals upward if needed).
  return {
    baselineCost: planned > 0 ? planned : safeNum(task?.baselineCost),
    derivedActualCost: Math.max(actual, safeNum(task?.actualCost)),
  };
}

function summariseTasks(tasks, itemIndex, now) {
  const todayMs = now.getTime();
  const buckets = {
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    blocked: 0,
  };
  let overdue = 0;
  let overdueByPriority = { low: 0, medium: 0, high: 0, critical: 0 };
  let totalBaseline = 0;
  let totalActual = 0;
  let totalEarned = 0;
  let totalPlannedValueToDate = 0;
  let percentSum = 0;
  // Split baseline by source so the dashboard can compare "linked-to-BoQ"
  // value against the contract sum (i.e. is the plan balanced against the
  // priced scope?). Tasks without links are 'manual' baseline.
  let linkedBaseline = 0;
  let manualBaseline = 0;

  const enriched = tasks.map((task) => {
    const baselineEnd = asDate(task?.baselineEnd) || asDate(task?.endDate);
    const baselineStart = asDate(task?.baselineStart) || asDate(task?.startDate);
    const endDate = asDate(task?.endDate);
    const pct = clamp(task?.percentComplete, 0, 100);
    const { baselineCost, derivedActualCost } = hydrateTaskCost(task, itemIndex);
    const earned = (baselineCost * pct) / 100;

    let isOverdue = false;
    if (
      isFiniteDate(endDate) &&
      endDate.getTime() < todayMs &&
      pct < 100 &&
      task?.status !== "completed"
    ) {
      isOverdue = true;
      overdue += 1;
      const p = task?.priority || "medium";
      if (overdueByPriority[p] === undefined) overdueByPriority[p] = 0;
      overdueByPriority[p] += 1;
    }

    // PV = portion of baseline that *should* be earned by today based on
    // baseline schedule.
    let plannedValueToDate = 0;
    if (baselineCost > 0 && isFiniteDate(baselineStart) && isFiniteDate(baselineEnd)) {
      if (todayMs >= baselineEnd.getTime()) {
        plannedValueToDate = baselineCost;
      } else if (todayMs <= baselineStart.getTime()) {
        plannedValueToDate = 0;
      } else {
        const span = baselineEnd.getTime() - baselineStart.getTime();
        const elapsed = todayMs - baselineStart.getTime();
        plannedValueToDate = baselineCost * (span > 0 ? elapsed / span : 0);
      }
    } else if (baselineCost > 0 && isFiniteDate(baselineEnd) && todayMs >= baselineEnd.getTime()) {
      plannedValueToDate = baselineCost;
    }

    totalBaseline += baselineCost;
    totalActual += derivedActualCost;
    totalEarned += earned;
    totalPlannedValueToDate += plannedValueToDate;
    percentSum += pct;
    if ((task?.linkedBoqIdentities || []).length > 0) {
      linkedBaseline += baselineCost;
    } else {
      manualBaseline += baselineCost;
    }

    const status = task?.status || (pct >= 100 ? "completed" : pct > 0 ? "in-progress" : "not-started");
    if (status === "completed" || pct >= 100) buckets.completed += 1;
    else if (status === "blocked") buckets.blocked += 1;
    else if (pct > 0 || status === "in-progress") buckets.inProgress += 1;
    else buckets.notStarted += 1;

    return {
      ...(task?.toObject ? task.toObject() : task),
      _computed: {
        baselineCost,
        actualCost: derivedActualCost,
        earnedValue: earned,
        plannedValueToDate,
        isOverdue,
      },
    };
  });

  const totalTasks = tasks.length;
  const avgPercent = totalTasks > 0 ? percentSum / totalTasks : 0;

  return {
    enriched,
    buckets,
    overdue,
    overdueByPriority,
    totalTasks,
    avgPercent,
    totalBaseline,
    totalActual,
    totalEarned,
    totalPlannedValueToDate,
    linkedBaseline,
    manualBaseline,
  };
}

function buildBurndown(tasks, totalBaseline, projectStart, projectFinish, now) {
  // Sample once per week between projectStart and projectFinish (or last
  // task end), capped at 24 points. Each point carries planned remaining
  // (BAC - PV) and actual remaining (BAC - EV).
  if (!isFiniteDate(projectStart) || !isFiniteDate(projectFinish)) {
    return [];
  }
  const span = projectFinish.getTime() - projectStart.getTime();
  if (span <= 0) return [];

  const points = [];
  const maxPoints = 24;
  const interval = Math.max(MS_DAY, Math.floor(span / maxPoints));

  for (let t = projectStart.getTime(); t <= projectFinish.getTime() + MS_DAY; t += interval) {
    const sampleDate = new Date(t);
    const sampleMs = sampleDate.getTime();
    let pv = 0;
    let ev = 0;

    for (const task of tasks) {
      const baselineStart = asDate(task?.baselineStart) || asDate(task?.startDate);
      const baselineEnd = asDate(task?.baselineEnd) || asDate(task?.endDate);
      const pct = clamp(task?.percentComplete, 0, 100);
      const { baselineCost } = task._computed || {};
      const cost = safeNum(baselineCost);

      if (cost > 0 && isFiniteDate(baselineStart) && isFiniteDate(baselineEnd)) {
        if (sampleMs >= baselineEnd.getTime()) pv += cost;
        else if (sampleMs > baselineStart.getTime()) {
          const s = baselineEnd.getTime() - baselineStart.getTime();
          pv += cost * ((sampleMs - baselineStart.getTime()) / (s > 0 ? s : 1));
        }
      }
      // EV is "as of now" — we don't have per-date percentComplete history,
      // so the actual curve flattens to the current EV after today. For
      // dates before today, scale by the same baseline ratio (best-effort).
      if (sampleMs <= now.getTime()) {
        if (cost > 0 && isFiniteDate(baselineStart) && isFiniteDate(baselineEnd)) {
          if (sampleMs >= baselineEnd.getTime()) ev += (cost * pct) / 100;
          else if (sampleMs > baselineStart.getTime()) {
            const s = baselineEnd.getTime() - baselineStart.getTime();
            const fraction = (sampleMs - baselineStart.getTime()) / (s > 0 ? s : 1);
            ev += ((cost * pct) / 100) * fraction;
          }
        }
      }
    }

    points.push({
      date: isoDay(sampleDate),
      plannedRemaining: Math.max(0, totalBaseline - pv),
      actualRemaining: sampleMs <= now.getTime()
        ? Math.max(0, totalBaseline - ev)
        : null,
    });
  }

  return points;
}

export function computeProjectStartFinish(tasks) {
  let start = null;
  let finish = null;
  for (const t of tasks) {
    const s = asDate(t?.baselineStart) || asDate(t?.startDate);
    const e = asDate(t?.baselineEnd) || asDate(t?.endDate);
    if (isFiniteDate(s) && (!start || s < start)) start = s;
    if (isFiniteDate(e) && (!finish || e > finish)) finish = e;
  }
  return { projectStart: start, projectFinish: finish };
}

export function computePmDashboard(project, { now = new Date() } = {}) {
  const pm = project?.projectManagement || {};
  const tasks = Array.isArray(pm.tasks) ? pm.tasks : [];
  const risks = Array.isArray(pm.risks) ? pm.risks : [];
  const issues = Array.isArray(pm.issues) ? pm.issues : [];
  const itemIndex = buildItemIndex(project);
  const {
    enriched,
    buckets,
    overdue,
    overdueByPriority,
    totalTasks,
    avgPercent,
    totalBaseline,
    totalActual,
    totalEarned,
    totalPlannedValueToDate,
    linkedBaseline,
    manualBaseline,
  } = summariseTasks(tasks, itemIndex, now);

  // Budget: prefer explicit override, then contract sum, then total baseline.
  const contractSum = safeNum(project?.contract?.contractSum);
  const grossFromItems = (Array.isArray(project?.items) ? project.items : []).reduce(
    (acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate),
    0,
  );
  const BAC = safeNum(pm.budgetOverride) || contractSum || totalBaseline || grossFromItems;

  // Budget reference: locked contract sum when available, else live BoQ total.
  // Used by the dashboard's "Plan balanced against contract?" indicator.
  const budgetReference = contractSum || grossFromItems;
  const contractLocked = Boolean(project?.contract?.locked);
  const variance = totalBaseline - budgetReference;
  let balanceStatus = "no-data";
  if (budgetReference > 0 && totalBaseline > 0) {
    const tolerancePct = 0.5; // ±0.5% is considered balanced
    const absVarPct = Math.abs(variance) / budgetReference * 100;
    if (absVarPct <= tolerancePct) balanceStatus = "balanced";
    else if (variance > 0) balanceStatus = "over";
    else balanceStatus = "under";
  } else if (totalBaseline === 0 && budgetReference > 0) {
    balanceStatus = "empty";
  }

  const CPI = totalActual > 0 ? totalEarned / totalActual : totalEarned > 0 ? 1 : 0;
  const SPI = totalPlannedValueToDate > 0 ? totalEarned / totalPlannedValueToDate : totalEarned > 0 ? 1 : 0;
  const budgetUsedPercent = BAC > 0 ? (totalActual / BAC) * 100 : 0;
  const tasksDonePercent = totalTasks > 0 ? (buckets.completed / totalTasks) * 100 : 0;

  // Project start / finish — prefer explicitly set values, else derive.
  let projectStart = asDate(pm.projectStart);
  let projectFinish = asDate(pm.projectFinish);
  if (!projectStart || !projectFinish) {
    const derived = computeProjectStartFinish(enriched);
    projectStart = projectStart || derived.projectStart;
    projectFinish = projectFinish || derived.projectFinish;
  }

  const burndown = buildBurndown(enriched, totalBaseline, projectStart, projectFinish, now);

  const openRisks = risks.filter((r) => r?.status !== "closed").length;
  const openIssues = issues.filter((i) => i?.status !== "resolved" && i?.status !== "closed").length;

  return {
    asOf: now.toISOString(),
    projectName: project?.name || "Project",
    projectStart: projectStart ? projectStart.toISOString() : null,
    projectFinish: projectFinish ? projectFinish.toISOString() : null,
    baselineDate: pm.baselineDate ? new Date(pm.baselineDate).toISOString() : null,
    headline: {
      progressPercent: Math.round(avgPercent * 10) / 10,
      budgetUsedPercent: Math.round(budgetUsedPercent * 10) / 10,
      overdueCount: overdue,
      CPI: Math.round(CPI * 100) / 100,
      SPI: Math.round(SPI * 100) / 100,
      tasksDonePercent: Math.round(tasksDonePercent * 10) / 10,
    },
    totals: {
      BAC: Math.round(BAC * 100) / 100,
      PV: Math.round(totalPlannedValueToDate * 100) / 100,
      EV: Math.round(totalEarned * 100) / 100,
      AC: Math.round(totalActual * 100) / 100,
      VAC: Math.round((BAC - (CPI > 0 ? BAC / CPI : BAC)) * 100) / 100,
      EAC: Math.round((CPI > 0 ? BAC / CPI : BAC) * 100) / 100,
      totalBaseline: Math.round(totalBaseline * 100) / 100,
      linkedBaseline: Math.round(linkedBaseline * 100) / 100,
      manualBaseline: Math.round(manualBaseline * 100) / 100,
      contractSum: Math.round(contractSum * 100) / 100,
      grossFromItems: Math.round(grossFromItems * 100) / 100,
      budgetReference: Math.round(budgetReference * 100) / 100,
      varianceVsBudget: Math.round(variance * 100) / 100,
      totalTasks,
      completedTasks: buckets.completed,
      inProgressTasks: buckets.inProgress,
      notStartedTasks: buckets.notStarted,
      blockedTasks: buckets.blocked,
      openRisks,
      openIssues,
    },
    balance: {
      status: balanceStatus, // 'balanced' | 'over' | 'under' | 'empty' | 'no-data'
      contractLocked,
      linkedBaseline: Math.round(linkedBaseline * 100) / 100,
      manualBaseline: Math.round(manualBaseline * 100) / 100,
      totalBaseline: Math.round(totalBaseline * 100) / 100,
      budgetReference: Math.round(budgetReference * 100) / 100,
      varianceAmount: Math.round(variance * 100) / 100,
      variancePercent:
        budgetReference > 0
          ? Math.round((variance / budgetReference) * 1000) / 10
          : 0,
    },
    buckets,
    overdueByPriority,
    burndown,
    tasks: enriched.map((t) => ({
      ...t,
      // Strip internal-only field but keep the computed envelope handy.
      _computed: undefined,
      computed: t._computed,
    })),
    risks,
    issues,
    // Lightweight BoQ catalogue so the client's task modal can render the
    // autocomplete picker without re-fetching the project. Each entry
    // includes the identity hash used for linkedBoqIdentities.
    boqItems: (Array.isArray(project?.items) ? project.items : []).map((item, idx) => ({
      identity: itemIdentity(item, idx),
      sn: safeNum(item?.sn) || idx + 1,
      description: String(item?.description || item?.materialName || item?.takeoffLine || "").trim(),
      unit: String(item?.unit || ""),
      qty: safeNum(item?.qty),
      rate: safeNum(item?.rate),
      amount: safeNum(item?.qty) * safeNum(item?.rate),
      category: String(item?.category || ""),
      trade: String(item?.trade || ""),
      completed: Boolean(item?.completed),
      purchased: Boolean(item?.purchased),
      percentComplete: clamp(safeNum(item?.percentComplete), 0, 100),
    })),
  };
}

export { itemIdentity as _itemIdentity };
