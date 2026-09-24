import React, { useState, useEffect } from "react";
import WkModal from "../../ds/WkModal.jsx";

const TRADES = [
  "Site Clearance","Ground works","Earthworks / Excavation","Backfilling / Compaction",
  "Concrete Works","Formwork","Rebar / Reinforcement","Blockwork / Masonry / Bricklaying",
  "Carpentry / Joinery","Roofing","Steelwork / Welding","Aluminium / Glazing",
  "Plumbing","Drainage","Electrical","ELV / ICT / Data Cabling",
  "HVAC / Mechanical","Fire Protection","Tiling","Flooring / Screed",
  "Ceilings / Partitions","Painting / Decorating","Waterproofing","Piling / Foundations",
  "Scaffolding","Roadworks / Asphalt","Landscaping","Security / Access Control",
  "Elevator / Lift","Testing & Commissioning","Demolition",
];

function fmt(date) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

const EMPTY = {
  itemOfWork: "",
  trade: TRADES[0],
  skilledLabor: 0,
  unskilledLabor: 0,
  hoursWorked: 0,
  breakHours: 0,
  equipmentUsed: "",
  output: 0,
  outputUnit: "units",
  taskStartDate: fmt(new Date()),
  taskEndDate: fmt(new Date()),
};

export default function TaskModal({ open, task, weather, onSave, onClose }) {
  const isEdit = !!task;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        itemOfWork: task.itemOfWork ?? "",
        trade: task.trade ?? TRADES[0],
        skilledLabor: task.skilledLabor ?? 0,
        unskilledLabor: task.unskilledLabor ?? 0,
        hoursWorked: task.hoursWorked ?? 0,
        breakHours: task.breakHours ?? 0,
        equipmentUsed: task.equipmentUsed ?? "",
        output: task.output ?? 0,
        outputUnit: task.outputUnit ?? "units",
        taskStartDate: fmt(task.taskStartDate),
        taskEndDate: fmt(task.taskEndDate),
      });
    } else {
      const today = fmt(new Date());
      setForm({ ...EMPTY, taskStartDate: today, taskEndDate: today });
    }
    setError("");
  }, [open, task]);

  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function numSet(key, val) {
    const n = parseFloat(val);
    set(key, isNaN(n) ? 0 : n);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!form.itemOfWork.trim()) {
      setError("Item of Work is required.");
      return;
    }
    if (new Date(form.taskEndDate) < new Date(form.taskStartDate)) {
      setError("End date cannot be before start date.");
      return;
    }
    if (form.breakHours > form.hoursWorked) {
      setError("Break hours cannot exceed hours worked.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        taskKey: task?.taskKey ?? crypto.randomUUID().replace(/-/g, ""),
        createdAtUtc: task?.createdAtUtc ?? new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
        weather: task?.weather ?? (weather
          ? {
              condition: weather.condition,
              temperature: weather.temperature,
              windSpeed: weather.windSpeed,
              date: new Date().toISOString(),
            }
          : null),
      };
      await onSave(payload, isEdit);
      onClose();
    } catch (err) {
      setError(err?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const snap = task?.weather ?? weather;

  // His modal (WkModal) and his modal form: a two-column grid of .wk-f
  // fields, .half for the paired ones, ending in his .wk-modal-go button.
  return (
    <WkModal
      open={open}
      title={isEdit ? "Edit Task" : "Add Task"}
      sub="Labour, hours and output for one item of work."
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={submit}>
        <label className="wk-f">
          <span>Item of Work *</span>
          <input
            value={form.itemOfWork}
            onChange={(e) => set("itemOfWork", e.target.value)}
            placeholder="e.g. Lay 200mm concrete slab to Level 3"
          />
        </label>

        <label className="wk-f">
          <span>Trade</span>
          <select value={form.trade} onChange={(e) => set("trade", e.target.value)}>
            {TRADES.map((tr) => (
              <option key={tr}>{tr}</option>
            ))}
          </select>
        </label>

        <label className="wk-f half">
          <span>Start Date</span>
          <input type="date" value={form.taskStartDate} onChange={(e) => set("taskStartDate", e.target.value)} />
        </label>
        <label className="wk-f half">
          <span>End Date</span>
          <input type="date" value={form.taskEndDate} onChange={(e) => set("taskEndDate", e.target.value)} />
        </label>

        <label className="wk-f half">
          <span>Skilled Labour</span>
          <input type="number" min="0" value={form.skilledLabor} onChange={(e) => numSet("skilledLabor", e.target.value)} />
        </label>
        <label className="wk-f half">
          <span>Unskilled Labour</span>
          <input type="number" min="0" value={form.unskilledLabor} onChange={(e) => numSet("unskilledLabor", e.target.value)} />
        </label>

        <label className="wk-f half">
          <span>Hours Worked</span>
          <input type="number" min="0" step="0.5" value={form.hoursWorked} onChange={(e) => numSet("hoursWorked", e.target.value)} />
        </label>
        <label className="wk-f half">
          <span>Break Hours</span>
          <input type="number" min="0" step="0.5" value={form.breakHours} onChange={(e) => numSet("breakHours", e.target.value)} />
        </label>

        <label className="wk-f half">
          <span>Output</span>
          <input type="number" min="0" step="any" value={form.output} onChange={(e) => numSet("output", e.target.value)} />
        </label>
        <label className="wk-f half">
          <span>Output Unit</span>
          <input value={form.outputUnit} onChange={(e) => set("outputUnit", e.target.value)} placeholder="m², units, m³…" />
        </label>

        <label className="wk-f">
          <span>Equipment Used</span>
          <input
            value={form.equipmentUsed}
            onChange={(e) => set("equipmentUsed", e.target.value)}
            placeholder="e.g. Excavator CAT 320, Concrete pump"
          />
        </label>

        {/* Weather snapshot */}
        {snap && (
          <p
            className="mk-note"
            style={{
              gridColumn: "1 / -1",
              margin: 0,
              background: "var(--pal-light-wash)",
              color: "var(--pal-light-key)",
              borderColor: "var(--pal-light-line)",
            }}
          >
            {snap.condition} · {snap.temperature}°C · {snap.windSpeed} km/h
            {!task?.weather && " · saved with this task"}
          </p>
        )}

        {error && (
          <p
            className="mk-note"
            role="alert"
            style={{
              gridColumn: "1 / -1",
              margin: 0,
              background: "var(--pal-orange-wash)",
              color: "var(--pal-orange-key)",
              borderColor: "var(--pal-orange-line)",
            }}
          >
            {error}
          </p>
        )}

        <button type="submit" className="wk-modal-go" disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Task"}
        </button>
      </form>
    </WkModal>
  );
}
