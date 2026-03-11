import React from "react";

const CHART_MODES = [
  { id: "pie", label: "Pie" },
  { id: "ribbon", label: "Ribbon" },
  { id: "line", label: "Line" },
];

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

function pathFromSeries(series, key, width, height, padX, padY, maxValue) {
  if (!series.length || maxValue <= 0) return "";
  return series
    .map((point, index) => {
      const x =
        series.length === 1
          ? width / 2
          : padX + (index / (series.length - 1)) * (width - padX * 2);
      const y =
        height -
        padY -
        (safeNum(point?.[key]) / maxValue) * (height - padY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function RibbonBar({ color, label, value, maxValue }) {
  const width = maxValue > 0 ? Math.min(100, (safeNum(value) / maxValue) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{label}</span>
        <span className="font-medium text-slate-900">{money(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
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
  const padX = 36;
  const padY = 24;
  const plannedPath = pathFromSeries(lineSeries, "planned", viewWidth, viewHeight, padX, padY, lineMax);
  const actualPath = pathFromSeries(lineSeries, "actual", viewWidth, viewHeight, padX, padY, lineMax);
  const varianceTone =
    actualCoverageCount === 0
      ? "text-slate-600"
      : actualVarianceAmount > 0
        ? "text-amber-700"
        : actualVarianceAmount < 0
          ? "text-emerald-700"
          : "text-slate-900";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium text-slate-900">Chart view</div>
          <div className="mt-1 text-sm text-slate-600">
            Planned vs actual for tracked lines, plus current {statusLabel.toLowerCase()} progress.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHART_MODES.map((mode) => {
            const active = chartMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={[
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No actual data yet. Add an actual qty or actual rate in the Bill / Quantity tab, then save to compare the project against plan here.
        </div>
      ) : null}

      {chartMode === "pie" && actualCoverageCount > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-[240px]">
            <div className="relative mx-auto h-56 w-56 rounded-full bg-slate-200">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(#94a3b8 0 ${plannedPct}%, #e2e8f0 ${plannedPct}% 100%)`,
                }}
              />
              <div className="absolute inset-5 rounded-full bg-white" />
              <div
                className="absolute inset-9 rounded-full"
                style={{
                  background: `conic-gradient(#2563eb 0 ${actualPct}%, #dbeafe ${actualPct}% 100%)`,
                }}
              />
              <div className="absolute inset-16 flex flex-col items-center justify-center rounded-full bg-white px-3 text-center shadow-inner">
                <div className="text-xs uppercase tracking-wide text-slate-400">Variance</div>
                <div className={`mt-1 text-2xl font-semibold ${varianceTone}`}>
                  {money(actualVarianceAmount)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {actualCoveragePercent.toFixed(1)}% actual coverage
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-400" /> Planned tracked value
                </span>
                <span className="font-medium text-slate-900">{money(actualPlannedAmount)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-600" /> Actual tracked value
                </span>
                <span className="font-medium text-slate-900">{money(actualTrackedAmount)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Tracked scope</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{actualCoverageCount}</div>
              <div className="mt-1 text-sm text-slate-500">line(s) with actual values saved</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Progress</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{safeNum(progressPercent).toFixed(1)}%</div>
              <div className="mt-1 text-sm text-slate-500">{progressCount} of {progressTotal} lines marked {statusLabel.toLowerCase()}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Reading the chart</div>
              <div className="mt-2 text-sm text-slate-600">
                The outer ring shows the planned value for lines where actuals exist. The inner ring shows the actual captured value for the same lines so you can see overrun or savings at a glance.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {chartMode === "ribbon" && actualCoverageCount > 0 ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <RibbonBar
            color="#94a3b8"
            label="Planned value for tracked lines"
            value={actualPlannedAmount}
            maxValue={scaleMax}
          />
          <RibbonBar
            color="#2563eb"
            label="Actual tracked value"
            value={actualTrackedAmount}
            maxValue={scaleMax}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Variance</div>
              <div className={`mt-1 text-xl font-semibold ${varianceTone}`}>{money(actualVarianceAmount)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Actual coverage</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{actualCoveragePercent.toFixed(1)}%</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Progress</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{safeNum(progressPercent).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      ) : null}

      {chartMode === "line" && actualCoverageCount > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {lineSeries.length ? (
            <div className="space-y-4">
              <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-[260px] w-full overflow-visible">
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                  const y = viewHeight - padY - tick * (viewHeight - padY * 2);
                  return (
                    <g key={tick}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={viewWidth - padX}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                      <text x="6" y={y + 4} fontSize="11" fill="#64748b">
                        {money(lineMax * tick)}
                      </text>
                    </g>
                  );
                })}

                <path d={plannedPath} fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
                <path d={actualPath} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />

                {lineSeries.map((point, index) => {
                  const x =
                    lineSeries.length === 1
                      ? viewWidth / 2
                      : padX + (index / (lineSeries.length - 1)) * (viewWidth - padX * 2);
                  const plannedY = viewHeight - padY - (safeNum(point.planned) / lineMax) * (viewHeight - padY * 2);
                  const actualY = viewHeight - padY - (safeNum(point.actual) / lineMax) * (viewHeight - padY * 2);
                  return (
                    <g key={point.label}>
                      <circle cx={x} cy={plannedY} r="4" fill="#94a3b8" />
                      <circle cx={x} cy={actualY} r="4" fill="#2563eb" />
                      <text x={x} y={viewHeight - 6} textAnchor="middle" fontSize="11" fill="#64748b">
                        {point.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-400" /> Planned cumulative value
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-600" /> Actual cumulative value
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Save actual entries on at least one line to draw the comparison trend.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}