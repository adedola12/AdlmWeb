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

// ── Stats card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ?? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Trade badge ───────────────────────────────────────────────────────────────
function TradeBadge({ trade }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-adlm-navy/10 dark:bg-white/10 text-adlm-navy dark:text-white/80">
      {trade || "—"}
    </span>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, deleting }) {
  const netHrs = Math.max(0, (task.hoursWorked ?? 0) - (task.breakHours ?? 0));
  return (
    <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3 text-sm text-slate-900 dark:text-white font-medium max-w-[220px] truncate">
        {task.itemOfWork}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <TradeBadge trade={task.trade} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 text-center">
        {netHrs.toFixed(1)}h
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 text-center hidden md:table-cell">
        {task.output} {task.outputUnit}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 hidden lg:table-cell">
        {dayjs(task.taskStartDate).format("D MMM YYYY")}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 text-center hidden lg:table-cell">
        {task.weather?.condition ? (
          <span title={`${task.weather.temperature}°C · ${task.weather.windSpeed} km/h`}>
            {task.weather.condition}
          </span>
        ) : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="px-2 py-1 rounded text-xs text-adlm-navy dark:text-blue-300 hover:bg-adlm-navy/10 dark:hover:bg-white/10"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(task)}
            disabled={deleting === task.taskKey}
            className="px-2 py-1 rounded text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40"
          >
            {deleting === task.taskKey ? "…" : "Delete"}
          </button>
        </div>
      </td>
    </tr>
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

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header band */}
      <div className="bg-adlm-navy text-white px-4 sm:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm text-white/60 font-medium mb-1">
            Welcome back, {user?.firstName || user?.username || "there"}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold">Time Log</h1>
          <p className="mt-1 text-white/60 text-sm">
            Track labour hours, trades, and site conditions — synced across desktop and web.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
        {/* Weather + Stats row */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Weather widget */}
          <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Site Weather
            </p>
            {wLoading && (
              <div className="mt-2 text-sm text-slate-400 animate-pulse">Detecting location…</div>
            )}
            {wError && !wLoading && (
              <div className="mt-2">
                <p className="text-xs text-rose-500 dark:text-rose-400">{wError}</p>
                <button onClick={requestLocation}
                  className="mt-2 text-xs text-adlm-navy dark:text-blue-400 underline">
                  Retry
                </button>
              </div>
            )}
            {weather && !wLoading && (
              <>
                <p className="mt-2 text-4xl">{wmoIcon(weather.weatherCode)}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {weather.temperature}{weather.unit}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{weather.condition}</p>
                <p className="text-xs text-slate-400 mt-0.5">💨 {weather.windSpeed} km/h</p>
              </>
            )}
          </div>

          {/* Stats */}
          <StatCard label="Total Tasks" value={tasks.length} sub="all time" />
          <StatCard label="Today's Tasks" value={stats.todayCount} sub="logged today" />
          <StatCard label="Week Hours" value={`${stats.weekHrs.toFixed(1)}h`} sub="this week" />
          <StatCard label="Trades" value={stats.tradeCount} sub="distinct trades" />
        </div>

        {/* Toolbar */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 w-full sm:w-auto">
            <input
              type="search"
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 sm:w-64 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-adlm-navy dark:focus:border-blue-400"
            />
            {tradeOptions.length > 0 && (
              <select
                value={filterTrade}
                onChange={e => setFilterTrade(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="">All trades</option>
                {tradeOptions.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={openAdd}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-adlm-orange text-white text-sm font-semibold shadow-glow-orange hover:brightness-110 active:scale-[.98] transition"
          >
            <span className="text-lg leading-none">+</span> Add Task
          </button>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          {loading ? (
            <div className="py-16 text-center text-slate-400 animate-pulse text-sm">
              Loading tasks…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-500 text-sm">{error}</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">🗂</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {tasks.length === 0
                  ? "No tasks yet — add your first task to get started."
                  : "No tasks match your filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Item of Work</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Trade</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center">Net Hrs</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center hidden md:table-cell">Output</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center hidden lg:table-cell">Weather</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map(task => (
                    <TaskRow
                      key={task.taskKey || task._id}
                      task={task}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      deleting={deleting}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {visible.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 text-right">
            Showing {visible.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            {" · "}Total net hours: {visible.reduce((s, t) => s + Math.max(0, (t.hoursWorked ?? 0) - (t.breakHours ?? 0)), 0).toFixed(1)}h
          </p>
        )}
      </div>

      <TaskModal
        open={modalOpen}
        task={editTask}
        weather={weather}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />
    </main>
  );
}
