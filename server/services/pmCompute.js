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
// when linkedBoqIdentities is set.
//
// Critical: we index BOTH measured items AND the virtual entries for
// preliminaries / provisional sums / variations. A task linked to a
// `prelim::N` / `pc::N` / `var::N` identity would otherwise resolve to
// "not found" and the task's baseline cost would silently drop to ₦0
// (the bug the user hit on the Final-fix task).
//
// The actualAmount on measured items uses the partial factor
// (binary ratified → 1, else percentComplete / 100) so the PM dashboard
// reflects partial progress, not just fully-signed-off lines.
function buildItemIndex(project, scope) {
  const map = new Map();

  // Pull every virtual item (measured + prelim + PC + variations) from
  // the scope computation — single source of truth for identities and
  // amounts. virtualItems.actualAmount is pre-computed correctly per
  // kind, so we don't reinvent the math here.
  const virtuals = Array.isArray(scope?.virtualItems) ? scope.virtualItems : [];
  for (const v of virtuals) {
    if (!v || !v.identity) continue;
    map.set(v.identity, {
      plannedAmount: safeNum(v.amount),
      actualAmount: safeNum(v.actualAmount),
      completed: Boolean(v.completed),
      percentComplete: safeNum(v.percentComplete),
      valuationFactor: safeNum(v.percentComplete) / 100,
      kind: v.kind,
    });
  }

  return map;
}

