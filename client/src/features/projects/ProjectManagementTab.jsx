import React from "react";
import PmDashboardView from "./pm/PmDashboardView.jsx";
import PmDetailsView from "./pm/PmDetailsView.jsx";
import { PmTaskModal, PmRiskModal, PmIssueModal, PmModalShell } from "./pm/PmModals.jsx";
import PmMppHelperModal from "./pm/PmMppHelperModal.jsx";
import { FaCog, FaTimes, FaSpinner } from "react-icons/fa";

// First-load skeleton — shown when the parent hasn't fetched the dashboard
// yet. Without this users briefly see "0%" on every tile which looks broken.
function PmLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 rounded-2xl bg-gradient-to-r from-adlm-blue-700/80 to-blue-800/80 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 inline-flex items-center justify-center gap-2 w-full">
        <FaSpinner className="animate-spin" />
        Loading PM dashboard…
      </div>
    </div>
  );
}

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
// `saving` toggles a loading state on the Apply button so the user sees
// feedback after clicking — important because the modal stays open while
// the network call runs (closes only on success).
//
// Extra props:
//   • contractLocked → disables the BAC override input (BAC is forced
//     to equal the BoQ total when the contract is locked, otherwise the
//     books drift away from the signed contract value)
//   • lockedBac      → current resolved BAC, shown in the disabled input
//   • wbsFinish      → latest task endDate across the WBS; used to
//     auto-prefill the finish input when the user changes start so the
//     user doesn't have to compute it manually
function HeaderSettingsModal({
  open,
  initial,
  saving = false,
  onSave,
  onClose,
  contractLocked = false,
  lockedBac = 0,
  wbsFinish = null,
}) {
  const [start, setStart] = React.useState("");
  const [finish, setFinish] = React.useState("");
  const [budget, setBudget] = React.useState(0);
  // Cascade defaults ON — most users who change projectStart want the
  // dates to ripple through the predecessor graph. Unchecking preserves
  // current task dates and only updates the header value.
  const [cascade, setCascade] = React.useState(true);
  // True when the finish field was auto-filled from the WBS — drives the
  // small "from WBS" hint shown beneath the input. Cleared as soon as
  // the user manually types a different date.
  const [finishAuto, setFinishAuto] = React.useState(false);
  const initialStart = fmtDateInput(initial?.projectStart);
  const initialFinish = fmtDateInput(initial?.projectFinish);
  const initialBudget = safeNum(initial?.budgetOverride);
  const wbsFinishStr = fmtDateInput(wbsFinish);

  React.useEffect(() => {
    if (!open) return;
    setStart(initialStart);
    setFinish(initialFinish);
    setBudget(initialBudget);
    setCascade(true);
    setFinishAuto(false);
  }, [open, initialStart, initialFinish, initialBudget]);

  // Auto-pick finish from WBS whenever the user changes start (and we
  // have a WBS finish date). Doesn't fire if the user has already
  // touched the finish field manually since the modal opened.
  const handleStartChange = (next) => {
    setStart(next);
    if (next && wbsFinishStr && (finish === initialFinish || finishAuto || !finish)) {
      // Only auto-fill if WBS finish is at or after the new start;
      // otherwise the WBS doesn't extend far enough and we keep
      // whatever the user already had.
      if (wbsFinishStr >= next) {
        setFinish(wbsFinishStr);
        setFinishAuto(true);
      }
    }
  };

  const handleFinishChange = (next) => {
    setFinish(next);
    setFinishAuto(false); // user touched it manually
  };

  const startChanged = start !== initialStart;
  const finishChanged = finish !== initialFinish;
  const budgetChanged = safeNum(budget) !== initialBudget;
  const anyChanged = startChanged || finishChanged || budgetChanged;

  return (
    <PmModalShell open={open} title="Project header" icon={FaCog} onClose={onClose} widthClass="max-w-md">
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Project start</span>
          <input
            type="date"
            value={start}
            onChange={(e) => handleStartChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          {wbsFinishStr ? (
            <span className="mt-1 block text-[10px] text-slate-400">
              WBS extends to <strong className="text-slate-600">{wbsFinishStr}</strong> — finish auto-fills from this when you change start.
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Project finish</span>
          <input
            type="date"
            value={finish}
            onChange={(e) => handleFinishChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          {finishAuto ? (
            <span className="mt-1 block text-[10px] text-emerald-600">
              Auto-picked from latest WBS task. Edit if needed.
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Total budget (BAC){contractLocked ? "" : " override"}
          </span>
          <input
            type="number"
            min="0"
            value={contractLocked ? Math.round(safeNum(lockedBac) * 100) / 100 : budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
            disabled={contractLocked}
            placeholder={contractLocked ? "" : "Leave 0 to auto-derive from BoQ / contract"}
            className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm text-right ${
              contractLocked
                ? "border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed"
                : "border-slate-200"
            }`}
          />
          {contractLocked ? (
            <span className="mt-1 block text-[10px] text-amber-700">
              <strong>Contract locked.</strong> Total Budget = BoQ total. Unlock the contract in the BoQ tab to adjust manually.
            </span>
          ) : (
            <span className="mt-1 block text-[10px] text-slate-400">
              Leave 0 to keep BAC equal to the BoQ total (recommended).
            </span>
          )}
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

        <div className="flex items-center justify-end gap-2 pt-2">
          {!anyChanged && !saving ? (
            <div className="mr-auto text-[10px] italic text-slate-400">
              No changes to apply.
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!anyChanged || saving}
            onClick={() =>
              onSave?.({
                projectStart: start || null,
                projectFinish: finish || null,
                budgetOverride: safeNum(budget),
                cascadeReschedule: cascade,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Saving…
              </>
            ) : (
              <>Apply{startChanged && cascade ? " & reschedule" : ""}</>
            )}
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
  onExportCalendar,
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
  // Read budgetOverride (user-set value, 0 = auto-derive) from its own field,
  // not totals.BAC (which is the resolved/computed number). Pre-fix this
  // accidentally round-tripped the computed BAC back as the override.
  const [budgetOverride, setBudgetOverride] = React.useState(safeNum(dashboard?.totals?.budgetOverride));
  const [dirty, setDirty] = React.useState(false);

  // Re-sync from server payload (after save, import, generate).
  React.useEffect(() => {
    setTasks(dashboard?.tasks || []);
    setRisks(dashboard?.risks || []);
    setIssues(dashboard?.issues || []);
    setProjectStart(fmtDateInput(dashboard?.projectStart));
    setProjectFinish(fmtDateInput(dashboard?.projectFinish));
    setBudgetOverride(safeNum(dashboard?.totals?.budgetOverride));
    setDirty(false);
    // If the header modal triggered the save, close it now that the
    // server has acknowledged. We only flip the flag back after closing.
    if (pendingHeaderCloseRef.current) {
      setHeaderModal(false);
      pendingHeaderCloseRef.current = false;
    }
  }, [dashboard?.asOf]);

  // ── Modal state ────────────────────────────────────────────────────
  const [taskModal, setTaskModal] = React.useState({ open: false, mode: "add", task: null });
  const [riskModal, setRiskModal] = React.useState({ open: false, mode: "add", risk: null });
  const [issueModal, setIssueModal] = React.useState({ open: false, mode: "add", issue: null });
  const [headerModal, setHeaderModal] = React.useState(false);
  // Set true when the header modal triggered a save — the dashboard
  // re-sync effect uses this to auto-close the modal once the new payload
  // arrives, giving the Apply button time to show its "Saving…" state.
  const pendingHeaderCloseRef = React.useRef(false);

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
  // Actual-duration handler — the user types into the "Days (P / A)"
  // column on the WBS table. Stores in days; server computes variance
  // vs planned durationDays at dashboard-compute time.
  function changeActualDuration(taskId, value) {
    const days = Math.max(0, Number(value) || 0);
    setTasks((prev) =>
      prev.map((t) =>
        String(t.taskId) === String(taskId)
          ? { ...t, actualDurationDays: days }
          : t,
      ),
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

    // Save immediately so the server-side cascade runs in the same round-trip
    // — matches the user expectation of "change date → tasks shift". Cascade
    // only fires server-side when projectStart actually moved AND the user
    // didn't uncheck the modal's "Reschedule tasks" toggle.
    //
    // The modal stays open while the save is in flight so the user gets
    // feedback (spinner on the Apply button). We close it after the next
    // dashboard payload arrives — useEffect on `dashboard.asOf` re-syncs
    // and we close from there.
    pendingHeaderCloseRef.current = true;
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

  // First-load guard. Once we've received any dashboard payload (asOf set),
  // we render the real views even if they're empty — the empty-state UX
  // inside lives in PmDashboardView.
  if (!dashboard && !importError) {
    return <PmLoadingSkeleton />;
  }

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
          onActualDurationChange={changeActualDuration}
          onAddRisk={openAddRisk}
          onEditRisk={openEditRisk}
          onDeleteRisk={deleteRisk}
          onAddIssue={openAddIssue}
          onEditIssue={openEditIssue}
          onDeleteIssue={deleteIssue}
          onClearImports={onClearImports}
          onReschedule={onReschedule}
          onExportCalendar={onExportCalendar}
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
        saving={saving}
        initial={{
          projectStart,
          projectFinish,
          budgetOverride,
        }}
        // Contract-lock state forces BAC = BoQ total and disables the
        // override input. Without this prop the user could quietly drift
        // the project budget away from the signed contract.
        contractLocked={Boolean(dashboard?.totals?.contractLocked)}
        lockedBac={safeNum(dashboard?.totals?.BAC)}
        // Latest task end across the WBS — fed into the modal so it can
        // auto-prefill the finish field whenever the user changes the
        // start date.
        wbsFinish={(() => {
          // Compute on the fly from the most recent task list so users
          // see the freshest WBS finish even before saving.
          const allTasks = Array.isArray(tasks) ? tasks : [];
          let latest = null;
          for (const t of allTasks) {
            const end = t?.endDate ? new Date(t.endDate) : null;
            if (end && !Number.isNaN(end.getTime())) {
              if (!latest || end > latest) latest = end;
            }
          }
          return latest;
        })()}
        onSave={handleHeaderSettings}
        onClose={() => {
          // Don't allow closing mid-save (button is disabled but ESC + outside
          // click would still fire onClose) — protects the pendingHeaderClose
          // ref from getting out of sync.
          if (saving) return;
          pendingHeaderCloseRef.current = false;
          setHeaderModal(false);
        }}
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
