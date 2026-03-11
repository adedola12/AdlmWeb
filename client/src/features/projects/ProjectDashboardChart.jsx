import React from "react";

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return safeNum(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function MetricCard({ label, value, helper, format = "money" }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : money(value);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{displayValue}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function ProjectDashboardChart({
  grossAmount = 0,
  valuedAmount = 0,
  remainingAmount = 0,
  progressPercent = 0,
  progressCount = 0,
  progressTotal = 0,
  statusLabel = "Completed",
}) {
  const total = Math.max(
    safeNum(grossAmount),
    safeNum(valuedAmount) + safeNum(remainingAmount),
    0,
  );
  const valuedPct = total > 0 ? (safeNum(valuedAmount) / total) * 100 : 0;
  const chartStyle = {
    background:
      total > 0
        ? `conic-gradient(#2563eb 0 ${valuedPct}%, #cbd5e1 ${valuedPct}% 100%)`
        : "conic-gradient(#e2e8f0 0 100%)",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <div className="font-medium text-slate-900">Project dashboard</div>
        <div className="mt-1 text-sm text-slate-600">
          Quick view of project value, progress, and remaining balance.
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-center">
        <div className="mx-auto w-full max-w-[240px]">
          <div className="relative mx-auto h-48 w-48 rounded-full" style={chartStyle}>
            <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
              <div className="text-xs text-slate-500">Progress</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">
                {safeNum(progressPercent).toFixed(1)}%
              </div>
              <div className="mt-1 px-3 text-[11px] text-slate-500">
                {progressCount} of {progressTotal} lines marked
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-600" />
              {statusLabel}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-300" />
              Remaining
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Total project cost"
            value={grossAmount}
            helper="All saved line items"
          />
          <MetricCard
            label={`${statusLabel} value`}
            value={valuedAmount}
            helper={`Value already marked ${String(statusLabel).toLowerCase()}`}
          />
          <MetricCard
            label="Amount left"
            value={remainingAmount}
            helper="Outstanding balance still on the project"
          />
          <MetricCard
            label="Work progress"
            value={progressPercent}
            helper={`${progressCount} of ${progressTotal} total lines marked`}
            format="percent"
          />
        </div>
      </div>
    </div>
  );
}
