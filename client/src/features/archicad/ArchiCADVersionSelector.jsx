// src/features/archicad/ArchiCADVersionSelector.jsx
// Dropdown over the project's BoQ versions (GET .../versions). Selecting an
// older version loads it read-only (the page shows the banner); the
// Reapply-rates button re-prices the CURRENT version with current rates.
import React from "react";
import dayjs from "dayjs";
import { FaSpinner, FaSyncAlt } from "../../components/icons.jsx";
import { fmtMoney } from "../../utils/archicadUnits.js";

export default function ArchiCADVersionSelector({
  versions = [],
  currentVersionId = null,
  selectedVersionId = null, // null = viewing the current version
  onSelect, // (versionId | null) => void
  onReapply, // () => void, only offered on the current version
  reapplying = false,
  currency = "NGN",
}) {
  const list = Array.isArray(versions) ? versions : [];
  const sorted = [...list].sort(
    (a, b) => (b?.versionNumber ?? 0) - (a?.versionNumber ?? 0),
  );
  const viewingCurrent = !selectedVersionId || selectedVersionId === currentVersionId;

  return (
    <div className="wk-acts" style={{ alignItems: "center" }}>
      <label className="wk-f" style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ margin: 0 }}>Version</span>
      <select
        value={viewingCurrent ? "" : selectedVersionId}
        onChange={(e) => onSelect?.(e.target.value || null)}
        style={{ padding: "8px 12px", width: "auto", maxWidth: 360 }}
      >
        <option value="">
          Current{sorted.length ? ` (v${sorted[0]?.versionNumber ?? "?"})` : ""}
        </option>
        {sorted
          .filter((v) => v?.versionId && v.versionId !== currentVersionId)
          .map((v) => (
            <option key={v.versionId} value={v.versionId}>
              {`v${v.versionNumber}, ${
                v.extractedAt ? dayjs(v.extractedAt).format("DD MMM YYYY HH:mm") : "unknown date"
              }, ${fmtMoney(v.grandTotal, currency)}`}
            </option>
          ))}
      </select>
      </label>

      {viewingCurrent && onReapply ? (
        <button
          type="button"
          disabled={reapplying}
          onClick={() => onReapply?.()}
          title="Re-price the current BoQ with today's rates (creates a new version)"
          className="ds-btn ds-btn-sm btn-o"
        >
          {reapplying ? <FaSpinner size={14} className="animate-spin" /> : <FaSyncAlt size={14} />}
          Reapply rates
        </button>
      ) : null}
    </div>
  );
}
