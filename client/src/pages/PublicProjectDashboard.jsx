import React from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../http.js";

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SummaryCard({ label, value, detail, color = "text-slate-900" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function ProgressRing({ percent = 0, count = 0, total = 0 }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="80" cy="80" r={r} fill="none"
          stroke="#3b82f6" strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
        />
        <text x="80" y="72" textAnchor="middle" className="text-2xl font-bold fill-slate-900">
          {percent.toFixed(1)}%
        </text>
        <text x="80" y="92" textAnchor="middle" className="text-xs fill-slate-500">
          {count} of {total} lines
        </text>
      </svg>
    </div>
  );
}

function ComparisonChart({ rows = [] }) {
  if (!rows.length) return null;
  const maxVal = Math.max(...rows.map((r) => Math.max(r.plannedAmount, r.actualAmount)), 1);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900">Planned vs Actual</div>
      <div className="space-y-1.5 max-h-64 overflow-auto">
        {rows.map((row, i) => (
          <div key={i} className="text-xs">
            <div className="truncate text-slate-700 mb-0.5">{row.description}</div>
            <div className="flex gap-1 items-center">
              <div className="w-12 text-right text-slate-500">Plan</div>
              <div className="flex-1 bg-slate-100 rounded h-3">
                <div
                  className="bg-blue-500 rounded h-3"
                  style={{ width: `${(row.plannedAmount / maxVal) * 100}%` }}
                />
              </div>
              <div className="w-20 text-right font-medium">{money(row.plannedAmount)}</div>
            </div>
            <div className="flex gap-1 items-center">
              <div className="w-12 text-right text-slate-500">Actual</div>
              <div className="flex-1 bg-slate-100 rounded h-3">
                <div
                  className={`rounded h-3 ${row.variance > 0 ? "bg-red-400" : "bg-emerald-400"}`}
                  style={{ width: `${(row.actualAmount / maxVal) * 100}%` }}
                />
              </div>
              <div className="w-20 text-right font-medium">{money(row.actualAmount)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublicProjectDashboard() {
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");

    api(`/api/projects/public/${token}`)
      .then((res) => {
        if (!res?.ok) throw new Error("Project not found");
        setData(res);
      })
      .catch((e) => setError(e?.message || "This shared link is no longer available."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Loading project dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-lg font-semibold text-slate-900">Project Not Found</div>
          <div className="text-sm text-slate-500">{error || "This shared link is no longer available."}</div>
          <Link to="/" className="inline-block text-sm text-blue-600 hover:underline">
            Go to ADLM Studio
          </Link>
        </div>
      </div>
    );
  }

  const varianceColor = data.actualVarianceAmount > 0 ? "text-red-600" : data.actualVarianceAmount < 0 ? "text-emerald-600" : "text-slate-900";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#1e293b] text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">Project Dashboard</div>
            <div className="text-lg font-semibold">{data.name}</div>
            {data.sharedBy ? (
              <div className="text-xs text-slate-400 mt-0.5">Shared by {data.sharedBy}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Powered by</div>
            <div className="text-sm font-medium text-white">ADLM Studio</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Progress Overview */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">Progress Overview</div>
              <div className="text-sm text-slate-500 mt-1">
                Project delivery progress based on items marked {data.statusLabel?.toLowerCase() || "completed"}.
              </div>
            </div>
            <ProgressRing
              percent={data.progressPercent}
              count={data.progressCount}
              total={data.progressTotal}
            />
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-slate-900">{data.progressCount}</div>
                <div className="text-xs text-slate-500">Marked</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{data.progressTotal - data.progressCount}</div>
                <div className="text-xs text-slate-500">Remaining</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{data.progressTotal}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Planned Total"
            value={money(data.grossAmount)}
            detail="Total project value"
          />
          <SummaryCard
            label={data.statusLabel + " to Date"}
            value={money(data.valuedAmount)}
            detail="Items already deducted"
            color="text-emerald-700"
          />
          <SummaryCard
            label="Outstanding Balance"
            value={money(data.remainingAmount)}
            detail="Remaining project amount"
            color="text-blue-700"
          />
        </div>

        {/* Actual Tracking Cards */}
        {data.actualTrackedCount > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="Actual Tracked Value"
              value={money(data.actualTrackedAmount)}
              detail={`${data.actualTrackedCount} items with actual data`}
            />
            <SummaryCard
              label="Actual Variance"
              value={money(data.actualVarianceAmount)}
              detail={`${data.actualVariancePercent}% against planned`}
              color={varianceColor}
            />
            <SummaryCard
              label="Progress"
              value={`${data.progressPercent}%`}
              detail={`${data.progressCount} of ${data.progressTotal} items`}
            />
          </div>
        ) : null}

        {/* Comparison Chart */}
        {data.comparisonRows?.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <ComparisonChart rows={data.comparisonRows} />
          </div>
        ) : null}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4">
          Last updated: {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}
          <span className="mx-2">·</span>
          <a href="https://www.adlmstudio.net" className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
            ADLM Studio
          </a>
        </div>
      </div>
    </div>
  );
}
