// The project Dashboard tab, in his work-surface pieces.
//
// Every figure the old dashboard showed is still here, regrouped into what he
// already uses: two .dsh-stats rows of four tiles, a .wk-panel with his
// .dsh-meter for progress (he has no ring or donut anywhere, so the progress
// ring became his meter), and a .wk-panel around the planned-vs-actual chart.
//
//   row one   planned total · completed to date · outstanding · progress
//   row two   actual tracked · actual variance · actual coverage · latest update
//             (the qty / rate override counts ride in the coverage sub-line)
//
// Inputs and their meaning are unchanged; this file only lays them out.

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

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`dsh-stat${tone ? ` ${tone}` : ""}`}>
      <span className="k">{label}</span>
      <b>{value}</b>
      <span className="ds-sub">{sub}</span>
    </div>
  );
}

function CountRow({ label, sub, value }) {
  return (
    <div className="wk-useline">
      <span className="p">
        {label}
        <em>{sub}</em>
      </span>
      <span className="q" />
      <span className="v">{safeNum(value).toLocaleString()}</span>
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
  linkedSummaries = [],
}) {
  const linkedGrandTotal = React.useMemo(
    () =>
      (Array.isArray(linkedSummaries) ? linkedSummaries : []).reduce(
        (s, l) => s + (Number(l?.live?.total ?? l?.snapshot?.total) || 0),
        0,
      ),
    [linkedSummaries],
  );

  // Overrun reads orange, a saving reads in his light-blue palette.
  const varianceTone =
    actualCoverageCount === 0
      ? ""
      : actualVarianceAmount > 0
        ? "warn"
        : actualVarianceAmount < 0
          ? "pal-on"
          : "";

  const pct = Math.max(0, Math.min(100, safeNum(progressPercent)));
  const remainingCount = Math.max(0, safeNum(progressTotal) - safeNum(progressCount));
  const status = statusLabel.toLowerCase();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="dsh-stats" style={{ marginBottom: 0 }}>
        <Tile
          label="Planned total"
          value={money(grossAmount + linkedGrandTotal)}
          sub={
            linkedGrandTotal > 0
              ? `Own works + linked services (₦${grossAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} own + ₦${linkedGrandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} linked)`
              : "Full project value (measured + PC + prelim + variations)"
          }
        />
        <Tile
          label={statusPastLabel}
          value={money(valuedAmount)}
          sub={`${statusLabel} items + executed PC sums, prelims & variations`}
        />
        <Tile
          label="Outstanding balance"
          value={money(remainingAmount + linkedGrandTotal)}
          sub="Project value still to earn or claim"
        />
        <Tile
          label="Progress"
          value={`${pct.toFixed(1)}%`}
          sub={`${progressCount} of ${progressTotal} work items ${status}`}
        />
      </div>

      <section className="wk-panel">
        <div className="wk-ph">
          <h2>Progress overview</h2>
          <span className="wk-locnote">
            Delivery progress based on the items of work marked {status}.
          </span>
        </div>
        <div style={{ padding: "18px 20px 4px" }}>
          <div className="dsh-meter">
            <div className="row">
              <div className="lab">
                <span>
                  {statusLabel} · {progressCount} of {progressTotal} items of work
                </span>
                <b>{pct.toFixed(1)}%</b>
              </div>
              <div
                className="track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label={`${statusLabel} progress`}
              >
                <i className={pct >= 100 ? "full" : undefined} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="wk-use">
          <CountRow
            label={`${statusLabel} work items`}
            sub={`Items of work ${status} to date`}
            value={progressCount}
          />
          <CountRow
            label="Remaining work items"
            sub="Items of work outstanding"
            value={remainingCount}
          />
          <CountRow
            label="Total work items"
            sub="All items of work in the project"
            value={progressTotal}
          />
        </div>
      </section>

      <div className="dsh-stats" style={{ marginBottom: 0 }}>
        <Tile
          label="Actual tracked value"
          value={money(actualTrackedAmount)}
          sub={`${actualCoverageCount} work item${actualCoverageCount === 1 ? "" : "s"} with actual data`}
        />
        <Tile
          label="Actual variance"
          value={money(actualVarianceAmount)}
          tone={varianceTone}
          sub={
            actualCoverageCount
              ? `${actualVariancePercent.toFixed(1)}% against planned value for tracked work items`
              : "Add actual qty or rate to start comparing against plan"
          }
        />
        <Tile
          label="Actual coverage"
          value={`${actualCoverageCount} of ${progressTotal}`}
          sub={`${actualCoveragePercent.toFixed(1)}% of work items · ${actualQtyOverrideCount} qty and ${actualRateOverrideCount} rate override${actualRateOverrideCount === 1 ? "" : "s"}`}
        />
        <Tile
          label="Latest actual update"
          value={formatDateTime(actualLatestAt)}
          sub="The most recent actual quantity or rate saved"
        />
      </div>

      <section className="wk-panel">
        <div className="wk-ph">
          <h2>Actual vs planned performance</h2>
          <span className="wk-locnote">
            Compare entered actuals with the saved project plan.
          </span>
        </div>
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
      </section>
    </div>
  );
}
