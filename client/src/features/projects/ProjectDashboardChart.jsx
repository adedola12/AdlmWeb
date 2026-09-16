// Planned vs actual, inside the dashboard's .wk-panel.
//
// The three modes are a saved per-project setting (valuationSettings
// .dashboardChartMode), so all three stay. How each is drawn:
//
//   Bars   his .dsh-meter rows — the one chart-like piece he has.
//   Donut  he has no ring anywhere; it stays a ring, drawn only in his tokens
//   Trend  he has no line chart; it stays an SVG, drawn only in his tokens
//
// "His tokens" means planned is var(--ink-3), actual is var(--action), grid
// lines are var(--line) and holes are var(--bg), so the charts follow the
// theme instead of carrying their own hex colours. The switch between modes is
// his .wk-loc-sw; the empty state is his .wk-empty; readings are his
// .wk-useline rows.
//
// Mode ids are persisted — keep them stable. Only the labels may change.

import React from "react";

const CHART_MODES = [
  { id: "pie", label: "Donut" },
  { id: "ribbon", label: "Bars" },
  { id: "line", label: "Trend" },
];

const PLANNED = "var(--ink-3)";
const ACTUAL = "var(--action)";

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

const swatch = (color) => ({
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: color,
  marginRight: 8,
  verticalAlign: 0,
});

