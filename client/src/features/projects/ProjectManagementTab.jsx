import React from "react";
import {
  FaTasks,
  FaExclamationTriangle,
  FaBug,
  FaUpload,
  FaMagic,
  FaPlus,
  FaTrash,
  FaSyncAlt,
  FaFileCode,
  FaFileImport,
} from "react-icons/fa";

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value) {
  return safeNum(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDateInput(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fmtDateDisplay(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function genId(prefix = "tsk") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function HeadlineTile({ label, value, tone = "default", helper }) {
  const toneCls =
    tone === "danger"
      ? "bg-rose-600 text-white"
      : tone === "warning"
        ? "bg-amber-500 text-white"
        : tone === "success"
          ? "bg-emerald-600 text-white"
          : tone === "info"
            ? "bg-sky-500 text-white"
            : tone === "purple"
              ? "bg-purple-600 text-white"
              : tone === "primary"
                ? "bg-adlm-blue-700 text-white"
                : "bg-slate-100 text-slate-900";
  return (
    <div className={`rounded-lg p-3 shadow-sm ${toneCls}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide opacity-90">{label}</div>
      {helper ? <div className="mt-1 text-[10px] opacity-80">{helper}</div> : null}
    </div>
  );
}

function ActionButton({ label, icon: Icon, color = "blue", onClick, disabled, title }) {
  const cls = {
    blue: "bg-adlm-blue-700 hover:bg-blue-800 text-white",
    green: "bg-emerald-600 hover:bg-emerald-700 text-white",
    orange: "bg-orange-500 hover:bg-orange-600 text-white",
    red: "bg-rose-600 hover:bg-rose-700 text-white",
    purple: "bg-purple-600 hover:bg-purple-700 text-white",
    slate: "bg-slate-700 hover:bg-slate-800 text-white",
  }[color] || "bg-slate-700 text-white";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-50 ${cls}`}
    >
      {Icon ? <Icon /> : null}
      {label}
    </button>
  );
}

function TasksDonut({ buckets, totalTasks }) {
  const completed = safeNum(buckets?.completed);
  const inProgress = safeNum(buckets?.inProgress);
  const notStarted = safeNum(buckets?.notStarted);
  const blocked = safeNum(buckets?.blocked);
  const total = totalTasks || completed + inProgress + notStarted + blocked;

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        No tasks yet
      </div>
    );
  }

  const completedPct = (completed / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  const blockedPct = (blocked / total) * 100;
  // notStarted = remainder

  const c1 = completedPct;
  const c2 = c1 + inProgressPct;
  const c3 = c2 + blockedPct;

  const bg = `conic-gradient(
    #16a34a 0 ${c1}%,
    #f59e0b ${c1}% ${c2}%,
    #dc2626 ${c2}% ${c3}%,
    #cbd5e1 ${c3}% 100%
  )`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-44 w-44 rounded-full" style={{ background: bg }}>
        <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <div className="text-2xl font-bold text-slate-900">
            {Math.round((completed / total) * 100)}%
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Done</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Completed ({completed})
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> In progress ({inProgress})
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" /> Blocked ({blocked})
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Not started ({notStarted})
        </div>
      </div>
    </div>
  );
}

function BudgetBars({ BAC, EV, AC }) {
  const max = Math.max(BAC, EV, AC, 1);
  const rows = [
    { label: "Budget (BAC)", value: BAC, color: "bg-sky-500" },
    { label: "Earned (EV)", value: EV, color: "bg-emerald-500" },
    { label: "Actual (AC)", value: AC, color: "bg-rose-500" },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{row.label}</span>
            <span className="font-medium text-slate-900">{fmtMoney(row.value)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
            <div
              className={`h-full ${row.color}`}
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
  const colors = {
    critical: "bg-rose-700",
    high: "bg-rose-500",
    medium: "bg-amber-500",
    low: "bg-slate-400",
  };
  const max = Math.max(1, ...labels.map((k) => safeNum(overdueByPriority?.[k])));
  return (
    <div className="space-y-2">
      {labels.map((k) => {
        const v = safeNum(overdueByPriority?.[k]);
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="capitalize">{k}</span>
              <span className="font-medium text-slate-900">{v}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full ${colors[k]}`}
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
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        Set project start &amp; finish dates to enable burndown
      </div>
    );
  }
  const W = 360;
  const H = 140;
  const max = Math.max(BAC, ...burndown.map((p) => safeNum(p.plannedRemaining)));
  const stepX = burndown.length > 1 ? W / (burndown.length - 1) : 0;

  const toY = (val) => H - (safeNum(val) / Math.max(max, 1)) * (H - 8) - 4;

  const plannedPath = burndown
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${toY(p.plannedRemaining)}`)
    .join(" ");

  const actualPoints = burndown
    .filter((p) => p.actualRemaining != null)
    .map((p, _i, arr) => {
      const idx = burndown.indexOf(p);
      return `${arr.indexOf(p) === 0 ? "M" : "L"} ${idx * stepX} ${toY(p.actualRemaining)}`;
    });

  return (
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full">
        <path d={plannedPath} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 3" />
        {actualPoints.length > 1 ? (
          <path d={actualPoints.join(" ")} fill="none" stroke="#dc2626" strokeWidth="2" />
        ) : null}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-sky-500" style={{ borderTop: "2px dashed #0ea5e9" }} />
          Planned remaining
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-rose-600" />
          Actual remaining
        </span>
      </div>
    </div>
  );
}

function TaskRow({ task, onChange, onDelete }) {
  const overdue = task?.computed?.isOverdue;
  return (
    <tr className={overdue ? "bg-rose-50" : ""}>
      <td className="px-2 py-1.5">
        <input
          value={task.wbs || ""}
          onChange={(e) => onChange({ ...task, wbs: e.target.value })}
          className="w-12 rounded border-slate-200 px-1 py-0.5 text-xs"
          placeholder="#"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={task.name || ""}
          onChange={(e) => onChange({ ...task, name: e.target.value })}
          className="w-full rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Task name"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={fmtDateInput(task.startDate)}
          onChange={(e) => onChange({ ...task, startDate: e.target.value || null })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={fmtDateInput(task.endDate)}
          onChange={(e) => onChange({ ...task, endDate: e.target.value || null })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min="0"
          max="100"
          value={Number.isFinite(Number(task.percentComplete)) ? Number(task.percentComplete) : 0}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            const next = { ...task, percentComplete: v };
            if (v >= 100) next.status = "completed";
            else if (v > 0 && next.status === "not-started") next.status = "in-progress";
            onChange(next);
          }}
          className="w-14 rounded border-slate-200 px-1 py-0.5 text-xs text-right"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min="0"
          value={safeNum(task.baselineCost)}
          onChange={(e) => onChange({ ...task, baselineCost: Math.max(0, Number(e.target.value) || 0) })}
          className="w-24 rounded border-slate-200 px-1 py-0.5 text-xs text-right"
          disabled={(task.linkedBoqIdentities || []).length > 0}
          title={(task.linkedBoqIdentities || []).length > 0 ? "Derived from linked BoQ items" : ""}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min="0"
          value={safeNum(task.actualCost)}
          onChange={(e) => onChange({ ...task, actualCost: Math.max(0, Number(e.target.value) || 0) })}
          className="w-24 rounded border-slate-200 px-1 py-0.5 text-xs text-right"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={task.priority || "medium"}
          onChange={(e) => onChange({ ...task, priority: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Med</option>
          <option value="high">High</option>
          <option value="critical">Crit</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={task.status || "not-started"}
          onChange={(e) => onChange({ ...task, status: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="not-started">Not started</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={task.assignedTo || ""}
          onChange={(e) => onChange({ ...task, assignedTo: e.target.value })}
          className="w-24 rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="—"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="Delete task"
        >
          <FaTrash />
        </button>
      </td>
    </tr>
  );
}

function RiskRow({ risk, onChange, onDelete }) {
  return (
    <tr>
      <td className="px-2 py-1.5">
        <input
          value={risk.title || ""}
          onChange={(e) => onChange({ ...risk, title: e.target.value })}
          className="w-full rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Risk title"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={risk.probability || "medium"}
          onChange={(e) => onChange({ ...risk, probability: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={risk.impact || "medium"}
          onChange={(e) => onChange({ ...risk, impact: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={risk.status || "open"}
          onChange={(e) => onChange({ ...risk, status: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="open">Open</option>
          <option value="mitigating">Mitigating</option>
          <option value="accepted">Accepted</option>
          <option value="closed">Closed</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={risk.owner || ""}
          onChange={(e) => onChange({ ...risk, owner: e.target.value })}
          className="w-28 rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Owner"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={risk.mitigation || ""}
          onChange={(e) => onChange({ ...risk, mitigation: e.target.value })}
          className="w-full rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Mitigation plan"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <button type="button" onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <FaTrash />
        </button>
      </td>
    </tr>
  );
}

function IssueRow({ issue, onChange, onDelete }) {
  return (
    <tr>
      <td className="px-2 py-1.5">
        <input
          value={issue.title || ""}
          onChange={(e) => onChange({ ...issue, title: e.target.value })}
          className="w-full rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Issue title"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={issue.severity || "medium"}
          onChange={(e) => onChange({ ...issue, severity: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={issue.status || "open"}
          onChange={(e) => onChange({ ...issue, status: e.target.value })}
          className="rounded border-slate-200 px-1 py-0.5 text-xs"
        >
          <option value="open">Open</option>
          <option value="in-progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={issue.owner || ""}
          onChange={(e) => onChange({ ...issue, owner: e.target.value })}
          className="w-28 rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Owner"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={issue.notes || ""}
          onChange={(e) => onChange({ ...issue, notes: e.target.value })}
          className="w-full rounded border-slate-200 px-1.5 py-0.5 text-xs"
          placeholder="Notes"
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap text-[10px] text-slate-500">
        {fmtDateDisplay(issue.openedAt)}
      </td>
      <td className="px-2 py-1.5 text-right">
        <button type="button" onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <FaTrash />
        </button>
      </td>
    </tr>
  );
}

export default function ProjectManagementTab({
  dashboard,
  saving = false,
  importing = false,
  generating = false,
  importError = "",
  onSave,
  onGenerateFromBoq,
  onImportFile,
  onReset,
  onSetHeader,
}) {
  const headline = dashboard?.headline || {};
  const totals = dashboard?.totals || {};
  const buckets = dashboard?.buckets || {};
  const overdueByPriority = dashboard?.overdueByPriority || {};
  const burndown = dashboard?.burndown || [];
  const initialTasks = dashboard?.tasks || [];
  const initialRisks = dashboard?.risks || [];
  const initialIssues = dashboard?.issues || [];

  const [tasks, setTasks] = React.useState(initialTasks);
  const [risks, setRisks] = React.useState(initialRisks);
  const [issues, setIssues] = React.useState(initialIssues);
  const [projectStart, setProjectStart] = React.useState(fmtDateInput(dashboard?.projectStart));
  const [projectFinish, setProjectFinish] = React.useState(fmtDateInput(dashboard?.projectFinish));
  const [budgetOverride, setBudgetOverride] = React.useState(safeNum(dashboard?.totals?.BAC));
  const [dirty, setDirty] = React.useState(false);
  const fileRef = React.useRef(null);

  // Re-sync local state when the dashboard prop changes (e.g. after import).
  React.useEffect(() => {
    setTasks(dashboard?.tasks || []);
    setRisks(dashboard?.risks || []);
    setIssues(dashboard?.issues || []);
    setProjectStart(fmtDateInput(dashboard?.projectStart));
    setProjectFinish(fmtDateInput(dashboard?.projectFinish));
    setBudgetOverride(safeNum(dashboard?.totals?.BAC));
    setDirty(false);
  }, [dashboard?.asOf]);

  function markDirty() {
    setDirty(true);
  }

  function handleAddTask() {
    setTasks((prev) => [
      ...prev,
      {
        taskId: genId("tsk"),
        wbs: String(prev.length + 1),
        name: "",
        startDate: null,
        endDate: null,
        percentComplete: 0,
        baselineCost: 0,
        actualCost: 0,
        status: "not-started",
        priority: "medium",
        source: "manual",
      },
    ]);
    markDirty();
  }

  function handleTaskChange(i, next) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? next : t)));
    markDirty();
  }

  function handleTaskDelete(i) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }

  function handleAddRisk() {
    setRisks((prev) => [
      ...prev,
      {
        riskId: genId("rsk"),
        title: "",
        probability: "medium",
        impact: "medium",
        status: "open",
      },
    ]);
    markDirty();
  }

  function handleRiskChange(i, next) {
    setRisks((prev) => prev.map((r, idx) => (idx === i ? next : r)));
    markDirty();
  }

  function handleRiskDelete(i) {
    setRisks((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }

  function handleAddIssue() {
    setIssues((prev) => [
      ...prev,
      {
        issueId: genId("iss"),
        title: "",
        severity: "medium",
        status: "open",
        openedAt: new Date(),
      },
    ]);
    markDirty();
  }

  function handleIssueChange(i, next) {
    setIssues((prev) => prev.map((it, idx) => (idx === i ? next : it)));
    markDirty();
  }

  function handleIssueDelete(i) {
    setIssues((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }

  function handleSave() {
    onSave?.({
      tasks,
      risks,
      issues,
      projectStart: projectStart || null,
      projectFinish: projectFinish || null,
      budgetOverride: safeNum(budgetOverride),
    });
  }

  function handleFilePicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportFile?.(file);
    // Reset input so picking the same file twice re-fires onChange.
    e.target.value = "";
  }

  const cpi = safeNum(headline.CPI);
  const spi = safeNum(headline.SPI);

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-xl bg-adlm-blue-700 px-4 py-3 text-center text-lg font-semibold text-white shadow-sm">
        All-in-One Project Management Dashboard
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          label="Add Task"
          icon={FaPlus}
          color="blue"
          onClick={handleAddTask}
        />
        <ActionButton
          label="Add Risk"
          icon={FaExclamationTriangle}
          color="orange"
          onClick={handleAddRisk}
        />
        <ActionButton
          label="Add Issue"
          icon={FaBug}
          color="red"
          onClick={handleAddIssue}
        />
        <ActionButton
          label="Generate from BoQ"
          icon={FaMagic}
          color="purple"
          onClick={() =>
            onGenerateFromBoq?.({
              projectStart: projectStart || undefined,
              projectFinish: projectFinish || undefined,
            })
          }
          disabled={generating}
          title="Create one task per BoQ item, linked to its qty × rate"
        />
        <ActionButton
          label={importing ? "Importing..." : "Import MS Project"}
          icon={FaFileImport}
          color="slate"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          title="Upload MS Project XML (.xml) or .mpp file"
        />
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.mpp"
          className="hidden"
          onChange={handleFilePicked}
        />
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <span className="text-[11px] font-medium text-amber-700">Unsaved changes</span>
          ) : null}
          <ActionButton
            label={saving ? "Saving..." : "Save PM Plan"}
            icon={FaSyncAlt}
            color="green"
            onClick={handleSave}
            disabled={saving || !dirty}
          />
        </div>
      </div>

      {importError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {importError}
        </div>
      ) : null}

      {/* Headline tiles — six metrics matching the reference dashboard */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <HeadlineTile
          label="Progress"
          value={`${safeNum(headline.progressPercent).toFixed(0)}%`}
          tone="primary"
          helper="Avg % complete"
        />
        <HeadlineTile
          label="Budget Used"
          value={`${safeNum(headline.budgetUsedPercent).toFixed(0)}%`}
          tone="success"
          helper="Actual cost / BAC"
        />
        <HeadlineTile
          label="Overdue"
          value={safeNum(headline.overdueCount)}
          tone="danger"
          helper="Tasks past end date"
        />
        <HeadlineTile
          label="CPI"
          value={cpi ? cpi.toFixed(2) : "—"}
          tone={cpi >= 1 ? "success" : cpi >= 0.9 ? "warning" : "danger"}
          helper={cpi >= 1 ? "Under budget" : cpi > 0 ? "Over budget" : "No data"}
        />
        <HeadlineTile
          label="SPI"
          value={spi ? spi.toFixed(2) : "—"}
          tone={spi >= 1 ? "success" : spi >= 0.9 ? "warning" : "danger"}
          helper={spi >= 1 ? "On / ahead schedule" : spi > 0 ? "Behind schedule" : "No data"}
        />
        <HeadlineTile
          label="Tasks Done"
          value={`${safeNum(headline.tasksDonePercent).toFixed(0)}%`}
          tone="info"
          helper={`${totals.completedTasks || 0} of ${totals.totalTasks || 0}`}
        />
      </div>

      {/* Four chart panels */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tasks</div>
          <div className="mt-2">
            <TasksDonut buckets={buckets} totalTasks={totals.totalTasks} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Budget</div>
          <div className="mt-3">
            <BudgetBars BAC={totals.BAC} EV={totals.EV} AC={totals.AC} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Overdue by priority
          </div>
          <div className="mt-3">
            <OverdueBars overdueByPriority={overdueByPriority} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Burndown
          </div>
          <div className="mt-2">
            <BurndownChart burndown={burndown} BAC={totals.BAC} />
          </div>
        </div>
      </div>

      {/* Project header settings */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-xs">
            <span className="text-slate-500">Project start</span>
            <input
              type="date"
              value={projectStart}
              onChange={(e) => {
                setProjectStart(e.target.value);
                markDirty();
                onSetHeader?.({ projectStart: e.target.value });
              }}
              className="mt-1 w-full rounded border-slate-200 px-1.5 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-slate-500">Project finish</span>
            <input
              type="date"
              value={projectFinish}
              onChange={(e) => {
                setProjectFinish(e.target.value);
                markDirty();
                onSetHeader?.({ projectFinish: e.target.value });
              }}
              className="mt-1 w-full rounded border-slate-200 px-1.5 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-slate-500">Total budget (BAC)</span>
            <input
              type="number"
              min="0"
              value={budgetOverride}
              onChange={(e) => {
                setBudgetOverride(Math.max(0, Number(e.target.value) || 0));
                markDirty();
              }}
              className="mt-1 w-full rounded border-slate-200 px-1.5 py-1 text-sm text-right"
              placeholder="Auto from BoQ"
            />
          </label>
          <div className="text-xs">
            <span className="text-slate-500">EVM summary</span>
            <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              PV {fmtMoney(totals.PV)} · EV {fmtMoney(totals.EV)} · AC {fmtMoney(totals.AC)} · EAC {fmtMoney(totals.EAC)}
            </div>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold text-slate-700">
            <FaTasks className="inline-block mr-2 text-slate-400" />
            Task List ({tasks.length})
          </div>
          <button
            type="button"
            onClick={handleAddTask}
            className="text-xs font-medium text-adlm-blue-700 hover:underline"
          >
            + Add task
          </button>
        </div>
        {tasks.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            No tasks yet. Generate from BoQ, import MS Project, or add tasks manually.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">WBS</th>
                  <th className="px-2 py-1.5 text-left">Name</th>
                  <th className="px-2 py-1.5 text-left">Start</th>
                  <th className="px-2 py-1.5 text-left">Finish</th>
                  <th className="px-2 py-1.5 text-right">%</th>
                  <th className="px-2 py-1.5 text-right">Baseline ₦</th>
                  <th className="px-2 py-1.5 text-right">Actual ₦</th>
                  <th className="px-2 py-1.5 text-left">Priority</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Assignee</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task, i) => (
                  <TaskRow
                    key={task.taskId || i}
                    task={task}
                    onChange={(next) => handleTaskChange(i, next)}
                    onDelete={() => handleTaskDelete(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Risk register */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold text-slate-700">
            <FaExclamationTriangle className="inline-block mr-2 text-amber-500" />
            Risk Register ({risks.length})
          </div>
          <button
            type="button"
            onClick={handleAddRisk}
            className="text-xs font-medium text-adlm-blue-700 hover:underline"
          >
            + Add risk
          </button>
        </div>
        {risks.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            No risks logged.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Title</th>
                  <th className="px-2 py-1.5 text-left">Probability</th>
                  <th className="px-2 py-1.5 text-left">Impact</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Owner</th>
                  <th className="px-2 py-1.5 text-left">Mitigation</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {risks.map((risk, i) => (
                  <RiskRow
                    key={risk.riskId || i}
                    risk={risk}
                    onChange={(next) => handleRiskChange(i, next)}
                    onDelete={() => handleRiskDelete(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Issue log */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold text-slate-700">
            <FaBug className="inline-block mr-2 text-rose-500" />
            Issue Log ({issues.length})
          </div>
          <button
            type="button"
            onClick={handleAddIssue}
            className="text-xs font-medium text-adlm-blue-700 hover:underline"
          >
            + Add issue
          </button>
        </div>
        {issues.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            No issues logged.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Title</th>
                  <th className="px-2 py-1.5 text-left">Severity</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Owner</th>
                  <th className="px-2 py-1.5 text-left">Notes</th>
                  <th className="px-2 py-1.5 text-left">Opened</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((issue, i) => (
                  <IssueRow
                    key={issue.issueId || i}
                    issue={issue}
                    onChange={(next) => handleIssueChange(i, next)}
                    onDelete={() => handleIssueDelete(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer / Import note */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-700 mb-1">
          <FaFileCode className="inline-block mr-2 text-slate-400" />
          About MS Project import
        </div>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <b>.xml</b> exports from MS Project are fully supported — File → Save As → "Microsoft Project XML Format (*.xml)".
          </li>
          <li>
            <b>.mpp</b> files are accepted but require <code>MPXJ_CLI_PATH</code> to be configured on the server (Java runtime).
            Without it, convert to .xml first.
          </li>
          <li>
            Tasks generated from BoQ stay linked — their baseline cost auto-updates when you change qty or rate in the Bill of Quantity tab.
          </li>
          {dashboard?.asOf ? (
            <li className="italic">
              As of {new Date(dashboard.asOf).toLocaleString()}.
            </li>
          ) : null}
        </ul>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="text-[10px] text-slate-400 hover:text-rose-600 hover:underline"
      >
        Reset PM data (clears tasks, risks, issues)
      </button>
    </div>
  );
}