// ── Project scope breakdown ──────────────────────────────────────────────
//
// The PM dashboard's cost figures (BAC, EV, AC, EAC, VAC) need to reflect
// the *full* contract — not just the measured BoQ items. A QS-grade total
// is Measured + Provisional Sums + Preliminaries + Variations, mirroring
// the contract panel shown in the BoQ tab.
//
// This function rolls those four streams up using the same convention the
// projects.js valuation pipeline uses, so the PM Dashboard and the
// Interim Payment Certificate flow stay numerically aligned.
//
// Earned semantics (matches existing computeValueToDate in projects.js):
//   • Measured items → earned = planned × valuationFactor (partial-aware)
//   • Provisional Sums → earned = full declared amount (declared = used)
//   • Variations → earned = full qty × rate (claimed when entered)
//   • Preliminaries → earned = pool × (completedAllocation / totalAllocation)
//
// Returns both the totals (for BAC / EV / AC) AND the per-entry virtual
// items (for the heatmap / picker / dashboard list views).
export function computeProjectScope(project) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const isMaterials = String(project?.productKey || "").includes("materials");
  const statusField = isMaterials ? "purchased" : "completed";

  // ── Measured (line items) ─────────────────────────────────────────────
  let measuredPlanned = 0;
  let measuredEarned = 0;
  let measuredActual = 0;
  const measuredVirtual = items.map((item, idx) => {
    const qty = safeNum(item?.qty);
    const rate = safeNum(item?.rate);
    const planned = qty * rate;
    const ratified = Boolean(item?.[statusField]);
    const pct = ratified ? 100 : clamp(safeNum(item?.percentComplete), 0, 100);
    const factor = pct / 100;
    const earned = planned * factor;
    // Actual: prefer recorded actualQty × actualRate when present, scaled by
    // the same valuation factor (so partial work shows partial actuals).
    const aQty = item?.actualQty != null ? safeNum(item?.actualQty) : qty;
    const aRate = item?.actualRate != null ? safeNum(item?.actualRate) : rate;
    const actual = aQty * aRate * factor;

    measuredPlanned += planned;
    measuredEarned += earned;
    measuredActual += actual;

    return {
      identity: itemIdentity(item, idx),
      kind: "measured",
      sn: safeNum(item?.sn) || idx + 1,
      description: String(item?.description || item?.materialName || item?.takeoffLine || "").trim(),
      unit: String(item?.unit || ""),
      qty,
      rate,
      amount: planned,
      // actualAmount preserves the aQty×aRate×factor calculation so the
      // task-cost hydrator (hydrateTaskCost) can read it through the
      // virtualItems-based itemIndex instead of recomputing from raw
      // item fields.
      actualAmount: actual,
      category: String(item?.category || ""),
      trade: String(item?.trade || ""),
      completed: ratified,
      purchased: Boolean(item?.purchased),
      percentComplete: ratified ? 100 : pct,
    };
  });

  // ── Provisional Sums (PC) ─────────────────────────────────────────────
  // PC sums always contribute to BAC (declared allowance) but only to EV
  // when the QS ticks them as executed. Until then they show as "not
  // started" in the PM dashboard heatmap, mirroring how preliminary items
  // behave.
  const provisionalSums = Array.isArray(project?.provisionalSums) ? project.provisionalSums : [];
  let provisionalTotal = 0;
  let provisionalEarned = 0;
  const provisionalVirtual = provisionalSums.map((p, idx) => {
    const amount = safeNum(p?.amount);
    const isDone = Boolean(p?.completed);
    provisionalTotal += amount;
    if (isDone) provisionalEarned += amount;
    return {
      identity: `pc::${idx}`,
      kind: "provisional",
      sn: idx + 1,
      description: String(p?.description || `PC sum #${idx + 1}`),
      unit: "sum",
      qty: 1,
      rate: amount,
      amount,
      actualAmount: isDone ? amount : 0,
      category: "Provisional Sums",
      trade: "",
      completed: isDone,
      purchased: false,
      percentComplete: isDone ? 100 : 0,
    };
  });

  // ── Variations ────────────────────────────────────────────────────────
  // Same rule as PC sums: instruction-issued contributes to BAC; executed
  // (completed flag set) contributes to EV.
  const variations = Array.isArray(project?.variations) ? project.variations : [];
  let variationsTotal = 0;
  let variationsEarned = 0;
  const variationsVirtual = variations.map((v, idx) => {
    const qty = safeNum(v?.qty);
    const rate = safeNum(v?.rate);
    const amount = qty * rate;
    const isDone = Boolean(v?.completed);
    variationsTotal += amount;
    if (isDone) variationsEarned += amount;
    return {
      identity: `var::${idx}`,
      kind: "variation",
      sn: idx + 1,
      description: String(v?.description || `Variation #${idx + 1}`),
      unit: String(v?.unit || ""),
      qty,
      rate,
      amount,
      actualAmount: isDone ? amount : 0,
      category: "Variations",
      trade: "",
      completed: isDone,
      purchased: false,
      percentComplete: isDone ? 100 : 0,
    };
  });

  // ── Preliminaries (BESMM4 checklist) ─────────────────────────────────
  const contract = project?.contract || {};
  const preliminaryPercent = safeNum(contract?.preliminaryPercent) || 7.5;
  const preliminaryPool = ((measuredPlanned + provisionalTotal) * preliminaryPercent) / 100;
  const preliminaryItems = Array.isArray(project?.preliminaryItems) ? project.preliminaryItems : [];
  const totalAllocation = preliminaryItems.reduce((acc, p) => acc + safeNum(p?.allocation), 0);
  const allocationBase = totalAllocation > 0 ? totalAllocation : 100;

  let preliminaryEarned = 0;
  const preliminaryVirtual = preliminaryItems.map((p, idx) => {
    const allocation = clamp(safeNum(p?.allocation), 0, 100);
    const amount = preliminaryPool * (allocation / allocationBase);
    const completed = Boolean(p?.completed);
    if (completed) preliminaryEarned += amount;
    return {
      identity: `prelim::${idx}`,
      kind: "preliminary",
      sn: idx + 1,
      description: String(p?.name || `Preliminary #${idx + 1}`),
      unit: "%",
      qty: allocation,
      rate: amount > 0 && allocation > 0 ? amount / allocation : 0,
      amount,
      actualAmount: completed ? amount : 0,
      category: "Preliminaries",
      trade: "",
      completed,
      purchased: false,
      percentComplete: completed ? 100 : 0,
    };
  });

  // ── Roll-up totals ────────────────────────────────────────────────────
  // projectTotal ALWAYS reflects the LIVE BoQ value (measured + prelim
  // + PC + variations). The previous behaviour froze it to the
  // contractSum + variations when locked, which silently desynced from
  // the BoQ tab whenever the user edited prelims/PC after lock — users
  // saw "BAC = 85.3M" while the BoQ tab shows "Project total = 93.4M".
  //
  // The locked contract sum stays available as `contractSumFrozen` on
  // this return so the Contract Movement / Variance panels can still
  // anchor variance tracking to the signed value. The "lock" affects
  // EDITABILITY (you can't manually override BAC when locked), not
  // the formula behind it.
  const contractLocked = Boolean(contract?.locked);
  const contractSumLocked = safeNum(contract?.contractSum);
  const projectTotal =
    measuredPlanned + provisionalTotal + preliminaryPool + variationsTotal;

  return {
    measured: {
      planned: measuredPlanned,
      earned: measuredEarned,
      actual: measuredActual,
      count: measuredVirtual.length,
    },
    provisional: {
      total: provisionalTotal,
      earned: provisionalEarned, // only when `completed` flag is ticked
      count: provisionalVirtual.length,
      completedCount: provisionalVirtual.filter((p) => p.completed).length,
    },
    variations: {
      total: variationsTotal,
      earned: variationsEarned, // only when `completed` flag is ticked
      count: variationsVirtual.length,
      completedCount: variationsVirtual.filter((v) => v.completed).length,
    },
    preliminary: {
      pool: preliminaryPool,
      earned: preliminaryEarned,
      percent: preliminaryPercent,
      itemCount: preliminaryVirtual.length,
      completedCount: preliminaryVirtual.filter((p) => p.completed).length,
    },
    projectTotal,
    contractLocked,
    // Frozen contract sum captured at lock time. Distinct from
    // projectTotal (which is always live). Variance panels compare
    // projectTotal vs contractSumFrozen to show how the project has
    // drifted since signing.
    contractSumFrozen: contractLocked ? contractSumLocked : 0,
    // Aggregate earned/actual across every category — the dashboard's true
    // EV / AC. PC sums and variations now only contribute when their
    // `completed` flag is ticked (matches preliminary-item semantics).
    totalEarned:
      measuredEarned + provisionalEarned + variationsEarned + preliminaryEarned,
    totalActual:
      measuredActual + provisionalEarned + variationsEarned + preliminaryEarned,
    virtualItems: [
      ...measuredVirtual,
      ...preliminaryVirtual,
      ...provisionalVirtual,
      ...variationsVirtual,
    ],
  };
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
  // Parallel weights array; missing entries are treated as 100 (full
  // share). Caller writes weights only when the user customises them.
  const weights = Array.isArray(task?.linkedBoqWeights)
    ? task.linkedBoqWeights
    : [];
  let planned = 0;
  let actual = 0;
  for (let i = 0; i < links.length; i += 1) {
    const id = links[i];
    const entry = itemIndex.get(id);
    if (!entry) continue;
    const rawWeight = Number(weights[i]);
    const weight = (Number.isFinite(rawWeight) ? rawWeight : 100) / 100;
    planned += entry.plannedAmount * weight;
    actual += entry.actualAmount * weight;
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
  // ALL tasks bucketed by priority — independent of overdue status.
  // Lets the dashboard show "you have 12 critical tasks" even when
  // none are overdue yet. "none" catches tasks with no priority set.
  let tasksByPriority = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  // Status counts at a glance — same source of truth as buckets but
  // indexed by the canonical status string, easier to render as a
  // simple "5 in-progress / 3 blocked / 12 not-started" strip.
  let tasksByStatus = {
    "not-started": 0,
    "in-progress": 0,
    blocked: 0,
    completed: 0,
  };
  // Critical-path counters — populated from the criticalPath flag set
  // by the MS Project importer. Lets the dashboard show how many
  // tasks have zero slack (an instant schedule-risk read independent
  // of the cost-side CPI).
  let criticalPathTotal = 0;
  let criticalPathPending = 0; // critical-path tasks not yet completed
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

    // Total-by-priority — counts EVERY task, regardless of overdue.
    // Falls back to "none" when no priority is set so the user can
    // see how many tasks lack a priority assignment.
    const rawPriority = String(task?.priority || "").toLowerCase();
    const priorityKey =
      rawPriority === "critical" || rawPriority === "high" ||
      rawPriority === "medium" || rawPriority === "low"
        ? rawPriority
        : "none";
    tasksByPriority[priorityKey] += 1;

    // Total-by-status mirror — same content as buckets but keyed by
    // canonical string so consumers can index without translation.
    const canonicalStatus =
      status === "completed" || status === "in-progress" ||
      status === "blocked" || status === "not-started"
        ? status
        : "not-started";
    tasksByStatus[canonicalStatus] += 1;

    // Critical-path counters — driven by the criticalPath flag set
    // during import. Pending = critical AND not yet 100% complete.
    if (task?.criticalPath) {
      criticalPathTotal += 1;
      if (canonicalStatus !== "completed") criticalPathPending += 1;
    }

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
    tasksByPriority,
    tasksByStatus,
    criticalPathTotal,
    criticalPathPending,
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
  // Invalid date range — finish on/before start. Returning empty here is
  // caught by the dashboard's burndownStatus reporter below.
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

// ── WBS hierarchy & summary roll-ups ────────────────────────────────────
//
// MS Project, Primavera and every other PM tool render a "summary task" as
// a bold row whose duration / start / finish / cost / % complete are NOT
// authored — they are *rolled up* from the leaves underneath. We mirror
// that here so the WBS table doesn't show "₦0 / 0%" against rows like
// "Pre contract stage" or "Substructure".
//
// Parent resolution: pure WBS-code prefix matching. For each task with WBS
// "A.21.1", we walk the segments ["A.21", "A"] and pick the longest one
// that also exists in the project. Top-level tasks (e.g. "A") fall back to
// "0" if a row with that WBS exists (MS Project's project-root convention).
// The result is an explicit parent→children map that drives the roll-up.
//
// Roll-up math (per summary):
//   baseline  = Σ leafDescendants.baselineCost
//   actual    = Σ leafDescendants.actualCost
//   percent   = Σ(leaf.pct × leaf.baseline) / Σ leaf.baseline  (weighted)
//               fallback to simple average when no costs are present
//   start/end = min(starts) / max(ends) across all leaf descendants
//   duration  = (end - start) in calendar days
//
// "Leaves only" matters: if a parent's own baselineCost were summed in
// alongside its children we'd double-count.

function isSummaryEligible(task, childrenByWbs) {
  if (!task) return false;
  if (task.isSummary) return true;
  const wbs = String(task.wbs || "").trim();
  if (!wbs) return false;
  const children = childrenByWbs.get(wbs);
  return Boolean(children && children.length > 0);
}

function buildWbsHierarchy(tasks) {
  const taskByWbs = new Map();
  const wbsSet = new Set();
  for (const t of tasks) {
    const w = String(t?.wbs || "").trim();
    if (!w) continue;
    taskByWbs.set(w, t);
    wbsSet.add(w);
  }

  function findParentWbs(wbs) {
    const segs = String(wbs).split(".").filter(Boolean);
    if (segs.length <= 1) {
      // Top-level task — fall back to "0" project root if present.
      if (wbs !== "0" && wbsSet.has("0")) return "0";
      return null;
    }
    // Walk up the segments and return the first existing ancestor.
    for (let i = segs.length - 1; i > 0; i--) {
      const candidate = segs.slice(0, i).join(".");
      if (wbsSet.has(candidate)) return candidate;
    }
    if (wbs !== "0" && wbsSet.has("0")) return "0";
    return null;
  }

  const childrenByWbs = new Map();
  const parentOf = new Map();
  for (const w of wbsSet) {
    const parent = findParentWbs(w);
    parentOf.set(w, parent);
    if (parent) {
      const arr = childrenByWbs.get(parent) || [];
      arr.push(taskByWbs.get(w));
      childrenByWbs.set(parent, arr);
    }
  }

  return { taskByWbs, childrenByWbs, parentOf };
}

function collectLeafDescendants(wbs, childrenByWbs, out = []) {
  const kids = childrenByWbs.get(wbs);
  if (!kids || !kids.length) return out;
  for (const kid of kids) {
    const kidWbs = String(kid?.wbs || "").trim();
    const grandkids = childrenByWbs.get(kidWbs);
    if (!grandkids || !grandkids.length) {
      out.push(kid);
    } else {
      collectLeafDescendants(kidWbs, childrenByWbs, out);
    }
  }
  return out;
}

function rollupSummary(task, childrenByWbs) {
  const wbs = String(task?.wbs || "").trim();
  const leaves = collectLeafDescendants(wbs, childrenByWbs);
  let baseline = 0;
  let actual = 0;
  let earned = 0;
  let weightedPct = 0;
  let totalWeight = 0;
  let pctSum = 0;
  let pctCount = 0;
  let start = null;
  let end = null;

  for (const leaf of leaves) {
    if (!leaf) continue;
    const cost = safeNum(leaf?._computed?.baselineCost ?? leaf?.baselineCost);
    const aCost = safeNum(leaf?._computed?.actualCost ?? leaf?.actualCost);
    const pct = clamp(safeNum(leaf?.percentComplete), 0, 100);
    baseline += cost;
    actual += aCost;
    earned += (cost * pct) / 100;
    weightedPct += pct * cost;
    totalWeight += cost;
    pctSum += pct;
    pctCount += 1;
    const s = asDate(leaf?.startDate) || asDate(leaf?.baselineStart);
    const e = asDate(leaf?.endDate) || asDate(leaf?.baselineEnd);
    if (isFiniteDate(s) && (!start || s < start)) start = s;
    if (isFiniteDate(e) && (!end || e > end)) end = e;
  }

  const rolledPct = totalWeight > 0
    ? weightedPct / totalWeight
    : pctCount > 0
      ? pctSum / pctCount
      : 0;

  const directChildren = childrenByWbs.get(wbs) || [];
  const durationDays = isFiniteDate(start) && isFiniteDate(end)
    ? Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_DAY))
    : 0;

  return {
    baselineCost: baseline,
    actualCost: actual,
    earnedValue: earned,
    percentComplete: rolledPct,
    startDate: start ? start.toISOString() : null,
    endDate: end ? end.toISOString() : null,
    durationDays,
    childCount: directChildren.length,
    leafCount: leaves.length,
    status:
      rolledPct >= 99.9
        ? "completed"
        : rolledPct > 0
          ? "in-progress"
          : "not-started",
  };
}

