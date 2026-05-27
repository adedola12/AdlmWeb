import React from "react";
import { FaTimes, FaTasks, FaExclamationTriangle, FaBug, FaLink, FaKeyboard } from "react-icons/fa";
import PmBoqItemPicker from "./PmBoqItemPicker.jsx";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
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

// Shared modal shell. Centred dialog, click-outside / Esc to close,
// scroll-locked body, ADLM blue header.
function Modal({ open, title, icon: Icon, onClose, children, footer, widthClass = "max-w-2xl" }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`relative w-full ${widthClass} max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-5 py-3 text-white">
          <div className="flex items-center gap-2.5 font-semibold">
            {Icon ? <Icon className="text-base" /> : null}
            <span className="text-base">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/20 transition"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{children}</span>;
}

function FieldInput(props) {
  return (
    <input
      {...props}
      className={`mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700 ${props.className || ""}`}
    />
  );
}

function FieldSelect({ children, ...props }) {
  return (
    <select
      {...props}
      className={`mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700 ${props.className || ""}`}
    >
      {children}
    </select>
  );
}

function FieldTextarea(props) {
  return (
    <textarea
      {...props}
      className={`mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700 ${props.className || ""}`}
    />
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 rounded-lg bg-adlm-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 transition disabled:opacity-50 ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Task Modal — add or edit a single task with BoQ linking support.
// Baseline cost can be entered manually OR derived from one-or-more
// linked BoQ items (their qty × rate summed). When linked, the manual
// number input is disabled so the user can't get the two out of sync.
// ─────────────────────────────────────────────────────────────────────
export function PmTaskModal({ open, mode = "add", task: initial, boqItems = [], onSave, onClose }) {
  const empty = React.useMemo(
    () => ({
      taskId: genId("tsk"),
      wbs: "",
      name: "",
      description: "",
      startDate: null,
      endDate: null,
      baselineStart: null,
      baselineEnd: null,
      percentComplete: 0,
      baselineCost: 0,
      actualCost: 0,
      status: "not-started",
      priority: "medium",
      assignedTo: "",
      resourceNames: "",
      linkedBoqIdentities: [],
      linkedBoqWeights: [],
      isMilestone: false,
      notes: "",
      source: "manual",
    }),
    [],
  );

  const [form, setForm] = React.useState(empty);
  const [costMode, setCostMode] = React.useState("manual");

  React.useEffect(() => {
    if (!open) return;
    const src = initial ? { ...empty, ...initial } : { ...empty };
    setForm(src);
    setCostMode(
      Array.isArray(src.linkedBoqIdentities) && src.linkedBoqIdentities.length > 0
        ? "linked"
        : "manual",
    );
  }, [open, initial, empty]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    const next = { ...form };
    if (!next.name?.trim()) return;
    // If a date pair is set, also seed baseline if empty.
    if (next.startDate && !next.baselineStart) next.baselineStart = next.startDate;
    if (next.endDate && !next.baselineEnd) next.baselineEnd = next.endDate;
    // If linked mode, baselineCost is computed by parent / server from items.
    onSave?.(next);
  }

  function handleLinkChange(identities, derivedAmount, weights) {
    setForm((prev) => ({
      ...prev,
      linkedBoqIdentities: identities,
      // Parallel weights array. The picker hands us the canonical
      // shape; if any caller forgets to provide one, fall back to a
      // full-100 array so the schema invariant holds.
      linkedBoqWeights: Array.isArray(weights) && weights.length === identities.length
        ? weights
        : identities.map(() => 100),
      // Surface the derived amount immediately so the user sees it; the
      // server will recompute on save based on current items.
      baselineCost: derivedAmount,
    }));
  }

  const isLinked = costMode === "linked";

  return (
    <Modal
      open={open}
      title={mode === "edit" ? "Edit task" : "Add task"}
      icon={FaTasks}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={!form.name?.trim()}>
            {mode === "edit" ? "Save changes" : "Add task"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <label className="sm:col-span-1">
            <FieldLabel>WBS</FieldLabel>
            <FieldInput
              value={form.wbs}
              onChange={(e) => set("wbs", e.target.value)}
              placeholder="1.1"
            />
          </label>
          <label className="sm:col-span-5">
            <FieldLabel>Task name *</FieldLabel>
            <FieldInput
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Excavation, concrete works, ceiling installation…"
              autoFocus
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label>
            <FieldLabel>Start</FieldLabel>
            <FieldInput
              type="date"
              value={fmtDateInput(form.startDate)}
              onChange={(e) => set("startDate", e.target.value || null)}
            />
          </label>
          <label>
            <FieldLabel>Finish</FieldLabel>
            <FieldInput
              type="date"
              value={fmtDateInput(form.endDate)}
              onChange={(e) => set("endDate", e.target.value || null)}
            />
          </label>
          <label>
            <FieldLabel>% complete</FieldLabel>
            <FieldInput
              type="number"
              min="0"
              max="100"
              value={safeNum(form.percentComplete)}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                const next = { ...form, percentComplete: v };
                if (v >= 100) next.status = "completed";
                else if (v > 0 && next.status === "not-started") next.status = "in-progress";
                setForm(next);
              }}
            />
          </label>
          <label>
            <FieldLabel>Status</FieldLabel>
            <FieldSelect
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </FieldSelect>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label>
            <FieldLabel>Priority</FieldLabel>
            <FieldSelect
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>Assignee</FieldLabel>
            <FieldInput
              value={form.assignedTo}
              onChange={(e) => set("assignedTo", e.target.value)}
              placeholder="Person or team"
            />
          </label>
          <label>
            <FieldLabel>Resources</FieldLabel>
            <FieldInput
              value={form.resourceNames}
              onChange={(e) => set("resourceNames", e.target.value)}
              placeholder="Skilled labour, masons…"
            />
          </label>
        </div>

        {/* Cost section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>Baseline cost</FieldLabel>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setCostMode("manual");
                  // When switching away from linked, drop the links so the
                  // manual number stays user-owned.
                  if (form.linkedBoqIdentities?.length) {
                    set("linkedBoqIdentities", []);
                  }
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  !isLinked ? "bg-adlm-blue-700 text-white" : "text-slate-500"
                }`}
              >
                <FaKeyboard className="inline mr-1.5 text-[10px]" />
                Manual
              </button>
              <button
                type="button"
                onClick={() => setCostMode("linked")}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  isLinked ? "bg-adlm-blue-700 text-white" : "text-slate-500"
                }`}
              >
                <FaLink className="inline mr-1.5 text-[10px]" />
                Link BoQ items
              </button>
            </div>
          </div>

          {isLinked ? (
            <PmBoqItemPicker
              items={boqItems}
              value={form.linkedBoqIdentities}
              weights={form.linkedBoqWeights}
              onChange={handleLinkChange}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <FieldLabel>Baseline ₦</FieldLabel>
                <FieldInput
                  type="number"
                  min="0"
                  value={safeNum(form.baselineCost)}
                  onChange={(e) =>
                    set("baselineCost", Math.max(0, Number(e.target.value) || 0))
                  }
                  placeholder="0"
                />
              </label>
              <label>
                <FieldLabel>Actual ₦</FieldLabel>
                <FieldInput
                  type="number"
                  min="0"
                  value={safeNum(form.actualCost)}
                  onChange={(e) =>
                    set("actualCost", Math.max(0, Number(e.target.value) || 0))
                  }
                  placeholder="0"
                />
              </label>
            </div>
          )}

          {isLinked && form.linkedBoqIdentities?.length > 0 ? (
            <div className="mt-2 text-[10px] text-slate-500">
              Baseline cost auto-updates as you change qty / rate in the Bill of Quantity tab.
              Actual cost will reflect the linked items' actual qty × actual rate once the contract is locked.
            </div>
          ) : null}
        </div>

        <label className="block">
          <FieldLabel>Notes / description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional details, dependencies, scope notes…"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(form.isMilestone)}
            onChange={(e) => set("isMilestone", e.target.checked)}
            className="rounded"
          />
          This is a milestone (zero duration marker)
        </label>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Risk modal
// ─────────────────────────────────────────────────────────────────────
export function PmRiskModal({ open, mode = "add", risk: initial, onSave, onClose }) {
  const empty = React.useMemo(
    () => ({
      riskId: genId("rsk"),
      title: "",
      description: "",
      probability: "medium",
      impact: "medium",
      status: "open",
      owner: "",
      mitigation: "",
    }),
    [],
  );
  const [form, setForm] = React.useState(empty);
  React.useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...empty, ...initial } : { ...empty });
  }, [open, initial, empty]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.title?.trim()) return;
    onSave?.(form);
  }

  return (
    <Modal
      open={open}
      title={mode === "edit" ? "Edit risk" : "Add risk"}
      icon={FaExclamationTriangle}
      onClose={onClose}
      widthClass="max-w-xl"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={!form.title?.trim()}>
            {mode === "edit" ? "Save changes" : "Add risk"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <label>
          <FieldLabel>Risk title *</FieldLabel>
          <FieldInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
            placeholder="Late delivery of cement, design rework, etc."
          />
        </label>
        <label>
          <FieldLabel>Description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <FieldLabel>Probability</FieldLabel>
            <FieldSelect
              value={form.probability}
              onChange={(e) => set("probability", e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>Impact</FieldLabel>
            <FieldSelect
              value={form.impact}
              onChange={(e) => set("impact", e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>Status</FieldLabel>
            <FieldSelect
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="open">Open</option>
              <option value="mitigating">Mitigating</option>
              <option value="accepted">Accepted</option>
              <option value="closed">Closed</option>
            </FieldSelect>
          </label>
        </div>
        <label>
          <FieldLabel>Owner</FieldLabel>
          <FieldInput
            value={form.owner}
            onChange={(e) => set("owner", e.target.value)}
            placeholder="Who is responsible?"
          />
        </label>
        <label>
          <FieldLabel>Mitigation plan</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.mitigation}
            onChange={(e) => set("mitigation", e.target.value)}
            placeholder="What actions reduce probability or impact?"
          />
        </label>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Issue modal
// ─────────────────────────────────────────────────────────────────────
export function PmIssueModal({ open, mode = "add", issue: initial, onSave, onClose }) {
  const empty = React.useMemo(
    () => ({
      issueId: genId("iss"),
      title: "",
      description: "",
      severity: "medium",
      status: "open",
      owner: "",
      notes: "",
      openedAt: new Date(),
    }),
    [],
  );
  const [form, setForm] = React.useState(empty);
  React.useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...empty, ...initial } : { ...empty });
  }, [open, initial, empty]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.title?.trim()) return;
    onSave?.(form);
  }

  return (
    <Modal
      open={open}
      title={mode === "edit" ? "Edit issue" : "Add issue"}
      icon={FaBug}
      onClose={onClose}
      widthClass="max-w-xl"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={!form.title?.trim()}>
            {mode === "edit" ? "Save changes" : "Add issue"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <label>
          <FieldLabel>Issue title *</FieldLabel>
          <FieldInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
            placeholder="Cement supplier delay, drawing inconsistency, etc."
          />
        </label>
        <label>
          <FieldLabel>Description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <FieldLabel>Severity</FieldLabel>
            <FieldSelect
              value={form.severity}
              onChange={(e) => set("severity", e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>Status</FieldLabel>
            <FieldSelect
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="open">Open</option>
              <option value="in-progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </FieldSelect>
          </label>
          <label>
            <FieldLabel>Owner</FieldLabel>
            <FieldInput
              value={form.owner}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="Who's on it?"
            />
          </label>
        </div>
        <label>
          <FieldLabel>Notes</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}

export { Modal as PmModalShell };
