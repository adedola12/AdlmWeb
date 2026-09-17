import React, { useState, useEffect } from "react";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEdit ? "Edit Task" : "Add Task"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Item of Work */}
          <div className="sm:col-span-2">
            <label className="label">Item of Work *</label>
            <input
              className="field"
              value={form.itemOfWork}
              onChange={e => set("itemOfWork", e.target.value)}
              placeholder="e.g. Lay 200mm concrete slab to Level 3"
            />
          </div>

          {/* Trade */}
          <div className="sm:col-span-2">
            <label className="label">Trade</label>
            <select className="field" value={form.trade} onChange={e => set("trade", e.target.value)}>
              {TRADES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="field" value={form.taskStartDate}
              onChange={e => set("taskStartDate", e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" className="field" value={form.taskEndDate}
              onChange={e => set("taskEndDate", e.target.value)} />
          </div>

          {/* Labour */}
          <div>
            <label className="label">Skilled Labour</label>
            <input type="number" min="0" className="field" value={form.skilledLabor}
              onChange={e => numSet("skilledLabor", e.target.value)} />
          </div>
          <div>
            <label className="label">Unskilled Labour</label>
            <input type="number" min="0" className="field" value={form.unskilledLabor}
              onChange={e => numSet("unskilledLabor", e.target.value)} />
          </div>

          {/* Hours */}
          <div>
            <label className="label">Hours Worked</label>
            <input type="number" min="0" step="0.5" className="field" value={form.hoursWorked}
              onChange={e => numSet("hoursWorked", e.target.value)} />
          </div>
          <div>
            <label className="label">Break Hours</label>
            <input type="number" min="0" step="0.5" className="field" value={form.breakHours}
              onChange={e => numSet("breakHours", e.target.value)} />
          </div>

          {/* Output */}
          <div>
            <label className="label">Output</label>
            <input type="number" min="0" step="any" className="field" value={form.output}
              onChange={e => numSet("output", e.target.value)} />
          </div>
          <div>
            <label className="label">Output Unit</label>
            <input className="field" value={form.outputUnit}
              onChange={e => set("outputUnit", e.target.value)} placeholder="m², units, m³…" />
          </div>

          {/* Equipment */}
          <div className="sm:col-span-2">
            <label className="label">Equipment Used</label>
            <input className="field" value={form.equipmentUsed}
              onChange={e => set("equipmentUsed", e.target.value)}
              placeholder="e.g. Excavator CAT 320, Concrete pump" />
          </div>

          {/* Weather snapshot */}
          {(weather || task?.weather) && (
            <div className="sm:col-span-2 flex items-center gap-2 text-sm rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-2">
              <span>🌤</span>
              <span>
                {(task?.weather ?? weather).condition} ·{" "}
                {(task?.weather ?? weather).temperature}°C ·{" "}
                {(task?.weather ?? weather).windSpeed} km/h
                {!task?.weather && " — will be saved with this task"}
              </span>
            </div>
          )}

          {error && (
            <p className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg bg-adlm-navy text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Task"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .label { display:block; font-size:.75rem; font-weight:600; margin-bottom:.25rem; color: var(--tw-color-slate-700,#344054); }
        .dark .label { color: #94a3b8; }
        .field {
          width:100%; padding:.5rem .75rem; border-radius:.5rem;
          border:1px solid #e2e8f0; background:#f8fafc; font-size:.875rem;
          outline:none; transition:border-color .15s;
        }
        .field:focus { border-color:#0B1B33; }
        .dark .field { background:#1e293b; border-color:#334155; color:#f1f5f9; }
        .dark .field:focus { border-color:#60a5fa; }
      `}</style>
    </div>
  );
}
