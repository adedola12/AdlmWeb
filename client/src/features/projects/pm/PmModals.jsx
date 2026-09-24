import React from "react";
import { FaBug, FaExclamationTriangle, FaKeyboard, FaLink, FaTasks } from "../../../components/icons.jsx";
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

// Shared modal shell: his .wk-modal (the markup of his W.modal), with
// click-outside / Esc to close and the body scroll locked. His modal has no
// header icon, so `icon` is accepted and not drawn. `widthClass` keeps its
// Tailwind names and maps onto his card's width.
const MODAL_WIDTH = { "max-w-md": 448, "max-w-lg": 512, "max-w-xl": 576, "max-w-2xl": 672, "max-w-3xl": 768 };

function Modal({ open, title, onClose, children, footer, widthClass = "max-w-2xl" }) {
  const [shown, setShown] = React.useState(false);

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

  // .wk-modal fades in once .on lands; the timer covers a tab that is not
  // painting, where requestAnimationFrame never fires (as in WkModal).
  React.useEffect(() => {
    if (!open) {
      setShown(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    const fallback = setTimeout(() => setShown(true), 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [open]);

  if (!open) return null;
  const width = MODAL_WIDTH[widthClass] || 672;
  return (
    <div
      className={`wk-modal${shown ? " on" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="wk-modal-c"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `min(${width}px, 100%)` }}
      >
        <button type="button" className="wk-modal-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-close" />
          </svg>
        </button>
        <h2 style={{ marginBottom: 22 }}>{title}</h2>
        {children}
        {footer ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid var(--line)",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Field pieces for his .wk-f labels: the span is his label, and his rules
// style the input and select. He has no textarea, so it borrows the same look.
const TEXTAREA = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "var(--bg-alt)",
  color: "var(--ink)",
  fontFamily: "var(--font)",
  fontSize: 14,
  fontWeight: 300,
  resize: "vertical",
};
const STACK = { display: "grid", gap: 16 };
const ROW = { display: "flex", flexWrap: "wrap", gap: 12 };
const FIELD = { flex: "1 1 150px", minWidth: 0 };
const HINT = { fontSize: 12, fontWeight: 300, color: "var(--ink-3)" };
const CHECK = { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" };

function FieldLabel({ children }) {
  return <span>{children}</span>;
}

function FieldInput(props) {
  return <input {...props} />;
}

function FieldSelect({ children, ...props }) {
  return <select {...props}>{children}</select>;
}

function FieldTextarea(props) {
  return <textarea {...props} style={{ ...TEXTAREA, ...props.style }} />;
}

function PrimaryButton({ children, ...props }) {
  return (
    <button type="button" {...props} className={`ds-btn ds-btn-sm btn-p ${props.className || ""}`}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button type="button" {...props} className={`ds-btn ds-btn-sm btn-o ${props.className || ""}`}>
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
      // Critical-path defaults — false for manually-added tasks; the
      // MS Project importer sets it to true (and writes totalSlackDays)
      // on tasks Project flagged as Critical.
      criticalPath: false,
      totalSlackDays: 0,
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
      <div style={STACK}>
        <div style={ROW}>
          <label className="wk-f" style={{ flex: "1 1 90px", minWidth: 0 }}>
            <FieldLabel>WBS</FieldLabel>
            <FieldInput
              value={form.wbs}
              onChange={(e) => set("wbs", e.target.value)}
              placeholder="1.1"
            />
          </label>
          <label className="wk-f" style={{ flex: "5 1 260px", minWidth: 0 }}>
            <FieldLabel>Task name *</FieldLabel>
            <FieldInput
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Excavation, concrete works, ceiling installation…"
              autoFocus
            />
          </label>
        </div>

        <div style={ROW}>
          <label className="wk-f" style={FIELD}>
            <FieldLabel>Start</FieldLabel>
            <FieldInput
              type="date"
              value={fmtDateInput(form.startDate)}
              onChange={(e) => set("startDate", e.target.value || null)}
            />
          </label>
          <label className="wk-f" style={FIELD}>
            <FieldLabel>Finish</FieldLabel>
            <FieldInput
              type="date"
              value={fmtDateInput(form.endDate)}
              onChange={(e) => set("endDate", e.target.value || null)}
            />
          </label>
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
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

        <div style={ROW}>
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
            <FieldLabel>Assignee</FieldLabel>
            <FieldInput
              value={form.assignedTo}
              onChange={(e) => set("assignedTo", e.target.value)}
              placeholder="Person or team"
            />
          </label>
          <label className="wk-f" style={FIELD}>
            <FieldLabel>Resources</FieldLabel>
            <FieldInput
              value={form.resourceNames}
              onChange={(e) => set("resourceNames", e.target.value)}
              placeholder="Skilled labour, masons…"
            />
          </label>
        </div>

        {/* Cost section */}
        <div className="wk-panel" style={{ marginBottom: 0, padding: 16 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
              Baseline cost
            </p>
            <div className="wk-loc-sw" role="tablist" aria-label="Baseline cost source">
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
                role="tab"
                aria-selected={!isLinked}
                className={!isLinked ? "on" : ""}
              >
                <FaKeyboard size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                Manual
              </button>
              <button
                type="button"
                onClick={() => setCostMode("linked")}
                role="tab"
                aria-selected={isLinked}
                className={isLinked ? "on" : ""}
              >
                <FaLink size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
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
            <div style={ROW}>
              <label className="wk-f" style={FIELD}>
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
              <label className="wk-f" style={FIELD}>
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
            <div style={{ ...HINT, marginTop: 10 }}>
              Baseline cost auto-updates as you change qty / rate in the Bill of Quantity tab.
              Actual cost will reflect the linked items' actual qty × actual rate once the contract is locked.
            </div>
          ) : null}
        </div>

        <label className="wk-f">
          <FieldLabel>Notes / description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional details, dependencies, scope notes…"
          />
        </label>

        <label style={CHECK}>
          <input
            type="checkbox"
            checked={Boolean(form.isMilestone)}
            onChange={(e) => set("isMilestone", e.target.checked)}
          />
          This is a milestone (zero duration marker)
        </label>

        {/* Critical-path toggle: auto-set by MS Project import, but
            users can flip it on manual tasks to mark sequencing
            bottlenecks the importer didn't see (subcontractor lead
            time, weather windows, etc.). */}
        <label style={CHECK}>
          <input
            type="checkbox"
            checked={Boolean(form.criticalPath)}
            onChange={(e) => set("criticalPath", e.target.checked)}
          />
          On critical path (zero slack, any delay slips finish date)
        </label>
        {form.criticalPath ? (
          <div style={{ ...HINT, marginLeft: 26 }}>
            Will display a 🔥 badge on the WBS row and count toward the
            dashboard's Critical-path total.
          </div>
        ) : null}
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
      <div style={STACK}>
        <label className="wk-f" style={FIELD}>
          <FieldLabel>Risk title *</FieldLabel>
          <FieldInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
            placeholder="Late delivery of cement, design rework, etc."
          />
        </label>
        <label className="wk-f" style={FIELD}>
          <FieldLabel>Description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div style={ROW}>
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
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
        <label className="wk-f" style={FIELD}>
          <FieldLabel>Owner</FieldLabel>
          <FieldInput
            value={form.owner}
            onChange={(e) => set("owner", e.target.value)}
            placeholder="Who is responsible?"
          />
        </label>
        <label className="wk-f" style={FIELD}>
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
      <div style={STACK}>
        <label className="wk-f" style={FIELD}>
          <FieldLabel>Issue title *</FieldLabel>
          <FieldInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
            placeholder="Cement supplier delay, drawing inconsistency, etc."
          />
        </label>
        <label className="wk-f" style={FIELD}>
          <FieldLabel>Description</FieldLabel>
          <FieldTextarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div style={ROW}>
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
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
          <label className="wk-f" style={FIELD}>
            <FieldLabel>Owner</FieldLabel>
            <FieldInput
              value={form.owner}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="Who's on it?"
            />
          </label>
        </div>
        <label className="wk-f" style={FIELD}>
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
