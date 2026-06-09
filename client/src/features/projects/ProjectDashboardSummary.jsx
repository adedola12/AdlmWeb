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
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-400"
          : "text-slate-900 dark:text-white";

  return (
    <div className="group relative spotlight rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-4 transition-shadow hover:shadow-depth-lg">
      <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClass}`}>
        {displayValue}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-dim">{helper}</div>
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
        ? `conic-gradient(#005be3 0 ${normalizedProgress}%, rgba(148,163,184,0.35) ${normalizedProgress}% 100%)`
        : "conic-gradient(rgba(148,163,184,0.28) 0 100%)",
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
      {/* Header description sits above the chart at all widths now —
          previously it was inline at lg+ which ate horizontal space and
          made the 3 stat cards crammed under the donut. */}
      <div className="mb-4">
        <div className="font-semibold text-slate-900 dark:text-white">Progress overview</div>
        <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
          Delivery progress based on the items of work marked {statusLabel.toLowerCase()}.
        </div>
      </div>

      {/* Side-by-side donut + cards only at xl+ (≥1280px). Below that the
          donut sits above the stat cards so each card has the full width
          to render its label and helper without crushing the text. */}
      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
        <div className="mx-auto w-full max-w-[220px]">
          <div className="relative mx-auto h-48 w-48 rounded-full" style={chartStyle}>
            <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white dark:bg-adlm-dark-panel px-4 text-center shadow-inner">
              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">Progress</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
                {normalizedProgress.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                {progressCount} of {progressTotal} items of work
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

        {/* Stat-card grid:
             • mobile  → 1 column (stacked)
             • sm-lg   → 3 columns (plenty of width)
             • xl+     → 3 columns next to donut */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-3 min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">{statusLabel} work items</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{progressCount}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">
              Items of work {statusLabel.toLowerCase()} to date
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-3 min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">Remaining work items</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{remainingCount}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">Items of work outstanding</div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-3 min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">Total work items</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{progressTotal}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted">All items of work in the project</div>
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
          helper="Full project value (measured + PC + prelim + variations)"
        />
        <MetricCard
          label={statusPastLabel}
          value={valuedAmount}
          helper={`${statusLabel} items + executed PC sums, prelims & variations`}
        />
        <MetricCard
          label="Outstanding balance"
          value={remainingAmount}
          helper="Project value still to earn or claim"
        />
        <MetricCard
          label="Actual tracked value"
          value={actualTrackedAmount}
          helper={`${actualCoverageCount} work item${actualCoverageCount === 1 ? "" : "s"} with actual data`}
        />
        <MetricCard
          label="Actual variance"
          value={actualVarianceAmount}
          helper={
            actualCoverageCount
              ? `${actualVariancePercent.toFixed(1)}% against planned value for tracked work items`
              : "Add actual qty or rate to start comparing against plan"
          }
          tone={varianceTone}
        />
        <MetricCard
          label="Progress"
          value={progressPercent}
          format="percent"
          helper={`${progressCount} of ${progressTotal} work items ${statusLabel.toLowerCase()}`}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">Actual vs planned performance</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
              Compare entered actuals with the saved project plan and switch between chart styles.
            </div>
          </div>

          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Actual coverage</div>
              <div className="mt-1 font-medium text-slate-900 dark:text-white">
                {actualCoverageCount} of {progressTotal} work items ({actualCoveragePercent.toFixed(1)}%)
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

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-4">
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
