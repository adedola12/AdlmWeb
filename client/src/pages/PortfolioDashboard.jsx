// src/pages/PortfolioDashboard.jsx
// Portfolio-wide dashboard — progress ring, charts, status, Excel export.
import React from "react";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import {
  FaChartBar,
  FaArrowLeft,
  FaSyncAlt,
  FaFileExcel,
  FaExternalLinkAlt,
} from "react-icons/fa";

dayjs.extend(relativeTime);

// ── helpers ─────────────────────────────────────────────────────────────────
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v, compact = false) {
  if (compact) {
    const n = safeNum(v);
    if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
    return `₦${n.toFixed(0)}`;
  }
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const PRODUCTS = [
  { key: "revit",     label: "QUIV",  color: "#3b82f6" },
  { key: "planswift", label: "HERON", color: "#8b5cf6" },
  { key: "mep",       label: "MEP",   color: "#10b981" },
  { key: "civil3d",   label: "Civil", color: "#f59e0b" },
];
const COLOR_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.color]));

function projectStatus(row) {
  const pct =
    safeNum(row.itemCount) > 0
      ? (safeNum(row.markedCount) / safeNum(row.itemCount)) * 100
      : 0;
  if (safeNum(row.itemCount) === 0) return { label: "Empty",       color: "bg-slate-100 text-slate-500" };
  if (pct === 0)                     return { label: "Not Started", color: "bg-slate-100 text-slate-500" };
  if (pct >= 100)                    return { label: "Complete",    color: "bg-emerald-100 text-emerald-700" };
  if (pct >= 60)                     return { label: "On Track",    color: "bg-blue-100 text-blue-700" };
  return                                    { label: "In Progress", color: "bg-amber-100 text-amber-700" };
}

function aggregateRows(rows) {
  const totals = { projectCount: 0, itemCount: 0, markedCount: 0, totalCost: 0, valuedAmount: 0 };
  for (const r of rows) {
    totals.projectCount  += 1;
    totals.itemCount     += safeNum(r.itemCount);
    totals.markedCount   += safeNum(r.markedCount);
    totals.totalCost     += safeNum(r.totalCost);
    totals.valuedAmount  += safeNum(r.valuedAmount);
  }
  totals.remainingAmount  = totals.totalCost - totals.valuedAmount;
  totals.progressPercent  = totals.itemCount ? (totals.markedCount / totals.itemCount) * 100 : 0;
  return totals;
}

// ── SVG chart components ─────────────────────────────────────────────────────
function ProgressRing({ pct, size = 120, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
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

// Dual horizontal bar chart: BoQ total vs completed, one row per product
function ProductBarChart({ grouped }) {
  const W = 440, H_ROW = 44, PAD = 100, INNER = W - PAD - 12;
  const entries = PRODUCTS.map((p) => {
    const rows = grouped[p.key] || [];
    const total  = rows.reduce((s, r) => s + safeNum(r.totalCost), 0);
    const valued = rows.reduce((s, r) => s + safeNum(r.valuedAmount), 0);
    return { ...p, total, valued };
  }).filter((e) => e.total > 0 || (grouped[e.key] || []).length > 0);

  const maxVal = Math.max(...entries.map((e) => e.total), 1);
  const H = entries.length * H_ROW + 10;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: H }}>
      {entries.map((e, i) => {
        const y = i * H_ROW + 6;
        const totalW = (e.total / maxVal) * INNER;
        const valuedW = (e.valued / maxVal) * INNER;
        return (
          <g key={e.key}>
            <text x={PAD - 8} y={y + 14} textAnchor="end"
              fill="#94a3b8" fontSize={11} fontWeight={600}>{e.label}</text>
            {/* BoQ total bar */}
            <rect x={PAD} y={y + 2} width={Math.max(totalW, 2)} height={14} rx={4} fill={e.color} opacity={0.18} />
            {/* Completed bar */}
            <rect x={PAD} y={y + 2} width={Math.max(valuedW, 0)} height={14} rx={4} fill={e.color} />
            {/* Outstanding thin bar */}
            <rect x={PAD + valuedW} y={y + 20} width={Math.max(totalW - valuedW, 0)} height={8} rx={3} fill={e.color} opacity={0.12} />
            <text x={PAD + totalW + 4} y={y + 13} fill="#94a3b8" fontSize={10}>{money(e.total, true)}</text>
            <text x={PAD + valuedW + 4} y={y + 27} fill={e.color} fontSize={10} opacity={0.8}>{money(e.valued, true)} done</text>
          </g>
        );
      })}
    </svg>
  );
}

