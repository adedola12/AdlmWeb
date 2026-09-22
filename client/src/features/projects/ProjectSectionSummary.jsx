// The figures above the project grid, in his .dsh-stats tiles.
//
// His row holds four. This section used to show five cards; "overall
// progress" now rides in the "completed to date" tile as its sub-line, so
// every figure is still on screen without leaving a fifth tile alone on a
// second row. Behaviour and inputs are unchanged.

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

export default function ProjectSectionSummary({
  statusPastLabel = "Completed to date",
  summary,
}) {
  if (!summary) return null;

  const pct = safeNum(summary.progressPercent);
  const marked = safeNum(summary.markedCount).toLocaleString();
  const items = safeNum(summary.itemCount).toLocaleString();

  return (
    <div className="dsh-stats">
      <div className="dsh-stat">
        <span className="k">Projects in section</span>
        <b>{safeNum(summary.projectCount).toLocaleString()}</b>
        <span className="ds-sub">Visible in the current view</span>
      </div>
      <div className="dsh-stat">
        <span className="k">Total section cost</span>
        <b>{money(summary.totalCost)}</b>
        <span className="ds-sub">Combined value of all visible projects</span>
      </div>
      <div className="dsh-stat pal-on">
        <span className="k">{statusPastLabel}</span>
        <b>{money(summary.valuedAmount)}</b>
        <span className="ds-sub">
          {pct.toFixed(1)}% · {marked} of {items} lines marked
        </span>
      </div>
      <div className={`dsh-stat${safeNum(summary.remainingAmount) > 0 ? " warn" : ""}`}>
        <span className="k">Outstanding balance</span>
        <b>{money(summary.remainingAmount)}</b>
        <span className="ds-sub">Still remaining across visible projects</span>
      </div>
    </div>
  );
}
