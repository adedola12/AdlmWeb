// src/features/archicad/ArchiCADVersionSelector.jsx
// Dropdown over the project's BoQ versions (GET .../versions). Selecting an
// older version loads it read-only (the page shows the banner); the
// Reapply-rates button re-prices the CURRENT version with current rates.
import React from "react";
import dayjs from "dayjs";
import { FaSyncAlt, FaSpinner } from "react-icons/fa";
import { fmtMoney } from "../../utils/archicadUnits.js";

export default function ArchiCADVersionSelector({
  versions = [],
  currentVersionId = null,
  selectedVersionId = null, // null = viewing the current version
  onSelect, // (versionId | null) => void
  onReapply, // () => void — only offered on the current version
  reapplying = false,
  currency = "NGN",
}) {
  const list = Array.isArray(versions) ? versions : [];
  const sorted = [...list].sort(
    (a, b) => (b?.versionNumber ?? 0) - (a?.versionNumber ?? 0),
  );
  const viewingCurrent = !selectedVersionId || selectedVersionId === currentVersionId;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
        Version
      </label>
      <select
        value={viewingCurrent ? "" : selectedVersionId}
        onChange={(e) => onSelect?.(e.target.value || null)}
        className="rounded-adlm border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-adlm-blue-600 focus:outline-none dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text"
      >
        <option value="">
          Current{sorted.length ? ` (v${sorted[0]?.versionNumber ?? "?"})` : ""}
        </option>
        {sorted
          .filter((v) => v?.versionId && v.versionId !== currentVersionId)
          .map((v) => (
            <option key={v.versionId} value={v.versionId}>
              {`v${v.versionNumber} — ${
                v.extractedAt ? dayjs(v.extractedAt).format("DD MMM YYYY HH:mm") : "unknown date"
              } — ${fmtMoney(v.grandTotal, currency)}`}
            </option>
          ))}
      </select>

      {viewingCurrent ? (
        <button
          type="button"
          disabled={reapplying}
          onClick={() => onReapply?.()}
          title="Re-price the current BoQ with today's rates (creates a new version)"
          className="inline-flex items-center gap-1.5 rounded-adlm border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:hover:text-adlm-blue-300"
        >
          {reapplying ? <FaSpinner className="animate-spin" /> : <FaSyncAlt />}
          Reapply rates
        </button>
      ) : null}
    </div>
  );
}
