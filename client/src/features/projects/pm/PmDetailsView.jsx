import React from "react";
import {
  FaArrowLeft,
  FaTasks,
  FaExclamationTriangle,
  FaBug,
  FaPencilAlt,
  FaTrash,
  FaPlus,
  FaLink,
  FaCheckCircle,
} from "react-icons/fa";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtDateDisplay(v) {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

// Status / priority badges so the table doesn't depend on cramped text.
function PriorityBadge({ priority }) {
  const cls = {
    critical: "bg-rose-100 text-rose-800 border-rose-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-slate-100 text-slate-700 border-slate-300",
    low: "bg-slate-50 text-slate-500 border-slate-200",
  }[priority || "medium"];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {priority || "medium"}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = {
    "not-started": "bg-slate-100 text-slate-600 border-slate-300",
    "in-progress": "bg-amber-100 text-amber-800 border-amber-300",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    blocked: "bg-rose-100 text-rose-800 border-rose-300",
    open: "bg-amber-100 text-amber-800 border-amber-300",
    mitigating: "bg-sky-100 text-sky-800 border-sky-300",
    accepted: "bg-slate-100 text-slate-700 border-slate-300",
    closed: "bg-slate-100 text-slate-500 border-slate-200",
    resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  }[status] || "bg-slate-100 text-slate-600 border-slate-300";

  const label = String(status || "").replace(/-/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WBS / Task Table
// ─────────────────────────────────────────────────────────────────────
function TaskTable({ tasks, onEditTask, onDeleteTask, onAddTask, onPercentChange, onStatusChange }) {
  if (!tasks?.length) {
    return (
      <EmptyState
        icon={FaTasks}
        title="No tasks yet"
        helper="Generate from BoQ, import MS Project, or add tasks manually."
        actionLabel="Add a task"
        onAction={onAddTask}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm" style={{ minWidth: 1100 }}>
        <thead className="sticky top-0 bg-slate-50 text-slate-600 z-10">
          <tr className="text-left">
            <th className="px-3 py-2 font-semibold" style={{ width: 70 }}>WBS</th>
            {/* Name column gets the most space; allows wrapping. */}
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 280 }}>Name</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ width: 110 }}>Start</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ width: 110 }}>Finish</th>
            <th className="px-3 py-2 font-semibold text-right" style={{ width: 80 }}>%</th>
            <th className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ width: 130 }}>Baseline ₦</th>
            <th className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ width: 130 }}>Actual ₦</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 100 }}>Priority</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 120 }}>Status</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 140 }}>Assignee</th>
            <th className="px-3 py-2 text-right" style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const overdue = task?.computed?.isOverdue;
            const linked = (task.linkedBoqIdentities || []).length > 0;
            return (
              <tr
                key={task.taskId}
                className={overdue ? "bg-rose-50/60 hover:bg-rose-50" : "hover:bg-slate-50"}
              >
                <td className="px-3 py-2 align-top text-xs font-mono text-slate-500">
                  {task.wbs || "—"}
                </td>
                <td className="px-3 py-2 align-top">
                  {/* Name wraps naturally — no truncation, full visibility */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 whitespace-normal break-words">
                        {task.name || <span className="italic text-slate-400">(no name)</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                        {linked ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-adlm-blue-700">
                            <FaLink className="text-[8px]" />
                            {task.linkedBoqIdentities.length} BoQ link{task.linkedBoqIdentities.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {task.isMilestone ? (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">
                            ◆ Milestone
                          </span>
                        ) : null}
                        {task.source && task.source !== "manual" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            {task.source}
                          </span>
                        ) : null}
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-xs whitespace-nowrap text-slate-700">
                  {fmtDateDisplay(task.startDate)}
                </td>
                <td className="px-3 py-2 align-top text-xs whitespace-nowrap text-slate-700">
                  {fmtDateDisplay(task.endDate)}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={safeNum(task.percentComplete)}
                    onChange={(e) =>
                      onPercentChange?.(task.taskId, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-14 rounded border-slate-200 px-1 py-0.5 text-xs text-right"
                  />
                </td>
                <td className="px-3 py-2 align-top text-right text-xs whitespace-nowrap">
                  {linked ? (
                    <span title="Derived from linked BoQ items">
                      ₦{fmtMoney(task.computed?.baselineCost ?? task.baselineCost)}
                    </span>
                  ) : (
                    `₦${fmtMoney(task.baselineCost)}`
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right text-xs whitespace-nowrap">
                  ₦{fmtMoney(task.computed?.actualCost ?? task.actualCost)}
                </td>
                <td className="px-3 py-2 align-top">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={task.status || "not-started"}
                    onChange={(e) => onStatusChange?.(task.taskId, e.target.value)}
                    className="rounded border-slate-200 px-1.5 py-0.5 text-[11px] bg-white"
                  >
                    <option value="not-started">Not started</option>
                    <option value="in-progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-700">
                  {task.assignedTo || <span className="italic text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTask?.(task)}
                      className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-adlm-blue-700"
                      title="Edit"
                    >
                      <FaPencilAlt className="text-xs" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask?.(task.taskId)}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete"
                    >
                      <FaTrash className="text-xs" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Risks Table
// ─────────────────────────────────────────────────────────────────────
function RiskTable({ risks, onEditRisk, onDeleteRisk, onAddRisk }) {
  if (!risks?.length) {
    return (
      <EmptyState
        icon={FaExclamationTriangle}
        title="No risks logged"
        helper="Track potential issues before they become problems."
        actionLabel="Add a risk"
        onAction={onAddRisk}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm" style={{ minWidth: 900 }}>
        <thead className="sticky top-0 bg-slate-50 text-slate-600 z-10">
          <tr className="text-left">
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 220 }}>Title</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 110 }}>Probability</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 110 }}>Impact</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 130 }}>Status</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 140 }}>Owner</th>
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 220 }}>Mitigation</th>
            <th className="px-3 py-2 text-right" style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {risks.map((risk) => (
            <tr key={risk.riskId} className="hover:bg-slate-50">
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-slate-900 whitespace-normal break-words">
                  {risk.title || <span className="italic text-slate-400">(no title)</span>}
                </div>
                {risk.description ? (
                  <div className="mt-0.5 text-[11px] text-slate-500 whitespace-normal break-words">
                    {risk.description}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top">
                <StatusBadge status={risk.probability} />
              </td>
              <td className="px-3 py-2 align-top">
                <StatusBadge status={risk.impact} />
              </td>
              <td className="px-3 py-2 align-top">
                <StatusBadge status={risk.status} />
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700">
                {risk.owner || <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700 whitespace-normal break-words">
                {risk.mitigation || <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 align-top text-right">
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditRisk?.(risk)}
                    className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-adlm-blue-700"
                    title="Edit"
                  >
                    <FaPencilAlt className="text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRisk?.(risk.riskId)}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Issues Table
// ─────────────────────────────────────────────────────────────────────
function IssueTable({ issues, onEditIssue, onDeleteIssue, onAddIssue }) {
  if (!issues?.length) {
    return (
      <EmptyState
        icon={FaBug}
        title="No issues logged"
        helper="Capture blockers, dependencies, and field issues here."
        actionLabel="Add an issue"
        onAction={onAddIssue}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm" style={{ minWidth: 900 }}>
        <thead className="sticky top-0 bg-slate-50 text-slate-600 z-10">
          <tr className="text-left">
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 220 }}>Title</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 100 }}>Severity</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 130 }}>Status</th>
            <th className="px-3 py-2 font-semibold" style={{ width: 140 }}>Owner</th>
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 220 }}>Notes</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ width: 110 }}>Opened</th>
            <th className="px-3 py-2 text-right" style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue) => (
            <tr key={issue.issueId} className="hover:bg-slate-50">
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-slate-900 whitespace-normal break-words">
                  {issue.title || <span className="italic text-slate-400">(no title)</span>}
                </div>
                {issue.description ? (
                  <div className="mt-0.5 text-[11px] text-slate-500 whitespace-normal break-words">
                    {issue.description}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top">
                <StatusBadge status={issue.severity} />
              </td>
              <td className="px-3 py-2 align-top">
                <StatusBadge status={issue.status} />
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700">
                {issue.owner || <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700 whitespace-normal break-words">
                {issue.notes || <span className="italic text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 align-top text-[10px] text-slate-500 whitespace-nowrap">
                {fmtDateDisplay(issue.openedAt)}
              </td>
              <td className="px-3 py-2 align-top text-right">
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditIssue?.(issue)}
                    className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-adlm-blue-700"
                    title="Edit"
                  >
                    <FaPencilAlt className="text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteIssue?.(issue.issueId)}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon: Icon, title, helper, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      <Icon className="mx-auto text-3xl text-slate-300" />
      <div className="mt-3 text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-adlm-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <FaPlus />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main details view — 3 sub-tabs
// ─────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { id: "tasks", label: "WBS / Tasks", icon: FaTasks },
  { id: "risks", label: "Risk Register", icon: FaExclamationTriangle },
  { id: "issues", label: "Issue Log", icon: FaBug },
];

export default function PmDetailsView({
  tasks = [],
  risks = [],
  issues = [],
  onBack,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onPercentChange,
  onStatusChange,
  onAddRisk,
  onEditRisk,
  onDeleteRisk,
  onAddIssue,
  onEditIssue,
  onDeleteIssue,
  onSave,
  saving,
  dirty,
}) {
  const [subTab, setSubTab] = React.useState("tasks");

  const counts = {
    tasks: tasks.length,
    risks: risks.length,
    issues: issues.length,
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-900 px-4 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            <FaArrowLeft />
            Back to Dashboard
          </button>
          <div>
            <div className="text-xs uppercase tracking-widest opacity-80">PM Details</div>
            <div className="text-sm font-bold">Schedule · Risks · Issues</div>
          </div>
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
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-600 transition disabled:opacity-50"
          >
            <FaCheckCircle />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-1">
        <div className="flex gap-1">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={[
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-adlm-blue-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                <Icon className={active ? "text-white" : "text-slate-400"} />
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    active ? "bg-white/20" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-700">
            {subTab === "tasks" ? "WBS / Task list" : subTab === "risks" ? "Risk register" : "Issue log"}
          </div>
          <button
            type="button"
            onClick={
              subTab === "tasks"
                ? () => onAddTask?.()
                : subTab === "risks"
                  ? () => onAddRisk?.()
                  : () => onAddIssue?.()
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            <FaPlus className="text-[10px]" />
            {subTab === "tasks" ? "Add task" : subTab === "risks" ? "Add risk" : "Add issue"}
          </button>
        </div>

        {subTab === "tasks" ? (
          <TaskTable
            tasks={tasks}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onAddTask={onAddTask}
            onPercentChange={onPercentChange}
            onStatusChange={onStatusChange}
          />
        ) : subTab === "risks" ? (
          <RiskTable
            risks={risks}
            onEditRisk={onEditRisk}
            onDeleteRisk={onDeleteRisk}
            onAddRisk={onAddRisk}
          />
        ) : (
          <IssueTable
            issues={issues}
            onEditIssue={onEditIssue}
            onDeleteIssue={onDeleteIssue}
            onAddIssue={onAddIssue}
          />
        )}
      </div>
    </div>
  );
}
