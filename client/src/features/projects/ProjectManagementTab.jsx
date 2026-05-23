import React from "react";
import PmDashboardView from "./pm/PmDashboardView.jsx";
import PmDetailsView from "./pm/PmDetailsView.jsx";
import { PmTaskModal, PmRiskModal, PmIssueModal, PmModalShell } from "./pm/PmModals.jsx";
import PmMppHelperModal from "./pm/PmMppHelperModal.jsx";
import { FaCog, FaTimes } from "react-icons/fa";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateInput(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function genId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// Small modal for project header settings (dates + budget override).
function HeaderSettingsModal({ open, initial, onSave, onClose }) {
  const [start, setStart] = React.useState("");
  const [finish, setFinish] = React.useState("");
  const [budget, setBudget] = React.useState(0);
  // Cascade defaults ON — most users who change projectStart want the
  // dates to ripple through the predecessor graph. Unchecking preserves
  // current task dates and only updates the header value.
  const [cascade, setCascade] = React.useState(true);
  const initialStart = fmtDateInput(initial?.projectStart);

  React.useEffect(() => {
    if (!open) return;
    setStart(fmtDateInput(initial?.projectStart));
    setFinish(fmtDateInput(initial?.projectFinish));
    setBudget(safeNum(initial?.budgetOverride));
    setCascade(true);
  }, [open, initial]);

  const startChanged = start && start !== initialStart;

  return (
    <PmModalShell open={open} title="Project header" icon={FaCog} onClose={onClose} widthClass="max-w-md">
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Project start</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Project finish</span>
          <input
            type="date"
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Total budget (BAC) override</span>
          <input
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
            placeholder="Leave 0 to auto-derive from BoQ / contract"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-right"
          />
        </label>
        {/* Cascade toggle — only relevant when the start date has actually
            changed. Visible at all times so the option is discoverable, but
            disabled (and ignored) when start is unchanged. */}
        <label
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
            startChanged
              ? "border-blue-200 bg-blue-50/60 text-slate-700"
              : "border-slate-200 bg-slate-50 text-slate-400"
          }`}
        >
          <input
            type="checkbox"
            checked={cascade}
            disabled={!startChanged}
            onChange={(e) => setCascade(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span>
            <strong className={startChanged ? "text-adlm-blue-700" : ""}>
              Reschedule all tasks from new start date
            </strong>
            <br />
            Uses predecessor relationships imported from MS Project. Tasks with
            no predecessors snap to the new start; everything else flows from
            its predecessor's finish date.
            {!startChanged ? " (Change the start date above to enable.)" : ""}
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSave?.({
                projectStart: start || null,
                projectFinish: finish || null,
                budgetOverride: budget,
                cascadeReschedule: cascade,
              })
            }
            className="rounded-lg bg-adlm-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
          >
            Apply{startChanged && cascade ? " & reschedule" : ""}
          </button>
        </div>
      </div>
    </PmModalShell>
  );
}

export default function ProjectManagementTab({
  dashboard,
  saving = false,
  importing = false,
  generating = false,
  importError = "",
  importErrorCode = "",
  onDismissImportError,
  onSave,
  onGenerateFromBoq,
  onImportFile,
  onReset,
  onClearImports,
  onReschedule,
}) {
  const initialTasks = dashboard?.tasks || [];
  const initialRisks = dashboard?.risks || [];
  const initialIssues = dashboard?.issues || [];
  const boqItems = dashboard?.boqItems || [];

  const [viewMode, setViewMode] = React.useState("dashboard"); // 'dashboard' | 'details'

  // Local optimistic state for tasks / risks / issues. Saves are batched
  // and sent via onSave (the parent PATCHes the server).
  const [tasks, setTasks] = React.useState(initialTasks);
  const [risks, setRisks] = React.useState(initialRisks);
  const [issues, setIssues] = React.useState(initialIssues);
  const [projectStart, setProjectStart] = React.useState(fmtDateInput(dashboard?.projectStart));
  const [projectFinish, setProjectFinish] = React.useState(fmtDateInput(dashboard?.projectFinish));
  const [budgetOverride, setBudgetOverride] = React.useState(safeNum(dashboard?.totals?.BAC));
  const [dirty, setDirty] = React.useState(false);

  // Re-sync from server payload (after save, import, generate).
  React.useEffect(() => {
    setTasks(dashboard?.tasks || []);
    setRisks(dashboard?.risks || []);
    setIssues(dashboard?.issues || []);
    setProjectStart(fmtDateInput(dashboard?.projectStart));
    setProjectFinish(fmtDateInput(dashboard?.projectFinish));
    setBudgetOverride(safeNum(dashboard?.totals?.BAC));
    setDirty(false);
  }, [dashboard?.asOf]);

  // ── Modal state ────────────────────────────────────────────────────
  const [taskModal, setTaskModal] = React.useState({ open: false, mode: "add", task: null });
  const [riskModal, setRiskModal] = React.useState({ open: false, mode: "add", risk: null });
  const [issueModal, setIssueModal] = React.useState({ open: false, mode: "add", issue: null });
  const [headerModal, setHeaderModal] = React.useState(false);

  function markDirty() {
    setDirty(true);
  }

  // ── Task handlers ──────────────────────────────────────────────────
  function openAddTask() {
    setTaskModal({ open: true, mode: "add", task: null });
  }
  function openEditTask(task) {
    setTaskModal({ open: true, mode: "edit", task });
  }
  function closeTaskModal() {
    setTaskModal({ open: false, mode: "add", task: null });
  }
  function saveTaskFromModal(taskData) {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => String(t.taskId) === String(taskData.taskId));
      if (idx >= 0) {
        // Edit
        const next = prev.slice();
        next[idx] = { ...next[idx], ...taskData };
        return next;
      }
      // Add
      return [...prev, { ...taskData, taskId: taskData.taskId || genId("tsk") }];
    });
    markDirty();
    closeTaskModal();
  }
  function deleteTask(taskId) {
    setTasks((prev) => prev.filter((t) => String(t.taskId) !== String(taskId)));
    markDirty();
  }
  function changePercent(taskId, value) {
    setTasks((prev) =>
      prev.map((t) => {
        if (String(t.taskId) !== String(taskId)) return t;
        const next = { ...t, percentComplete: value };
        if (value >= 100) next.status = "completed";
        else if (value > 0 && next.status === "not-started") next.status = "in-progress";
        return next;
      }),
    );
    markDirty();
  }
  function changeStatus(taskId, value) {
    setTasks((prev) =>
      prev.map((t) => {
        if (String(t.taskId) !== String(taskId)) return t;
        const next = { ...t, status: value };
        if (value === "completed") next.percentComplete = 100;
        return next;
      }),
    );
    markDirty();
  }

  // ── Risk handlers ──────────────────────────────────────────────────
  function openAddRisk() {
    setRiskModal({ open: true, mode: "add", risk: null });
  }
  function openEditRisk(risk) {
    setRiskModal({ open: true, mode: "edit", risk });
  }
  function closeRiskModal() {
    setRiskModal({ open: false, mode: "add", risk: null });
  }
  function saveRiskFromModal(riskData) {
    setRisks((prev) => {
      const idx = prev.findIndex((r) => String(r.riskId) === String(riskData.riskId));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...riskData };
        return next;
      }
      return [...prev, { ...riskData, riskId: riskData.riskId || genId("rsk") }];
    });
    markDirty();
    closeRiskModal();
  }
  function deleteRisk(riskId) {
    setRisks((prev) => prev.filter((r) => String(r.riskId) !== String(riskId)));
    markDirty();
  }

  // ── Issue handlers ─────────────────────────────────────────────────
  function openAddIssue() {
    setIssueModal({ open: true, mode: "add", issue: null });
  }
  function openEditIssue(issue) {
    setIssueModal({ open: true, mode: "edit", issue });
  }
  function closeIssueModal() {
    setIssueModal({ open: false, mode: "add", issue: null });
  }
  function saveIssueFromModal(issueData) {
    setIssues((prev) => {
      const idx = prev.findIndex((i) => String(i.issueId) === String(issueData.issueId));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...issueData };
        return next;
      }
      return [...prev, { ...issueData, issueId: issueData.issueId || genId("iss") }];
    });
    markDirty();
    closeIssueModal();
  }
  function deleteIssue(issueId) {
    setIssues((prev) => prev.filter((i) => String(i.issueId) !== String(issueId)));
    markDirty();
  }

  // ── Save batch to server ───────────────────────────────────────────
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

  function handleHeaderSettings({
    projectStart: s,
    projectFinish: f,
    budgetOverride: b,
    cascadeReschedule = true,
  }) {
    const nextStart = s || "";
    const nextFinish = f || "";
    const nextBudget = safeNum(b);
    const startChanged = nextStart !== projectStart;

    setProjectStart(nextStart);
    setProjectFinish(nextFinish);
    setBudgetOverride(nextBudget);
    setHeaderModal(false);

    // Save immediately so the server-side cascade runs in the same round-trip
    // — matches the user expectation of "change date → tasks shift". Cascade
    // only fires server-side when projectStart actually moved AND the user
    // didn't uncheck the modal's "Reschedule tasks" toggle.
    onSave?.({
      tasks,
      risks,
      issues,
      projectStart: nextStart || null,
      projectFinish: nextFinish || null,
      budgetOverride: nextBudget,
      cascadeReschedule: startChanged && cascadeReschedule,
    });
  }

  // Build a derived dashboard that reflects optimistic local state
  // (so the user sees immediate feedback before they save). We patch
  // tasks/risks/issues into the server payload — totals will refresh
  // on the next save.
  const liveDashboard = React.useMemo(() => {
    if (!dashboard) return null;
    return {
      ...dashboard,
      tasks,
      risks,
      issues,
    };
  }, [dashboard, tasks, risks, issues]);

  return (
    <div className="space-y-3">
      {viewMode === "dashboard" ? (
        <PmDashboardView
          dashboard={liveDashboard}
          saving={saving}
          importing={importing}
          generating={generating}
          importError={importError}
          dirty={dirty}
          onAddTask={openAddTask}
          onAddRisk={openAddRisk}
          onAddIssue={openAddIssue}
          onGenerateFromBoq={() =>
            onGenerateFromBoq?.({
              projectStart: projectStart || undefined,
              projectFinish: projectFinish || undefined,
            })
          }
          onImportFile={onImportFile}
          onClearImports={onClearImports}
          onViewDetails={() => setViewMode("details")}
          onOpenHeaderSettings={() => setHeaderModal(true)}
          onSave={handleSave}
        />
      ) : (
        <PmDetailsView
          tasks={tasks}
          risks={risks}
          issues={issues}
          saving={saving}
          dirty={dirty}
          onBack={() => setViewMode("dashboard")}
          onAddTask={openAddTask}
          onEditTask={openEditTask}
          onDeleteTask={deleteTask}
          onPercentChange={changePercent}
          onStatusChange={changeStatus}
          onAddRisk={openAddRisk}
          onEditRisk={openEditRisk}
          onDeleteRisk={deleteRisk}
          onAddIssue={openAddIssue}
          onEditIssue={openEditIssue}
          onDeleteIssue={deleteIssue}
          onClearImports={onClearImports}
          onReschedule={onReschedule}
          onSave={handleSave}
        />
      )}

      {/* Modals */}
      <PmTaskModal
        open={taskModal.open}
        mode={taskModal.mode}
        task={taskModal.task}
        boqItems={boqItems}
        onSave={saveTaskFromModal}
        onClose={closeTaskModal}
      />
      <PmRiskModal
        open={riskModal.open}
        mode={riskModal.mode}
        risk={riskModal.risk}
        onSave={saveRiskFromModal}
        onClose={closeRiskModal}
      />
      <PmIssueModal
        open={issueModal.open}
        mode={issueModal.mode}
        issue={issueModal.issue}
        onSave={saveIssueFromModal}
        onClose={closeIssueModal}
      />
      <HeaderSettingsModal
        open={headerModal}
        initial={{
          projectStart,
          projectFinish,
          budgetOverride,
        }}
        onSave={handleHeaderSettings}
        onClose={() => setHeaderModal(false)}
      />

      {/* Auto-open the XML helper when the server says .mpp parsing is
          disabled. The modal handles its own dismissal + lets the user
          retry the import directly with the .xml file. */}
      <PmMppHelperModal
        open={importErrorCode === "MPP_NOT_ENABLED"}
        errorMessage={importError}
        onClose={onDismissImportError}
        onPickXml={(file) => {
          onDismissImportError?.();
          onImportFile?.(file);
        }}
      />

      {/* Reset link — kept tiny since it's destructive */}
      {viewMode === "dashboard" ? (
        <div className="text-right">
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-slate-400 hover:text-rose-600 hover:underline"
          >
            Reset PM data (clears tasks, risks, issues)
          </button>
        </div>
      ) : null}
    </div>
  );
}
