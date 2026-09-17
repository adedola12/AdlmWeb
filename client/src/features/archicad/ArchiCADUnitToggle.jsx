// src/features/archicad/ArchiCADUnitToggle.jsx
// Metric/imperial switch, in his .wk-loc-sw (as the dashboard chart switch).
import React from "react";

const OPTIONS = [
  { id: "metric", label: "Metric" },
  { id: "imperial", label: "Imperial" },
];

export default function ArchiCADUnitToggle({ units = "metric", onChange }) {
  return (
    <div className="wk-loc-sw" role="group" aria-label="Units" style={{ flex: "none" }}>
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
            className={active ? "on" : ""}
            onClick={() => onChange?.(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
