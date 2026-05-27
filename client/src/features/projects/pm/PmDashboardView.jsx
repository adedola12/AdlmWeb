import React from "react";
import {
  FaPlus,
  FaExclamationTriangle,
  FaBug,
  FaMagic,
  FaFileImport,
  FaSyncAlt,
  FaCheckCircle,
  FaTimesCircle,
  FaArrowRight,
  FaListUl,
  FaBalanceScale,
  FaTachometerAlt,
  FaCoins,
  FaClock,
  FaChartLine,
  FaTasks,
  FaTimes,
  FaUnlink,
  FaCopy,
  FaLayerGroup,
} from "react-icons/fa";
import PmBoqHeatmap from "./PmBoqHeatmap.jsx";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMoneyDec(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────
// Six headline tiles — each uses a gradient consistent with the ADLM
// design language. CPI / SPI swap tone (success / warning / danger)
// based on EVM thresholds.
// ─────────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, icon: Icon, gradient }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-md ${gradient}`}
    >
      <div className="absolute -right-4 -top-4 opacity-20 text-6xl">
        {Icon ? <Icon /> : null}
      </div>
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-widest opacity-90">
          {label}
        </div>
        <div className="mt-1 text-3xl font-bold leading-none">{value}</div>
        {sub ? <div className="mt-1.5 text-[11px] opacity-90">{sub}</div> : null}
      </div>
    </div>
  );
}

