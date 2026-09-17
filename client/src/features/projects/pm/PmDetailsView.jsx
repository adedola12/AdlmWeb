import React from "react";
import { FaBug, FaCalendarAlt, FaCheckCircle, FaExclamationTriangle, FaFileImport, FaLink, FaPencilAlt, FaPlus, FaSyncAlt, FaTasks, FaTrash } from "../../../components/icons.jsx";
import SectionRail from "../SectionRail.jsx";

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
  if (!v) return "–";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString();
}

// His palettes, for chips and row states.
function palChip(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
const ROW_BTN = { padding: "4px 7px" };
const EMPTY_INK = { color: "var(--ink-3)" };

// Status / priority badges, as his .wk-src chips in his palettes: orange for
// what needs attention, blues for work moving or done, plain for the rest.
function PriorityBadge({ priority }) {
  const style = {
    critical: palChip("orange"),
    high: palChip("deep"),
  }[priority || "medium"];
  return (
    <span className="wk-src sm" style={{ textTransform: "capitalize", ...style }}>
      {priority || "medium"}
    </span>
  );
}

function StatusBadge({ status }) {
  const style = {
    "in-progress": palChip("deep"),
    completed: palChip("light"),
    blocked: palChip("orange"),
    open: palChip("orange"),
    mitigating: palChip("grad"),
    resolved: palChip("light"),
  }[status];

  const label = String(status || "").replace(/-/g, " ");
  return (
    <span className="wk-src sm" style={style}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WBS / Task Table
// ─────────────────────────────────────────────────────────────────────
function TaskTable({
  tasks,
  onEditTask,
  onDeleteTask,
  onAddTask,
  onPercentChange,
  onStatusChange,
  // onActualDurationChange(taskId, days) — fired when the user types
  // a number into the Actual-days input. Server derives variance vs
  // planned and surfaces a slip/early pill underneath the input.
  onActualDurationChange,
}) {
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

  // SectionRail shape — { id, label, badge, indent, refGetter }. Reuses
  // the WBS section list but adds indent based on dot depth so nested
  // summary tasks appear visually nested in the rail.
  const railSections = React.useMemo(() => {
    return sections.map((s) => {
      const depth = String(s.wbs || "")
        .split(".")
        .filter(Boolean).length - 1;
      return {
        id: s.id,
        label: s.name || "(unnamed)",
        badge: s.wbs || undefined,
        indent: Math.max(0, depth),
        refGetter: s.refGetter,
      };
    });
  }, [sections]);

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
    <div className="flex gap-4">
      {/* Docked section rail: sticky on xl+ screens, falls back to a
          floating pill on smaller screens. All jumps are instant
          (behavior: "auto") so the user doesn't get the dizzy feel of
          smooth-scrolling across a 200-row WBS. */}
      <SectionRail
        title="WBS sections"
        sections={railSections}
        scrollOffset={96}
      />

      <div className="wk-panel" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
      {summaryCount > 0 ? (
        <div
          className="wk-bar wk-locnote"
          style={{ marginBottom: 0, justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}
        >
          <div>
            {hasCollapsed ? (
              <span>
                <strong style={{ color: "var(--ink)" }}>{collapsedWbs.size}</strong>{" "}
                of {summaryCount} summary {summaryCount === 1 ? "row" : "rows"} collapsed.
              </span>
            ) : (
              <span>
                Click the ▼ on a summary row to collapse it. State persists across reloads.
              </span>
            )}
          </div>
          <div className="wk-acts">
            <button
              type="button"
              onClick={collapseAll}
              className="ds-btn ds-btn-sm btn-o"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={expandAll}
              disabled={!hasCollapsed}
              className="ds-btn ds-btn-sm btn-o"
            >
              Expand all
            </button>
          </div>
        </div>
      ) : null}
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
      <table className="w-full text-sm" style={{ minWidth: 1100 }}>
        <thead className="sticky top-0 bg-slate-50 text-slate-600 z-10">
          <tr className="text-left">
            <th className="px-3 py-2 font-semibold" style={{ width: 70 }}>WBS</th>
            {/* Name column gets the most space; allows wrapping. */}
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 280 }}>Name</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ width: 110 }}>Start</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ width: 110 }}>Finish</th>
            {/* Days column, planned / actual / variance. Single
                column keeps the table compact; the cell renders three
                small lines stacked. */}
            <th className="px-3 py-2 font-semibold text-right whitespace-nowrap" style={{ width: 110 }}>
              Days (P / A)
            </th>
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
            const rowStyle = isSummary
              ? { background: "var(--bg-alt)" }
              : overdue
                ? { background: "var(--pal-orange-wash)" }
                : undefined;

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
                style={rowStyle}
              >
                <td className={`px-3 py-2 align-top text-xs font-mono ${isSummary ? "font-bold text-slate-900" : "text-slate-500"}`}>
                  {task.wbs || "–"}
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
                      <span className="mt-1 text-[10px]" style={EMPTY_INK}>└</span>
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
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {isSummary && rollup ? (
                          <span className="wk-src sm" style={palChip("light")}>
                            Σ {rollup.leafCount} leaf{rollup.leafCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {isCollapsed && hiddenChildCount > 0 ? (
                          <span className="wk-src sm">
                            ▶ {hiddenChildCount} hidden
                          </span>
                        ) : null}
                        {isSummary && rollup?.durationDays ? (
                          <span className="wk-src sm">
                            {rollup.durationDays}d
                          </span>
                        ) : null}
                        {linked ? (
                          <span className="wk-src sm" style={palChip("light")}>
                            <FaLink size={11} />
                            {task.linkedBoqIdentities.length} BoQ link{task.linkedBoqIdentities.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {task.isMilestone ? (
                          <span className="wk-src sm" style={palChip("deep")}>
                            ◆ Milestone
                          </span>
                        ) : null}
                        {/* Critical path badge. Set by the MS Project
                            importer when MSPDI reports Critical=1 (zero
                            slack). Surfaces in rose so users can see at
                            a glance which tasks have no scheduling
                            buffer. Hidden on summary rows since
                            criticality is a leaf property. */}
                        {!isSummary && task.criticalPath ? (
                          <span
                            className="wk-src sm"
                            style={palChip("orange")}
                            title={
                              safeNum(task.totalSlackDays) > 0
                                ? `On critical path · ${safeNum(task.totalSlackDays)}d total slack`
                                : "On critical path · zero slack, any delay slips the project finish"
                            }
                          >
                            🔥 Critical path
                          </span>
                        ) : null}
                        {/* Near-critical hint, non-critical tasks with
                            very tight slack get a low-key amber chip so
                            users know they should watch them too. */}
                        {!isSummary &&
                        !task.criticalPath &&
                        safeNum(task.totalSlackDays) > 0 &&
                        safeNum(task.totalSlackDays) <= 1 ? (
                          <span
                            className="wk-src sm"
                            style={palChip("orange")}
                            title={`Only ${safeNum(task.totalSlackDays).toFixed(1)}d of slack, near critical`}
                          >
                            ⚠ Tight slack
                          </span>
                        ) : null}
                        {!isSummary && task.source && task.source !== "manual" ? (
                          <span className="wk-src sm">
                            {task.source}
                          </span>
                        ) : null}
                        {overdue && !isSummary ? (
                          <span className="wk-src sm" style={palChip("orange")}>
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
                {/* Days cell: planned (from durationDays) on top, actual
                    (editable on leaves; rolled up on summaries) below,
                    variance pill at the bottom. Hidden bookkeeping note:
                    the server derives actualDurationDays from
                    actualStartDate/actualEndDate when both are set and
                    the user hasn't typed an explicit value. */}
                <td className="px-3 py-2 align-top text-right text-xs whitespace-nowrap">
                  {(() => {
                    const planned = safeNum(
                      isSummary && rollup ? rollup.durationDays : task.durationDays,
                    );
                    const actual = safeNum(
                      task.computed?.actualDuration ?? task.actualDurationDays,
                    );
                    const variance = safeNum(task.computed?.scheduleVarianceDays);
                    if (isSummary) {
                      // Rolled-up summary: just show planned. Per-task
                      // actuals aren't aggregated to summaries because
                      // they'd double-count parallel work.
                      return (
                        <div className="text-slate-700">
                          {planned > 0 ? `${planned}d` : "–"}
                        </div>
                      );
                    }
                    return (
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-slate-500">
                          P: {planned > 0 ? `${planned}d` : "–"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={actual || ""}
                          placeholder="Actual"
                          onChange={(e) =>
                            onActualDurationChange?.(
                              task.taskId,
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                          className="w-16 rounded border-slate-200 px-1 py-0.5 text-[11px] text-right"
                          title={
                            actual > 0
                              ? `Actual ${actual} days · planned was ${planned}`
                              : "Enter actual duration in days"
                          }
                        />
                        {actual > 0 && planned > 0 ? (
                          <span
                            className="text-[9px] font-semibold"
                            style={{
                              color:
                                variance > 0
                                  ? "var(--pal-orange-key)"
                                  : variance < 0
                                    ? "var(--pal-light-key)"
                                    : "var(--ink-3)",
                            }}
                            title={
                              variance > 0
                                ? `Slip, task ran ${variance}d longer than planned`
                                : variance < 0
                                  ? `Finished ${Math.abs(variance)}d early`
                                  : "On schedule"
                            }
                          >
                            {variance > 0
                              ? `+${variance}d slip`
                              : variance < 0
                                ? `${variance}d early`
                                : "on time"}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  {isSummary ? (
                    // Read-only weighted-average percent. A small bar visualises
                    // it so the summary row scans like a progress header.
                    <div className="inline-flex flex-col items-end">
                      <span className="font-bold text-slate-900 text-sm">
                        {displayPercent.toFixed(0)}%
                      </span>
                      <div className="dsh-meter" style={{ marginTop: 4 }}>
                        <div className="track" style={{ width: 48, height: 4 }}>
                          <i style={{ width: `${Math.max(0, Math.min(100, displayPercent))}%` }} />
                        </div>
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
                    <span className="text-[10px] text-slate-400">–</span>
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
                    <span className="text-[10px] text-slate-400">–</span>
                  ) : (
                    task.assignedTo || <span className="italic text-slate-400">–</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="inline-flex items-center gap-1">
                    {/* Summary tasks are read-only. Their values come from
                        their leaf children. Editing or deleting them would
                        leave orphan rows and a corrupted hierarchy. To make
                        a summary editable, delete every child first; the
                        row stops being a summary and the buttons re-enable. */}
                    <button
                      type="button"
                      onClick={() => !isSummary && onEditTask?.(task)}
                      disabled={isSummary}
                      className="ds-btn ds-btn-sm btn-o"
                      style={ROW_BTN}
                      title={isSummary ? "Summary tasks are read-only. Delete or edit their child tasks instead." : "Edit"}
                    >
                      <FaPencilAlt size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => !isSummary && onDeleteTask?.(task.taskId)}
                      disabled={isSummary}
                      className="ds-btn ds-btn-sm btn-o"
                      style={ROW_BTN}
                      title={isSummary ? "Delete child tasks first, summary rows can't be removed while they have descendants." : "Delete"}
                    >
                      <FaTrash size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
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
    <div className="wk-panel" style={{ marginBottom: 0, overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
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
                {risk.owner || <span className="italic text-slate-400">–</span>}
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700 whitespace-normal break-words">
                {risk.mitigation || <span className="italic text-slate-400">–</span>}
              </td>
              <td className="px-3 py-2 align-top text-right">
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditRisk?.(risk)}
                    className="ds-btn ds-btn-sm btn-o"
                    style={ROW_BTN}
                    title="Edit"
                  >
                    <FaPencilAlt size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRisk?.(risk.riskId)}
                    className="ds-btn ds-btn-sm btn-o"
                    style={ROW_BTN}
                    title="Delete"
                  >
                    <FaTrash size={13} />
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
    <div className="wk-panel" style={{ marginBottom: 0, overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
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
                {issue.owner || <span className="italic text-slate-400">–</span>}
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700 whitespace-normal break-words">
                {issue.notes || <span className="italic text-slate-400">–</span>}
              </td>
              <td className="px-3 py-2 align-top text-[10px] text-slate-500 whitespace-nowrap">
                {fmtDateDisplay(issue.openedAt)}
              </td>
              <td className="px-3 py-2 align-top text-right">
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditIssue?.(issue)}
                    className="ds-btn ds-btn-sm btn-o"
                    style={ROW_BTN}
                    title="Edit"
                  >
                    <FaPencilAlt size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteIssue?.(issue.issueId)}
                    className="ds-btn ds-btn-sm btn-o"
                    style={ROW_BTN}
                    title="Delete"
                  >
                    <FaTrash size={13} />
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
    <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
      <Icon size={28} style={{ display: "block", margin: "0 auto", color: "var(--ink-3)" }} />
      <b style={{ display: "block", marginTop: 12, fontWeight: 500, color: "var(--ink)" }}>{title}</b>
      <span style={{ display: "block", marginTop: 4, fontSize: 13 }}>{helper}</span>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="ds-btn ds-btn-sm btn-p" style={{ marginTop: 16 }}>
          <FaPlus size={13} />
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
  { id: "tasks", label: "WBS / Tasks" },
  { id: "risks", label: "Risk Register" },
  { id: "issues", label: "Issue Log" },
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
  // Forwarded to TaskTable for the Actual-days input. Parent should
  // patch the corresponding task's actualDurationDays.
  onActualDurationChange,
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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Header, in his panel */}
      <section className="wk-panel" style={{ marginBottom: 0 }}>
        <div className="wk-ph" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <button
              type="button"
              onClick={onBack}
              className="wk-back"
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit" }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-right" />
              </svg>
              Back to Dashboard
            </button>
            <p className="wk-grp" style={{ padding: 0, margin: "8px 0 4px" }}>PM details</p>
            <h2>Schedule · Risks · Issues</h2>
          </div>
          <div className="wk-acts" style={{ alignItems: "center" }}>
            {/* Export to calendar, downloads the schedule as a .ics file.
                Drop into Google Calendar / Outlook / Apple Calendar via the
                app's "Import calendar" flow. Filename = project name. */}
            {onExportCalendar ? (
              <button
                type="button"
                onClick={onExportCalendar}
                title="Download the schedule as a calendar (.ics) file. Import into Google Calendar, Outlook, or Apple Calendar."
                className="ds-btn ds-btn-sm btn-o"
              >
                <FaCalendarAlt size={14} />
                Export calendar
              </button>
            ) : null}
            {/* Reschedule, explicit re-cascade. Useful after manually editing
                durations or adding predecessor links, without having to bump
                the project start to trigger the auto-cascade. */}
            {onReschedule ? (
              <button
                type="button"
                onClick={onReschedule}
                title="Recompute every task's start/finish from the project start date, flowing through predecessor relationships."
                className="ds-btn ds-btn-sm btn-o"
              >
                <FaSyncAlt size={14} />
                Reschedule
              </button>
            ) : null}
            {/* Delete-imports, only visible when MS Project tasks exist, so
                the destructive control doesn't appear on a clean slate. */}
            {importedTaskCount > 0 && onClearImports ? (
              <button
                type="button"
                onClick={onClearImports}
                title={`Delete all ${importedTaskCount} imported MS Project task(s). Manual & BoQ-linked tasks are preserved.`}
                className="ds-btn ds-btn-sm btn-o"
                style={{ color: "var(--pal-orange-key)" }}
              >
                <FaFileImport size={14} />
                Delete imports · {importedTaskCount}
              </button>
            ) : null}
            {dirty ? <span className="wk-dirty" style={{ marginRight: 4 }}>Unsaved</span> : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="ds-btn ds-btn-sm btn-p"
            >
              <FaCheckCircle size={14} />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </section>

      {/* Sub-tabs, in his tabs; the count follows in his muted ink. */}
      <div
        className="wk-tabs"
        role="tablist"
        aria-label="PM details"
        style={{ maxWidth: "100%", overflowX: "auto", justifySelf: "start" }}
      >
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={active ? "on" : ""}
            >
              {tab.label}
              <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{counts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <section className="wk-panel" style={{ marginBottom: 0 }}>
        <div className="wk-ph">
          <h2>
            {subTab === "tasks" ? "WBS / Task list" : subTab === "risks" ? "Risk register" : "Issue log"}
          </h2>
          <button
            type="button"
            onClick={
              subTab === "tasks"
                ? () => onAddTask?.()
                : subTab === "risks"
                  ? () => onAddRisk?.()
                  : () => onAddIssue?.()
            }
            className="ds-btn ds-btn-sm btn-p"
          >
            <FaPlus size={13} />
            {subTab === "tasks" ? "Add task" : subTab === "risks" ? "Add risk" : "Add issue"}
          </button>
        </div>
        <div style={{ padding: 16 }}>

        {subTab === "tasks" ? (
          <TaskTable
            tasks={tasks}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onAddTask={onAddTask}
            onPercentChange={onPercentChange}
            onStatusChange={onStatusChange}
            onActualDurationChange={onActualDurationChange}
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
      </section>
    </div>
  );
}
