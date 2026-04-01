import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../http.js";

/* ─── Helpers ─── */
function fmt(date) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function ScoreRing({ score = 0, status }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = status === "Pass" ? "#16A34A" : status === "Warning" ? "#D97706" : "#DC2626";
  const label = status === "Pass" ? "Ready for Takeoff" : status === "Warning" ? "Conditionally Ready" : "Not Ready";

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="65" textAnchor="middle" className="text-2xl font-bold" fill="#0f172a">
          {score.toFixed(0)}%
        </text>
        <text x="70" y="82" textAnchor="middle" className="text-[10px]" fill="#64748b">
          Readiness
        </text>
      </svg>
      <span className="mt-1 text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function StatCard({ label, value, color = "text-slate-900" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = status === "Pass" ? "bg-green-100 text-green-700"
    : status === "Fail" ? "bg-red-100 text-red-700"
    : status === "Warning" ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

/* ─── Main Page ─── */
export default function ModelCheckReport() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api(`/api/model-checks/public/${id}`);
        setData(res);
      } catch (err) {
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-slate-500">Loading model check report...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Report Not Found</h2>
          <p className="text-slate-500 mb-6">{error || "This model check report could not be found or may have been deleted."}</p>
          <Link to="/" className="inline-block rounded-lg bg-[#091E39] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0F2D52]">
            Go to ADLM Studio
          </Link>
        </div>
      </div>
    );
  }

  const d = data;
  const issueCount = (d.missingCategories || 0) + (d.overlapCount || 0);
  const cats = d.categories || [];
  const rebar = d.rebarAnalysis || [];
  const hasRebar = rebar.length > 0 && rebar.some(r => r.total > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#091E39] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold">A</div>
            <h1 className="text-lg font-semibold">ADLM Model Checker Report</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            {d.projectName || "N/A"} &bull; {d.modelType} Model &bull; {fmt(d.checkedAt)}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Score + Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-1 flex justify-center">
            <ScoreRing score={d.readinessScore || 0} status={d.overallStatus} />
          </div>
          <div className="md:col-span-3 grid grid-cols-3 gap-3">
            <StatCard label="Total Elements" value={(d.totalElements || 0).toLocaleString()} />
            <StatCard
              label="Missing Categories"
              value={d.missingCategories || 0}
              color={d.missingCategories > 0 ? "text-red-600" : "text-green-600"}
            />
            <StatCard
              label="Overlaps"
              value={d.overlapCount || 0}
              color={d.overlapCount > 0 ? "text-amber-600" : "text-green-600"}
            />
          </div>
        </div>

        {/* Project Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wide">Project Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
            <div><span className="text-slate-500">Project:</span> <span className="font-medium">{d.projectName || "N/A"}</span></div>
            <div><span className="text-slate-500">Project No:</span> <span className="font-medium">{d.projectNumber || "N/A"}</span></div>
            <div><span className="text-slate-500">Model Type:</span> <span className="font-medium">{d.modelType}</span></div>
            <div><span className="text-slate-500">Checked By:</span> <span className="font-medium">{d.checkedByUser || "N/A"}</span></div>
            <div><span className="text-slate-500">Date:</span> <span className="font-medium">{fmt(d.checkedAt)}</span></div>
            <div><span className="text-slate-500">Status:</span> <StatusBadge status={d.overallStatus} /></div>
          </div>
        </div>

        {/* Category Results */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Category Results</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#091E39] text-white text-xs uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Count</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
                {cats.length === 0 && (
                  <tr><td colSpan="3" className="px-4 py-6 text-center text-slate-400">No categories recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rebar Analysis */}
        {hasRebar && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Reinforcement Analysis</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#091E39] text-white text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium">Host Category</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5 text-right font-medium">With Rebar</th>
                    <th className="px-4 py-2.5 text-right font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {rebar.filter(r => r.total > 0).map((r, i) => {
                    const pct = r.coveragePercent || 0;
                    const cls = pct >= 90 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{r.hostCategory}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.withRebar}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${cls}`}>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QS Query Text */}
        {d.qsQueryText && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">QS Query Report</h2>
              <button
                onClick={() => { navigator.clipboard.writeText(d.qsQueryText); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Copy to Clipboard
              </button>
            </div>
            <pre className="p-5 text-[11px] leading-relaxed text-slate-700 font-mono whitespace-pre-wrap overflow-x-auto max-h-[600px] overflow-y-auto">
              {d.qsQueryText}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-xs text-slate-400">
          <p>Generated by <strong>ADLM Model Checker</strong> &bull; {fmt(d.checkedAt)}</p>
          <p className="mt-1">
            <Link to="/" className="text-blue-500 hover:underline">www.adlmstudio.net</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
