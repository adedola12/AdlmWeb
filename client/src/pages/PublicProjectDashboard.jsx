import React from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../http.js";

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value) {
  const n = Number(value || 0);
  return `${n.toFixed(1)}%`;
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
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const offset = c - (p / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="80" cy="80" r={r} fill="none"
          stroke="#005be3" strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
        />
        <text x="80" y="72" textAnchor="middle" className="text-2xl font-bold fill-slate-900">
          {p.toFixed(1)}%
        </text>
        <text x="80" y="92" textAnchor="middle" className="text-xs fill-slate-500">
          {count} of {total} lines
        </text>
      </svg>
    </div>
  );
}

// Side-by-side progress bars — physical (lines completed) vs cost (committed spend).
// A dashed red line on each bar marks where the counterpart sits, so divergence is obvious.
function DualProgressBars({ progressPercent = 0, costPercent = 0 }) {
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  const phys = clamp(progressPercent);
  const cost = clamp(costPercent);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium text-slate-700">Physical progress</span>
          <span className="text-slate-500">{phys.toFixed(1)}% of lines complete</span>
        </div>
        <div className="relative h-3 rounded bg-slate-100 overflow-hidden">
          <div
            className="h-3 rounded bg-adlm-blue-700 transition-all duration-500"
            style={{ width: `${phys}%` }}
          />
          {cost > 0 && Math.abs(cost - phys) > 1 ? (
            <div
              className="absolute top-0 h-3 w-0.5 bg-red-500"
              style={{ left: `${cost}%` }}
              title={`Cost position: ${cost.toFixed(1)}%`}
            />
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium text-slate-700">Cost progress</span>
          <span className="text-slate-500">{cost.toFixed(1)}% of contract committed</span>
        </div>
        <div className="relative h-3 rounded bg-slate-100 overflow-hidden">
          <div
            className="h-3 rounded bg-emerald-500 transition-all duration-500"
            style={{ width: `${cost}%` }}
          />
          {phys > 0 && Math.abs(cost - phys) > 1 ? (
            <div
              className="absolute top-0 h-3 w-0.5 bg-red-500"
              style={{ left: `${phys}%` }}
              title={`Physical position: ${phys.toFixed(1)}%`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ status, delta = 0 }) {
  const map = {
    "starting": {
      bg: "bg-slate-50 border-slate-200",
      dot: "bg-slate-400",
      text: "text-slate-700",
      label: "Project just starting",
      detail: "Not enough progress yet to read the trend.",
    },
    "on-track": {
      bg: "bg-emerald-50 border-emerald-200",
      dot: "bg-emerald-500",
      text: "text-emerald-900",
      label: "On track",
      detail: "Cost progress is in line with physical progress.",
    },
    "watch": {
      bg: "bg-amber-50 border-amber-200",
      dot: "bg-amber-500",
      text: "text-amber-900",
      label: "Watch",
      detail: `Cost is ${delta > 0 ? "running ahead" : "behind"} physical progress by ${Math.abs(delta).toFixed(1)}%.`,
    },
    "over-budget": {
      bg: "bg-red-50 border-red-200",
      dot: "bg-red-500",
      text: "text-red-900",
      label: "Over budget",
      detail: `Spend is ${Math.abs(delta).toFixed(1)}% ahead of completed work. Review valuation.`,
    },
  };
  const c = map[status] || map["starting"];
  return (
    <div className={`rounded-xl border p-4 ${c.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} />
        <div className={`text-sm font-semibold ${c.text}`}>{c.label}</div>
      </div>
      <div className={`mt-1 text-xs ${c.text} opacity-80`}>{c.detail}</div>
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

function UpcomingSpend({ rows = [], total = 0 }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Planned next spend</div>
          <div className="text-xs text-slate-500">
            Highest-value items remaining — likely upcoming disbursements.
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Subtotal</div>
          <div className="text-base font-semibold text-adlm-blue-700">{money(total)}</div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-2 text-xs">
            <div className="min-w-0 pr-3">
              <div className="truncate font-medium text-slate-800">{r.description || "—"}</div>
              <div className="text-[10px] text-slate-500">
                {Number(r.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.unit} × {money(r.rate)}
              </div>
            </div>
            <div className="text-sm font-semibold text-slate-900">{money(r.amount)}</div>
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
          <Link to="/" className="inline-block text-sm text-adlm-blue-700 hover:underline">
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
      <div className="bg-adlm-navy-tertiary text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">Project Dashboard</div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">{data.name}</div>
              {data.contractLocked ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                  🔒 Contract locked
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  Draft
                </span>
              )}
            </div>
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
        {/* Status banner */}
        <StatusBanner status={data.status} delta={data.costVsProgressDelta} />

        {/* Progress Overview */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">Progress Overview</div>
              <div className="text-sm text-slate-500 mt-1">
                Physical delivery vs financial progress — see where cost is sitting relative to actual completion.
              </div>
            </div>
            <ProgressRing
              percent={data.progressPercent}
              count={data.progressCount}
              total={data.progressTotal}
            />
            <div className="flex-1">
              <DualProgressBars
                progressPercent={data.progressPercent}
                costPercent={data.costPercent}
              />
            </div>
          </div>
        </div>

        {/* Contract sum breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Contract sum</div>
              <div className="text-xs text-slate-500">
                {data.contractLocked
                  ? `Locked${data.contractLockedAt ? " on " + new Date(data.contractLockedAt).toLocaleDateString() : ""}`
                  : "Draft — contract not yet locked"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Planned contract sum</div>
              <div className="text-xl font-bold text-adlm-blue-700">{money(data.contractSum)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div>
              <div className="text-slate-500">Measured</div>
              <div className="font-semibold text-slate-900">{money(data.grossAmount)}</div>
            </div>
            <div>
              <div className="text-slate-500">Provisional</div>
              <div className="font-semibold text-slate-900">{money(data.provisionalTotal)}</div>
            </div>
            <div>
              <div className="text-slate-500">Preliminaries ({pct(data.preliminaryPercent)})</div>
              <div className="font-semibold text-slate-900">{money(data.preliminaryAmount)}</div>
            </div>
            <div>
              <div className="text-slate-500">Variations</div>
              <div
                className={`font-semibold ${
                  data.variationsTotal > 0
                    ? "text-amber-700"
                    : data.variationsTotal < 0
                    ? "text-red-700"
                    : "text-slate-900"
                }`}
              >
                {money(data.variationsTotal)}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label={data.statusLabel + " to date"}
            value={money(data.valuedAmount)}
            detail={`${data.progressCount} / ${data.progressTotal} items`}
            color="text-emerald-700"
          />
          <SummaryCard
            label="Outstanding balance"
            value={money(data.remainingAmount)}
            detail="Measured work remaining"
            color="text-adlm-blue-700"
          />
          <SummaryCard
            label="Actual project cost"
            value={money(data.actualProjectCost)}
            detail={
              data.contractLocked
                ? data.actualProjectCost > data.contractSum
                  ? `${money(data.actualProjectCost - data.contractSum)} over contract`
                  : `${money(data.contractSum - data.actualProjectCost)} under contract`
                : "Including variations + provisional"
            }
            color={
              data.contractLocked && data.actualProjectCost > data.contractSum
                ? "text-red-600"
                : "text-slate-900"
            }
          />
        </div>

        {/* Actual Tracking Cards */}
        {data.actualTrackedCount > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="Actual tracked value"
              value={money(data.actualTrackedAmount)}
              detail={`${data.actualTrackedCount} items with actual data`}
            />
            <SummaryCard
              label="Actual variance"
              value={money(data.actualVarianceAmount)}
              detail={`${data.actualVariancePercent}% against planned`}
              color={varianceColor}
            />
            <SummaryCard
              label="Progress"
              value={pct(data.progressPercent)}
              detail={`${data.progressCount} of ${data.progressTotal} items`}
            />
          </div>
        ) : null}

        {/* Upcoming spend forecast */}
        <UpcomingSpend rows={data.upcoming || []} total={data.upcomingTotal} />

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
