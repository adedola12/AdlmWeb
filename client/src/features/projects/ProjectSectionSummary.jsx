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

function SectionCard({ label, value, helper, format = "money" }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : format === "count"
        ? safeNum(value).toLocaleString()
        : money(value);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{displayValue}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function ProjectSectionSummary({
  statusPastLabel = "Completed to date",
  summary,
}) {
  if (!summary) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SectionCard
        label="Projects in section"
        value={summary.projectCount}
        helper="Visible in the current view"
        format="count"
      />
      <SectionCard
        label="Total section cost"
        value={summary.totalCost}
        helper="Combined value of all visible projects"
      />
      <SectionCard
        label={statusPastLabel}
        value={summary.valuedAmount}
        helper="Already deducted from project balances"
      />
      <SectionCard
        label="Outstanding balance"
        value={summary.remainingAmount}
        helper="Still remaining across visible projects"
      />
      <SectionCard
        label="Overall progress"
        value={summary.progressPercent}
        helper={`${safeNum(summary.markedCount).toLocaleString()} of ${safeNum(summary.itemCount).toLocaleString()} lines marked`}
        format="percent"
      />
    </div>
  );
}
