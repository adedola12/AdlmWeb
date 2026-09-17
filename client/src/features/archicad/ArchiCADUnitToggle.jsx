// src/features/archicad/ArchiCADUnitToggle.jsx
// Segmented metric/imperial control — same visual language as the chart-mode
// switcher in ProjectDashboardChart.jsx.
import React from "react";

const OPTIONS = [
  { id: "metric", label: "Metric" },
  { id: "imperial", label: "Imperial" },
];

export default function ArchiCADUnitToggle({ units = "metric", onChange }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-slate-100 dark:bg-white/5 p-1">
      {OPTIONS.map((opt) => {
        const active = units === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            title={
              opt.id === "imperial"
                ? "Show quantities in ft / ft² / ft³ (cross-sections in inches). Amounts stay in ₦."
                : "Show quantities in m / m² / m³"
            }
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              active
                ? "bg-white dark:bg-adlm-dark-panel text-adlm-blue-700 dark:text-adlm-blue-300 shadow-sm"
                : "text-slate-600 dark:text-adlm-dark-muted hover:text-slate-900 dark:hover:text-white",
            ].join(" ")}
            onClick={() => onChange?.(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
