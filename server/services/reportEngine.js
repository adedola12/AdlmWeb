// Report engine — assembles the data payloads behind the exportable
// Project / PM / Management reports.
//
// Pure functions over already-loaded TakeoffProject documents (lean or
// hydrated): no DB access and no I/O here, mirroring pmCompute.js. The
// routes in routes/reports.js do the loading + access checks and hand
// documents in; the client renders these payloads into the uniform
// report layout (features/reports) and exports to PDF.

import { computePmDashboard, computeProjectScope } from "./pmCompute.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(safeNum(v) * 100) / 100;
}

function round1(v) {
  return Math.round(safeNum(v) * 10) / 10;
}

function isoOrNull(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Display labels for the desktop products. Mirrors the client-side map in
// PortfolioDashboard.jsx — keep both in sync when a product is added.
export const PRODUCT_LABELS = {
  revit: "QUIV (Revit)",
  "revit-materials": "QUIV Materials",
  planswift: "HERON (PlanSwift)",
  "planswift-materials": "HERON Materials",
  mep: "MEP",
  "mep-materials": "MEP Materials",
  revitmep: "Revit MEP",
  "revitmep-materials": "Revit MEP Materials",
  civil3d: "Civil 3D",
  "civil3d-materials": "Civil 3D Materials",
};

export function productLabel(key) {
  const k = String(key || "").trim().toLowerCase();
  return PRODUCT_LABELS[k] || (k ? k.toUpperCase() : "Unknown");
}

// ── Shared helpers ─────────────────────────────────────────────────────────

// Group the measured virtual items by trade (falling back to category) and
// roll up planned/earned per group. Returns groups sorted by planned value,
// capped at `limit` with the remainder folded into "Other".
function progressByGroup(virtualItems, { limit = 10 } = {}) {
  const groups = new Map();
  for (const it of virtualItems) {
    if (it.kind !== "measured") continue;
    const label =
      String(it.trade || "").trim() ||
      String(it.category || "").trim() ||
      "Ungrouped";
    let g = groups.get(label);
    if (!g) {
      g = { label, planned: 0, earned: 0, itemCount: 0, completedCount: 0 };
      groups.set(label, g);
    }
    g.planned += safeNum(it.amount);
    g.earned += safeNum(it.amount) * (safeNum(it.percentComplete) / 100);
    g.itemCount += 1;
    if (it.completed) g.completedCount += 1;
  }
  const sorted = [...groups.values()].sort((a, b) => b.planned - a.planned);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  if (tail.length) {
    const other = tail.reduce(
      (acc, g) => {
        acc.planned += g.planned;
        acc.earned += g.earned;
        acc.itemCount += g.itemCount;
        acc.completedCount += g.completedCount;
        return acc;
      },
      { label: "Other", planned: 0, earned: 0, itemCount: 0, completedCount: 0 },
    );
    head.push(other);
  }
  return head.map((g) => ({
    label: g.label,
    planned: round2(g.planned),
    earned: round2(g.earned),
    percent: g.planned > 0 ? round1((g.earned / g.planned) * 100) : 0,
    itemCount: g.itemCount,
    completedCount: g.completedCount,
  }));
}

// Budget & procurement rollup from budgetItems. Budget value per line is
// qty × budgetRate (the internal cost plan); procurement status comes from
// the procured / procuredPercent / targetDate fields.
function budgetSummary(project) {
  const items = Array.isArray(project?.budgetItems) ? project.budgetItems : [];
  if (!items.length) return null;

  let budgetTotal = 0;
  let procuredValue = 0;
  let procuredCount = 0;
  const upcoming = [];
  const byGroup = new Map();

  for (const it of items) {
    const amount = safeNum(it.qty) * safeNum(it.budgetRate ?? it.rate);
    budgetTotal += amount;
    const pct = it.procured ? 100 : Math.min(100, Math.max(0, safeNum(it.procuredPercent)));
    procuredValue += amount * (pct / 100);
    if (it.procured) procuredCount += 1;

    const label =
      String(it.trade || "").trim() ||
      String(it.category || "").trim() ||
      "Ungrouped";
    let g = byGroup.get(label);
    if (!g) {
      g = { label, budget: 0, procured: 0, itemCount: 0 };
      byGroup.set(label, g);
    }
    g.budget += amount;
    g.procured += amount * (pct / 100);
    g.itemCount += 1;

    if (!it.procured && it.targetDate) {
      upcoming.push({
        description: String(it.description || it.materialName || "").slice(0, 160),
        trade: label,
        amount: round2(amount),
        targetDate: isoOrNull(it.targetDate),
        supplier: String(it.supplier || ""),
      });
    }
  }

  upcoming.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

  return {
    itemCount: items.length,
    budgetTotal: round2(budgetTotal),
    procuredValue: round2(procuredValue),
    procuredCount,
    pendingCount: items.length - procuredCount,
    procuredPercent: budgetTotal > 0 ? round1((procuredValue / budgetTotal) * 100) : 0,
    byGroup: [...byGroup.values()]
      .sort((a, b) => b.budget - a.budget)
      .slice(0, 12)
      .map((g) => ({
        label: g.label,
        budget: round2(g.budget),
        procured: round2(g.procured),
        percent: g.budget > 0 ? round1((g.procured / g.budget) * 100) : 0,
        itemCount: g.itemCount,
      })),
    upcoming: upcoming.slice(0, 10),
  };
}

function certificateSummary(project) {
  const certs = Array.isArray(project?.certificates) ? project.certificates : [];
  if (!certs.length) return { list: [], totalCertified: 0, totalPaid: 0 };
  const list = certs.map((c) => ({
    number: c.number,
    date: isoOrNull(c.date),
    periodStart: isoOrNull(c.periodStart),
    periodEnd: isoOrNull(c.periodEnd),
    cumulativeValue: round2(c.cumulativeValue),
    thisCertificate: round2(c.thisCertificate),
    retentionAmount: round2(c.retentionAmount),
    netPayable: round2(c.netPayable),
    status: c.status || "draft",
  }));
  const approvedOrPaid = list.filter((c) => c.status !== "draft");
  return {
    list,
    totalCertified: round2(
      approvedOrPaid.reduce((acc, c) => acc + safeNum(c.thisCertificate), 0),
    ),
    totalPaid: round2(
      list
        .filter((c) => c.status === "paid")
        .reduce((acc, c) => acc + safeNum(c.netPayable), 0),
    ),
  };
}

function metaFor(project, now) {
  return {
    id: String(project._id || ""),
    name: project.name || "Project",
    productKey: project.productKey || "",
    productLabel: productLabel(project.productKey),
    modelTitle: project.modelTitle || "",
    version: Number(project.version) || 1,
    pmTrackerOnly: !!project.pmTrackerOnly,
    createdAt: isoOrNull(project.createdAt),
    updatedAt: isoOrNull(project.updatedAt),
    collaboratorCount: (project.collaborators || []).length,
    contractLocked: !!project?.contract?.locked,
    generatedAt: now.toISOString(),
  };
}

// ── Project report ─────────────────────────────────────────────────────────
// Client / QS-facing progress report for a single project: contract value
// breakdown, progress by trade, valuation & certificates, budget &
// procurement. Money is assumed visible — the route enforces canSeeRates
// before calling this (reports are inherently financial documents).
export function buildProjectReport(project, { now = new Date() } = {}) {
  const scope = computeProjectScope(project);
  const contract = project?.contract || {};

  const subtotal =
    safeNum(scope.measured.planned) +
    safeNum(scope.provisional.total) +
    safeNum(scope.preliminary.pool);
  const contingencyAmount = (subtotal * safeNum(contract.contingencyPercent)) / 100;
  const taxAmount = ((subtotal + contingencyAmount) * safeNum(contract.taxPercent)) / 100;

  const progressPercent =
    scope.projectTotal > 0
      ? round1((safeNum(scope.totalEarned) / scope.projectTotal) * 100)
      : 0;

  const fa = project?.finalAccount || {};

  return {
    type: "project",
    meta: metaFor(project, now),
    currency: "NGN",
    financials: {
      measured: {
        planned: round2(scope.measured.planned),
        earned: round2(scope.measured.earned),
        actual: round2(scope.measured.actual),
        count: scope.measured.count,
      },
      provisional: {
        total: round2(scope.provisional.total),
        earned: round2(scope.provisional.earned),
        count: scope.provisional.count,
        completedCount: scope.provisional.completedCount,
      },
      variations: {
        total: round2(scope.variations.total),
        earned: round2(scope.variations.earned),
        count: scope.variations.count,
        completedCount: scope.variations.completedCount,
      },
      preliminary: {
        pool: round2(scope.preliminary.pool),
        earned: round2(scope.preliminary.earned),
        percent: round1(scope.preliminary.percent),
        itemCount: scope.preliminary.itemCount,
        completedCount: scope.preliminary.completedCount,
      },
      subtotal: round2(subtotal),
      contingencyPercent: round1(contract.contingencyPercent),
      contingencyAmount: round2(contingencyAmount),
      taxPercent: round1(contract.taxPercent),
      taxAmount: round2(taxAmount),
      projectTotal: round2(scope.projectTotal),
      totalEarned: round2(scope.totalEarned),
      totalActual: round2(scope.totalActual),
      progressPercent,
      contract: {
        locked: !!contract.locked,
        lockedAt: isoOrNull(contract.lockedAt),
        approvedAt: isoOrNull(contract.approvedAt),
        contractSum: round2(contract.contractSum),
      },
    },
    progressByTrade: progressByGroup(scope.virtualItems),
    certificates: certificateSummary(project),
    finalAccount: fa.finalized
      ? {
          finalized: true,
          finalizedAt: isoOrNull(fa.finalizedAt),
          agreedContractSum: round2(fa.agreedContractSum),
          finalContractValue: round2(fa.finalContractValue),
          totalCertifiedToDate: round2(fa.totalCertifiedToDate),
          savings: round2(fa.savings),
        }
      : null,
    budget: budgetSummary(project),
  };
}

// ── PM report ──────────────────────────────────────────────────────────────
// Schedule & earned-value report — the PM dashboard payload plus report
// meta. The dashboard's heavy per-line arrays are trimmed to what the
// printed document actually shows.
export function buildPmReport(project, { now = new Date() } = {}) {
  const dash = computePmDashboard(project, { now });

  // Leaf tasks only (summaries are structure, not work), worst schedule
  // slip first, capped for print.
  const leafTasks = (dash.tasks || []).filter((t) => !t.isSummary);
  const printTasks = leafTasks
    .map((t) => ({
      wbs: t.wbs || "",
      name: t.name || "",
      startDate: isoOrNull(t.startDate),
      endDate: isoOrNull(t.endDate),
      percentComplete: round1(t.percentComplete),
      status: t.status || "not-started",
      priority: t.priority || "medium",
      isMilestone: !!t.isMilestone,
      criticalPath: !!t.criticalPath,
      baselineCost: round2(t.computed?.baselineCost),
      earnedValue: round2(t.computed?.earnedValue),
      isOverdue: !!t.computed?.isOverdue,
      scheduleVarianceDays: safeNum(t.computed?.scheduleVarianceDays),
      assignedTo: t.assignedTo || t.resourceNames || "",
    }))
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return b.baselineCost - a.baselineCost;
    });

  return {
    type: "pm",
    meta: metaFor(project, now),
    currency: "NGN",
    projectStart: dash.projectStart,
    projectFinish: dash.projectFinish,
    baselineDate: dash.baselineDate,
    headline: dash.headline,
    totals: dash.totals,
    balance: dash.balance,
    buckets: dash.buckets,
    tasksByPriority: dash.tasksByPriority,
    tasksByStatus: dash.tasksByStatus,
    overdueByPriority: dash.overdueByPriority,
    criticalPathTotal: dash.criticalPathTotal,
    criticalPathPending: dash.criticalPathPending,
    burndown: dash.burndown || [],
    burndownStatus: dash.burndownStatus,
    boqCoverage: dash.boqCoverage
      ? {
          coveragePercent: dash.boqCoverage.coveragePercent,
          totalAmount: dash.boqCoverage.totalAmount,
          linkedAmount: dash.boqCoverage.linkedAmount,
          unlinkedAmount: dash.boqCoverage.unlinkedAmount,
          unlinkedCount: dash.boqCoverage.unlinkedCount,
        }
      : null,
    tasks: printTasks.slice(0, 60),
    taskCountTotal: leafTasks.length,
    risks: (dash.risks || []).map((r) => ({
      title: r.title || "",
      probability: r.probability || "medium",
      impact: r.impact || "medium",
      status: r.status || "open",
      owner: r.owner || "",
      mitigation: String(r.mitigation || "").slice(0, 300),
    })),
    issues: (dash.issues || []).map((i) => ({
      title: i.title || "",
      severity: i.severity || "medium",
      status: i.status || "open",
      owner: i.owner || "",
      openedAt: isoOrNull(i.openedAt),
      resolvedAt: isoOrNull(i.resolvedAt),
    })),
  };
}

