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
  FaFileImport,
  FaSyncAlt,
  FaCalendarAlt,
} from "react-icons/fa";
import PmWbsScrollNav from "./PmWbsScrollNav.jsx";

// A row is treated as a section anchor in the scroll-nav drawer if it's
// flagged as a summary (set during MS Project import) OR its WBS code is
// shallow enough to act as a heading. Tweak SHALLOW_DEPTH to make sections
// coarser/finer (depth = number of dot-separated levels).
const SHALLOW_DEPTH = 2;
function isSectionRow(task) {
  if (!task) return false;
  if (task.isSummary) return true;
  const wbs = String(task.wbs || "").trim();
  if (!wbs) return false;
  const depth = wbs.split(".").filter(Boolean).length;
  return depth <= SHALLOW_DEPTH;
}

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
  // Persist DOM refs for summary / section rows so the floating scroll nav
  // can jump to them. Stored in a ref-map keyed by taskId because tasks can
  // re-render on every keystroke (percent edit, status change, etc.).
  const sectionRefs = React.useRef({});

  // ── Collapsible summary state ────────────────────────────────────────
  // The triangle on each summary row toggles whether its descendants
  // render. Keyed on WBS code so the state survives task-id regeneration
  // (e.g. after an import that re-creates tasks). Persisted in
  // localStorage so users don't lose their layout on reload.
  const STORAGE_KEY = "adlm:pmCollapsedWbs";
  const [collapsedWbs, setCollapsedWbs] = React.useState(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  function toggleCollapsed(wbs) {
    if (!wbs) return;
    setCollapsedWbs((prev) => {
      const next = new Set(prev);
      if (next.has(wbs)) next.delete(wbs);
      else next.add(wbs);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }

  function collapseAll() {
    const allSummaryWbs = tasks
      .filter((t) => t.isSummary && t.wbs)
      .map((t) => t.wbs);
    const next = new Set(allSummaryWbs);
    setCollapsedWbs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch { /* ignore */ }
  }
  function expandAll() {
    setCollapsedWbs(new Set());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch { /* ignore */ }
  }

  // Walk-the-chain check: a task is hidden if ANY ancestor WBS is in the
  // collapsed set. Uses the server-supplied parentWbs to skip recomputing
  // hierarchy on the client.
  const parentByWbs = React.useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (t.wbs && t.parentWbs) m.set(t.wbs, t.parentWbs);
    }
    return m;
  }, [tasks]);

  function isHiddenByCollapse(task) {
    if (collapsedWbs.size === 0) return false;
    let p = task?.parentWbs || null;
    let safety = 64; // pathological-tree guard
    while (p && safety-- > 0) {
      if (collapsedWbs.has(p)) return true;
      p = parentByWbs.get(p) || null;
    }
    return false;
  }

  const visibleTasks = React.useMemo(
    () => tasks.filter((t) => !isHiddenByCollapse(t)),
    [tasks, collapsedWbs, parentByWbs],
  );

  // Pre-compute hidden-child counts so the collapsed summary can show
  // "+ N hidden" for context. Cheap because tasks is already iterated.
  const hiddenChildCountByWbs = React.useMemo(() => {
    const map = new Map();
    if (collapsedWbs.size === 0) return map;
    for (const t of tasks) {
      let p = t?.parentWbs || null;
      let safety = 64;
      while (p && safety-- > 0) {
        if (collapsedWbs.has(p)) {
          map.set(p, (map.get(p) || 0) + 1);
          break; // count under the nearest collapsed ancestor only
        }
        p = parentByWbs.get(p) || null;
      }
    }
    return map;
  }, [tasks, collapsedWbs, parentByWbs]);

  const sections = React.useMemo(() => {
    if (!tasks?.length) return [];
    return tasks.filter(isSectionRow).map((t) => ({
      id: t.taskId,
      wbs: t.wbs || "",
      name: t.name || "",
      refGetter: () => sectionRefs.current[t.taskId] || null,
    }));
  }, [tasks]);

  // Any tasks visibly hidden right now? Drives the "Expand all" hint.
  const hasCollapsed = collapsedWbs.size > 0;

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
  // How many summary rows can be collapsed? Used to decide whether to
  // show the "Collapse all" button at all.
  const summaryCount = tasks.filter((t) => t.isSummary && t.wbs).length;

  return (
    <div className="rounded-xl border border-slate-200">
      {summaryCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-600">
          <div>
            {hasCollapsed ? (
              <span>
                <strong className="text-slate-900">{collapsedWbs.size}</strong>{" "}
                of {summaryCount} summary {summaryCount === 1 ? "row" : "rows"} collapsed.
              </span>
            ) : (
              <span>
                Click the ▼ on a summary row to collapse it. State persists across reloads.
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={collapseAll}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={expandAll}
              disabled={!hasCollapsed}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Expand all
            </button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
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
          {visibleTasks.map((task) => {
            const overdue = task?.computed?.isOverdue;
            const linked = (task.linkedBoqIdentities || []).length > 0;
            const isSection = isSectionRow(task);
            // Summary rows: use rolled-up values (which include all leaf
            // descendants) instead of the task's own — usually empty — fields.
            const isSummary = Boolean(task?.isSummary || task?.rollup);
            const rollup = task?.rollup || null;
            const depth = Math.max(0, safeNum(task?.wbsDepth));
            const isCollapsed = isSummary && collapsedWbs.has(task.wbs);
            const hiddenChildCount = isCollapsed
              ? hiddenChildCountByWbs.get(task.wbs) || 0
              : 0;

            // Choose display values: summary rows show rollup values, leaves
            // show their own.
            const displayPercent = isSummary && rollup
              ? safeNum(rollup.percentComplete)
              : safeNum(task.percentComplete);
            const displayBaseline = isSummary && rollup
              ? rollup.baselineCost
              : (task.computed?.baselineCost ?? task.baselineCost);
            const displayActual = isSummary && rollup
              ? rollup.actualCost
              : (task.computed?.actualCost ?? task.actualCost);
            const displayStart = isSummary && rollup
              ? rollup.startDate
              : task.startDate;
            const displayEnd = isSummary && rollup
              ? rollup.endDate
              : task.endDate;
            const displayStatus = isSummary && rollup
              ? rollup.status
              : (task.status || "not-started");

            // Visual treatment for summary rows — distinct background,
            // bold name, no input controls (they're read-only rollups).
            const rowBgCls = isSummary
              ? "bg-slate-100/80 hover:bg-slate-100 border-y border-slate-200"
              : overdue
                ? "bg-rose-50/60 hover:bg-rose-50"
                : "hover:bg-slate-50";

            return (
              <tr
                key={task.taskId}
                ref={
                  isSection
                    ? (el) => {
                        if (el) sectionRefs.current[task.taskId] = el;
                        else delete sectionRefs.current[task.taskId];
                      }
                    : undefined
                }
                className={rowBgCls}
              >
                <td className={`px-3 py-2 align-top text-xs font-mono ${isSummary ? "font-bold text-slate-900" : "text-slate-500"}`}>
                  {task.wbs || "—"}
                </td>
                <td className="px-3 py-2 align-top">
                  {/* Indent based on WBS depth so the hierarchy is visible.
                      Summary rows render in bold with a triangle marker. */}
                  <div
                    className="flex items-start gap-2"
                    style={{ paddingLeft: Math.min(depth, 5) * 16 }}
                  >
                    {isSummary ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(task.wbs)}
                        title={isCollapsed ? `Expand (${hiddenChildCount} hidden)` : "Collapse children"}
                        aria-expanded={!isCollapsed}
                        className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-adlm-blue-700 hover:bg-blue-100/70 active:scale-95 transition"
                      >
                        <span className="text-[11px] leading-none">
                          {isCollapsed ? "▶" : "▼"}
                        </span>
                      </button>
                    ) : depth > 0 ? (
                      <span className="mt-1 text-[10px] text-slate-300">└</span>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div
                        className={[
                          "whitespace-normal break-words",
                          isSummary
                            ? "font-bold text-slate-900 text-sm"
                            : "font-medium text-slate-800",
                        ].join(" ")}
                      >
                        {task.name || <span className="italic text-slate-400">(no name)</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                        {isSummary && rollup ? (
                          <span className="inline-flex items-center gap-1 rounded bg-adlm-blue-700 px-1.5 py-0.5 text-white font-semibold">
                            Σ {rollup.leafCount} leaf{rollup.leafCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {isCollapsed && hiddenChildCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 font-medium">
                            ▶ {hiddenChildCount} hidden
                          </span>
                        ) : null}
                        {isSummary && rollup?.durationDays ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">
                            {rollup.durationDays}d
                          </span>
                        ) : null}
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
                        {!isSummary && task.source && task.source !== "manual" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            {task.source}
                          </span>
                        ) : null}
                        {overdue && !isSummary ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={`px-3 py-2 align-top text-xs whitespace-nowrap ${isSummary ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                  {fmtDateDisplay(displayStart)}
                </td>
                <td className={`px-3 py-2 align-top text-xs whitespace-nowrap ${isSummary ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                  {fmtDateDisplay(displayEnd)}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  {isSummary ? (
                    // Read-only weighted-average percent. A small bar visualises
                    // it so the summary row scans like a progress header.
                    <div className="inline-flex flex-col items-end">
                      <span className="font-bold text-slate-900 text-sm">
                        {displayPercent.toFixed(0)}%
                      </span>
                      <div className="mt-0.5 h-1 w-12 overflow-hidden rounded bg-slate-300">
                        <div
                          className="h-full bg-adlm-blue-700"
                          style={{ width: `${Math.max(0, Math.min(100, displayPercent))}%` }}
                        />
                      </div>
                    </div>
                  ) : (
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
                  )}
                </td>
                <td className={`px-3 py-2 align-top text-right text-xs whitespace-nowrap ${isSummary ? "font-bold text-slate-900" : ""}`}>
                  {linked && !isSummary ? (
                    <span title="Derived from linked BoQ items">
                      ₦{fmtMoney(displayBaseline)}
                    </span>
                  ) : (
                    `₦${fmtMoney(displayBaseline)}`
                  )}
                </td>
                <td className={`px-3 py-2 align-top text-right text-xs whitespace-nowrap ${isSummary ? "font-bold text-slate-900" : ""}`}>
                  ₦{fmtMoney(displayActual)}
                </td>
                <td className="px-3 py-2 align-top">
                  {isSummary ? (
                    <span className="text-[10px] text-slate-400">—</span>
                  ) : (
                    <PriorityBadge priority={task.priority} />
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  {isSummary ? (
                    <StatusBadge status={displayStatus} />
                  ) : (
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
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-700">
                  {isSummary ? (
                    <span className="text-[10px] text-slate-400">—</span>
                  ) : (
                    task.assignedTo || <span className="italic text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="inline-flex items-center gap-1">
                    {/* Summary tasks are read-only — their values come from
                        their leaf children. Editing or deleting them would
                        leave orphan rows and a corrupted hierarchy. To make
                        a summary editable, delete every child first; the
                        row stops being a summary and the buttons re-enable. */}
                    <button
                      type="button"
                      onClick={() => !isSummary && onEditTask?.(task)}
                      disabled={isSummary}
                      className={`rounded p-1.5 ${isSummary ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:bg-blue-50 hover:text-adlm-blue-700"}`}
                      title={isSummary ? "Summary tasks are read-only. Delete or edit their child tasks instead." : "Edit"}
                    >
                      <FaPencilAlt className="text-xs" />
                    </button>
                    <button
                      type="button"
                      onClick={() => !isSummary && onDeleteTask?.(task.taskId)}
                      disabled={isSummary}
                      className={`rounded p-1.5 ${isSummary ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:bg-rose-50 hover:text-rose-600"}`}
                      title={isSummary ? "Delete child tasks first — summary rows can't be removed while they have descendants." : "Delete"}
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
      {/* Floating jump nav — fixed to the viewport so it stays visible while
          the user scrolls the long task list. */}
      <PmWbsScrollNav sections={sections} />
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
  onClearImports,
  onReschedule,
  onExportCalendar,
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

  // How many tasks came from an MS Project import — drives the visibility
  // of the "Delete imports" button in the details header.
  const importedTaskCount = React.useMemo(() => {
    return tasks.filter((t) => String(t?.source || "").startsWith("msproject")).length;
  }, [tasks]);

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
          {/* Export to calendar — downloads the schedule as a .ics file.
              Drop into Google Calendar / Outlook / Apple Calendar via the
              app's "Import calendar" flow. Filename = project name. */}
          {onExportCalendar ? (
            <button
              type="button"
              onClick={onExportCalendar}
              title="Download the schedule as a calendar (.ics) file. Import into Google Calendar, Outlook, or Apple Calendar."
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-white/20 transition"
            >
              <FaCalendarAlt className="text-[11px]" />
              Export calendar
            </button>
          ) : null}
          {/* Reschedule — explicit re-cascade. Useful after manually editing
              durations or adding predecessor links, without having to bump
              the project start to trigger the auto-cascade. */}
          {onReschedule ? (
            <button
              type="button"
              onClick={onReschedule}
              title="Recompute every task's start/finish from the project start date, flowing through predecessor relationships."
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-white/20 transition"
            >
              <FaSyncAlt className="text-[11px]" />
              Reschedule
            </button>
          ) : null}
          {/* Delete-imports — only visible when MS Project tasks exist, so
              the destructive control doesn't appear on a clean slate. */}
          {importedTaskCount > 0 && onClearImports ? (
            <button
              type="button"
              onClick={onClearImports}
              title={`Delete all ${importedTaskCount} imported MS Project task(s). Manual & BoQ-linked tasks are preserved.`}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-600 transition"
            >
              <FaFileImport />
              Delete imports
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                {importedTaskCount}
              </span>
            </button>
          ) : null}
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
