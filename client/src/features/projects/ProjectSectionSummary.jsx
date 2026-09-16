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

const DOT = {
  blue: "bg-adlm-blue-600",
  slate: "bg-slate-400",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-adlm-orange",
};
const BAR = {
  blue: "bg-adlm-blue-600",
  slate: "bg-slate-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-gradient-to-r from-adlm-orange to-amber-400",
};

function SectionCard({ label, value, helper, format = "money", accent = "blue", showBar = false }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : format === "count"
        ? safeNum(value).toLocaleString()
        : money(value);

  return (
    <div className="group relative spotlight rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white shadow-depth p-4 transition-shadow hover:shadow-depth-lg">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[accent] || DOT.blue}`} />
        <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">{label}</div>
      </div>
      <div className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">{displayValue}</div>
      {showBar ? (
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full ${BAR[accent] || BAR.blue} transition-[width] duration-700`}
            style={{ width: `${Math.min(100, Math.max(0, safeNum(value)))}%` }}
          />
        </div>
      ) : null}
      <div className="mt-1.5 text-xs text-slate-500 dark:text-adlm-dark-dim">{helper}</div>
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
        accent="blue"
      />
      <SectionCard
        label="Total section cost"
        value={summary.totalCost}
        helper="Combined value of all visible projects"
        accent="slate"
      />
      <SectionCard
        label={statusPastLabel}
        value={summary.valuedAmount}
        helper="Already deducted from project balances"
        accent="emerald"
      />
      <SectionCard
        label="Outstanding balance"
        value={summary.remainingAmount}
        helper="Still remaining across visible projects"
        accent="amber"
      />
      <SectionCard
        label="Overall progress"
        value={summary.progressPercent}
        helper={`${safeNum(summary.markedCount).toLocaleString()} of ${safeNum(summary.itemCount).toLocaleString()} lines marked`}
        format="percent"
        accent="orange"
        showBar
      />
    </div>
  );
}
