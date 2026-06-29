import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import { Link } from "react-router-dom";
import {
  FaPlus,
  FaTimes,
  FaTasks,
  FaExclamationTriangle,
  FaBug,
  FaFileImport,
  FaSyncAlt,
  FaTrash,
  FaArrowLeft,
  FaClock,
  FaSpinner,
  FaShareAlt,
  FaCopy,
  FaCheck,
} from "react-icons/fa";
import PmDashboardView from "../features/projects/pm/PmDashboardView.jsx";
import PmDetailsView from "../features/projects/pm/PmDetailsView.jsx";
import { PmTaskModal, PmRiskModal, PmIssueModal } from "../features/projects/pm/PmModals.jsx";
import PmMppHelperModal from "../features/projects/pm/PmMppHelperModal.jsx";

dayjs.extend(relativeTime);

// ── Endpoint helpers ────────────────────────────────────────────────────────
const PM_BASE = (id) => `/projects/revit/${id}`;
const EP = {
  pmDashboard: (id) => `${PM_BASE(id)}/pm/dashboard`,
  pmUpdate: (id) => `${PM_BASE(id)}/pm`,
  pmImport: (id) => `${PM_BASE(id)}/pm/import`,
  pmClearImports: (id) => `${PM_BASE(id)}/pm/clear-imports`,
  pmReschedule: (id) => `${PM_BASE(id)}/pm/reschedule`,
  pmCalendar: (id) => `${PM_BASE(id)}/pm/calendar.ics`,
};

function genId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// Every PM endpoint returns { ok, dashboard: computePmDashboard(...) }.
// This unwraps it so callers always get the dashboard object regardless
// of whether the response was the bare dashboard or the wrapped form.
function unwrapDash(data) {
  return data?.dashboard ?? data;
}

// ── Small UI helpers ────────────────────────────────────────────────────────
function Btn({ children, variant = "primary", className = "", ...props }) {
  const base =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50";
  const variants = {
    primary: "bg-adlm-blue-700 text-white shadow-sm hover:bg-blue-800",
    secondary: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  };
  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ── QUIV gate ───────────────────────────────────────────────────────────────
function QuivGate() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-sm border border-slate-200 p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-adlm-blue-700/10 flex items-center justify-center">
          <FaTasks className="text-2xl text-adlm-blue-700" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">QUIV Subscription Required</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          The PM Tracker is a QUIV-exclusive feature. You need an active QUIV (Revit) subscription
          to create and manage standalone PM projects.
        </p>
        <Link
          to="/product/revit"
          className="inline-flex items-center gap-2 rounded-lg bg-adlm-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 transition"
        >
          View QUIV Plans
        </Link>
      </div>
    </div>
  );
}

