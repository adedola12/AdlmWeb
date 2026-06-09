import React from "react";

// Mode ids are persisted in project settings — keep them stable. Only the
// labels are dressed up to read professionally.
const CHART_MODES = [
  { id: "pie", label: "Donut" },
  { id: "ribbon", label: "Bars" },
  { id: "line", label: "Trend" },
];

// Shared palette — a bright brand blue that stays legible on both the
// light card and the dark panel, and a neutral slate for the plan.
const ACTUAL_COLOR = "#2b86ff";
const PLANNED_COLOR = "#94a3b8";

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return safeNum(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function buildLineSeries(rows) {
  const tracked = (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.actualHasData,
  );

  let plannedRunning = 0;
  let actualRunning = 0;

  return tracked.map((row, index) => {
    plannedRunning += safeNum(row?.fullAmount);
    actualRunning += safeNum(row?.actualAmount);
    return {
      index,
      label: String(row?.sn ?? index + 1),
      planned: plannedRunning,
      actual: actualRunning,
    };
  });
}

function computePoints(series, key, width, height, padX, padY, maxValue) {
  if (!series.length || maxValue <= 0) return [];
  return series.map((point, index) => {
    const x =
      series.length === 1
        ? width / 2
        : padX + (index / (series.length - 1)) * (width - padX * 2);
    const y =
      height - padY - (safeNum(point?.[key]) / maxValue) * (height - padY * 2);
    return { x, y };
  });
}

// Catmull-Rom → cubic bezier, for a smooth (not jagged) trend line.
function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function RibbonBar({ color, label, value, maxValue }) {
  const width = maxValue > 0 ? Math.min(100, (safeNum(value) / maxValue) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-adlm-dark-muted">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          &#8358;{money(value)}
        </span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${width}%`,
            backgroundImage: `linear-gradient(90deg, ${color}cc, ${color})`,
          }}
        />
      </div>
    </div>
  );
}

export default function ProjectDashboardChart({
  actualCoverageCount = 0,
  actualCoveragePercent = 0,
  actualPlannedAmount = 0,
  actualTrackedAmount = 0,
  actualVarianceAmount = 0,
  chartMode = "pie",
  comparisonRows = [],
  onChartModeChange,
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  statusLabel = "Completed",
}) {
  const scaleMax = Math.max(
    safeNum(actualPlannedAmount),
    safeNum(actualTrackedAmount),
    1,
  );
  const plannedPct = Math.min(100, (safeNum(actualPlannedAmount) / scaleMax) * 100);
  const actualPct = Math.min(100, (safeNum(actualTrackedAmount) / scaleMax) * 100);
  const lineSeries = React.useMemo(
    () => buildLineSeries(comparisonRows),
    [comparisonRows],
  );
  const lineMax = Math.max(
    ...lineSeries.map((point) => Math.max(safeNum(point.actual), safeNum(point.planned))),
    1,
  );
  const viewWidth = 520;
  const viewHeight = 240;
  const padX = 40;
  const padY = 24;
  const baseline = viewHeight - padY;
  const plannedPts = computePoints(lineSeries, "planned", viewWidth, viewHeight, padX, padY, lineMax);
  const actualPts = computePoints(lineSeries, "actual", viewWidth, viewHeight, padX, padY, lineMax);
  const plannedPath = smoothPath(plannedPts);
  const actualPath = smoothPath(actualPts);
  const actualArea =
    actualPts.length > 1
      ? `${actualPath} L ${actualPts[actualPts.length - 1].x.toFixed(2)} ${baseline} L ${actualPts[0].x.toFixed(2)} ${baseline} Z`
      : "";
  const varianceTone =
    actualCoverageCount === 0
      ? "text-slate-600 dark:text-adlm-dark-muted"
      : actualVarianceAmount > 0
        ? "text-amber-700 dark:text-amber-400"
        : actualVarianceAmount < 0
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-slate-900 dark:text-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">Chart view</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
            Planned vs actual for tracked work items, plus current{" "}
            {statusLabel.toLowerCase()} progress.
          </div>
        </div>

        {/* Segmented control — reads as one clean control, not loose pills. */}
        <div className="inline-flex shrink-0 rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-slate-100 dark:bg-white/5 p-1">
          {CHART_MODES.map((mode) => {
            const active = chartMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                className={[
                  "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-white dark:bg-adlm-dark-panel text-adlm-blue-700 dark:text-adlm-blue-300 shadow-sm"
                    : "text-slate-600 dark:text-adlm-dark-muted hover:text-slate-900 dark:hover:text-white",
                ].join(" ")}
                onClick={() => onChartModeChange?.(mode.id)}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      {actualCoverageCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-adlm-dark-border bg-white dark:bg-white/5 p-6 text-sm text-slate-600 dark:text-adlm-dark-muted">
          No actual data yet. Add an actual quantity or rate against an item of
          work in the Bill of Quantity tab, then save to compare the project
          against plan here.
        </div>
      ) : null}

      {chartMode === "pie" && actualCoverageCount > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-[240px]">
            <div className="relative mx-auto h-56 w-56 rounded-full">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${PLANNED_COLOR} 0 ${plannedPct}%, rgba(148,163,184,0.22) ${plannedPct}% 100%)`,
                }}
              />
              <div className="absolute inset-5 rounded-full bg-white dark:bg-adlm-dark-panel" />
              <div
                className="absolute inset-9 rounded-full"
                style={{
                  background: `conic-gradient(${ACTUAL_COLOR} 0 ${actualPct}%, rgba(43,134,255,0.16) ${actualPct}% 100%)`,
                }}
              />
              <div className="absolute inset-16 flex flex-col items-center justify-center rounded-full bg-white dark:bg-adlm-dark-panel px-3 text-center shadow-inner">
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">
                  Variance
                </div>
                <div className={`mt-1 text-2xl font-semibold ${varianceTone}`}>
                  {money(actualVarianceAmount)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                  {actualCoveragePercent.toFixed(1)}% actual coverage
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-white dark:bg-white/5 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-slate-600 dark:text-adlm-dark-muted">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PLANNED_COLOR }} />{" "}
                  Planned tracked value
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  &#8358;{money(actualPlannedAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white dark:bg-white/5 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-slate-600 dark:text-adlm-dark-muted">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ACTUAL_COLOR }} />{" "}
                  Actual tracked value
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  &#8358;{money(actualTrackedAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">
                Tracked scope
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
                {actualCoverageCount}
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-adlm-dark-muted">
                work item(s) with actual values saved
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">
                Progress
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
                {safeNum(progressPercent).toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-adlm-dark-muted">
                {progressCount} of {progressTotal} work items{" "}
                {statusLabel.toLowerCase()}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-adlm-dark-dim">
                Reading the chart
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-adlm-dark-muted">
                The outer ring shows the planned value for work items where
                actuals exist. The inner ring shows the actual captured value
                for the same items, so overrun or savings reads at a glance.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {chartMode === "ribbon" && actualCoverageCount > 0 ? (
        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4">
          <RibbonBar
            color={PLANNED_COLOR}
            label="Planned value for tracked work items"
            value={actualPlannedAmount}
            maxValue={scaleMax}
          />
          <RibbonBar
            color={ACTUAL_COLOR}
            label="Actual tracked value"
            value={actualTrackedAmount}
            maxValue={scaleMax}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-3">
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">Variance</div>
              <div className={`mt-1 text-xl font-semibold ${varianceTone}`}>
                {money(actualVarianceAmount)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-3">
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">Actual coverage</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                {actualCoveragePercent.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-3">
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">Progress</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                {safeNum(progressPercent).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {chartMode === "line" && actualCoverageCount > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4">
          {lineSeries.length ? (
            <div className="space-y-4">
              <svg
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                className="h-[260px] w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="adlmActualArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACTUAL_COLOR} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={ACTUAL_COLOR} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                  const y = viewHeight - padY - tick * (viewHeight - padY * 2);
                  return (
                    <g key={tick}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={viewWidth - padX}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-white/10"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="6"
                        y={y + 4}
                        fontSize="11"
                        className="fill-slate-500 dark:fill-adlm-dark-muted"
                      >
                        {money(lineMax * tick)}
                      </text>
                    </g>
                  );
                })}

                {actualArea ? <path d={actualArea} fill="url(#adlmActualArea)" /> : null}

                <path
                  d={plannedPath}
                  fill="none"
                  stroke={PLANNED_COLOR}
                  strokeWidth="3"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
                <path
                  d={actualPath}
                  fill="none"
                  stroke={ACTUAL_COLOR}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {lineSeries.map((point, index) => {
                  const x =
                    lineSeries.length === 1
                      ? viewWidth / 2
                      : padX + (index / (lineSeries.length - 1)) * (viewWidth - padX * 2);
                  const plannedY =
                    viewHeight - padY - (safeNum(point.planned) / lineMax) * (viewHeight - padY * 2);
                  const actualY =
                    viewHeight - padY - (safeNum(point.actual) / lineMax) * (viewHeight - padY * 2);
                  return (
                    <g key={point.label}>
                      <circle cx={x} cy={plannedY} r="3.5" fill={PLANNED_COLOR} />
                      <circle
                        cx={x}
                        cy={actualY}
                        r="4.5"
                        fill="#fff"
                        stroke={ACTUAL_COLOR}
                        strokeWidth="2.5"
                      />
                      <text
                        x={x}
                        y={viewHeight - 6}
                        textAnchor="middle"
                        fontSize="11"
                        className="fill-slate-500 dark:fill-adlm-dark-muted"
                      >
                        {point.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-adlm-dark-muted">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PLANNED_COLOR }} />{" "}
                  Planned cumulative value
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ACTUAL_COLOR }} />{" "}
                  Actual cumulative value
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">
              Save actual entries against at least one item of work to draw the
              comparison trend.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