// Attach `rollup` to every summary-eligible task. The client reads rollup
// values for display when present and falls back to the task's own fields
// otherwise.
function computeWbsRollups(enrichedTasks) {
  const { childrenByWbs, parentOf } = buildWbsHierarchy(enrichedTasks);
  const wbsToTask = new Map();
  for (const t of enrichedTasks) {
    const w = String(t?.wbs || "").trim();
    if (w) wbsToTask.set(w, t);
  }

  for (const task of enrichedTasks) {
    const isSummary = isSummaryEligible(task, childrenByWbs);
    if (!isSummary) continue;
    const rollup = rollupSummary(task, childrenByWbs);
    task._rollup = rollup;
    task._isSummary = true;
  }

  // Also stamp parent / depth on every task so the client can indent rows.
  for (const t of enrichedTasks) {
    const w = String(t?.wbs || "").trim();
    const depth = w
      ? Math.max(0, w.split(".").filter(Boolean).length - 1)
      : 0;
    t._wbsDepth = depth;
    t._parentWbs = w ? parentOf.get(w) || null : null;
  }

  return enrichedTasks;
}

// ── Task rescheduling (predecessor-driven cascade) ──────────────────────
//
// When the user moves `projectStart` (e.g. project slips by 2 months), the
// task dates need to flow through the predecessor graph imported from MS
// Project. We assume the most common relationship — Finish-to-Start with
// zero lag — for every link. That covers ~95% of construction schedules
// authored in Project. Lag / SS / SF / FF relationships can be added
// later by extending the parser to capture `<Type>` and `<LinkLag>`.
//
// Algorithm:
//   1. Build a task-id → task map (we mutate clones, not the originals)
//   2. Topological sort by predecessor edges (cycle-safe: cycles are
//      logged and the offending edge is dropped)
//   3. Walk in topo order:
//        - No predecessors → start = projectStart
//        - Has predecessors → start = max(predecessor.endDate)
//        - end = start + durationDays
//   4. Summary tasks are skipped — their dates are derived from leaves
//      by the rollup pass and shouldn't be authored directly.
//
// Returns { tasks: <rescheduled>, changed: <int>, cycles: <int>, anchored: <int> }
export function rescheduleTasks(tasks, projectStart, opts = {}) {
  const { minDuration = 1 } = opts;
  const start = asDate(projectStart);
  if (!start) {
    return {
      tasks: Array.isArray(tasks) ? tasks.slice() : [],
      changed: 0,
      cycles: 0,
      anchored: 0,
    };
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { tasks: [], changed: 0, cycles: 0, anchored: 0 };
  }

  // Clone each task so we never mutate the caller's array. Use plain
  // objects so subdocument toObject() output is stable.
  const taskById = new Map();
  const ordered = [];
  for (const t of tasks) {
    const plain = t?.toObject ? t.toObject() : { ...t };
    const taskId = String(plain?.taskId || "");
    ordered.push({ taskId, plain });
    if (taskId) {
      taskById.set(taskId, {
        ...plain,
        _origStart: asDate(plain?.startDate),
        _origEnd: asDate(plain?.endDate),
      });
    }
  }

  // Cycle-safe DFS topological sort.
  const visited = new Set();
  const inProgress = new Set();
  const sorted = [];
  let cycles = 0;

  function visit(taskId) {
    if (visited.has(taskId)) return;
    if (inProgress.has(taskId)) {
      // Back-edge — record and bail. The cycle's tail edge is effectively
      // ignored (won't act as a predecessor in scheduling below).
      cycles += 1;
      return;
    }
    inProgress.add(taskId);
    const t = taskById.get(taskId);
    if (t) {
      const preds = Array.isArray(t.predecessors) ? t.predecessors : [];
      for (const predId of preds) {
        const sid = String(predId || "");
        if (sid && taskById.has(sid)) visit(sid);
      }
    }
    inProgress.delete(taskId);
    visited.add(taskId);
    sorted.push(taskId);
  }

  for (const taskId of taskById.keys()) {
    visit(taskId);
  }

  // Walk sorted: predecessors are guaranteed scheduled by the time we
  // reach a dependent. Use the freshly-computed endDate on the clone,
  // not the original.
  let changed = 0;
  let anchored = 0;

  for (const taskId of sorted) {
    const task = taskById.get(taskId);
    if (!task) continue;
    if (task.isSummary) continue; // summaries roll up from leaves

    const preds = (Array.isArray(task.predecessors) ? task.predecessors : [])
      .map((pid) => taskById.get(String(pid || "")))
      .filter(Boolean);

    let newStart;
    if (preds.length === 0) {
      newStart = new Date(start.getTime());
      anchored += 1;
    } else {
      let maxEnd = null;
      for (const pred of preds) {
        const pEnd = asDate(pred.endDate);
        if (pEnd && (!maxEnd || pEnd > maxEnd)) maxEnd = pEnd;
      }
      newStart = maxEnd ? new Date(maxEnd.getTime()) : new Date(start.getTime());
    }

    const duration = Math.max(0, safeNum(task.durationDays) || minDuration);
    const newEnd = new Date(newStart.getTime() + duration * MS_DAY);

    const oldStart = task._origStart;
    const oldEnd = task._origEnd;
    if (
      !oldStart || !oldEnd ||
      oldStart.getTime() !== newStart.getTime() ||
      oldEnd.getTime() !== newEnd.getTime()
    ) {
      changed += 1;
    }

    task.startDate = newStart;
    task.endDate = newEnd;
    // Strip internal markers before the task gets persisted.
    delete task._origStart;
    delete task._origEnd;
  }

  // Reassemble in the original order so the array's index identity is
  // preserved for downstream callers (mongoose doc indices, UI keys).
  const result = ordered.map(({ taskId, plain }) => {
    if (taskId && taskById.has(taskId)) return taskById.get(taskId);
    return plain;
  });

  return { tasks: result, changed, cycles, anchored };
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
  // Compute scope FIRST so the itemIndex can resolve identities for
  // every BoQ stream (measured + prelim + PC + variations). Without
  // this, tasks linked to a `prelim::N` / `pc::N` / `var::N` identity
  // would silently lose their baseline cost in hydrateTaskCost.
  const scope = computeProjectScope(project);
  const itemIndex = buildItemIndex(project, scope);
  const {
    enriched,
    buckets,
    overdue,
    overdueByPriority,
    tasksByPriority,
    tasksByStatus,
    criticalPathTotal,
    criticalPathPending,
    totalTasks,
    avgPercent,
    totalBaseline,
    totalActual,
    totalEarned,
    totalPlannedValueToDate,
    linkedBaseline,
    manualBaseline,
  } = summariseTasks(tasks, itemIndex, now);

  // Roll summary tasks up from their leaf descendants (MS-Project style).
  // Mutates the enriched tasks in place to attach `_rollup` and `_isSummary`.
  computeWbsRollups(enriched);

  // ── BoQ-link reverse index ───────────────────────────────────────────
  // For each BoQ identity, count how many tasks link to it and capture
  // the linked task names. Surfaced in the dashboard payload so the BoQ
  // tab can render a "Linked to N tasks" chip per row — letting users
  // spot accidental double-counts (same item linked from 2+ tasks)
  // that would otherwise inflate the EV figure.
  //
  // Summary tasks are excluded — they roll up from leaves and don't
  // directly carry links, but counting them would double-count any
  // leaf's link.
  const linkCountByIdentity = new Map();
  const linkedTaskNamesByIdentity = new Map();
  // Sum of weights across every task linking to each identity. Tells the
  // BoQ tab whether a line is balanced (100), under-allocated (<100, gap
  // in WBS coverage) or over-allocated (>100, double-count in EV).
  const totalWeightByIdentity = new Map();
  // Reverse-propagate task progress onto BoQ items. For each BoQ
  // identity we collect Σ(taskPct × weight/100) and Σ(weight/100). The
  // effective progress for that identity is then the weighted average
  // of its linked tasks' percentComplete. Surfaces in the heatmap so
  // prelim / PC / variation cells colour by the work actually being
  // done on tasks that execute them — not just the binary "completed"
  // flag (which the previous code used and gave a white/blue-only
  // heatmap for non-measured streams).
  const progressNumByIdentity = new Map();
  const progressDenByIdentity = new Map();
  for (const t of enriched) {
    if (t._isSummary) continue;
    const links = Array.isArray(t.linkedBoqIdentities) ? t.linkedBoqIdentities : [];
    const weights = Array.isArray(t.linkedBoqWeights) ? t.linkedBoqWeights : [];
    const taskPct = clamp(safeNum(t.percentComplete), 0, 100);
    for (let i = 0; i < links.length; i += 1) {
      const id = String(links[i] || "");
      if (!id) continue;
      linkCountByIdentity.set(id, (linkCountByIdentity.get(id) || 0) + 1);
      const arr = linkedTaskNamesByIdentity.get(id) || [];
      arr.push(t.name || `Task ${t.taskId || ""}`);
      linkedTaskNamesByIdentity.set(id, arr);
      const rawW = Number(weights[i]);
      const w = Number.isFinite(rawW) ? clamp(rawW, 0, 100) : 100;
      totalWeightByIdentity.set(id, (totalWeightByIdentity.get(id) || 0) + w);
      // Progress accumulator — same weight basis as the cost rollup.
      const wFrac = w / 100;
      progressNumByIdentity.set(
        id,
        (progressNumByIdentity.get(id) || 0) + taskPct * wFrac,
      );
      progressDenByIdentity.set(
        id,
        (progressDenByIdentity.get(id) || 0) + wFrac,
      );
    }
  }

  // ── Project-scope breakdown ────────────────────────────────────────────
  // (scope was already computed above so itemIndex could see prelim/PC/
  // variation identities — same single source of truth for both layers.)
  const grossFromItems = scope.measured.planned;
  const contractSum = safeNum(project?.contract?.contractSum);
  const contractLocked = scope.contractLocked;

  // BAC priority:
  //   • Contract LOCKED → always projectTotal (frozen BoQ value + any
  //     post-lock variations). The override is ignored so the books
  //     can't drift away from the locked contract.
  //   • Contract UNLOCKED → user-set budgetOverride wins, then projectTotal,
  //     then legacy fallbacks for projects without scope set up.
  const projectTotal = scope.projectTotal;
  const BAC = contractLocked
    ? (projectTotal || contractSum || totalBaseline || grossFromItems)
    : (safeNum(pm.budgetOverride) ||
       projectTotal ||
       contractSum ||
       totalBaseline ||
       grossFromItems);

  // BoQ-derived EV / AC — replaces the task-only numbers for the dashboard's
  // cost-side metrics so prelim, PC and variation work all flow through.
  // PV stays task-based (it's a schedule projection); SPI then expresses
  // "is the cost-earned tracking the schedule-planned?" which is the
  // standard EVM meaning of SPI.
  const totalScopeEarned = scope.totalEarned;
  const totalScopeActual = scope.totalActual;

  // Budget reference: BoQ project total when available, else locked contract
  // sum, else gross of measured. Drives the "plan vs contract" indicator.
  const budgetReference = projectTotal || contractSum || grossFromItems;
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

  const CPI = totalScopeActual > 0
    ? totalScopeEarned / totalScopeActual
    : totalScopeEarned > 0 ? 1 : 0;

  // Effective PV for display.
  //
  // The raw calculation returns 0 when "today" is before every task's
  // baselineStart (common case: project planned for the future but user
  // has already started recording progress on tasks). Mathematically PV
  // = 0 is correct per EVM — "nothing should have been earned per the
  // baseline by today" — but the dashboard then shows "PV ₦0 / EV ₦2.8M"
  // which looks broken to users.
  //
  // When EV > 0 but PV = 0, anchor PV to EV. This represents
  // "you're running ahead of schedule, so by today the plan should have
  // earned at least what you have" → SPI = 1.00 (on track).
  //
  // When PV > 0 normally, leave it alone.
  const displayPV = totalPlannedValueToDate > 0
    ? totalPlannedValueToDate
    : (totalScopeEarned > 0 ? totalScopeEarned : 0);

  const SPI = displayPV > 0
    ? totalScopeEarned / displayPV
    : totalScopeEarned > 0 ? 1 : 0;
  const budgetUsedPercent = BAC > 0 ? (totalScopeActual / BAC) * 100 : 0;
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
  // Diagnose the burndown empty state. The UI uses this to show the
  // right "fix this" prompt instead of a generic "burndown unavailable".
  let burndownStatus = "ok";
  if (!isFiniteDate(projectStart) || !isFiniteDate(projectFinish)) {
    burndownStatus = "no-dates";
  } else if (projectFinish.getTime() <= projectStart.getTime()) {
    burndownStatus = "invalid-dates";
  } else if (enriched.length === 0) {
    burndownStatus = "no-tasks";
  } else if (totalBaseline === 0) {
    burndownStatus = "no-baseline";
  }

  const openRisks = risks.filter((r) => r?.status !== "closed").length;
  const openIssues = issues.filter((i) => i?.status !== "resolved" && i?.status !== "closed").length;

  // ── BoQ ↔ WBS coverage reconciliation ───────────────────────────────
  // Walk every BoQ entry (measured + prelim + PC + variation) and
  // classify by how the WBS covers it:
  //   • unlinked      → no task touches this line
  //   • under         → some task(s) link to it but total weight < 100
  //                      (gap in WBS — part of the BoQ value is missing
  //                      from the plan, so SPI/CPI will under-state)
  //   • fully         → total weight == 100 (single task at 100% OR
  //                      multiple tasks summing to 100%)
  //   • over          → total weight > 100 (same BoQ value counted
  //                      multiple times in EV — inflated CPI/SPI)
  //
  // The "amount at risk" for over-allocation is the EXCESS portion,
  // not the full line. So a ₦1M line with 160% allocation contributes
  // ₦600K to overAllocatedAmount, not ₦1.6M.
  //
  // Returned to the client so the dashboard can render a single panel
  // that answers: "is the WBS a faithful execution plan for the BoQ?"
  const boqCoverage = {
    totalAmount: 0,
    linkedAmount: 0,         // weighted (totalWeight/100 × amount), capped at amount
    unlinkedAmount: 0,
    underAllocatedAmount: 0, // shortfall = (100 - totalWeight)/100 × amount
    overAllocatedAmount: 0,  // excess = (totalWeight - 100)/100 × amount
    unlinkedCount: 0,
    fullyAllocatedCount: 0,
    underAllocatedCount: 0,
    overAllocatedCount: 0,
    totalCount: 0,
    // Tasks pointing at BoQ identities that no longer exist (renamed,
    // deleted, or re-keyed by sn change). These silently drop to ₦0
    // baseline so we surface them as "needs re-link" rather than
    // letting the numbers quietly mis-state.
    staleLinkTasks: [],
    // List of the worst offenders so the panel can guide the user
    // straight to the BoQ rows that need rebalancing. Top 8 each.
    topUnlinked: [],
    topOver: [],
    topUnder: [],
  };

  // Build a fast lookup of every valid scope identity for stale-link
  // detection below.
  const validIdentities = new Set(scope.virtualItems.map((v) => v.identity));
  for (const t of enriched) {
    if (t._isSummary) continue;
    const links = Array.isArray(t.linkedBoqIdentities) ? t.linkedBoqIdentities : [];
    if (!links.length) continue;
    const stale = links.filter((id) => id && !validIdentities.has(String(id)));
    if (stale.length > 0) {
      boqCoverage.staleLinkTasks.push({
        taskId: t.taskId || null,
        wbs: t.wbs || "",
        name: t.name || `Task ${t.taskId || ""}`,
        staleCount: stale.length,
        totalLinks: links.length,
      });
    }
  }
  boqCoverage.staleLinkTasks = boqCoverage.staleLinkTasks.slice(0, 12);

  for (const v of scope.virtualItems) {
    if (!v || !v.identity) continue;
    boqCoverage.totalCount += 1;
    const amount = safeNum(v.amount);
    boqCoverage.totalAmount += amount;
    const totalWeight = safeNum(totalWeightByIdentity.get(v.identity));

    if (totalWeight <= 0) {
      // No task links here — full BoQ value is unallocated.
      boqCoverage.unlinkedCount += 1;
      boqCoverage.unlinkedAmount += amount;
      // Capture every unlinked entry — including ₦0 rows like
      // unprovisioned PC sums. Users explicitly asked to see which
      // items aren't covered, even when the financial impact is 0.
      // The client tile becomes hover-able to reveal this list.
      boqCoverage.topUnlinked.push({
        identity: v.identity,
        kind: v.kind,
        description: v.description,
        amount,
        totalWeight: 0,
      });
    } else if (Math.abs(totalWeight - 100) < 0.5) {
      // Effectively balanced (allow 0.5% tolerance for float drift).
      boqCoverage.fullyAllocatedCount += 1;
      boqCoverage.linkedAmount += amount;
    } else if (totalWeight < 100) {
      // Some coverage but short — partial WBS gap.
      boqCoverage.underAllocatedCount += 1;
      const linkedShare = (totalWeight / 100) * amount;
      const shortfall = amount - linkedShare;
      boqCoverage.linkedAmount += linkedShare;
      boqCoverage.underAllocatedAmount += shortfall;
      if (shortfall > 0) {
        boqCoverage.topUnder.push({
          identity: v.identity,
          kind: v.kind,
          description: v.description,
          amount,
          totalWeight,
          shortfall,
          taskNames: linkedTaskNamesByIdentity.get(v.identity) || [],
        });
      }
    } else {
      // Over-allocated: the EXCESS portion is the double-count risk.
      // Linked amount is capped at the line's value (we never count
      // more than 100% of the BoQ line into "linked").
      boqCoverage.overAllocatedCount += 1;
      const excess = ((totalWeight - 100) / 100) * amount;
      boqCoverage.linkedAmount += amount; // capped at amount
      boqCoverage.overAllocatedAmount += excess;
      boqCoverage.topOver.push({
        identity: v.identity,
        kind: v.kind,
        description: v.description,
        amount,
        totalWeight,
        excess,
        taskNames: linkedTaskNamesByIdentity.get(v.identity) || [],
      });
    }
  }

  // Sort + trim the offender lists. Highest-impact entries surface
  // first so the user fixes biggest gaps first.
  boqCoverage.topUnlinked.sort((a, b) => b.amount - a.amount);
  // Unlinked list capped at 20 (was 8) so users with a few-dozen
  // misses can still see the full set when hovering the tile.
  boqCoverage.topUnlinked = boqCoverage.topUnlinked.slice(0, 20);
  boqCoverage.topOver.sort((a, b) => b.excess - a.excess);
  boqCoverage.topOver = boqCoverage.topOver.slice(0, 8);
  boqCoverage.topUnder.sort((a, b) => b.shortfall - a.shortfall);
  boqCoverage.topUnder = boqCoverage.topUnder.slice(0, 8);

  boqCoverage.coveragePercent =
    boqCoverage.totalAmount > 0
      ? Math.round((boqCoverage.linkedAmount / boqCoverage.totalAmount) * 1000) / 10
      : 0;
  // Round monetary fields for client display.
  boqCoverage.totalAmount = Math.round(boqCoverage.totalAmount * 100) / 100;
  boqCoverage.linkedAmount = Math.round(boqCoverage.linkedAmount * 100) / 100;
  boqCoverage.unlinkedAmount = Math.round(boqCoverage.unlinkedAmount * 100) / 100;
  boqCoverage.underAllocatedAmount = Math.round(boqCoverage.underAllocatedAmount * 100) / 100;
  boqCoverage.overAllocatedAmount = Math.round(boqCoverage.overAllocatedAmount * 100) / 100;

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
      // budgetOverride is the user-set value from the Project Header modal.
      // BAC above is the *resolved* number (override OR contract OR baseline
      // OR gross). Exposing override separately lets the header modal show
      // the actual saved override (0 = "auto-derive") instead of accidentally
      // round-tripping the computed BAC as the override.
      budgetOverride: Math.round(safeNum(pm.budgetOverride) * 100) / 100,
      // Contract-lock flag duplicated on totals so the header modal can
      // disable the BAC override input without having to dig into scope.
      contractLocked,
      PV: Math.round(displayPV * 100) / 100,
      // EV / AC now reflect the BoQ-side reality (measured + PC + prelim +
      // variations), not just the task baselines. The task-only equivalents
      // are still exposed below under taskEarned / taskActual for callers
      // that want them.
      EV: Math.round(totalScopeEarned * 100) / 100,
      AC: Math.round(totalScopeActual * 100) / 100,
      VAC: Math.round((BAC - (CPI > 0 ? BAC / CPI : BAC)) * 100) / 100,
      EAC: Math.round((CPI > 0 ? BAC / CPI : BAC) * 100) / 100,
      totalBaseline: Math.round(totalBaseline * 100) / 100,
      linkedBaseline: Math.round(linkedBaseline * 100) / 100,
      manualBaseline: Math.round(manualBaseline * 100) / 100,
      contractSum: Math.round(contractSum * 100) / 100,
      grossFromItems: Math.round(grossFromItems * 100) / 100,
      projectTotal: Math.round(projectTotal * 100) / 100,
      budgetReference: Math.round(budgetReference * 100) / 100,
      varianceVsBudget: Math.round(variance * 100) / 100,
      // Per-stream contributions to BAC — surfaces for the EV summary
      // footer so the user can see WHERE the budget comes from.
      measuredAmount: Math.round(scope.measured.planned * 100) / 100,
      provisionalAmount: Math.round(scope.provisional.total * 100) / 100,
      preliminaryPool: Math.round(scope.preliminary.pool * 100) / 100,
      variationsAmount: Math.round(scope.variations.total * 100) / 100,
      // Task-only equivalents (left in for transparency / debugging).
      taskEarned: Math.round(totalEarned * 100) / 100,
      taskActual: Math.round(totalActual * 100) / 100,
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
    // Total-task breakdowns — independent of overdue status. Surfaces
    // priority + status distribution across the whole WBS so the
    // dashboard can show "12 critical / 3 high / 18 medium" even
    // when nothing is overdue yet (which was the previous gap —
    // overdueByPriority showed all zeros until tasks slipped).
    tasksByPriority,
    tasksByStatus,
    // Critical-path totals from MS Project import. `criticalPathTotal`
    // counts every task with criticalPath=true; `criticalPathPending`
    // narrows to those not yet completed (the actual exposure to
    // schedule risk today).
    criticalPathTotal,
    criticalPathPending,
    burndown,
    burndownStatus,
    tasks: enriched.map((t) => ({
      ...t,
      // Strip internal-only fields but expose them under public names so
      // the client can render summary rows, indent by depth, etc.
      _computed: undefined,
      _rollup: undefined,
      _isSummary: undefined,
      _wbsDepth: undefined,
      _parentWbs: undefined,
      computed: t._computed,
      rollup: t._rollup || null,
      isSummary: Boolean(t._isSummary),
      wbsDepth: safeNum(t._wbsDepth),
      parentWbs: t._parentWbs || null,
    })),
    risks,
    issues,
    // Full project-scope catalogue — measured BoQ lines + virtual entries
    // for preliminaries, provisional sums, and variations. Each entry has
    // a `kind` field ("measured" | "preliminary" | "provisional" |
    // "variation") so the heatmap can group/colour them and the task
    // modal picker can filter to kind === "measured" only.
    //
    // linkCount / linkedTaskNames let the BoQ table show users a "this
    // line is linked to N task(s)" chip, with a warning style when N>1
    // (potential double-count in EV).
    boqItems: scope.virtualItems.map((item) => {
      // Effective percent for the heatmap. Measured items keep their
      // own value (the partial-aware percent from buildItemIndex).
      // Prelim / PC / variation items get the weighted-average of
      // linked task percentComplete — so a half-done task linked to a
      // PC sum colours that PC cell yellow, not blank. If a non-
      // measured item is explicitly `completed`, that wins (100).
      let effectivePercent = safeNum(item.percentComplete);
      if (
        (item.kind === "preliminary" ||
          item.kind === "provisional" ||
          item.kind === "variation") &&
        !item.completed
      ) {
        const num = progressNumByIdentity.get(item.identity);
        const den = progressDenByIdentity.get(item.identity);
        if (num != null && den != null && den > 0) {
          effectivePercent = clamp(num / den, 0, 100);
        }
      }
      return {
        ...item,
        percentComplete: Math.round(effectivePercent * 100) / 100,
        linkCount: linkCountByIdentity.get(item.identity) || 0,
        linkedTaskNames: linkedTaskNamesByIdentity.get(item.identity) || [],
        // Sum of weights across all linking tasks. 100 = balanced;
        // <100 = WBS doesn't cover the full BoQ value; >100 = double-count
        // in EV. Surfaced as the WbsLinkChip's primary signal.
        totalLinkWeight: Math.round(
          (totalWeightByIdentity.get(item.identity) || 0) * 100,
        ) / 100,
      };
    }),
    // Roll-up totals per stream — exposed separately for callers that
    // want to display a contract-breakdown summary without re-computing.
    scope: {
      measured: scope.measured,
      provisional: scope.provisional,
      variations: scope.variations,
      preliminary: scope.preliminary,
      projectTotal: scope.projectTotal,
      contractLocked: scope.contractLocked,
    },
    // BoQ ↔ WBS coverage reconciliation. Lets the dashboard answer
    // "does the WBS faithfully execute the BoQ?" — surfaces gaps
    // (unlinked / under-allocated) AND over-counts (>100% weight)
    // that would otherwise quietly distort EV / CPI / SPI.
    boqCoverage,
  };
}

export { itemIdentity as _itemIdentity };