// ── Management report ──────────────────────────────────────────────────────
// Organization-wide portfolio report across every project the user owns or
// collaborates on, spanning all products. Money on collaborator projects is
// masked unless the user can see rates there (active RateGen entitlement);
// masked projects still contribute progress/schedule stats, and the org
// money totals note the omission via moneyPartial.
export function buildManagementReport(entries, { user = null, now = new Date() } = {}) {
  const rows = [];
  const byProduct = new Map();
  const statusDist = { completed: 0, onTrack: 0, atRisk: 0, behind: 0, notStarted: 0 };
  const totals = {
    projectCount: entries.length,
    ownedCount: 0,
    sharedCount: 0,
    portfolioValue: 0,
    earnedValue: 0,
    actualCost: 0,
    openRisks: 0,
    openIssues: 0,
    overdueTasks: 0,
    totalTasks: 0,
    completedTasks: 0,
  };
  let moneyPartial = false;

  for (const { project, role, canSeeMoney } of entries) {
    let dash;
    try {
      dash = computePmDashboard(project, { now });
    } catch {
      continue; // a malformed project must not sink the whole report
    }
    const scope = dash.scope || {};
    const value = safeNum(scope.projectTotal);
    const earned = safeNum(dash.totals?.EV);
    const actual = safeNum(dash.totals?.AC);
    const progress = value > 0 ? round1((earned / value) * 100) : round1(dash.headline?.tasksDonePercent);
    const spi = safeNum(dash.headline?.SPI);
    const cpi = safeNum(dash.headline?.CPI);
    const totalTasks = safeNum(dash.totals?.totalTasks);

    if (role === "owner") totals.ownedCount += 1;
    else totals.sharedCount += 1;

    if (canSeeMoney) {
      totals.portfolioValue += value;
      totals.earnedValue += earned;
      totals.actualCost += actual;
    } else {
      moneyPartial = true;
    }
    totals.openRisks += safeNum(dash.totals?.openRisks);
    totals.openIssues += safeNum(dash.totals?.openIssues);
    totals.overdueTasks += safeNum(dash.headline?.overdueCount);
    totals.totalTasks += totalTasks;
    totals.completedTasks += safeNum(dash.totals?.completedTasks);

    if (progress >= 99.95) statusDist.completed += 1;
    else if (progress <= 0.05 && totalTasks === 0) statusDist.notStarted += 1;
    else if (totalTasks > 0 && spi > 0 && spi < 0.8) statusDist.behind += 1;
    else if (totalTasks > 0 && spi > 0 && spi < 0.95) statusDist.atRisk += 1;
    else statusDist.onTrack += 1;

    const key = String(project.productKey || "").toLowerCase();
    let prod = byProduct.get(key);
    if (!prod) {
      prod = { productKey: key, label: productLabel(key), count: 0, value: 0, earned: 0 };
      byProduct.set(key, prod);
    }
    prod.count += 1;
    if (canSeeMoney) {
      prod.value += value;
      prod.earned += earned;
    }

    rows.push({
      id: String(project._id || ""),
      name: project.name || "Project",
      productKey: key,
      productLabel: productLabel(key),
      role,
      contractLocked: !!scope.contractLocked,
      progressPercent: progress,
      value: canSeeMoney ? round2(value) : null,
      earned: canSeeMoney ? round2(earned) : null,
      actual: canSeeMoney ? round2(actual) : null,
      cpi: totalTasks > 0 ? cpi : null,
      spi: totalTasks > 0 ? spi : null,
      totalTasks,
      completedTasks: safeNum(dash.totals?.completedTasks),
      overdueCount: safeNum(dash.headline?.overdueCount),
      openRisks: safeNum(dash.totals?.openRisks),
      openIssues: safeNum(dash.totals?.openIssues),
      moneyMasked: !canSeeMoney,
      updatedAt: isoOrNull(project.updatedAt),
    });
  }

  rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  return {
    type: "management",
    currency: "NGN",
    generatedAt: now.toISOString(),
    organization: {
      name: user?.firmName || "",
      preparedBy:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.username ||
        user?.email ||
        "",
      email: user?.email || "",
    },
    totals: {
      ...totals,
      portfolioValue: round2(totals.portfolioValue),
      earnedValue: round2(totals.earnedValue),
      actualCost: round2(totals.actualCost),
      portfolioProgressPercent:
        totals.portfolioValue > 0
          ? round1((totals.earnedValue / totals.portfolioValue) * 100)
          : 0,
      moneyPartial,
    },
    statusDistribution: statusDist,
    byProduct: [...byProduct.values()]
      .sort((a, b) => b.value - a.value)
      .map((p) => ({
        ...p,
        value: round2(p.value),
        earned: round2(p.earned),
        percent: p.value > 0 ? round1((p.earned / p.value) * 100) : 0,
      })),
    projects: rows,
  };
}
