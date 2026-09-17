import React, { useState, useMemo } from "react";
import dayjs from "dayjs";
import { useTasks } from "../features/timemgt/useTaskApi.js";
import { useWeather } from "../features/timemgt/useWeather.js";
import TaskModal from "../features/timemgt/TaskModal.jsx";
import { useAuth } from "../store.jsx";

// ── Weather icon mapping (WMO code → emoji) ──────────────────────────────────
function wmoIcon(code) {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫";
  if (code <= 55) return "🌦";
  if (code <= 65) return "🌧";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧";
  return "⛈";
}

// ── Stats tile (his .dsh-stat) ───────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="dsh-stat">
      <span className="k">{label}</span>
      <b>{value}</b>
      {sub && <span className="ds-sub">{sub}</span>}
    </div>
  );
}

// ── Trade chip (his .wk-src) ─────────────────────────────────────────────────
function TradeBadge({ trade }) {
  return <span className="wk-src sm">{trade || "–"}</span>;
}

// ── Task row (his bill row) ──────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, deleting }) {
  const netHrs = Math.max(0, (task.hoursWorked ?? 0) - (task.breakHours ?? 0));
  const details = [
    dayjs(task.taskStartDate).format("D MMM YYYY"),
    task.weather?.condition
      ? `${task.weather.condition}${task.weather.temperature != null ? ` · ${task.weather.temperature}°C` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="wk-qr">
      <span className="d">
        <b style={{ display: "block", fontSize: 13.5, fontWeight: 400, color: "var(--ink)" }}>
          {task.itemOfWork}
        </b>
        <em>{details}</em>
      </span>
      <span className="s">
        <TradeBadge trade={task.trade} />
      </span>
      <span className="q">
        {netHrs.toFixed(1)}
        <i>h</i>
      </span>
      <span className="r">
        {task.output} {task.outputUnit}
      </span>
      <span className="ds-a">
        <span className="wk-acts" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onEdit(task)} className="ds-btn ds-btn-sm btn-o" style={{ padding: "4px 10px" }}>
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            disabled={deleting === task.taskKey}
            className="ds-btn ds-btn-sm btn-o"
            style={{ padding: "4px 10px", color: "var(--pal-orange-key)" }}
          >
            {deleting === task.taskKey ? "…" : "Delete"}
          </button>
        </span>
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TimeManagement() {
  const { user } = useAuth();
  const { tasks, loading, error, createTask, updateTask, deleteTask } = useTasks();
  const { weather, loading: wLoading, error: wError, requestLocation } = useWeather();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("");

  // Derived stats
  const stats = useMemo(() => {
    const today = dayjs().startOf("day");
    const weekStart = dayjs().startOf("week");
    let totalHrs = 0, weekHrs = 0, todayCount = 0;
    const trades = new Set();

    for (const t of tasks) {
      const netH = Math.max(0, (t.hoursWorked ?? 0) - (t.breakHours ?? 0));
      totalHrs += netH;
      if (dayjs(t.taskStartDate).isSame(today, "day")) todayCount++;
      if (dayjs(t.taskStartDate).isAfter(weekStart)) weekHrs += netH;
      if (t.trade) trades.add(t.trade);
    }
    return { totalHrs, weekHrs, todayCount, tradeCount: trades.size };
  }, [tasks]);

  // Filtered task list
  const visible = useMemo(() => {
    return tasks.filter(t => {
      if (filterTrade && t.trade !== filterTrade) return false;
      if (!search.trim()) return true;
      const hay = `${t.itemOfWork} ${t.trade} ${t.equipmentUsed}`.toLowerCase();
      return search.toLowerCase().split(" ").filter(Boolean).every(tok => hay.includes(tok));
    });
  }, [tasks, search, filterTrade]);

  // Unique trade list for filter
  const tradeOptions = useMemo(() => {
    const s = new Set(tasks.map(t => t.trade).filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  function openAdd() { setEditTask(null); setModalOpen(true); }
  function openEdit(task) { setEditTask(task); setModalOpen(true); }

  async function handleSave(payload, isEdit) {
    if (isEdit && editTask) {
      await updateTask(editTask.taskKey, payload);
    } else {
      await createTask(payload);
    }
  }

  async function handleDelete(task) {
    if (!confirm(`Delete "${task.itemOfWork}"?`)) return;
    setDeleting(task.taskKey);
    try {
      await deleteTask(task.taskKey);
    } finally {
      setDeleting(null);
    }
  }

  const netTotal = visible.reduce(
    (s, v) => s + Math.max(0, (v.hoursWorked ?? 0) - (v.breakHours ?? 0)),
    0,
  );

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Time Log</h1>
          <p className="wk-ref">
            Welcome back, {user?.firstName || user?.username || "there"}. Track labour
            hours, trades and site conditions: synced across desktop and web.
          </p>
        </div>
        <div className="wk-acts">
          <button type="button" onClick={openAdd} className="ds-btn ds-btn-sm btn-p">
            + Add Task
          </button>
        </div>
      </div>

      {/* Weather + figures, in his tiles */}
      <div
        className="dsh-stats"
        style={{ marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        <div className="dsh-stat">
          <span className="k">Site weather</span>
          {wLoading ? (
            <span className="ds-sub animate-pulse">Detecting location…</span>
          ) : wError ? (
            <>
              <span className="ds-sub" style={{ color: "var(--pal-orange-key)" }}>{wError}</span>
              <button
                type="button"
                onClick={requestLocation}
                className="ds-btn ds-btn-sm btn-o"
                style={{ marginTop: 8, alignSelf: "flex-start" }}
              >
                Retry
              </button>
            </>
          ) : weather ? (
            <>
              <b>
                <span aria-hidden="true" style={{ marginRight: 8 }}>{wmoIcon(weather.weatherCode)}</span>
                {weather.temperature}
                {weather.unit}
              </b>
              <span className="ds-sub">
                {weather.condition} · wind {weather.windSpeed} km/h
              </span>
            </>
          ) : (
            <span className="ds-sub">–</span>
          )}
        </div>
        <StatCard label="Total Tasks" value={tasks.length} sub="all time" />
        <StatCard label="Today's Tasks" value={stats.todayCount} sub="logged today" />
        <StatCard label="Week Hours" value={`${stats.weekHrs.toFixed(1)}h`} sub="this week" />
        <StatCard label="Trades" value={stats.tradeCount} sub="distinct trades" />
      </div>

      <section className="wk-panel" style={{ marginBottom: 0 }}>
        {/* Toolbar */}
        <div className="wk-bar" style={{ margin: 0, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <label className="wk-find">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-search" />
            </svg>
            <input
              type="search"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
              autoComplete="off"
            />
          </label>
          {tradeOptions.length > 0 && (
            <label className="wk-f" style={{ flex: "0 1 200px", margin: 0 }}>
              <select
                value={filterTrade}
                onChange={(e) => setFilterTrade(e.target.value)}
                aria-label="Filter by trade"
                style={{ padding: "10px 12px" }}
              >
                <option value="">All trades</option>
                {tradeOptions.map((tr) => (
                  <option key={tr}>{tr}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {loading ? (
          <div className="wk-empty animate-pulse">Loading tasks…</div>
        ) : error ? (
          <div className="wk-empty" style={{ color: "var(--pal-orange-key)" }}>{error}</div>
        ) : visible.length === 0 ? (
          <div className="wk-empty">
            {tasks.length === 0
              ? "No tasks yet. Add your first task to get started."
              : "No tasks match your filter."}
          </div>
        ) : (
          <div className="wk-qt" style={{ padding: "0 20px" }}>
            <div className="wk-qhd">
              <span>Item of work</span>
              <span>Trade</span>
              <span>Net hrs</span>
              <span>Output</span>
              <span />
            </div>
            {visible.map((task) => (
              <TaskRow
                key={task.taskKey || task._id}
                task={task}
                onEdit={openEdit}
                onDelete={handleDelete}
                deleting={deleting}
              />
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <p className="wk-note" style={{ borderTop: "1px solid var(--line)", textAlign: "right" }}>
            Showing {visible.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            {" · "}Total net hours: {netTotal.toFixed(1)}h
          </p>
        )}
      </section>

      <TaskModal
        open={modalOpen}
        task={editTask}
        weather={weather}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