function gradientFor(tone) {
  switch (tone) {
    case "primary":
      return "bg-gradient-to-br from-adlm-blue-700 to-blue-800";
    case "success":
      return "bg-gradient-to-br from-emerald-500 to-emerald-700";
    case "info":
      return "bg-gradient-to-br from-sky-500 to-sky-700";
    case "warning":
      return "bg-gradient-to-br from-amber-500 to-orange-600";
    case "danger":
      return "bg-gradient-to-br from-rose-500 to-rose-700";
    case "purple":
      return "bg-gradient-to-br from-purple-500 to-purple-700";
    default:
      return "bg-gradient-to-br from-slate-500 to-slate-700";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Tasks donut (gradient ring)
// ─────────────────────────────────────────────────────────────────────
function TasksDonut({ buckets, totalTasks }) {
  const completed = safeNum(buckets?.completed);
  const inProgress = safeNum(buckets?.inProgress);
  const blocked = safeNum(buckets?.blocked);
  const notStarted = safeNum(buckets?.notStarted);
  const total = totalTasks || completed + inProgress + blocked + notStarted;

  if (total === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-slate-400">
        No tasks yet
      </div>
    );
  }
  const c1 = (completed / total) * 100;
  const c2 = c1 + (inProgress / total) * 100;
  const c3 = c2 + (blocked / total) * 100;
  const bg = `conic-gradient(
    #10b981 0 ${c1}%,
    #f59e0b ${c1}% ${c2}%,
    #ef4444 ${c2}% ${c3}%,
    #e2e8f0 ${c3}% 100%
  )`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-40 w-40 rounded-full shadow-inner" style={{ background: bg }}>
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <div className="text-2xl font-bold text-slate-900">
            {Math.round((completed / total) * 100)}%
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Done</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] w-full">
        <Legend color="#10b981" label="Completed" count={completed} />
        <Legend color="#f59e0b" label="In progress" count={inProgress} />
        <Legend color="#ef4444" label="Blocked" count={blocked} />
        <Legend color="#e2e8f0" label="Not started" count={notStarted} />
      </div>
    </div>
  );
}
function Legend({ color, label, count }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto font-semibold text-slate-900">{count}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Budget bars (BAC / EV / AC)
// ─────────────────────────────────────────────────────────────────────
function BudgetBars({ BAC, EV, AC }) {
  const max = Math.max(BAC, EV, AC, 1);
  const rows = [
    { label: "Budget (BAC)", value: BAC, gradient: "from-sky-400 to-sky-600" },
    { label: "Earned (EV)", value: EV, gradient: "from-emerald-400 to-emerald-600" },
    { label: "Actual (AC)", value: AC, gradient: "from-rose-400 to-rose-600" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
            <span>{row.label}</span>
            <span className="font-semibold text-slate-900">₦{fmtMoney(row.value)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full bg-gradient-to-r ${row.gradient} rounded-full`}
              style={{ width: `${Math.min(100, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Priority breakdown — shows TOTAL count per priority (filled bar) with
// the overdue count overlaid (deeper colour). Lets the user see "I have
// 18 medium-priority tasks total, 3 of which are overdue" in one row,
// rather than the old single-purpose overdue-only chart that read 0
// across the board until tasks slipped.
function OverdueBars({ overdueByPriority, tasksByPriority }) {
  const labels = ["critical", "high", "medium", "low"];
  const totalShades = {
    critical: "bg-rose-200",
    high: "bg-amber-200",
    medium: "bg-sky-200",
    low: "bg-slate-200",
  };
  const overdueShades = {
    critical: "bg-rose-600",
    high: "bg-rose-500",
    medium: "bg-amber-500",
    low: "bg-slate-500",
  };
  const max = Math.max(
    1,
    ...labels.map((k) => safeNum(tasksByPriority?.[k])),
    ...labels.map((k) => safeNum(overdueByPriority?.[k])),
  );
  const hasAnyTask = labels.some((k) => safeNum(tasksByPriority?.[k]) > 0)
    || safeNum(tasksByPriority?.none) > 0;
  const noneCount = safeNum(tasksByPriority?.none);
  return (
    <div className="space-y-2.5">
      {labels.map((k) => {
        const total = safeNum(tasksByPriority?.[k]);
        const overdue = safeNum(overdueByPriority?.[k]);
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
              <span className="capitalize">{k}</span>
              <span className="font-semibold text-slate-900">
                {total}
                {overdue > 0 ? (
                  <span className="ml-1 text-rose-600 font-medium">
                    ({overdue} overdue)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {/* Total tasks bar — lighter shade */}
              <div
                className={`absolute inset-y-0 left-0 ${totalShades[k]} rounded-full transition-all`}
                style={{ width: `${(total / max) * 100}%` }}
              />
              {/* Overdue overlay — darker shade, drawn on top */}
              {overdue > 0 ? (
                <div
                  className={`absolute inset-y-0 left-0 ${overdueShades[k]} rounded-full transition-all`}
                  style={{ width: `${(overdue / max) * 100}%` }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {noneCount > 0 ? (
        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          + <strong className="text-slate-600">{noneCount}</strong> task
          {noneCount === 1 ? "" : "s"} with no priority assigned
        </div>
      ) : null}
      {!hasAnyTask ? (
        <div className="text-[10px] text-slate-400 italic text-center py-2">
          No tasks yet — add one to populate priority breakdown.
        </div>
      ) : null}
    </div>
  );
}

function BurndownChart({ burndown, BAC, burndownStatus }) {
  if (!Array.isArray(burndown) || burndown.length === 0) {
    // Pick a specific message based on what's actually missing — the
    // generic "set dates" prompt was misleading when dates ARE set but
    // finish < start, or when no tasks exist yet.
    const message = (
      {
        "invalid-dates": (
          <>
            <strong className="text-rose-700 block">Project dates are invalid.</strong>
            Project finish must be after project start. Edit them in the
            Project header to enable the burndown.
          </>
        ),
        "no-tasks": (
          <>
            <strong className="text-slate-700 block">No tasks yet.</strong>
            Generate tasks from BoQ or import an MS Project file to see
            the burndown.
          </>
        ),
        "no-baseline": (
          <>
            <strong className="text-slate-700 block">No baseline cost.</strong>
            Link tasks to BoQ items (or enter manual baseline cost) so
            the burndown has a value to track against.
          </>
        ),
      }[burndownStatus]
    ) || (
      <>
        Set project start &amp; finish dates to enable burndown.
      </>
    );
    return (
      <div className="flex h-44 items-center justify-center text-center text-xs text-slate-500 px-3 leading-relaxed">
        <div>{message}</div>
      </div>
    );
  }
  const W = 360;
  const H = 160;
  const max = Math.max(BAC, ...burndown.map((p) => safeNum(p.plannedRemaining)));
  const stepX = burndown.length > 1 ? W / (burndown.length - 1) : 0;
  const toY = (val) => H - (safeNum(val) / Math.max(max, 1)) * (H - 16) - 8;

  const plannedPath = burndown
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${toY(p.plannedRemaining)}`)
    .join(" ");
  const actualPoints = burndown.filter((p) => p.actualRemaining != null);
  const actualPath = actualPoints
    .map((p, _i, arr) => {
      const idx = burndown.indexOf(p);
      return `${arr.indexOf(p) === 0 ? "M" : "L"} ${idx * stepX} ${toY(p.actualRemaining)}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
        <defs>
          <linearGradient id="plannedFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${plannedPath} L ${W} ${H} L 0 ${H} Z`} fill="url(#plannedFill)" />
        <path d={plannedPath} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="5 3" />
        {actualPoints.length > 1 ? (
          <path d={actualPath} fill="none" stroke="#dc2626" strokeWidth="2.5" />
        ) : null}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-sky-500" />
          Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-rose-600" />
          Actual
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Balance indicator: linked baseline + manual baseline vs contract sum
// ─────────────────────────────────────────────────────────────────────
function BalanceIndicator({ balance }) {
  const status = balance?.status || "no-data";
  const total = safeNum(balance?.totalBaseline);
  const linked = safeNum(balance?.linkedBaseline);
  const manual = safeNum(balance?.manualBaseline);
  const ref = safeNum(balance?.budgetReference);
  const diff = safeNum(balance?.varianceAmount);
  const pct = safeNum(balance?.variancePercent);

  const config = {
    balanced: {
      icon: FaCheckCircle,
      title: "Plan balanced",
      detail: "PM baseline total equals the BoQ contract sum.",
      bg: "from-emerald-50 to-emerald-100",
      border: "border-emerald-300",
      text: "text-emerald-800",
      iconColor: "text-emerald-600",
    },
    over: {
      icon: FaExclamationTriangle,
      title: "Over budget",
      detail: `PM baseline exceeds ${balance?.contractLocked ? "contract sum" : "BoQ total"} by ₦${fmtMoneyDec(diff)} (${pct.toFixed(1)}%).`,
      bg: "from-rose-50 to-rose-100",
      border: "border-rose-300",
      text: "text-rose-800",
      iconColor: "text-rose-600",
    },
    under: {
      icon: FaExclamationTriangle,
      title: "Under budget",
      detail: `PM baseline is ₦${fmtMoneyDec(Math.abs(diff))} (${Math.abs(pct).toFixed(1)}%) below ${balance?.contractLocked ? "contract sum" : "BoQ total"}. Link more BoQ items or add manual cost.`,
      bg: "from-amber-50 to-amber-100",
      border: "border-amber-300",
      text: "text-amber-800",
      iconColor: "text-amber-600",
    },
    empty: {
      icon: FaTimesCircle,
      title: "No baseline cost yet",
      detail: "Add tasks and link them to BoQ items, or enter manual cost. The dashboard will then track project books.",
      bg: "from-slate-50 to-slate-100",
      border: "border-slate-300",
      text: "text-slate-700",
      iconColor: "text-slate-500",
    },
    "no-data": {
      icon: FaBalanceScale,
      title: "Add tasks and BoQ items to balance the project books",
      detail: "Generate tasks from BoQ, import a schedule, or add tasks manually to start tracking.",
      bg: "from-slate-50 to-slate-100",
      border: "border-slate-300",
      text: "text-slate-700",
      iconColor: "text-slate-500",
    },
  };

  const c = config[status] || config["no-data"];
  const Icon = c.icon;

  return (
    <div
      className={`rounded-2xl border ${c.border} bg-gradient-to-br ${c.bg} p-4 shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 text-xl ${c.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${c.text}`}>{c.title}</div>
          <div className={`mt-0.5 text-xs ${c.text} opacity-90`}>{c.detail}</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Stat label="Linked baseline" value={`₦${fmtMoney(linked)}`} tone="text-emerald-700" />
            <Stat label="Manual baseline" value={`₦${fmtMoney(manual)}`} tone="text-sky-700" />
            <Stat label="PM total" value={`₦${fmtMoney(total)}`} tone="text-slate-900" bold />
            <Stat
              label={balance?.contractLocked ? "Contract sum" : "BoQ total"}
              value={`₦${fmtMoney(ref)}`}
              tone="text-slate-900"
              bold
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900", bold }) {
  return (
    <div className="rounded-lg bg-white/70 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 ${tone} ${bold ? "font-bold" : "font-semibold"} text-sm`}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quick action card (compact, used in the action-strip row)
// ─────────────────────────────────────────────────────────────────────
function ActionCard({ label, icon: Icon, onClick, disabled, color = "blue", subtitle }) {
  const colorClass = {
    blue: "from-adlm-blue-700 to-blue-800 hover:from-blue-800 hover:to-blue-900",
    orange: "from-amber-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
    red: "from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800",
    purple: "from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800",
    slate: "from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900",
    green: "from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${colorClass} p-3 text-white shadow-sm transition disabled:opacity-50`}
    >
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-white/20 p-2 group-hover:bg-white/30 transition">
          {Icon ? <Icon className="text-base" /> : null}
        </div>
        <div className="text-left">
          <div className="text-xs font-semibold">{label}</div>
          {subtitle ? (
            <div className="text-[10px] opacity-80 mt-0.5">{subtitle}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main dashboard view
// ─────────────────────────────────────────────────────────────────────
export default function PmDashboardView({
  dashboard,
  saving = false,
  importing = false,
  generating = false,
  importError = "",
  onAddTask,
  onAddRisk,
  onAddIssue,
  onGenerateFromBoq,
  onImportFile,
  onClearImports,
  onViewDetails,
  onOpenHeaderSettings,
  onSave,
  dirty,
}) {
  // Count how many tasks came from an MS Project import — drives the
  // visibility of the "Clear imports" button + the count badge.
  const importedTaskCount = React.useMemo(() => {
    if (!Array.isArray(dashboard?.tasks)) return 0;
    return dashboard.tasks.filter((t) =>
      String(t?.source || "").startsWith("msproject"),
    ).length;
  }, [dashboard?.tasks]);
  const headline = dashboard?.headline || {};
  const totals = dashboard?.totals || {};
  const buckets = dashboard?.buckets || {};
  const overdueByPriority = dashboard?.overdueByPriority || {};
  const tasksByPriority = dashboard?.tasksByPriority || {};
  const tasksByStatus = dashboard?.tasksByStatus || {};
  const burndown = dashboard?.burndown || [];
  const balance = dashboard?.balance || { status: "no-data" };

  const fileRef = React.useRef(null);
  function pickFile() {
    fileRef.current?.click();
  }
  function onFile(e) {
    const file = e.target.files?.[0];
    if (file) onImportFile?.(file);
    e.target.value = "";
  }

  const cpi = safeNum(headline.CPI);
  const spi = safeNum(headline.SPI);

  // Onboarding signals — drive the empty-state banner and the "project
  // start not set" callout. Both are non-blocking — the user can still see
  // every chart underneath.
  const totalTasks = safeNum(totals.totalTasks);
  const hasNoTasks = totalTasks === 0;
  const hasNoProjectStart = !dashboard?.projectStart;

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-adlm-blue-700 via-blue-700 to-blue-800 px-5 py-4 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-80">Project Management</div>
            <div className="mt-0.5 text-xl font-bold">All-in-One PM Dashboard</div>
            {dashboard?.projectStart || dashboard?.projectFinish ? (
              <div className="mt-1 text-[11px] opacity-90">
                {dashboard?.projectStart
                  ? new Date(dashboard.projectStart).toLocaleDateString()
                  : "—"}
                {" → "}
                {dashboard?.projectFinish
                  ? new Date(dashboard.projectFinish).toLocaleDateString()
                  : "—"}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Unsaved
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-adlm-blue-700 shadow hover:bg-blue-50 transition disabled:opacity-50"
            >
              <FaSyncAlt className={saving ? "animate-spin" : ""} />
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onViewDetails}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-900/40 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-900/60 transition"
            >
              <FaListUl />
              View Details
              <FaArrowRight className="text-[10px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Empty-state onboarding banner — shown when there are no tasks at
          all. Replaces the silent "0 / 0 / ₦0" tiles below with an actual
          first-time-user prompt. Dismissed implicitly by adding any task. */}
      {hasNoTasks ? (
        <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-5 py-6 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-adlm-blue-700 text-white shadow">
            <FaTasks className="text-xl" />
          </div>
          <div className="mt-3 text-base font-bold text-slate-900">
            Your PM dashboard is empty
          </div>
          <div className="mt-1 text-xs text-slate-600 max-w-md mx-auto">
            Add tasks manually, generate one task per item from your BoQ, or
            import an MS Project file. The dashboard tiles, charts, and
            burndown will populate automatically.
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-blue-800"
            >
              <FaPlus className="text-[10px]" />
              Add first task
            </button>
            <button
              type="button"
              onClick={onGenerateFromBoq}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-purple-700 disabled:opacity-50"
            >
              <FaMagic className="text-[10px]" />
              {generating ? "Generating…" : "Generate from BoQ"}
            </button>
            <button
              type="button"
              onClick={pickFile}
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
            >
              <FaFileImport className="text-[10px]" />
              {importing ? "Importing…" : "Import MS Project"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Project-start banner — non-blocking nudge when tasks exist but the
          project's start date hasn't been set. Without a start the Burndown
          can't render and the Reschedule action errors out. */}
      {!hasNoTasks && hasNoProjectStart ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <FaClock className="text-amber-600" />
            <span>
              <strong>Set a project start date</strong> to enable the burndown
              chart and the task-reschedule cascade.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenHeaderSettings}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
          >
            Set start date
          </button>
        </div>
      ) : null}

      {/* Action strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <ActionCard label="Add Task" subtitle="Schedule a work item" icon={FaPlus} color="blue" onClick={onAddTask} />
        <ActionCard label="Add Risk" subtitle="Log a risk" icon={FaExclamationTriangle} color="orange" onClick={onAddRisk} />
        <ActionCard label="Add Issue" subtitle="Log an issue" icon={FaBug} color="red" onClick={onAddIssue} />
        <ActionCard
          label="Generate from BoQ"
          subtitle="One task per item"
          icon={FaMagic}
          color="purple"
          onClick={onGenerateFromBoq}
          disabled={generating}
        />
        <ActionCard
          label={importing ? "Importing…" : "Import MS Project"}
          subtitle=".xml or .mpp"
          icon={FaFileImport}
          color="slate"
          onClick={pickFile}
          disabled={importing}
        />
        <input ref={fileRef} type="file" accept=".xml,.mpp" className="hidden" onChange={onFile} />
      </div>

      {/* Clear-imports row — only visible when imported tasks exist, so the
          control doesn't add noise to a fresh project. */}
      {importedTaskCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FaFileImport className="text-slate-400" />
            <span>
              <strong className="text-slate-900">{importedTaskCount}</strong>{" "}
              task{importedTaskCount === 1 ? "" : "s"} came from MS Project import.
            </span>
          </div>
          <button
            type="button"
            onClick={onClearImports}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
            title="Remove all MS Project imported tasks. Manual & BoQ-linked tasks are preserved."
          >
            <FaTimes className="text-[10px]" />
            Delete imported tasks
          </button>
        </div>
      ) : null}

      {importError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {importError}
        </div>
      ) : null}

      {/* Headline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile
          label="Progress"
          value={`${safeNum(headline.progressPercent).toFixed(0)}%`}
          sub="Avg % complete"
          icon={FaTachometerAlt}
          gradient={gradientFor("primary")}
        />
        <Tile
          label="Budget Used"
          value={`${safeNum(headline.budgetUsedPercent).toFixed(0)}%`}
          sub="AC / BAC"
          icon={FaCoins}
          gradient={gradientFor("success")}
        />
        <Tile
          label="Overdue"
          value={safeNum(headline.overdueCount)}
          sub="Tasks past end date"
          icon={FaClock}
          gradient={gradientFor("danger")}
        />
        <Tile
          label="CPI"
          value={cpi ? cpi.toFixed(2) : "—"}
          sub={cpi >= 1 ? "Under budget" : cpi > 0 ? "Over budget" : "No data"}
          icon={FaCoins}
          gradient={gradientFor(cpi >= 1 ? "success" : cpi >= 0.9 ? "warning" : "danger")}
        />
        <Tile
          label="SPI"
          value={spi ? spi.toFixed(2) : "—"}
          sub={spi >= 1 ? "On/ahead" : spi > 0 ? "Behind" : "No data"}
          icon={FaChartLine}
          gradient={gradientFor(spi >= 1 ? "success" : spi >= 0.9 ? "warning" : "danger")}
        />
        <Tile
          label="Tasks Done"
          value={`${safeNum(headline.tasksDonePercent).toFixed(0)}%`}
          sub={`${totals.completedTasks || 0} of ${totals.totalTasks || 0}`}
          icon={FaTasks}
          gradient={gradientFor("info")}
        />
      </div>

      {/* Balance indicator */}
      <BalanceIndicator balance={balance} />

      {/* WBS status & priority strip — compact at-a-glance row showing
          how the work is distributed across status + priority buckets.
          Surfaces the priority breakdown that was previously hidden
          behind "Overdue by priority" (which read 0 until tasks
          slipped). */}
      <WbsHealthStrip
        tasksByStatus={tasksByStatus}
        tasksByPriority={tasksByPriority}
        overdueByPriority={overdueByPriority}
        totalTasks={safeNum(totals.totalTasks)}
        // Critical-path counts from the MS Project importer. Falls
        // through to 0 for projects that haven't been re-imported
        // since the feature shipped.
        criticalPathTotal={safeNum(dashboard?.criticalPathTotal)}
        criticalPathPending={safeNum(dashboard?.criticalPathPending)}
      />

      {/* Contract movement — variations + provisional flow, with
          execution status and forecast impact. Drives the user's awareness
          of whether the project is going as scheduled AND as budgeted. */}
      <ContractMovementPanel dashboard={dashboard} />

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
        <ChartCard title="Tasks">
          <TasksDonut buckets={buckets} totalTasks={totals.totalTasks} />
        </ChartCard>
        <ChartCard title="Budget">
          <BudgetBars BAC={totals.BAC} EV={totals.EV} AC={totals.AC} />
        </ChartCard>
        <ChartCard title="Tasks by priority">
          <OverdueBars
            overdueByPriority={overdueByPriority}
            tasksByPriority={tasksByPriority}
          />
        </ChartCard>
        <ChartCard title="Burndown">
          <BurndownChart
            burndown={burndown}
            BAC={totals.BAC}
            burndownStatus={dashboard?.burndownStatus}
          />
        </ChartCard>
      </div>

      {/* BoQ progress heatmap — full-width to give it room */}
      <PmBoqHeatmap boqItems={dashboard?.boqItems || []} />

      {/* BoQ ↔ WBS coverage reconciliation — surfaces unlinked /
          under-allocated / double-counted BoQ entries so the user knows
          immediately whether the WBS faithfully executes the BoQ. */}
      <BoqCoveragePanel
        coverage={dashboard?.boqCoverage}
        onViewDetails={onViewDetails}
      />

      {/* EVM summary footer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Earned Value Summary
          </div>
          <button
            type="button"
            onClick={onOpenHeaderSettings}
            className="text-[11px] font-medium text-adlm-blue-700 hover:underline"
          >
            Edit project dates &amp; budget
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <EvmStat label="BAC" value={`₦${fmtMoney(totals.BAC)}`} hint="Budget at completion" />
          <EvmStat label="PV" value={`₦${fmtMoney(totals.PV)}`} hint="Planned value to date" />
          <EvmStat label="EV" value={`₦${fmtMoney(totals.EV)}`} hint="Earned value" />
          <EvmStat label="AC" value={`₦${fmtMoney(totals.AC)}`} hint="Actual cost" />
          <EvmStat label="EAC" value={`₦${fmtMoney(totals.EAC)}`} hint="Estimate at completion" />
          <EvmStat
            label="VAC"
            value={`₦${fmtMoney(totals.VAC)}`}
            hint={safeNum(totals.VAC) >= 0 ? "Forecast savings" : "Forecast over-run"}
            tone={safeNum(totals.VAC) >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
        </div>
      </div>

      {dashboard?.asOf ? (
        <div className="text-[10px] text-slate-400 text-right italic">
          As of {new Date(dashboard.asOf).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function EvmStat({ label, value, hint, tone = "text-slate-900" }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-bold text-sm ${tone}`}>{value}</div>
      {hint ? <div className="text-[9px] text-slate-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Contract Movement panel — variation + provisional tracker.
//
// Surfaces three things the user asked for:
//   1. How much extra scope has been instructed (variations declared).
//   2. How much of that scope has actually been executed (earned).
//   3. The net impact on contract sum + forecast — savings or overrun.
//
// Data source: dashboard.scope.{variations,provisional} from the server
// (computeProjectScope). All numbers respect the new completed-flag
// semantics, so declared-but-not-done shows in BAC but not EV.
// ────────────────────────────────────────────────────────────────────
function ContractMovementPanel({ dashboard }) {
  const scope = dashboard?.scope || {};
  const variations = scope.variations || { total: 0, earned: 0, count: 0, completedCount: 0 };
  const provisional = scope.provisional || { total: 0, earned: 0, count: 0, completedCount: 0 };
  const totals = dashboard?.totals || {};

  const variationsOpen = Math.max(0, safeNum(variations.total) - safeNum(variations.earned));
  const provisionalOpen = Math.max(0, safeNum(provisional.total) - safeNum(provisional.earned));

  // Forecast savings/overrun. Negative VAC = over-run, positive = savings.
  const vac = safeNum(totals.VAC);
  const eac = safeNum(totals.EAC);
  const bac = safeNum(totals.BAC);
  const variancePct = bac > 0 ? (vac / bac) * 100 : 0;

  let healthTone = "slate";
  let healthLabel = "Tracking";
  let healthMsg = "Awaiting actuals.";
  if (bac > 0 && eac > 0) {
    if (vac >= 0) {
      healthTone = "emerald";
      healthLabel = `Forecast savings ₦${fmtMoney(Math.abs(vac))}`;
      healthMsg = `Project is forecast to come in ${Math.abs(variancePct).toFixed(1)}% under contract.`;
    } else {
      const overrun = Math.abs(variancePct);
      healthTone = overrun >= 5 ? "rose" : "amber";
      healthLabel = `Forecast over-run ₦${fmtMoney(Math.abs(vac))}`;
      healthMsg = `Project is forecast to exceed contract by ${overrun.toFixed(1)}%. Review variation execution and actuals.`;
    }
  }

  const headerTone = {
    emerald: "from-emerald-600 to-emerald-700",
    amber: "from-amber-500 to-amber-600",
    rose: "from-rose-600 to-rose-700",
    slate: "from-slate-600 to-slate-700",
  }[healthTone];

  // Nothing to show if both streams are empty — keep the dashboard
  // uncluttered when the project hasn't issued any variations or PC yet.
  if (
    safeNum(variations.total) === 0 &&
    safeNum(provisional.total) === 0 &&
    Math.abs(vac) < 1
  ) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`bg-gradient-to-r ${headerTone} px-4 py-3 text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">
              Contract Movement
            </div>
            <div className="text-base font-bold">{healthLabel}</div>
          </div>
          <div className="text-[11px] text-white/85 max-w-xs text-right">
            {healthMsg}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        <MovementStat
          label="Variations declared"
          value={`₦${fmtMoney(variations.total)}`}
          hint={`${variations.count || 0} instruction${variations.count === 1 ? "" : "s"}`}
        />
        <MovementStat
          label="Variations executed"
          value={`₦${fmtMoney(variations.earned)}`}
          hint={`${variations.completedCount || 0} of ${variations.count || 0} done · ₦${fmtMoney(variationsOpen)} open`}
          tone={variations.earned > 0 ? "text-emerald-700" : "text-slate-700"}
        />
        <MovementStat
          label="PC sums released"
          value={`₦${fmtMoney(provisional.earned)}`}
          hint={`${provisional.completedCount || 0} of ${provisional.count || 0} drawn · ₦${fmtMoney(provisionalOpen)} held`}
        />
        <MovementStat
          label="Forecast at completion"
          value={`₦${fmtMoney(eac)}`}
          hint={vac >= 0 ? "Within budget" : "Over budget"}
          tone={vac >= 0 ? "text-emerald-700" : "text-rose-700"}
        />
      </div>

      {/* Visual variance bar — quick "are we tracking?" read */}
      {bac > 0 ? (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>Contract baseline</span>
            <span>Forecast at completion</span>
          </div>
          <div className="relative h-4 w-full rounded-full bg-slate-100 overflow-hidden">
            {/* Baseline as the full 100% reference */}
            <div className="absolute inset-y-0 left-0 right-0 bg-slate-200" />
            {/* Forecast bar — width shows EAC vs BAC, capped at 130% so
                massive overruns still render readably. */}
            <div
              className={`absolute inset-y-0 left-0 transition-all ${
                vac >= 0 ? "bg-emerald-500" : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(130, (eac / bac) * 100)}%` }}
            />
            {/* Baseline marker — a vertical line at 100% to anchor the eye */}
            <div className="absolute inset-y-0 left-[76.92%] w-px bg-white/80" style={{ left: `${Math.min(100, 100 * bac / Math.max(bac, eac))}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>₦{fmtMoney(bac)}</span>
            <span className={vac >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
              ₦{fmtMoney(eac)} ({vac >= 0 ? "−" : "+"}{Math.abs(variancePct).toFixed(1)}%)
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MovementStat({ label, value, hint, tone = "text-slate-900" }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-bold text-sm ${tone}`}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// BoQ ↔ WBS coverage panel.
//
// Answers the single question users ask after building a WBS:
// "Does my schedule actually execute the priced scope, or have I left
//  bits unallocated / accidentally counted lines twice?"
//
// Surfaces four categories from the server's boqCoverage payload:
//   1. Fully allocated → green tile, count only (the healthy bucket).
//   2. Unlinked        → grey tile, ₦ value at risk + top offenders.
//   3. Under-allocated → amber tile, shortfall amount + top rows.
//   4. Over-allocated  → rose tile, double-count amount + top rows.
//
// Each problem category has a collapsible list of the top 8 offending
// BoQ rows so the user can jump from "your books don't balance" to the
// specific row they need to fix. The full visual is a single-stack
// segmented bar showing the same proportions in one glance.
// ────────────────────────────────────────────────────────────────────
function BoqCoveragePanel({ coverage, onViewDetails }) {
  if (!coverage || !coverage.totalCount) {
    return null;
  }

  const total = safeNum(coverage.totalAmount);
  const linked = safeNum(coverage.linkedAmount);
  const unlinked = safeNum(coverage.unlinkedAmount);
  const under = safeNum(coverage.underAllocatedAmount);
  const over = safeNum(coverage.overAllocatedAmount);
  const coveragePct = safeNum(coverage.coveragePercent);

  // Header tone reflects worst issue. Over-allocation outweighs under-
  // allocation because over-counts directly inflate EV (CPI/SPI lie),
  // whereas under-counts only depress them (a milder distortion).
  let headerTone = "from-emerald-600 to-emerald-700";
  let headerLabel = "BoQ fully covered";
  let headerMsg = `${coverage.fullyAllocatedCount} BoQ entries are tracked end-to-end by the WBS.`;
  if (over > 0) {
    headerTone = "from-rose-600 to-rose-700";
    headerLabel = `Possible double-count: ₦${fmtMoney(over)}`;
    headerMsg = `${coverage.overAllocatedCount} BoQ entries have task weights summing to > 100%. EV and CPI/SPI may be over-stated.`;
  } else if (unlinked > 0 || under > 0) {
    headerTone = "from-amber-500 to-amber-600";
    const gap = unlinked + under;
    headerLabel = `Coverage gap: ₦${fmtMoney(gap)}`;
    const parts = [];
    if (coverage.unlinkedCount > 0) {
      parts.push(`${coverage.unlinkedCount} unlinked`);
    }
    if (coverage.underAllocatedCount > 0) {
      parts.push(`${coverage.underAllocatedCount} under-allocated`);
    }
    headerMsg = `${parts.join(" + ")}. WBS does not yet execute the full BoQ — EV and SPI will under-state.`;
  }

  // Single-stack segmented coverage bar widths (% of total amount).
  const linkedPct = total > 0 ? (Math.min(linked, total) / total) * 100 : 0;
  const underPct = total > 0 ? (under / total) * 100 : 0;
  const unlinkedPct = total > 0 ? (unlinked / total) * 100 : 0;
  // Over-allocation isn't part of the 100% bar — it's an overflow
  // marker rendered to the right of the bar instead.
  const overPct = total > 0 ? Math.min(40, (over / total) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`bg-gradient-to-r ${headerTone} px-4 py-3 text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">
              BoQ ↔ WBS Coverage
            </div>
            <div className="text-base font-bold">{headerLabel}</div>
          </div>
          <div className="text-[11px] text-white/85 max-w-md text-right">
            {headerMsg}
          </div>
        </div>
      </div>

      {/* Stat tiles — one per coverage bucket */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        <CoverageStat
          icon={FaCheckCircle}
          label="Fully covered"
          value={`${coverage.fullyAllocatedCount}`}
          hint="entries balanced at 100%"
          tone="text-emerald-700"
          iconBg="bg-emerald-100"
        />
        <CoverageStat
          icon={FaUnlink}
          label="Unlinked"
          value={`${coverage.unlinkedCount}`}
          hint={`₦${fmtMoney(unlinked)} unallocated`}
          tone={unlinked > 0 ? "text-slate-700" : "text-slate-400"}
          iconBg="bg-slate-100"
          // Hover reveals every unlinked BoQ row — including the
          // zero-cost ones. Answers the user's "show me what I missed"
          // question without forcing them to scroll into the offender
          // panel below.
          details={coverage.topUnlinked}
          detailsLabel="Unlinked BoQ items"
        />
        <CoverageStat
          icon={FaExclamationTriangle}
          label="Under-allocated"
          value={`${coverage.underAllocatedCount}`}
          hint={`₦${fmtMoney(under)} short`}
          tone={under > 0 ? "text-amber-700" : "text-slate-400"}
          iconBg="bg-amber-100"
          details={coverage.topUnder}
          detailsLabel="Under-allocated BoQ items"
        />
        <CoverageStat
          icon={FaCopy}
          label="Over-allocated"
          value={`${coverage.overAllocatedCount}`}
          hint={`₦${fmtMoney(over)} excess`}
          tone={over > 0 ? "text-rose-700" : "text-slate-400"}
          iconBg="bg-rose-100"
          details={coverage.topOver}
          detailsLabel="Over-allocated BoQ items"
        />
      </div>

      {/* Single-stack segmented coverage bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>
            <strong className="text-slate-900">{coveragePct.toFixed(1)}%</strong> of
            ₦{fmtMoney(total)} BoQ value is linked to the WBS
          </span>
          {over > 0 ? (
            <span className="text-rose-700 font-semibold">
              + ₦{fmtMoney(over)} double-counted
            </span>
          ) : null}
        </div>
        <div className="relative h-3.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${linkedPct}%` }}
            title={`Linked: ₦${fmtMoney(linked)}`}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${underPct}%` }}
            title={`Under-allocated shortfall: ₦${fmtMoney(under)}`}
          />
          <div
            className="h-full bg-slate-300 transition-all"
            style={{ width: `${unlinkedPct}%` }}
            title={`Unlinked: ₦${fmtMoney(unlinked)}`}
          />
        </div>
        {over > 0 ? (
          <div className="mt-2 relative h-2 w-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-rose-500"
              style={{ width: `${overPct}%` }}
            />
            <div className="absolute inset-y-0 left-0 h-full flex items-center text-[9px] font-semibold text-rose-700 ml-1">
              double-counted →
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
          <Legend color="#10b981" label="Linked" count={`₦${fmtMoney(linked)}`} />
          {under > 0 ? (
            <Legend color="#fbbf24" label="Shortfall" count={`₦${fmtMoney(under)}`} />
          ) : null}
          {unlinked > 0 ? (
            <Legend color="#cbd5e1" label="Unlinked" count={`₦${fmtMoney(unlinked)}`} />
          ) : null}
          {over > 0 ? (
            <Legend color="#f43f5e" label="Excess" count={`₦${fmtMoney(over)}`} />
          ) : null}
        </div>
      </div>

      {/* Offender lists — only render the sections with actual issues so
          a healthy project shows just the green stat tiles + bar. */}
      {(coverage.topOver?.length > 0 ||
        coverage.topUnlinked?.length > 0 ||
        coverage.topUnder?.length > 0 ||
        coverage.staleLinkTasks?.length > 0) ? (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {/* Stale links — highest priority because the task's baseline
              silently drops to ₦0 until the user re-links. */}
          {coverage.staleLinkTasks?.length > 0 ? (
            <StaleLinksPanel tasks={coverage.staleLinkTasks} />
          ) : null}
          {coverage.topOver?.length > 0 ? (
            <CoverageOffenders
              title="Over-allocated (double-count risk)"
              icon={FaCopy}
              tone="rose"
              rows={coverage.topOver}
              measureLabel="excess"
              measureKey="excess"
              note="Lower the weight on one of the tasks below so weights sum to 100%."
            />
          ) : null}
          {coverage.topUnder?.length > 0 ? (
            <CoverageOffenders
              title="Under-allocated (WBS gap)"
              icon={FaExclamationTriangle}
              tone="amber"
              rows={coverage.topUnder}
              measureLabel="shortfall"
              measureKey="shortfall"
              note="Add another task to cover the rest, or raise an existing task's weight."
            />
          ) : null}
          {coverage.topUnlinked?.length > 0 ? (
            <CoverageOffenders
              title="Unlinked BoQ entries"
              icon={FaUnlink}
              tone="slate"
              rows={coverage.topUnlinked}
              measureLabel="value"
              measureKey="amount"
              note="Add a task for each, or link it to an existing one."
            />
          ) : null}
          {onViewDetails ? (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onViewDetails}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-adlm-blue-700 hover:underline"
              >
                <FaLayerGroup className="text-[10px]" />
                Open WBS to fix
                <FaArrowRight className="text-[9px]" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Tasks whose linkedBoqIdentities point at BoQ rows that no longer
// exist in the current scope. This is the silent cause of "Task shows
// ₦0 baseline even though I linked 5 items" — the items were renamed
// or re-ordered, breaking the identity hash.
function StaleLinksPanel({ tasks }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-rose-800"
      >
        <span className="inline-flex items-center gap-1.5">
          <FaTimesCircle className="text-rose-500" />
          Tasks with stale BoQ links
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold">
            {tasks.length}
          </span>
        </span>
        <span className="text-[10px] font-medium opacity-70">
          {open ? "Hide ▾" : "Show ▸"}
        </span>
      </button>
      {open ? (
        <div className="bg-white px-3 pb-3 pt-1">
          <div className="text-[10px] text-slate-600 italic mb-2">
            These tasks are linked to BoQ rows that no longer exist (renamed,
            deleted, or re-ordered). Their baseline cost has silently dropped
            to ₦0. Open the task and re-link to the current BoQ rows to fix.
          </div>
          <ul className="space-y-1.5">
            {tasks.map((t) => (
              <li
                key={t.taskId || t.wbs || t.name}
                className="rounded-md border border-rose-100 bg-rose-50/40 px-2.5 py-1.5 text-[11px] flex items-center gap-2"
              >
                {t.wbs ? (
                  <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-mono text-slate-600">
                    {t.wbs}
                  </span>
                ) : null}
                <span className="flex-1 min-w-0 font-medium text-slate-900 truncate" title={t.name}>
                  {t.name}
                </span>
                <span className="shrink-0 text-[10px] text-rose-700 font-semibold">
                  {t.staleCount} of {t.totalLinks} link{t.totalLinks === 1 ? "" : "s"} broken
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// CoverageStat — one of the four tiles inside the BoQ↔WBS coverage
// panel. When `details` is provided AND non-empty, the tile becomes
// hover-popover-able: hovering the value reveals the full list of
// offending BoQ rows under that bucket. Useful for the Unlinked tile
// where users explicitly asked "show me which items aren't covered".
function CoverageStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-slate-900",
  iconBg = "bg-slate-100",
  details = null, // optional array of { description, kind, amount }
  detailsLabel = "Items",
}) {
  const [open, setOpen] = React.useState(false);
  const hasDetails = Array.isArray(details) && details.length > 0;
  // Hover state is debounced so the popover doesn't flicker when the
  // user crosses the gap between the tile and the floating panel.
  const hideTimer = React.useRef(null);
  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setOpen(false), 250);
  };

  return (
    <div
      className={`relative rounded-lg border border-slate-100 bg-white px-3 py-2.5 flex items-start gap-2.5 ${
        hasDetails ? "cursor-help" : ""
      }`}
      onMouseEnter={hasDetails ? () => { cancelHide(); setOpen(true); } : undefined}
      onMouseLeave={hasDetails ? scheduleHide : undefined}
      onFocus={hasDetails ? () => setOpen(true) : undefined}
      onBlur={hasDetails ? scheduleHide : undefined}
      tabIndex={hasDetails ? 0 : -1}
    >
      <div className={`shrink-0 rounded-md ${iconBg} p-2 ${tone}`}>
        {Icon ? <Icon className="text-sm" /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-0.5 font-bold text-base ${tone} leading-tight`}>{value}</div>
        {hint ? <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={hint}>{hint}</div> : null}
        {hasDetails ? (
          <div className="mt-1 text-[9px] uppercase tracking-wider text-adlm-blue-700 font-semibold">
            Hover for list ▾
          </div>
        ) : null}
      </div>

      {/* Floating popover with the offender rows. Positioned below the
          tile so it doesn't get clipped on narrow viewports. */}
      {hasDetails && open ? (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-slate-200 bg-white shadow-xl dark:bg-slate-800 dark:border-slate-700"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 dark:bg-slate-700/40 dark:border-slate-700 flex items-center justify-between">
            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              {detailsLabel} · {details.length}
            </div>
            <div className="text-[9px] text-slate-400">
              {details.length >= 20 ? "showing top 20" : ""}
            </div>
          </div>
          <ul className="max-h-72 overflow-auto divide-y divide-slate-100 dark:divide-slate-700">
            {details.map((d, idx) => {
              const badge = COVERAGE_KIND_BADGE[d.kind] || COVERAGE_KIND_BADGE.measured;
              return (
                <li key={d.identity || idx} className="px-3 py-1.5 text-[11px] flex items-start gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="flex-1 min-w-0 font-medium text-slate-800 dark:text-slate-200 truncate" title={d.description}>
                    {d.description || `Item ${d.identity}`}
                  </span>
                  <span className="shrink-0 text-slate-500 text-[10px]">
                    {safeNum(d.amount) > 0 ? `₦${fmtMoney(d.amount)}` : "₦0"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const COVERAGE_KIND_BADGE = {
  measured: { label: "BoQ", cls: "bg-slate-100 text-slate-700" },
  preliminary: { label: "Prelim", cls: "bg-purple-100 text-purple-700" },
  provisional: { label: "PC sum", cls: "bg-amber-100 text-amber-800" },
  variation: { label: "Variation", cls: "bg-rose-100 text-rose-700" },
};

function CoverageOffenders({ title, icon: Icon, tone, rows, measureLabel, measureKey, note }) {
  const toneCls = {
    rose: { border: "border-rose-200", bg: "bg-rose-50/60", title: "text-rose-800", icon: "text-rose-500" },
    amber: { border: "border-amber-200", bg: "bg-amber-50/60", title: "text-amber-800", icon: "text-amber-500" },
    slate: { border: "border-slate-200", bg: "bg-slate-50/60", title: "text-slate-800", icon: "text-slate-500" },
  }[tone] || { border: "border-slate-200", bg: "bg-slate-50/60", title: "text-slate-800", icon: "text-slate-500" };

  const [open, setOpen] = React.useState(true);

  return (
    <div className={`rounded-lg border ${toneCls.border} ${toneCls.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold ${toneCls.title}`}
      >
        <span className="inline-flex items-center gap-1.5">
          {Icon ? <Icon className={toneCls.icon} /> : null}
          {title}
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold">
            {rows.length}
          </span>
        </span>
        <span className="text-[10px] font-medium opacity-70">
          {open ? "Hide ▾" : "Show ▸"}
        </span>
      </button>
      {open ? (
        <div className="bg-white/70 px-3 pb-3 pt-1">
          {note ? (
            <div className="text-[10px] text-slate-600 italic mb-2">{note}</div>
          ) : null}
          <ul className="space-y-1.5">
            {rows.map((row) => {
              const badge = COVERAGE_KIND_BADGE[row.kind] || COVERAGE_KIND_BADGE.measured;
              const measure = safeNum(row[measureKey]);
              const linkedTasks = Array.isArray(row.taskNames) ? row.taskNames : [];
              return (
                <li
                  key={row.identity}
                  className="rounded-md border border-slate-100 bg-white px-2.5 py-1.5 text-[11px] flex flex-wrap items-start gap-2"
                >
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-slate-900 break-words">
                      {row.description || `Item #${row.identity}`}
                    </span>
                    {linkedTasks.length > 0 ? (
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        Linked from: {linkedTasks.slice(0, 3).join(", ")}
                        {linkedTasks.length > 3 ? ` +${linkedTasks.length - 3} more` : ""}
                        {row.totalWeight != null ? (
                          <span className="ml-1 text-slate-600">
                            (total weight {Math.round(safeNum(row.totalWeight))}%)
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                      {measureLabel}
                    </span>
                    <span className="font-bold text-slate-900">
                      ₦{fmtMoney(measure)}
                    </span>
                    <span className="block text-[9px] text-slate-500">
                      of ₦{fmtMoney(row.amount)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// WbsHealthStrip — single-row dashboard panel summarising the WBS by
// STATUS (not-started / in-progress / blocked / completed) and
// PRIORITY (critical / high / medium / low / none).
//
// Why this exists: the Tasks donut shows status %, but priority was
// only surfaced through "Overdue by priority" which reads zero on
// healthy projects. Users couldn't see "how many critical tasks do
// I have" without drilling into the WBS itself. This strip fixes
// that — every category renders with count + colour tile, plus an
// overdue overlay where relevant.
// ────────────────────────────────────────────────────────────────────
function WbsHealthStrip({
  tasksByStatus,
  tasksByPriority,
  overdueByPriority,
  totalTasks,
  // Critical-path counters from the MS Project import. `total` is the
  // whole count; `pending` is total minus already-completed (the live
  // exposure to schedule slip). Falls back to undefined for older
  // projects that haven't been re-imported since the feature shipped.
  criticalPathTotal = 0,
  criticalPathPending = 0,
}) {
  if (!totalTasks) return null;

  const statusItems = [
    { key: "completed", label: "Completed", color: "bg-emerald-500", text: "text-emerald-700" },
    { key: "in-progress", label: "In progress", color: "bg-amber-500", text: "text-amber-700" },
    { key: "blocked", label: "Blocked", color: "bg-rose-500", text: "text-rose-700" },
    { key: "not-started", label: "Not started", color: "bg-slate-400", text: "text-slate-700" },
  ];

  const priorityItems = [
    { key: "critical", label: "Critical", color: "bg-rose-600", text: "text-rose-700", icon: "🔥" },
    { key: "high", label: "High", color: "bg-amber-500", text: "text-amber-700", icon: "⚠" },
    { key: "medium", label: "Medium", color: "bg-sky-500", text: "text-sky-700", icon: "●" },
    { key: "low", label: "Low", color: "bg-slate-400", text: "text-slate-600", icon: "○" },
    { key: "none", label: "Unset", color: "bg-slate-300", text: "text-slate-500", icon: "—" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
      {/* Critical-path banner — only shown when MS Project import
          flagged at least one task. Surfaces the schedule risk
          up-front: "8 critical-path tasks · 6 still pending" gives the
          user a fast read on the bottleneck size before they scroll
          into the WBS detail. */}
      {safeNum(criticalPathTotal) > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 dark:border-rose-700/50 dark:bg-rose-900/20">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base" aria-hidden="true">🔥</span>
            <div className="leading-tight">
              <div className="font-semibold text-rose-800 dark:text-rose-200">
                Critical path · {criticalPathTotal} task
                {criticalPathTotal === 1 ? "" : "s"}
              </div>
              <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80">
                {criticalPathPending > 0
                  ? `${criticalPathPending} still pending — any delay slips the project finish date`
                  : "All critical-path tasks complete — schedule risk has cleared"}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-rose-700/70 dark:text-rose-300/70">
            Imported from MS Project
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status column */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              WBS Status
            </div>
            <div className="text-[10px] text-slate-400">
              {totalTasks} task{totalTasks === 1 ? "" : "s"} total
            </div>
          </div>
          {/* Stacked horizontal bar */}
          <div className="flex h-6 w-full overflow-hidden rounded-lg bg-slate-100 mb-2">
            {statusItems.map((s) => {
              const c = safeNum(tasksByStatus?.[s.key]);
              const w = totalTasks > 0 ? (c / totalTasks) * 100 : 0;
              if (w === 0) return null;
              return (
                <div
                  key={s.key}
                  className={`${s.color} flex items-center justify-center text-[10px] font-semibold text-white`}
                  style={{ width: `${w}%` }}
                  title={`${s.label}: ${c}`}
                >
                  {w > 8 ? c : ""}
                </div>
              );
            })}
          </div>
          {/* Per-status counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {statusItems.map((s) => {
              const c = safeNum(tasksByStatus?.[s.key]);
              return (
                <div
                  key={s.key}
                  className="flex items-center gap-1.5 rounded-md border border-slate-100 px-2 py-1 dark:border-slate-700"
                >
                  <span className={`h-2 w-2 rounded-sm ${s.color}`} />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate flex-1">
                    {s.label}
                  </span>
                  <span className={`text-xs font-bold ${s.text} dark:opacity-90`}>{c}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority column */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              WBS Priority
            </div>
            <div className="text-[10px] text-slate-400">
              {priorityItems.reduce(
                (acc, p) => acc + safeNum(overdueByPriority?.[p.key]),
                0,
              )}{" "}
              overdue
            </div>
          </div>
          {/* Stacked horizontal bar */}
          <div className="flex h-6 w-full overflow-hidden rounded-lg bg-slate-100 mb-2">
            {priorityItems.map((p) => {
              const c = safeNum(tasksByPriority?.[p.key]);
              const w = totalTasks > 0 ? (c / totalTasks) * 100 : 0;
              if (w === 0) return null;
              return (
                <div
                  key={p.key}
                  className={`${p.color} flex items-center justify-center text-[10px] font-semibold text-white`}
                  style={{ width: `${w}%` }}
                  title={`${p.label}: ${c}${
                    safeNum(overdueByPriority?.[p.key]) > 0
                      ? ` (${overdueByPriority[p.key]} overdue)`
                      : ""
                  }`}
                >
                  {w > 8 ? c : ""}
                </div>
              );
            })}
          </div>
          {/* Per-priority counts with overdue overlay note */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {priorityItems.map((p) => {
              const c = safeNum(tasksByPriority?.[p.key]);
              const od = safeNum(overdueByPriority?.[p.key]);
              return (
                <div
                  key={p.key}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                    od > 0
                      ? "border-rose-200 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-900/20"
                      : "border-slate-100 dark:border-slate-700"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-sm ${p.color}`} />
                  <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate flex-1">
                    {p.label}
                  </span>
                  <span className={`text-xs font-bold ${p.text} dark:opacity-90`}>
                    {c}
                    {od > 0 ? (
                      <span className="ml-0.5 text-[9px] text-rose-600 font-medium">
                        ({od}!)
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