// Vertical bar chart: project count per product
function ProductCountChart({ grouped }) {
  const W = 260, H = 160, PAD_B = 28, PAD_L = 28;
  const entries = PRODUCTS.map((p) => ({
    ...p,
    projects: (grouped[p.key] || []).length,
    items: (grouped[p.key] || []).reduce((s, r) => s + safeNum(r.itemCount), 0),
  })).filter((e) => e.projects > 0);

  const maxP = Math.max(...entries.map((e) => e.projects), 1);
  const barW = entries.length > 0 ? Math.floor((W - PAD_L - 10) / entries.length) - 6 : 30;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      <text x={4} y={14} fontSize={9} fill="#94a3b8" fontWeight={600}>Projects</text>
      {entries.map((e, i) => {
        const x = PAD_L + i * (barW + 6);
        const bh = (e.projects / maxP) * (H - PAD_B - 20);
        const y = H - PAD_B - bh;
        return (
          <g key={e.key}>
            <rect x={x} y={y} width={barW} height={bh} rx={3} fill={e.color} opacity={0.85} />
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={10} fontWeight={700} fill={e.color}>{e.projects}</text>
            <text x={x + barW / 2} y={H - PAD_B + 12} textAnchor="middle" fontSize={10} fill="#94a3b8">{e.label}</text>
            <text x={x + barW / 2} y={H - PAD_B + 22} textAnchor="middle" fontSize={9} fill="#cbd5e1">{e.items} items</text>
          </g>
        );
      })}
      <line x1={PAD_L - 4} y1={H - PAD_B} x2={W - 4} y2={H - PAD_B} stroke="#e2e8f0" strokeWidth={1} />
    </svg>
  );
}

// ── Excel export ─────────────────────────────────────────────────────────────
function exportExcel(rows, totals) {
  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet([
    ["ADLM Studio — Portfolio Dashboard", "", "", dayjs().format("DD MMM YYYY HH:mm")],
    [],
    ["Metric", "Value"],
    ["Total Projects",       totals.projectCount],
    ["Total Work Items",     totals.itemCount],
    ["Completed Items",      totals.markedCount],
    ["Overall Progress (%)", +totals.progressPercent.toFixed(2)],
    ["Combined BoQ Total",   totals.totalCost],
    ["Completed to Date",    totals.valuedAmount],
    ["Outstanding Balance",  totals.remainingAmount],
  ]);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const projectHeaders = ["Project Name","Product","Status","Items","Completed Items","Progress (%)","BoQ Total (₦)","Completed to Date (₦)","Outstanding (₦)","Last Updated"];
  const projectData = rows.map((r) => {
    const pct = safeNum(r.itemCount) ? (safeNum(r.markedCount) / safeNum(r.itemCount)) * 100 : 0;
    return [
      r.name, r.productLabel, projectStatus(r).label,
      safeNum(r.itemCount), safeNum(r.markedCount), +pct.toFixed(2),
      safeNum(r.totalCost), safeNum(r.valuedAmount),
      safeNum(r.totalCost) - safeNum(r.valuedAmount),
      r.updatedAt ? dayjs(r.updatedAt).format("DD MMM YYYY") : "",
    ];
  });
  const wsProjects = XLSX.utils.aoa_to_sheet([projectHeaders, ...projectData]);
  wsProjects["!cols"] = [22,12,14,8,16,14,18,20,16,16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsProjects, "Projects");

  const productHeaders = ["Product","Projects","Total Items","Completed Items","Progress (%)","BoQ Total (₦)","Completed (₦)","Outstanding (₦)"];
  const productData = PRODUCTS.map(({ key, label }) => {
    const g = rows.filter((r) => r.productKey === key);
    if (!g.length) return null;
    const agg = aggregateRows(g);
    return [label, agg.projectCount, agg.itemCount, agg.markedCount, +agg.progressPercent.toFixed(2), agg.totalCost, agg.valuedAmount, agg.remainingAmount];
  }).filter(Boolean);
  const wsProducts = XLSX.utils.aoa_to_sheet([productHeaders, ...productData]);
  wsProducts["!cols"] = [14,10,14,16,14,18,16,16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsProducts, "By Product");

  XLSX.writeFile(wb, `adlm-portfolio-${dayjs().format("YYYY-MM-DD")}.xlsx`);
}