function Reading({ label, sub, value, color, valueColor }) {
  return (
    <div className="wk-useline">
      <span className="p">
        {color ? <span style={swatch(color)} aria-hidden="true" /> : null}
        {label}
        {sub ? <em>{sub}</em> : null}
      </span>
      <span className="q" />
      <span className="v" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
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

  // Overrun reads in his orange, a saving in his light-blue key.
  const varianceColor =
    actualCoverageCount === 0
      ? "var(--ink-3)"
      : actualVarianceAmount > 0
        ? "var(--pal-orange-key)"
        : actualVarianceAmount < 0
          ? "var(--pal-light-key)"
          : "var(--ink)";

  const status = statusLabel.toLowerCase();
  const progressText = `${safeNum(progressPercent).toFixed(1)}%`;
  const has = actualCoverageCount > 0;

  return (
    <div>
      <div className="wk-bar" style={{ padding: "16px 20px 0", marginBottom: 0 }}>
        <p className="wk-locnote" style={{ margin: 0, marginRight: "auto" }}>
          Planned vs actual for tracked work items, plus current {status} progress.
        </p>
        <div className="wk-loc-sw" role="group" aria-label="Chart view">
          {CHART_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={chartMode === mode.id}
              className={chartMode === mode.id ? "on" : ""}
              onClick={() => onChartModeChange?.(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {!has ? (
        <div style={{ padding: 20 }}>
          <div className="wk-empty">
            No actual data yet. Add an actual quantity or rate against an item of work
            in the Bill of Quantity tab, then save to compare the project against plan
            here.
          </div>
        </div>
      ) : null}

      {chartMode === "pie" && has ? (
        <>
          <div
            style={{
              padding: 20,
              display: "grid",
              gap: 24,
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              alignItems: "center",
            }}
          >
            <div
              style={{ position: "relative", width: 210, height: 210, margin: "0 auto" }}
              role="img"
              aria-label={`Planned ${money(actualPlannedAmount)}, actual ${money(actualTrackedAmount)}, variance ${money(actualVarianceAmount)}`}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: `conic-gradient(${PLANNED} 0 ${plannedPct}%, var(--line) ${plannedPct}% 100%)`,
                }}
              />
              <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "var(--bg)" }} />
              <div
                style={{
                  position: "absolute",
                  inset: 30,
                  borderRadius: "50%",
                  background: `conic-gradient(${ACTUAL} 0 ${actualPct}%, color-mix(in srgb, var(--action) 16%, transparent) ${actualPct}% 100%)`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 56,
                  borderRadius: "50%",
                  background: "var(--bg)",
                  display: "grid",
                  placeContent: "center",
                  textAlign: "center",
                  padding: "0 8px",
                }}
              >
                <span className="wk-grp" style={{ padding: 0 }}>
                  Variance
                </span>
                <b
                  style={{
                    fontSize: 20,
                    fontWeight: 500,
                    color: varianceColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {money(actualVarianceAmount)}
                </b>
                <span className="wk-fx">{actualCoveragePercent.toFixed(1)}% coverage</span>
              </div>
            </div>

            <div className="wk-use" style={{ padding: 0 }}>
              <Reading
                label="Planned tracked value"
                value={`₦${money(actualPlannedAmount)}`}
                color={PLANNED}
              />
              <Reading
                label="Actual tracked value"
                value={`₦${money(actualTrackedAmount)}`}
                color={ACTUAL}
              />
              <Reading
                label="Tracked scope"
                sub="work item(s) with actual values saved"
                value={actualCoverageCount.toLocaleString()}
              />
              <Reading
                label="Progress"
                sub={`${progressCount} of ${progressTotal} work items ${status}`}
                value={progressText}
              />
            </div>
          </div>
          <p className="wk-note">
            Reading the chart: the outer ring shows the planned value for work items
            where actuals exist. The inner ring shows the actual captured value for the
            same items, so overrun or savings reads at a glance.
          </p>
        </>
      ) : null}

      {chartMode === "ribbon" && has ? (
        <>
          <div style={{ padding: "18px 20px 6px" }}>
            <div className="dsh-meter">
              <div className="row">
                <div className="lab">
                  <span>Planned value for tracked work items</span>
                  <b>₦{money(actualPlannedAmount)}</b>
                </div>
                <div className="track">
                  <i style={{ width: `${plannedPct}%`, background: PLANNED }} />
                </div>
              </div>
              <div className="row">
                <div className="lab">
                  <span>Actual tracked value</span>
                  <b>₦{money(actualTrackedAmount)}</b>
                </div>
                <div className="track">
                  <i style={{ width: `${actualPct}%` }} />
                </div>
              </div>
            </div>
          </div>
          <div className="wk-use">
            <Reading label="Variance" value={money(actualVarianceAmount)} valueColor={varianceColor} />
            <Reading label="Actual coverage" value={`${actualCoveragePercent.toFixed(1)}%`} />
            <Reading label="Progress" value={progressText} />
          </div>
        </>
      ) : null}

      {chartMode === "line" && has ? (
        <div style={{ padding: 20 }}>
          {lineSeries.length ? (
            <>
              <svg
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                style={{ width: "100%", height: 260, overflow: "visible" }}
                role="img"
                aria-label="Planned and actual cumulative value by tracked work item"
              >
                <defs>
                  <linearGradient id="adlmActualArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: ACTUAL, stopOpacity: 0.28 }} />
                    <stop offset="100%" style={{ stopColor: ACTUAL, stopOpacity: 0 }} />
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
                        style={{ stroke: "var(--line)" }}
                        strokeDasharray="4 4"
                      />
                      <text x="6" y={y + 4} fontSize="11" style={{ fill: "var(--ink-3)" }}>
                        {money(lineMax * tick)}
                      </text>
                    </g>
                  );
                })}

                {actualArea ? <path d={actualArea} fill="url(#adlmActualArea)" /> : null}

                <path
                  d={plannedPath}
                  fill="none"
                  style={{ stroke: PLANNED }}
                  strokeWidth="3"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
                <path
                  d={actualPath}
                  fill="none"
                  style={{ stroke: ACTUAL }}
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
                      <circle cx={x} cy={plannedY} r="3.5" style={{ fill: PLANNED }} />
                      <circle
                        cx={x}
                        cy={actualY}
                        r="4.5"
                        strokeWidth="2.5"
                        style={{ fill: "var(--bg)", stroke: ACTUAL }}
                      />
                      <text
                        x={x}
                        y={viewHeight - 6}
                        textAnchor="middle"
                        fontSize="11"
                        style={{ fill: "var(--ink-3)" }}
                      >
                        {point.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <p className="wk-locnote" style={{ margin: "12px 0 0" }}>
                <span style={swatch(PLANNED)} aria-hidden="true" />
                Planned cumulative value
                <span style={{ ...swatch(ACTUAL), marginLeft: 18 }} aria-hidden="true" />
                Actual cumulative value
              </p>
            </>
          ) : (
            <div className="wk-empty">
              Save actual entries against at least one item of work to draw the
              comparison trend.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