// ── Storage bar ─────────────────────────────────────────────────────────────
function StorageBar({ used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearFull = pct >= 80;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          <strong className="text-slate-700">{used}</strong> / {limit} projects used
        </span>
        <span className={nearFull ? "text-amber-600 font-medium" : ""}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            nearFull ? "bg-amber-500" : "bg-adlm-blue-700"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onOpen, onDelete }) {
  return (
    <div
      className="group relative rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 space-y-3"
      onClick={() => onOpen(project._id)}
    >
      {/* Delete button */}
      <button
        type="button"
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(project._id);
        }}
        aria-label="Delete project"
      >
        <FaTrash className="text-xs" />
      </button>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 leading-tight pr-6 line-clamp-2">
          {project.name}
        </h3>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
          <FaClock className="text-[10px]" />
          <span>{dayjs(project.updatedAt).fromNow()}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
          <FaTasks className="text-adlm-blue-700 text-[10px]" />
          {project.taskCount ?? 0} tasks
        </span>
        <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
          <FaExclamationTriangle className="text-amber-500 text-[10px]" />
          {project.riskCount ?? 0} risks
        </span>
        <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
          <FaBug className="text-rose-500 text-[10px]" />
          {project.issueCount ?? 0} issues
        </span>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ open, newName, setNewName, creating, createErr, onCreate, onClose }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const handle = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-5 py-3 text-white">
          <div className="flex items-center gap-2.5 font-semibold text-base">
            <FaPlus />
            New PM Project
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/20 transition"
          >
            <FaTimes />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Project name *
            </span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) onCreate();
              }}
              autoFocus
              placeholder="Office Block Phase 2, Road Works…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
            />
          </label>
          {createErr ? (
            <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{createErr}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={onCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? (
                <>
                  <FaSpinner className="animate-spin text-xs" />
                  Creating…
                </>
              ) : (
                "Create project"
              )}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ open, projectName, deleting, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <FaTrash className="text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Delete project?</h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{projectName}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            All tasks, risks, and issues in this project will be permanently deleted. This cannot
            be undone.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={onClose} disabled={deleting}>
              Cancel
            </Btn>
            <Btn variant="danger" onClick={onConfirm} disabled={deleting}>
              {deleting ? (
                <>
                  <FaSpinner className="animate-spin text-xs" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PmTracker() {
  const { accessToken, user } = useAuth();

  // ── List state ──────────────────────────────────────────────────────
  const [projects, setProjects] = React.useState([]);
  const [used, setUsed] = React.useState(0);
  const [limit, setLimit] = React.useState(10);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // ── Selection / open project ────────────────────────────────────────
  const [selectedId, setSelectedId] = React.useState(null);
  const [activeView, setActiveView] = React.useState("dashboard"); // "dashboard" | "details"

  // ── PM data ─────────────────────────────────────────────────────────
  const [pmDashboard, setPmDashboard] = React.useState(null);
  const [pmLoading, setPmLoading] = React.useState(false);
  const [pmSaving, setPmSaving] = React.useState(false);
  const [pmImporting, setPmImporting] = React.useState(false);
  const [pmImportError, setPmImportError] = React.useState("");
  const [pmImportErrorCode, setPmImportErrorCode] = React.useState("");
  const [pmImportProgress, setPmImportProgress] = React.useState(0);
  const [pmImportStatus, setPmImportStatus] = React.useState("");
  const pmImportTimerRef = React.useRef(null);
  const [pmDirty, setPmDirty] = React.useState(false);
  const [pmPublicShareEnabled, setPmPublicShareEnabled] = React.useState(false);
  const [pmPublicToken, setPmPublicToken] = React.useState(null);

  // Optimistic local task/risk/issue lists (mirrors ProjectManagementTab pattern)
  const [localTasks, setLocalTasks] = React.useState([]);
  const [localRisks, setLocalRisks] = React.useState([]);
  const [localIssues, setLocalIssues] = React.useState([]);

  // ── Modal state ─────────────────────────────────────────────────────
  const [showNewModal, setShowNewModal] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createErr, setCreateErr] = React.useState("");

  const [showMppHelper, setShowMppHelper] = React.useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(null); // project id
  const [deleting, setDeleting] = React.useState(false);

  // Task / risk / issue modals
  const [taskModal, setTaskModal] = React.useState({ open: false, mode: "add", task: null });
  const [riskModal, setRiskModal] = React.useState({ open: false, mode: "add", risk: null });
  const [issueModal, setIssueModal] = React.useState({ open: false, mode: "add", issue: null });

  // ── QUIV entitlement check ──────────────────────────────────────────
  // We rely on the server to enforce this; client-side we check the
  // summary.subscriptions list that's already in auth store user object.
  // The server will 403 on POST if not entitled.
  const hasQuiv = React.useMemo(() => {
    if (!user) return null; // unknown yet
    const ents = Array.isArray(user.entitlements) ? user.entitlements : [];
    const sub = ents.find((e) => e.productKey === "revit" && e.status === "active");
    if (!sub) return false;
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return false;
    return true;
  }, [user]);

  // ── Fetch project list ──────────────────────────────────────────────
  async function fetchList() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiAuthed("/me/pm-tracker", { token: accessToken });
      setProjects(data.projects || []);
      setUsed(data.used ?? 0);
      setLimit(data.limit ?? 10);
    } catch (e) {
      setErr(e?.message || "Failed to load PM Tracker projects.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch PM dashboard when project selected ──────────────────────────
  React.useEffect(() => {
    if (!selectedId) {
      setPmDashboard(null);
      setLocalTasks([]);
      setLocalRisks([]);
      setLocalIssues([]);
      setPmDirty(false);
      return;
    }
    let cancelled = false;
    setPmLoading(true);
    setPmDashboard(null);
    apiAuthed(EP.pmDashboard(selectedId), { token: accessToken })
      .then((data) => {
        if (cancelled) return;
        const dash = unwrapDash(data);
        setPmDashboard(dash);
        setLocalTasks(dash?.tasks || []);
        setLocalRisks(dash?.risks || []);
        setLocalIssues(dash?.issues || []);
        setPmDirty(false);
      })
      .catch(() => {
        if (!cancelled) setPmDashboard(null);
      })
      .finally(() => {
        if (!cancelled) setPmLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live dashboard — optimistic local state overlaid on server payload
  const liveDashboard = React.useMemo(() => {
    if (!pmDashboard) return null;
    return { ...pmDashboard, tasks: localTasks, risks: localRisks, issues: localIssues };
  }, [pmDashboard, localTasks, localRisks, localIssues]);

  // ── PM save ────────────────────────────────────────────────────────
  async function handlePmSave(payload) {
    if (!selectedId) return;
    setPmSaving(true);
    try {
      const data = await apiAuthed(EP.pmUpdate(selectedId), {
        token: accessToken,
        method: "PATCH",
        body: payload,
      });
      const dash = unwrapDash(data);
      setPmDashboard(dash);
      // Guard: only replace localTasks from the server if it returned at
      // least as many tasks as we sent. A missing/empty response must not
      // wipe the user's task list.
      const serverTasks = dash?.tasks;
      if (Array.isArray(serverTasks) && serverTasks.length >= payload.tasks.length) {
        setLocalTasks(serverTasks);
      }
      if (Array.isArray(dash?.risks)) setLocalRisks(dash.risks);
      if (Array.isArray(dash?.issues)) setLocalIssues(dash.issues);
      setPmDirty(false);
      // Update counts in the sidebar list
      setProjects((prev) =>
        prev.map((p) =>
          String(p._id) === String(selectedId)
            ? {
                ...p,
                taskCount: (dash?.tasks || []).length,
                riskCount: (dash?.risks || []).length,
                issueCount: (dash?.issues || []).length,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
    } catch (e) {
      // surface error but don't clear state
      console.error("PM save failed:", e);
    } finally {
      setPmSaving(false);
    }
  }

  function stripEnrichedFields(task) {
    // eslint-disable-next-line no-unused-vars
    const { computed, rollup, isSummary, wbsDepth, parentWbs, _computed, _rollup, _isSummary, _wbsDepth, _parentWbs, ...rest } = task;
    return rest;
  }

  function buildSavePayload() {
    return {
      tasks: localTasks.map(stripEnrichedFields),
      risks: localRisks,
      issues: localIssues,
      header: pmDashboard?.header || {},
    };
  }

  function markDirty() {
    setPmDirty(true);
  }

  // ── PM import ──────────────────────────────────────────────────────
  // Simulated progress phases: each entry is [targetPct, label, durationMs].
  // The ticker advances toward the target over the given duration, then
  // pauses at the ceiling waiting for the real response.
  const IMPORT_PHASES = [
    [15,  "Uploading file…",       800],
    [40,  "Parsing schedule…",    1800],
    [65,  "Extracting tasks…",    1500],
    [82,  "Auto-linking BoQ…",    1200],
    [92,  "Saving to project…",    900],
    [97,  "Almost done…",         9999], // holds until server responds
  ];

  function startImportProgress() {
    setPmImportProgress(0);
    setPmImportStatus("Preparing…");
    let phaseIdx = 0;
    let current = 0;

    function tick() {
      if (phaseIdx >= IMPORT_PHASES.length) return;
      const [target, label, duration] = IMPORT_PHASES[phaseIdx];
      const steps = Math.max(1, Math.round(duration / 80));
      const increment = (target - current) / steps;

      setPmImportStatus(label);
      let step = 0;

      function advance() {
        step++;
        current = Math.min(target, current + increment);
        setPmImportProgress(Math.round(current));
        if (current < target) {
          pmImportTimerRef.current = setTimeout(advance, 80);
        } else {
          phaseIdx++;
          if (phaseIdx < IMPORT_PHASES.length) {
            pmImportTimerRef.current = setTimeout(tick, 120);
          }
        }
      }
      advance();
    }
    tick();
  }

  function stopImportProgress(success) {
    clearTimeout(pmImportTimerRef.current);
    if (success) {
      setPmImportProgress(100);
      setPmImportStatus("Import complete!");
      pmImportTimerRef.current = setTimeout(() => {
        setPmImportProgress(0);
        setPmImportStatus("");
      }, 2000);
    } else {
      setPmImportProgress(0);
      setPmImportStatus("");
    }
  }

  async function handleToggleShare(enable) {
    if (!selectedId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/revit/${selectedId}/share`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enable }),
      });
      const data = await res.json();
      if (res.ok) {
        setPmPublicShareEnabled(Boolean(data.publicShareEnabled));
        setPmPublicToken(data.publicToken || null);
        setProjects(prev =>
          prev.map(p =>
            p._id === selectedId
              ? { ...p, publicShareEnabled: data.publicShareEnabled, publicToken: data.publicToken }
              : p
          )
        );
      }
    } catch (e) {
      console.error("Share toggle failed", e);
    }
  }

  async function handlePmImportFile(file) {
    if (!selectedId || !file) return;
    setPmImporting(true);
    setPmImportError("");
    setPmImportErrorCode("");
    startImportProgress();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}${EP.pmImport(selectedId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        stopImportProgress(false);
        setPmImportError(data?.error || "Import failed.");
        const errCode = data?.errorCode || data?.code || "";
        setPmImportErrorCode(errCode);
        if (errCode === "MPP_NOT_ENABLED" || errCode === "MPP_SERVICE_UNREACHABLE" || errCode === "MPP_SERVICE_FAILED") setShowMppHelper(true);
        return;
      }
      stopImportProgress(true);
      const dash = data?.dashboard ?? data;
      setPmDashboard(dash);
      setLocalTasks(dash?.tasks || []);
      setLocalRisks(dash?.risks || []);
      setLocalIssues(dash?.issues || []);
      setPmDirty(false);
    } catch (e) {
      stopImportProgress(false);
      setPmImportError(e?.message || "Import failed.");
    } finally {
      setPmImporting(false);
    }
  }

  async function handlePmClearImports() {
    if (!selectedId) return;
    try {
      const data = await apiAuthed(EP.pmClearImports(selectedId), {
        token: accessToken,
        method: "POST",
      });
      const dash = unwrapDash(data);
      setPmDashboard(dash);
      setLocalTasks(dash?.tasks || []);
      setLocalRisks(dash?.risks || []);
      setLocalIssues(dash?.issues || []);
      setPmDirty(false);
    } catch (e) {
      console.error("Clear imports failed:", e);
    }
  }

  async function handlePmReschedule() {
    if (!selectedId) return;
    try {
      const data = await apiAuthed(EP.pmReschedule(selectedId), {
        token: accessToken,
        method: "POST",
      });
      const dash = unwrapDash(data);
      setPmDashboard(dash);
      setLocalTasks(dash?.tasks || []);
      setLocalRisks(dash?.risks || []);
      setLocalIssues(dash?.issues || []);
      setPmDirty(false);
    } catch (e) {
      console.error("Reschedule failed:", e);
    }
  }

  function handleExportCalendar() {
    if (!selectedId) return;
    window.open(`${API_BASE}${EP.pmCalendar(selectedId)}?token=${accessToken}`, "_blank");
  }

  // ── Task handlers ──────────────────────────────────────────────────
  function saveTaskFromModal(taskData) {
    setLocalTasks((prev) => {
      const idx = prev.findIndex((t) => String(t.taskId) === String(taskData.taskId));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...taskData };
        return next;
      }
      return [...prev, { ...taskData, taskId: taskData.taskId || genId("tsk") }];
    });
    markDirty();
    setTaskModal({ open: false, mode: "add", task: null });
  }

  function handleDeleteTask(taskId) {
    const next = localTasks.filter((t) => String(t.taskId) !== String(taskId));
    setLocalTasks(next);
    handlePmSave({ ...buildSavePayload(), tasks: next });
  }

  function handlePercentChange(taskId, pct) {
    const next = localTasks.map((t) => {
      if (String(t.taskId) !== String(taskId)) return t;
      const updated = { ...t, percentComplete: pct };
      if (pct >= 100) updated.status = "completed";
      else if (pct > 0 && updated.status === "not-started") updated.status = "in-progress";
      return updated;
    });
    setLocalTasks(next);
    markDirty();
  }

  function handleStatusChange(taskId, status) {
    const next = localTasks.map((t) => {
      if (String(t.taskId) !== String(taskId)) return t;
      const updated = { ...t, status };
      if (status === "completed") updated.percentComplete = 100;
      return updated;
    });
    setLocalTasks(next);
    markDirty();
  }

  function handleActualDurationChange(taskId, days) {
    const next = localTasks.map((t) =>
      String(t.taskId) === String(taskId)
        ? { ...t, actualDurationDays: Math.max(0, Number(days) || 0) }
        : t,
    );
    setLocalTasks(next);
    markDirty();
  }

  // ── Risk handlers ──────────────────────────────────────────────────
  function saveRiskFromModal(riskData) {
    setLocalRisks((prev) => {
      const idx = prev.findIndex((r) => String(r.riskId) === String(riskData.riskId));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...riskData };
        return next;
      }
      return [...prev, { ...riskData, riskId: riskData.riskId || genId("rsk") }];
    });
    markDirty();
    setRiskModal({ open: false, mode: "add", risk: null });
  }

  function handleDeleteRisk(riskId) {
    const next = localRisks.filter((r) => String(r.riskId) !== String(riskId));
    setLocalRisks(next);
    handlePmSave({ ...buildSavePayload(), risks: next });
  }

  // ── Issue handlers ─────────────────────────────────────────────────
  function saveIssueFromModal(issueData) {
    setLocalIssues((prev) => {
      const idx = prev.findIndex((i) => String(i.issueId) === String(issueData.issueId));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...issueData };
        return next;
      }
      return [...prev, { ...issueData, issueId: issueData.issueId || genId("iss") }];
    });
    markDirty();
    setIssueModal({ open: false, mode: "add", issue: null });
  }

  function handleDeleteIssue(issueId) {
    const next = localIssues.filter((i) => String(i.issueId) !== String(issueId));
    setLocalIssues(next);
    handlePmSave({ ...buildSavePayload(), issues: next });
  }

  // ── Create project ─────────────────────────────────────────────────
  async function handleCreateProject() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr("");
    try {
      const data = await apiAuthed("/me/pm-tracker", {
        token: accessToken,
        method: "POST",
        body: { name: newName.trim() },
      });
      setProjects((prev) => [data.project, ...prev]);
      setUsed((u) => u + 1);
      setNewName("");
      setShowNewModal(false);
    } catch (e) {
      setCreateErr(e?.message || "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  // ── Delete project ─────────────────────────────────────────────────
  async function handleDeleteProject() {
    const id = showDeleteConfirm;
    if (!id) return;
    setDeleting(true);
    try {
      await apiAuthed(`/me/pm-tracker/${id}`, { token: accessToken, method: "DELETE" });
      setProjects((prev) => prev.filter((p) => String(p._id) !== String(id)));
      setUsed((u) => Math.max(0, u - 1));
      if (String(selectedId) === String(id)) {
        setSelectedId(null);
        setActiveView("dashboard");
      }
      setShowDeleteConfirm(null);
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(false);
    }
  }

  // ── QUIV gate ──────────────────────────────────────────────────────
  // hasQuiv === null means user data not loaded yet — don't flash the gate
  if (hasQuiv === false) return <QuivGate />;

  // ── Selected project name ─────────────────────────────────────────
  const selectedProject = projects.find((p) => String(p._id) === String(selectedId));

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
            >
              <FaArrowLeft className="text-xs" />
              Dashboard
            </Link>
            <span className="text-slate-200">/</span>
            <div className="flex items-center gap-2">
              <FaTasks className="text-adlm-blue-700" />
              <span className="text-base font-bold text-slate-800">PM Tracker</span>
              <span className="rounded-full bg-adlm-blue-700/10 px-2 py-0.5 text-[10px] font-semibold text-adlm-blue-700 uppercase tracking-wide">
                QUIV Exclusive
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {selectedId === null ? (
          /* ── Project list view ── */
          <div className="space-y-5">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Your PM Projects</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Standalone project management — tasks, risks, and issues.
                </p>
              </div>
              <Btn
                variant="primary"
                onClick={() => {
                  setNewName("");
                  setCreateErr("");
                  setShowNewModal(true);
                }}
                disabled={used >= limit}
              >
                <FaPlus className="text-xs" />
                New Project
              </Btn>
            </div>

            {/* Storage bar */}
            <div className="max-w-xs">
              <StorageBar used={used} limit={limit} />
            </div>

            {/* Error */}
            {err ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {err}
                <button
                  type="button"
                  onClick={fetchList}
                  className="ml-2 underline hover:no-underline text-rose-800"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {/* Loading */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
                <FaTasks className="mx-auto text-3xl text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No PM projects yet</p>
                <p className="text-xs text-slate-400">
                  Create your first project to start tracking tasks, risks, and issues.
                </p>
                <Btn
                  variant="primary"
                  onClick={() => {
                    setNewName("");
                    setCreateErr("");
                    setShowNewModal(true);
                  }}
                >
                  <FaPlus className="text-xs" />
                  Create first project
                </Btn>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => (
                  <ProjectCard
                    key={p._id}
                    project={p}
                    onOpen={(id) => {
                      setSelectedId(id);
                      setActiveView("dashboard");
                      const proj = projects.find(p => p._id === id);
                      setPmPublicShareEnabled(Boolean(proj?.publicShareEnabled));
                      setPmPublicToken(proj?.publicToken || null);
                    }}
                    onDelete={(id) => setShowDeleteConfirm(id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Open project view ── */
          <div className="space-y-4">
            {/* Project header */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setActiveView("dashboard");
                  setPmDashboard(null);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
              >
                <FaArrowLeft className="text-xs" />
                All Projects
              </button>
              <span className="text-slate-200">/</span>
              <h2 className="text-base font-bold text-slate-800 truncate">
                {selectedProject?.name || "Project"}
              </h2>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1 shadow-sm">
                {[
                  { key: "dashboard", label: "Dashboard", icon: FaTasks },
                  { key: "details", label: "Details", icon: FaBug },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveView(key)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                      activeView === key
                        ? "bg-adlm-blue-700 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="text-xs" />
                    {label}
                  </button>
                ))}
              </div>
              <PmShareButton
                publicShareEnabled={pmPublicShareEnabled}
                publicToken={pmPublicToken}
                projectId={selectedId}
                accessToken={accessToken}
                onToggle={handleToggleShare}
              />
            </div>

            {/* PM content */}
            {pmLoading ? (
              <div className="space-y-4">
                <div className="h-20 rounded-2xl bg-gradient-to-r from-adlm-blue-700/80 to-blue-800/80 animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : activeView === "dashboard" ? (
              <PmDashboardView
                dashboard={liveDashboard}
                saving={pmSaving}
                importing={pmImporting}
                generating={false}
                importError={pmImportError}
                importProgress={pmImportProgress}
                importStatus={pmImportStatus}
                dirty={pmDirty}
                onAddTask={() => setTaskModal({ open: true, mode: "add", task: null })}
                onAddRisk={() => setRiskModal({ open: true, mode: "add", risk: null })}
                onAddIssue={() => setIssueModal({ open: true, mode: "add", issue: null })}
                onGenerateFromBoq={null}
                onImportFile={handlePmImportFile}
                onClearImports={handlePmClearImports}
                onViewDetails={() => setActiveView("details")}
                onSave={() => handlePmSave(buildSavePayload())}
              />
            ) : (
              <PmDetailsView
                tasks={localTasks}
                risks={localRisks}
                issues={localIssues}
                saving={pmSaving}
                dirty={pmDirty}
                onBack={() => setActiveView("dashboard")}
                onAddTask={() => setTaskModal({ open: true, mode: "add", task: null })}
                onEditTask={(task) => setTaskModal({ open: true, mode: "edit", task })}
                onDeleteTask={handleDeleteTask}
                onPercentChange={handlePercentChange}
                onStatusChange={handleStatusChange}
                onActualDurationChange={handleActualDurationChange}
                onAddRisk={() => setRiskModal({ open: true, mode: "add", risk: null })}
                onEditRisk={(risk) => setRiskModal({ open: true, mode: "edit", risk })}
                onDeleteRisk={handleDeleteRisk}
                onAddIssue={() => setIssueModal({ open: true, mode: "add", issue: null })}
                onEditIssue={(issue) => setIssueModal({ open: true, mode: "edit", issue })}
                onDeleteIssue={handleDeleteIssue}
                onClearImports={handlePmClearImports}
                onReschedule={handlePmReschedule}
                onExportCalendar={handleExportCalendar}
                onSave={() => handlePmSave(buildSavePayload())}
              />
            )}
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      <NewProjectModal
        open={showNewModal}
        newName={newName}
        setNewName={setNewName}
        creating={creating}
        createErr={createErr}
        onCreate={handleCreateProject}
        onClose={() => setShowNewModal(false)}
      />

      <DeleteConfirmModal
        open={Boolean(showDeleteConfirm)}
        projectName={projects.find((p) => String(p._id) === String(showDeleteConfirm))?.name || ""}
        deleting={deleting}
        onConfirm={handleDeleteProject}
        onClose={() => setShowDeleteConfirm(null)}
      />

      <PmTaskModal
        open={taskModal.open}
        mode={taskModal.mode}
        task={taskModal.task}
        boqItems={[]} // PM Tracker projects have no BoQ items
        onSave={saveTaskFromModal}
        onClose={() => setTaskModal({ open: false, mode: "add", task: null })}
      />

      <PmRiskModal
        open={riskModal.open}
        mode={riskModal.mode}
        risk={riskModal.risk}
        onSave={saveRiskFromModal}
        onClose={() => setRiskModal({ open: false, mode: "add", risk: null })}
      />

      <PmIssueModal
        open={issueModal.open}
        mode={issueModal.mode}
        issue={issueModal.issue}
        onSave={saveIssueFromModal}
        onClose={() => setIssueModal({ open: false, mode: "add", issue: null })}
      />

      <PmMppHelperModal
        open={showMppHelper}
        errorMessage={pmImportError}
        onClose={() => setShowMppHelper(false)}
        onPickXml={(f) => {
          setShowMppHelper(false);
          setPmImportError("");
          setPmImportErrorCode("");
          handlePmImportFile(f);
        }}
      />
    </div>
  );
}

function PmShareButton({ publicShareEnabled, publicToken, projectId, accessToken, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("view"); // "view" | "editor"
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Editor invite state
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviting, setInviting] = React.useState(false);
  const [inviteResult, setInviteResult] = React.useState(null); // { ok, message }

  const shareUrl = publicToken
    ? `${window.location.origin}/projects/shared/${publicToken}`
    : "";

  async function handleToggle(enable) {
    setBusy(true);
    await onToggle?.(enable);
    setBusy(false);
  }

  function copyUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleInviteEditor(e) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !projectId) return;
    setInviting(true);
    setInviteResult(null);
    try {
      // 1. Generate a full-access share code restricted to this email
      const codeRes = await fetch(`${API_BASE}/projects/revit/${projectId}/collab/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ accessLevel: "full", allowedEmails: email, label: `Invited: ${email}` }),
      });
      const codeData = await codeRes.json();
      if (!codeRes.ok) throw new Error(codeData?.error || "Failed to create invite code");

      // 2. Send invitation email via server
      const mailRes = await fetch(`${API_BASE}/me/pm-tracker/${projectId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, code: codeData.code }),
      });
      const mailData = await mailRes.json();
      if (!mailRes.ok) throw new Error(mailData?.error || "Failed to send invite email");

      setInviteResult({ ok: true, message: `Invitation sent to ${email}` });
      setInviteEmail("");
    } catch (err) {
      setInviteResult({ ok: false, message: err.message || "Invite failed" });
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          publicShareEnabled
            ? "border-blue-200 bg-blue-50 text-adlm-blue-700"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
        onClick={() => { setOpen(v => !v); setInviteResult(null); }}
      >
        <FaShareAlt className={publicShareEnabled ? "text-adlm-blue-700" : "text-slate-400"} />
        {publicShareEnabled ? "Shared" : "Share"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-88 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden" style={{ width: 340 }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white text-sm font-semibold">
                <FaShareAlt className="text-xs" />
                Share Project
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition">
                <FaTimes className="text-xs" />
              </button>
            </div>

            {/* Tab strip */}
            <div className="flex border-b border-slate-100">
              {[
                { key: "view", label: "View Only" },
                { key: "editor", label: "Invite Editor" },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); setInviteResult(null); }}
                  className={`flex-1 py-2 text-xs font-medium transition border-b-2 ${
                    tab === t.key
                      ? "border-adlm-blue-700 text-adlm-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {tab === "view" ? (
                <>
                  <p className="text-xs text-slate-500">
                    Clients get a <strong>read-only</strong> dashboard link showing progress, budget tiles, task chart, burndown, and overdue summary. No login required.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicShareEnabled}
                      disabled={busy}
                      onChange={e => handleToggle(e.target.checked)}
                      className="rounded"
                    />
                    {busy ? "Updating…" : "Enable public link"}
                  </label>
                  {publicShareEnabled && shareUrl ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <input
                          readOnly
                          value={shareUrl}
                          className="flex-1 bg-transparent text-xs text-slate-600 outline-none truncate"
                        />
                        <button
                          type="button"
                          onClick={copyUrl}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-adlm-blue-700 hover:bg-blue-50 whitespace-nowrap"
                        >
                          {copied ? <><FaCheck className="text-emerald-500" /> Copied</> : <><FaCopy /> Copy</>}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Disable the toggle to revoke this link at any time.
                      </p>
                    </div>
                  ) : !publicShareEnabled ? (
                    <p className="text-[10px] text-slate-400">Enable the link above to generate a shareable URL.</p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    Invite a collaborator as a <strong>full editor</strong>. They'll receive an email with a secure join link and can edit tasks, risks, and issues.
                  </p>
                  <form onSubmit={handleInviteEditor} className="space-y-2">
                    <input
                      type="email"
                      required
                      placeholder="collaborator@email.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-adlm-blue-700 focus:ring-1 focus:ring-adlm-blue-700/20 placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-adlm-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition disabled:opacity-50"
                    >
                      {inviting ? <><FaSpinner className="animate-spin" /> Sending…</> : "Send Invite Email"}
                    </button>
                  </form>
                  {inviteResult ? (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${inviteResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                      {inviteResult.ok ? <FaCheck className="inline mr-1" /> : null}
                      {inviteResult.message}
                    </div>
                  ) : null}
                  <p className="text-[10px] text-slate-400">
                    The invite link is single-use and restricted to this email address.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