// ── sub components ───────────────────────────────────────────────────────────
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
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-3 rounded bg-slate-100 dark:bg-white/10" /></td>
      ))}
    </tr>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr]         = React.useState("");
  const [tab, setTab]         = React.useState("overview");

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const settled = await Promise.allSettled(
        PRODUCTS.map(async ({ key, label }) => {
          const data = await apiAuthed(`/projects/${key}`, { token: accessToken });
          return (Array.isArray(data) ? data : []).map((r) => ({ ...r, productKey: key, productLabel: label }));
        }),
      );
      setRows(settled.filter((r) => r.status === "fulfilled").flatMap((r) => r.value));
    } catch (e) {
      setErr(e.message || "Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => { load(); }, [load]);

  const totals  = React.useMemo(() => aggregateRows(rows), [rows]);
  const grouped = React.useMemo(() => {
    const m = {};
    for (const r of rows) { if (!m[r.productKey]) m[r.productKey] = []; m[r.productKey].push(r); }
    return m;
  }, [rows]);

  const pct = totals.progressPercent;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-adlm-dark-muted dark:hover:text-adlm-dark-text transition">
              <FaArrowLeft className="text-xs" /> Back
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <FaChartBar className="text-adlm-blue-700" />
              <h1 className="text-xl font-bold">Portfolio Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-adlm-dark-text shadow-sm hover:shadow-md transition disabled:opacity-60">
              <FaSyncAlt className={`text-xs ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button type="button" onClick={() => !loading && exportExcel(rows, totals)}
              disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:shadow-md transition disabled:opacity-50">
              <FaFileExcel className="text-xs" /> Export Excel
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">{err}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-adlm-dark-border">
          {[{ id: "overview", label: "Overview" }, { id: "charts", label: "Charts" }, { id: "report", label: "Report" }].map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.id
                  ? "border-adlm-blue-700 text-adlm-blue-700 dark:text-adlm-blue-300"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-adlm-dark-muted"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══ */}
        {tab === "overview" && (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-6">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text mb-1">Progress overview</div>
              <div className="text-xs text-slate-400 dark:text-adlm-dark-dim mb-5">
                Delivery progress based on items of work marked completed across all projects.
              </div>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                <div className="relative flex-shrink-0">
                  <ProgressRing pct={pct} size={128} stroke={12} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">{pct.toFixed(1)}%</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Overall</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 w-full">
                  <StatTile label="Total projects"    value={loading ? "—" : totals.projectCount} helper="Across all ADLM products" />
                  <StatTile label="Completed items"   value={loading ? "—" : totals.markedCount.toLocaleString()} helper="Items marked done" tone="success" />
                  <StatTile label="Remaining items"   value={loading ? "—" : (totals.itemCount - totals.markedCount).toLocaleString()} helper="Items outstanding" />
                  <StatTile label="Total work items"  value={loading ? "—" : totals.itemCount.toLocaleString()} helper="All items combined" />
                  <StatTile label="Planned total"     value={loading ? "—" : `₦${money(totals.totalCost)}`} helper="Combined BoQ value" />
                  <StatTile label="Completed to date" value={loading ? "—" : `₦${money(totals.valuedAmount)}`} helper="Value of work done" tone="success" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatTile label="Outstanding balance" value={loading ? "—" : `₦${money(totals.remainingAmount)}`} helper="Project value yet to claim" tone="warning" />
              <StatTile label="Overall progress"    value={loading ? "—" : `${pct.toFixed(1)}%`} helper={`${totals.markedCount.toLocaleString()} of ${totals.itemCount.toLocaleString()} work items`} />
            </div>

            {/* Project table */}
            <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-adlm-dark-border">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text">Project breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5">
                      {["Project","Product","Status","Items","BoQ Total","Completed","Progress",""].map((h) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim ${["Items","Progress",""].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-adlm-dark-border">
                    {loading && [1,2,3].map((n) => <SkeletonRow key={n} />)}
                    {!loading && rows.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-xs">No projects found. Open a project from your ADLM plugin to get started.</td></tr>
                    )}
                    {!loading && PRODUCTS.map(({ key }) => {
                      const group = grouped[key] || [];
                      if (!group.length) return null;
                      return (
                        <React.Fragment key={key}>
                          <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                            <td colSpan={8} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-adlm-dark-dim"
                              style={{ borderLeft: `3px solid ${COLOR_MAP[key]}` }}>
                              {group[0].productLabel}
                            </td>
                          </tr>
                          {group.map((row) => {
                            const rowPct = safeNum(row.itemCount) ? (safeNum(row.markedCount) / safeNum(row.itemCount)) * 100 : 0;
                            const st = projectStatus(row);
                            return (
                              <tr key={row.id || row._id}
                                className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                onClick={() => navigate(`/projects/${key}?project=${encodeURIComponent(row.slug || row.id)}`)}>
                                <td className="px-4 py-3 font-medium text-slate-800 dark:text-adlm-dark-text max-w-[180px] truncate">{row.name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-adlm-dark-muted">{row.productLabel}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-slate-600 dark:text-adlm-dark-text">{safeNum(row.itemCount).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-slate-600 dark:text-adlm-dark-text">₦{money(row.totalCost)}</td>
                                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">₦{money(row.valuedAmount)}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 justify-end">
                                    <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                      <div className="h-full rounded-full bg-adlm-blue-700" style={{ width: `${Math.min(100, rowPct)}%` }} />
                                    </div>
                                    <span className="text-xs text-slate-500 w-9 text-right">{rowPct.toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-400"><FaExternalLinkAlt className="text-[10px]" /></td>
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
          </>
        )}

        {/* ══ CHARTS ══ */}
        {tab === "charts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* BoQ vs Completed horizontal bars */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text mb-1">BoQ Total vs Completed — by Product</div>
              <div className="text-xs text-slate-400 mb-4">Solid = completed · Faint = BoQ total · Thin below = remaining</div>
              {loading
                ? <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
                : rows.length === 0
                  ? <p className="text-xs text-slate-400 py-8 text-center">No project data yet.</p>
                  : <ProductBarChart grouped={grouped} />
              }
              <div className="mt-4 flex flex-wrap gap-4">
                {PRODUCTS.filter((p) => (grouped[p.key] || []).length > 0).map((p) => (
                  <div key={p.key} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
                    <span className="text-xs text-slate-500 dark:text-adlm-dark-muted">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Project count bars */}
            <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text mb-1">Projects by Product</div>
              <div className="text-xs text-slate-400 mb-4">Count and total items per product</div>
              {loading
                ? <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
                : rows.length === 0
                  ? <p className="text-xs text-slate-400 py-8 text-center">No data.</p>
                  : <ProductCountChart grouped={grouped} />
              }
            </div>

            {/* Overall delivery ring */}
            <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-5 flex flex-col items-center justify-center gap-3">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text">Overall Delivery</div>
              <div className="relative">
                <ProgressRing pct={pct} size={160} stroke={14} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{pct.toFixed(1)}%</span>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wide">Complete</span>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted text-center">
                {totals.markedCount.toLocaleString()} of {totals.itemCount.toLocaleString()} items done
              </div>
            </div>

            {/* Per-product progress rings */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text mb-4">Progress by Product</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {PRODUCTS.map((p) => {
                  const g = grouped[p.key] || [];
                  if (!g.length) return null;
                  const agg = aggregateRows(g);
                  return (
                    <div key={p.key} className="flex flex-col items-center gap-2">
                      <div className="relative">
                        <svg width={72} height={72} className="-rotate-90">
                          <circle cx={36} cy={36} r={28} fill="none" stroke={p.color} strokeWidth={7} opacity={0.15} />
                          <circle cx={36} cy={36} r={28} fill="none" stroke={p.color} strokeWidth={7}
                            strokeDasharray={2 * Math.PI * 28}
                            strokeDashoffset={2 * Math.PI * 28 * (1 - agg.progressPercent / 100)}
                            strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[13px] font-bold" style={{ color: p.color }}>{agg.progressPercent.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-600 dark:text-adlm-dark-text">{p.label}</div>
                      <div className="text-[10px] text-slate-400">{g.length} project{g.length !== 1 ? "s" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ REPORT ══ */}
        {tab === "report" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-white">Portfolio Report</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Generated {dayjs().format("DD MMM YYYY, HH:mm")}</p>
                </div>
                <button type="button" onClick={() => !loading && exportExcel(rows, totals)}
                  disabled={loading || rows.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50">
                  <FaFileExcel className="text-xs" /> Download Excel
                </button>
              </div>

              {/* Executive summary */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Executive Summary</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-adlm-dark-border mb-6">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-adlm-dark-border">
                    {[
                      ["Total Projects",      loading ? "—" : totals.projectCount],
                      ["Total Work Items",    loading ? "—" : totals.itemCount.toLocaleString()],
                      ["Completed Items",     loading ? "—" : totals.markedCount.toLocaleString()],
                      ["Overall Progress",    loading ? "—" : `${pct.toFixed(1)}%`],
                      ["Combined BoQ Total",  loading ? "—" : `₦${money(totals.totalCost)}`],
                      ["Completed to Date",   loading ? "—" : `₦${money(totals.valuedAmount)}`],
                      ["Outstanding Balance", loading ? "—" : `₦${money(totals.remainingAmount)}`],
                    ].map(([label, value]) => (
                      <tr key={label} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2.5 text-slate-500 dark:text-adlm-dark-muted font-medium w-56">{label}</td>
                        <td className="px-4 py-2.5 text-slate-800 dark:text-white font-semibold">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* By product */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Breakdown by Product</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-adlm-dark-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-adlm-dark-border">
                      {["Product","Projects","Items","Progress","BoQ Total","Completed","Outstanding"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-adlm-dark-border">
                    {loading
                      ? <tr><td colSpan={7} className="px-4 py-4 text-center text-slate-400 text-xs animate-pulse">Loading…</td></tr>
                      : PRODUCTS.map(({ key, label, color }) => {
                          const g = grouped[key] || [];
                          if (!g.length) return null;
                          const agg = aggregateRows(g);
                          return (
                            <tr key={key} className="hover:bg-slate-50 dark:hover:bg-white/5">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                  <span className="font-semibold text-slate-700 dark:text-adlm-dark-text">{label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-adlm-dark-text">{agg.projectCount}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-adlm-dark-text">{agg.itemCount.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, agg.progressPercent)}%`, background: color }} />
                                  </div>
                                  <span className="text-xs text-slate-500">{agg.progressPercent.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-adlm-dark-text">₦{money(agg.totalCost)}</td>
                              <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">₦{money(agg.valuedAmount)}</td>
                              <td className="px-4 py-3 text-amber-600 dark:text-amber-400">₦{money(agg.remainingAmount)}</td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-adlm-dark-muted">
          <Link to="/portfolio"  className="hover:text-adlm-blue-700 transition">All Projects →</Link>
          <Link to="/pm-tracker" className="hover:text-adlm-blue-700 transition">PM Tracker →</Link>
          <Link to="/dashboard"  className="hover:text-adlm-blue-700 transition">Dashboard →</Link>
        </div>

      </div>
    </div>
  );
}
