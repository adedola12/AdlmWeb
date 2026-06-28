// src/pages/PortfolioDashboard.jsx
// Aggregated dashboard across all the user's ADLM projects —
// mirrors the individual-project dashboard style but rolled up portfolio-wide.
import React from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import {
  FaChartBar,
  FaArrowLeft,
  FaExternalLinkAlt,
  FaSyncAlt,
} from "react-icons/fa";

dayjs.extend(relativeTime);

// ── helpers ────────────────────────────────────────────────────────────────
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const PRODUCTS = [
  { key: "revit",     label: "QUIV (Revit)" },
  { key: "planswift", label: "HERON (PlanSwift)" },
  { key: "mep",       label: "MEP Services" },
  { key: "civil3d",   label: "Civil 3D" },
];

function aggregateRows(rows) {
  const totals = {
    projectCount: 0,
    itemCount: 0,
    markedCount: 0,
    totalCost: 0,
    valuedAmount: 0,
    remainingAmount: 0,
  };
  for (const r of rows) {
    totals.projectCount += 1;
    totals.itemCount    += safeNum(r.itemCount);
    totals.markedCount  += safeNum(r.markedCount);
    totals.totalCost    += safeNum(r.totalCost);
    totals.valuedAmount += safeNum(r.valuedAmount);
    totals.remainingAmount += safeNum(r.totalCost) - safeNum(r.valuedAmount);
  }
  totals.progressPercent = totals.itemCount
    ? (totals.markedCount / totals.itemCount) * 100
    : 0;
  return totals;
}

// ── sub-components ─────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 120, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={stroke}
        className="text-slate-200 dark:text-white/10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-adlm-blue-700 transition-all duration-700" />
    </svg>
  );
}

function StatTile({ label, value, helper, tone }) {
  const toneClass =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warning" ? "text-amber-600 dark:text-amber-400"
    : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-4">
      <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</div>
      {helper && <div className="mt-0.5 text-xs text-slate-400 dark:text-adlm-dark-dim">{helper}</div>}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded bg-slate-100 dark:bg-white/10" />
        </td>
      ))}
    </tr>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = React.useState([]);      // { ...projectRow, productKey, productLabel }
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const settled = await Promise.allSettled(
        PRODUCTS.map(async ({ key, label }) => {
          const data = await apiAuthed(`/projects/${key}`, { token: accessToken });
          const list = Array.isArray(data) ? data : [];
          return list.map((r) => ({ ...r, productKey: key, productLabel: label }));
        }),
      );
      const combined = settled
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value);
      setRows(combined);
    } catch (e) {
      setErr(e.message || "Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => { load(); }, [load]);

  const totals = React.useMemo(() => aggregateRows(rows), [rows]);

  // Group rows by product for the breakdown table
  const grouped = React.useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!map[r.productKey]) map[r.productKey] = [];
      map[r.productKey].push(r);
    }
    return map;
  }, [rows]);

  const pct = totals.progressPercent;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-adlm-dark-muted dark:hover:text-adlm-dark-text transition"
            >
              <FaArrowLeft className="text-xs" />
              Back
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <FaChartBar className="text-adlm-blue-700" />
              <h1 className="text-xl font-bold">Portfolio Dashboard</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-adlm-dark-text shadow-sm hover:shadow-md transition disabled:opacity-60"
          >
            <FaSyncAlt className={`text-xs ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
            {err}
          </div>
        )}

        {/* Progress overview card */}
        <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-6">
          <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text mb-1">
            Progress overview
          </div>
          <div className="text-xs text-slate-400 dark:text-adlm-dark-dim mb-5">
            Delivery progress based on items of work marked completed across all projects.
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
            {/* Ring */}
            <div className="relative flex-shrink-0">
              <ProgressRing pct={pct} size={128} stroke={12} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {pct.toFixed(1)}%
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">
                  Overall
                </span>
              </div>
            </div>

            {/* Count tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 w-full">
              <StatTile
                label="Total projects"
                value={loading ? "—" : totals.projectCount}
                helper="Across all ADLM products"
              />
              <StatTile
                label="Completed items"
                value={loading ? "—" : totals.markedCount.toLocaleString()}
                helper="Items of work marked done"
                tone="success"
              />
              <StatTile
                label="Remaining items"
                value={loading ? "—" : (totals.itemCount - totals.markedCount).toLocaleString()}
                helper="Items of work outstanding"
              />
              <StatTile
                label="Total work items"
                value={loading ? "—" : totals.itemCount.toLocaleString()}
                helper="All items across all projects"
              />
              <StatTile
                label="Planned total"
                value={loading ? "—" : `₦${money(totals.totalCost)}`}
                helper="Combined BoQ value"
              />
              <StatTile
                label="Completed to date"
                value={loading ? "—" : `₦${money(totals.valuedAmount)}`}
                helper="Value of work done"
                tone="success"
              />
            </div>
          </div>
        </div>

        {/* Outstanding balance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatTile
            label="Outstanding balance"
            value={loading ? "—" : `₦${money(totals.remainingAmount)}`}
            helper="Project value still to earn or claim"
            tone="warning"
          />
          <StatTile
            label="Overall progress"
            value={loading ? "—" : `${pct.toFixed(1)}%`}
            helper={`${loading ? "—" : totals.markedCount.toLocaleString()} of ${loading ? "—" : totals.itemCount.toLocaleString()} work items completed`}
          />
        </div>

        {/* Per-project breakdown */}
        <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-adlm-dark-border">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text">
              Project breakdown
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">Project</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">Product</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">Items</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">BoQ Total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">Completed</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">Progress</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-adlm-dark-border">
                {loading && [1, 2, 3].map((n) => <SkeletonRow key={n} />)}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-adlm-dark-dim text-xs">
                      No projects found. Open a project from your ADLM plugin to get started.
                    </td>
                  </tr>
                )}
                {!loading && PRODUCTS.map(({ key, label }) => {
                  const group = grouped[key] || [];
                  if (group.length === 0) return null;
                  return (
                    <React.Fragment key={key}>
                      <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        <td colSpan={7} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim">
                          {label}
                        </td>
                      </tr>
                      {group.map((row) => {
                        const rowPct = safeNum(row.itemCount)
                          ? (safeNum(row.markedCount) / safeNum(row.itemCount)) * 100
                          : 0;
                        return (
                          <tr
                            key={row.id || row._id}
                            className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            onClick={() =>
                              navigate(`/projects/${key}?project=${encodeURIComponent(row.slug || row.id)}`)
                            }
                          >
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-adlm-dark-text max-w-[200px] truncate">
                              {row.name}
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-adlm-dark-muted text-xs">
                              {row.productLabel}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-adlm-dark-text">
                              {safeNum(row.itemCount).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-adlm-dark-text">
                              ₦{money(row.totalCost)}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                              ₦{money(row.valuedAmount)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 justify-end">
                                <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-adlm-blue-700"
                                    style={{ width: `${Math.min(100, rowPct)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-adlm-dark-muted w-10 text-right">
                                  {rowPct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-400 dark:text-adlm-dark-dim">
                              <FaExternalLinkAlt className="text-[10px]" />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-adlm-dark-muted">
          <Link to="/portfolio" className="hover:text-adlm-blue-700 transition">All Projects →</Link>
          <Link to="/pm-tracker" className="hover:text-adlm-blue-700 transition">PM Tracker →</Link>
          <Link to="/dashboard" className="hover:text-adlm-blue-700 transition">Dashboard →</Link>
        </div>

      </div>
    </div>
  );
}
