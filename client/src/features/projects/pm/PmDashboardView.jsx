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

function OverdueBars({ overdueByPriority }) {
  const labels = ["critical", "high", "medium", "low"];
  const gradients = {
    critical: "from-rose-500 to-rose-700",
    high: "from-rose-400 to-rose-500",
    medium: "from-amber-400 to-amber-500",
    low: "from-slate-300 to-slate-400",
  };
  const max = Math.max(1, ...labels.map((k) => safeNum(overdueByPriority?.[k])));
  return (
    <div className="space-y-2.5">
      {labels.map((k) => {
        const v = safeNum(overdueByPriority?.[k]);
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
              <span className="capitalize">{k}</span>
              <span className="font-semibold text-slate-900">{v}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full bg-gradient-to-r ${gradients[k]} rounded-full`}
                style={{ width: `${(v / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BurndownChart({ burndown, BAC }) {
  if (!Array.isArray(burndown) || burndown.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-center text-xs text-slate-400 px-3">
        Set project start &amp; finish dates to enable burndown
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

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
        <ChartCard title="Tasks">
          <TasksDonut buckets={buckets} totalTasks={totals.totalTasks} />
        </ChartCard>
        <ChartCard title="Budget">
          <BudgetBars BAC={totals.BAC} EV={totals.EV} AC={totals.AC} />
        </ChartCard>
        <ChartCard title="Overdue by priority">
          <OverdueBars overdueByPriority={overdueByPriority} />
        </ChartCard>
        <ChartCard title="Burndown">
          <BurndownChart burndown={burndown} BAC={totals.BAC} />
        </ChartCard>
      </div>

      {/* BoQ progress heatmap — full-width to give it room */}
      <PmBoqHeatmap boqItems={dashboard?.boqItems || []} />

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
