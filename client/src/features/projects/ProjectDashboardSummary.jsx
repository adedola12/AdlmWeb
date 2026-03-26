import React from "react";
import ProjectDashboardChart from "./ProjectDashboardChart.jsx";

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return safeNum(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "No actual updates yet";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function MetricCard({ label, value, helper, format = "money", tone = "default" }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : format === "text"
        ? String(value || "-")
        : money(value);

  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-rose-700"
          : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>
        {displayValue}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function ProgressOverviewCard({
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  statusLabel = "Completed",
}) {
  const normalizedProgress = Math.max(0, Math.min(100, safeNum(progressPercent)));
  const remainingCount = Math.max(0, safeNum(progressTotal) - safeNum(progressCount));
  const chartStyle = {
    background:
      normalizedProgress > 0
        ? `conic-gradient(#005be3 0 ${normalizedProgress}%, #cbd5e1 ${normalizedProgress}% 100%)`
        : "conic-gradient(#e2e8f0 0 100%)",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="font-medium text-slate-900">Progress overview</div>
          <div className="mt-1 text-sm text-slate-600">
            Quick view of project delivery progress based on the lines marked {statusLabel.toLowerCase()}.
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-[220px]">
            <div className="relative mx-auto h-48 w-48 rounded-full" style={chartStyle}>
              <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white px-4 text-center shadow-inner">
                <div className="text-xs uppercase tracking-wide text-slate-400">Progress</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">
                  {normalizedProgress.toFixed(1)}%
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {progressCount} of {progressTotal} lines marked
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-adlm-blue-700" />
                {statusLabel}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-slate-300" />
                Remaining
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Marked lines</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{progressCount}</div>
              <div className="mt-1 text-xs text-slate-500">
                Items already marked {statusLabel.toLowerCase()}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Remaining lines</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{remainingCount}</div>
              <div className="mt-1 text-xs text-slate-500">Items still left to mark</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Total lines</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{progressTotal}</div>
              <div className="mt-1 text-xs text-slate-500">Full project line count</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDashboardSummary({
  actualCoverageCount = 0,
  actualCoveragePercent = 0,
  actualLatestAt = null,
  actualPlannedAmount = 0,
  actualQtyOverrideCount = 0,
  actualRateOverrideCount = 0,
  actualTrackedAmount = 0,
  actualVarianceAmount = 0,
  actualVariancePercent = 0,
  chartMode = "pie",
  comparisonRows = [],
  grossAmount = 0,
  onChartModeChange,
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  remainingAmount = 0,
  statusLabel = "Completed",
  statusPastLabel = "Completed to date",
  valuedAmount = 0,
}) {
  const varianceTone =
    actualCoverageCount === 0
      ? "default"
      : actualVarianceAmount > 0
        ? "warning"
        : actualVarianceAmount < 0
          ? "positive"
          : "default";

  return (
    <div className="space-y-4">
      <ProgressOverviewCard
        progressCount={progressCount}
        progressPercent={progressPercent}
        progressTotal={progressTotal}
        statusLabel={statusLabel}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Planned total"
          value={grossAmount}
          helper="Saved project value"
        />
        <MetricCard
          label={statusPastLabel}
          value={valuedAmount}
          helper={`${statusLabel} items already deducted`}
        />
        <MetricCard
          label="Outstanding balance"
          value={remainingAmount}
          helper="Current project amount remaining"
        />
        <MetricCard
          label="Actual tracked value"
          value={actualTrackedAmount}
          helper={`${actualCoverageCount} line${actualCoverageCount === 1 ? "" : "s"} with actual data`}
        />
        <MetricCard
          label="Actual variance"
          value={actualVarianceAmount}
          helper={
            actualCoverageCount
              ? `${actualVariancePercent.toFixed(1)}% against planned value for tracked lines`
              : "Add actual qty or rate to start comparing against plan"
          }
          tone={varianceTone}
        />
        <MetricCard
          label="Progress"
          value={progressPercent}
          format="percent"
          helper={`${progressCount} of ${progressTotal} lines marked ${statusLabel.toLowerCase()}`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-medium text-slate-900">Actual vs planned dashboard</div>
            <div className="mt-1 text-sm text-slate-600">
              Compare entered actuals with the saved project plan and switch between chart styles.
            </div>
          </div>

          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Actual coverage</div>
              <div className="mt-1 font-medium text-slate-900">
                {actualCoverageCount} of {progressTotal} lines ({actualCoveragePercent.toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Latest actual update</div>
              <div className="mt-1 font-medium text-slate-900">
                {formatDateTime(actualLatestAt)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Qty overrides</div>
              <div className="mt-1 font-medium text-slate-900">{actualQtyOverrideCount}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Rate overrides</div>
              <div className="mt-1 font-medium text-slate-900">{actualRateOverrideCount}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ProjectDashboardChart
            actualCoverageCount={actualCoverageCount}
            actualCoveragePercent={actualCoveragePercent}
            actualPlannedAmount={actualPlannedAmount}
            actualTrackedAmount={actualTrackedAmount}
            actualVarianceAmount={actualVarianceAmount}
            chartMode={chartMode}
            comparisonRows={comparisonRows}
            onChartModeChange={onChartModeChange}
            progressPercent={progressPercent}
            progressCount={progressCount}
            progressTotal={progressTotal}
            statusLabel={statusLabel}
          />
        </div>
      </div>
    </div>
  );
}
