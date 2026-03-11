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

function StatCard({ label, value, helper, format = "money" }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : money(value);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {displayValue}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function ProjectDashboardSummary({
  grossAmount = 0,
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  remainingAmount = 0,
  statusLabel = "Completed",
  statusPastLabel = "Completed to date",
  valuedAmount = 0,
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gross project total"
          value={grossAmount}
          helper="All items before deductions"
        />
        <StatCard
          label={statusPastLabel}
          value={valuedAmount}
          helper={`${statusLabel} items already deducted`}
        />
        <StatCard
          label="Outstanding balance"
          value={remainingAmount}
          helper="Current project amount remaining"
        />
        <StatCard
          label="Progress"
          value={progressPercent}
          format="percent"
          helper={`${progressCount} of ${progressTotal} lines marked ${statusLabel.toLowerCase()}`}
        />
      </div>

      <ProjectDashboardChart
        grossAmount={grossAmount}
        valuedAmount={valuedAmount}
        remainingAmount={remainingAmount}
        progressPercent={progressPercent}
        progressCount={progressCount}
        progressTotal={progressTotal}
        statusLabel={statusLabel}
      />
    </div>
  );
}
