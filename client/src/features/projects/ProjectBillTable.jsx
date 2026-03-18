import React from "react";
import { FaInfoCircle, FaLink, FaSearch, FaTimes } from "react-icons/fa";

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
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function InfoTip({ text }) {
  return (
    <span className="relative inline-flex items-center group">
      <FaInfoCircle className="text-slate-500" />
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
        {text}
      </span>
    </span>
  );
}

export default function ProjectBillTable({
  actualQtyInputs = {},
  actualRateInputs = {},
  actualTrackedAmount = 0,
  autoFillBusy = false,
  autoFillMaterialsRates = false,
  autoFillBoqRates = false,
  autoFillBoqBusy = false,
  canRateGen = false,
  canRateGenBoq = false,
  rateSyncEnabled = false,
  onToggleRateSyncEnabled,
  checkboxCls = "",
  computedShown = [],
  getBoqCandidatesForItem,
  getCandidatesForItem,
  grossAmount = 0,
  isGroupLinked,
  itemQuery = "",
  items = [],
  linkedGroupsCount = 0,
  onActualQtyChange,
  onActualRateChange,
  onClearItemQuery,
  onCloseBoqPickKey,
  onClosePickKey,
  onItemQueryChange,
  onPickBoqCandidate,
  onPickCandidate,
  onRateChange,
  onStatusToggle,
  onSyncBoqRates,
  onSyncPrices,
  onToggleAutoFill,
  onToggleAutoFillBoq,
  onToggleGroupLink,
  onToggleOnlyFillEmpty,
  onToggleOpenBoqPickKey,
  onToggleOpenPickKey,
  onToggleShowActualColumns,
  onlyFillEmpty = true,
  openBoqPickKey = null,
  openPickKey = null,
  rateInfoText = "",
  rates = {},
  remainingAmount = 0,
  showActualColumns = false,
  showMaterials = false,
  statusLabel = "Completed",
  valuedAmount = 0,
}) {
  const statusLabelLower = String(statusLabel || "Completed").toLowerCase();
  const statusActionText = showMaterials
    ? "Mark as purchased"
    : "Mark as completed";
  const statusOffText = showMaterials ? "Not purchased" : "Not completed";
  const statusPendingText = showMaterials
    ? "Save to log this purchase date and deduct it from the balance."
    : "Save to log this completion date and deduct it from the balance.";


  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyFillEmpty}
                onChange={(e) => onToggleOnlyFillEmpty?.(e.target.checked)}
                className={checkboxCls}
              />
              Only fill empty rates
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showActualColumns}
                onChange={(e) => onToggleShowActualColumns?.(e.target.checked)}
                className={checkboxCls}
              />
              Show actual qty / rate columns
            </label>

            {showMaterials && canRateGen ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoFillMaterialsRates}
                  onChange={(e) => onToggleAutoFill?.(e.target.checked)}
                  disabled={autoFillBusy}
                  className={checkboxCls}
                />
                Auto-fill material rates (RateGen)
              </label>
            ) : null}

            {showMaterials && canRateGen ? (
              <button
                type="button"
                className="btn btn-xs"
                onClick={onSyncPrices}
                disabled={autoFillBusy}
                title="Fetch prices and auto-fill again"
              >
                {autoFillBusy ? "Syncing..." : "Sync prices"}
              </button>
            ) : null}

            {canRateGenBoq ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoFillBoqRates}
                  onChange={(e) => onToggleAutoFillBoq?.(e.target.checked)}
                  disabled={autoFillBoqBusy}
                  className={checkboxCls}
                />
                Auto-sync rates (RateGen)
              </label>
            ) : null}

            {canRateGenBoq ? (
              <button
                type="button"
                className="btn btn-xs"
                onClick={onSyncBoqRates}
                disabled={autoFillBoqBusy}
                title="Fetch rates from RateGen library and auto-fill"
              >
                {autoFillBoqBusy ? "Syncing..." : "Sync rates from RateGen"}
              </button>
            ) : null}

            {canRateGenBoq ? (
              <label className="inline-flex items-center gap-2" title="When enabled, project rates auto-update when RateGen rates change (saved per project)">
                <input
                  type="checkbox"
                  checked={rateSyncEnabled}
                  onChange={(e) => onToggleRateSyncEnabled?.(e.target.checked)}
                  className={checkboxCls}
                />
                Live rate sync
              </label>
            ) : null}

            {rateInfoText ? (
              <span className="inline-flex items-center gap-2 text-slate-500">
                <InfoTip text={rateInfoText} />
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Linked groups: <b className="text-slate-700">{linkedGroupsCount}</b>
            </span>
            {showActualColumns ? (
              <span>
                Actual tracked value: <b className="text-slate-700">{money(actualTrackedAmount)}</b>
              </span>
            ) : null}
          </div>
        </div>

        {showActualColumns ? (
          <div className="mt-3 text-xs text-slate-500">
            Actual amount uses the entered actual qty and actual rate. If only one actual field is entered, the other value falls back to the planned quantity or rate for comparison.
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 rounded-md border bg-white px-2 py-2">
        <FaSearch className="text-slate-500" />
        <input
          className="w-full text-sm outline-none"
          placeholder="Search items (description / group / S/N)..."
          value={itemQuery}
          onChange={(e) => onItemQueryChange?.(e.target.value)}
        />
        {itemQuery ? (
          <button
            type="button"
            className="text-slate-500 hover:text-slate-700"
            onClick={onClearItemQuery}
            title="Clear"
          >
            <FaTimes />
          </button>
        ) : null}
      </div>

      {!items.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          This project does not have any saved items yet.
        </div>
      ) : null}

      {items.length && !computedShown.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          No items match the current search.
        </div>
      ) : null}

      {computedShown.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[1250px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">S/N</th>
                <th className="px-4 py-3">{statusLabel}</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Rate</th>
                {showActualColumns ? <th className="px-4 py-3">Actual qty</th> : null}
                {showActualColumns ? <th className="px-4 py-3">Actual rate</th> : null}
                {showActualColumns ? <th className="px-4 py-3">Actual amount</th> : null}
                {showActualColumns ? <th className="px-4 py-3">Actual added</th> : null}
                <th className="px-4 py-3">Gross amount</th>
                <th className="px-4 py-3">Deducted</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>

            <tbody>
              {computedShown.map((row) => {
                const item = items[row.i] || {};
                const groupId = row.groupId;
                const canLink = Boolean(groupId) && row.groupCount >= 2;
                const linked = Boolean(groupId) && isGroupLinked?.(groupId);
                const candidates = showMaterials
                  ? getCandidatesForItem?.(item) || []
                  : [];
                const rateValue = rates?.[row.key] ?? "";
                const actualQtyValue = actualQtyInputs?.[row.key] ?? "";
                const actualRateValue = actualRateInputs?.[row.key] ?? "";
                const actualDateLabel = formatDateTime(
                  row.actualUpdatedAt || row.actualRecordedAt,
                );

                return (
                  <tr
                    key={row.key || row.i}
                    className={`border-t align-top ${row.isMarked ? "bg-emerald-50/40" : "bg-white"}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">{row.sn}</td>

                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 font-medium text-slate-800">
                        <input
                          type="checkbox"
                          className={checkboxCls}
                          checked={row.isMarked}
                          onChange={(e) => onStatusToggle?.(row.i, e.target.checked)}
                          aria-label={statusActionText}
                        />
                        <span>{row.isMarked ? statusLabel : statusOffText}</span>
                      </label>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {row.isMarked
                          ? row.markedAt
                            ? `Logged ${formatDateTime(row.markedAt)}`
                            : statusPendingText
                          : `Unchecked items stay in the outstanding balance until marked ${statusLabelLower}.`}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.description}</div>
                      {row.groupId ? (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Group: <span className="text-slate-700">{row.groupLabel} ({row.groupCount})</span>
                          {linked ? <span className="font-medium text-blue-700"> | linked</span> : null}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-slate-700">{row.qty.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.unit}</td>

                    <td className="px-4 py-3">
                      <div className="flex min-w-[240px] items-start gap-2">
                        <input
                          className="input !h-9 !w-[140px] !px-2 !py-1"
                          type="number"
                          step="any"
                          value={rateValue}
                          placeholder={String(Number(item?.rate || 0))}
                          onChange={(e) => onRateChange?.(row.i, e.target.value)}
                        />

                        <button
                          type="button"
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${canLink ? linked ? "border-blue-300 bg-blue-50" : "hover:bg-slate-50" : "cursor-not-allowed opacity-40"}`}
                          title={canLink ? linked ? "Linked: rate changes propagate to similar items" : "Link similar items" : "No similar items found to link"}
                          disabled={!canLink}
                          onClick={() => onToggleGroupLink?.(groupId, row.i)}
                        >
                          <FaLink className={linked ? "text-blue-700" : "text-slate-600"} />
                        </button>

                        {showMaterials && candidates.length ? (
                          <div className="relative">
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-slate-50"
                              title="Pick a matching material price"
                              onClick={() => onToggleOpenPickKey?.(row.key)}
                            >
                              <FaSearch className="text-slate-600" />
                            </button>

                            {openPickKey === row.key ? (
                              <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border bg-white shadow-lg">
                                <div className="border-b px-3 py-2 text-xs text-slate-600">
                                  Choose a price for <b>{String(item?.materialName || "").trim()}</b>
                                </div>

                                <div className="max-h-64 overflow-auto">
                                  {candidates.slice(0, 10).map((candidate) => {
                                    const unitMismatch =
                                      String(item?.unit || "").trim() &&
                                      String(candidate?.unit || "").trim() &&
                                      String(item.unit).trim().toLowerCase() !==
                                        String(candidate.unit).trim().toLowerCase();

                                    return (
                                      <button
                                        key={`${candidate.description || "candidate"}-${candidate.unit || ""}-${candidate.source || ""}`}
                                        type="button"
                                        className="w-full border-b px-3 py-2 text-left hover:bg-slate-50"
                                        onClick={() => onPickCandidate?.(row.i, candidate)}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="truncate font-medium text-slate-900">
                                            {candidate.description}
                                          </div>
                                          <div className="font-semibold text-slate-900">
                                            {money(candidate.price)}
                                          </div>
                                        </div>
                                        <div className="mt-0.5 text-xs text-slate-500">
                                          {candidate.unit} | {candidate.source}
                                          {unitMismatch ? (
                                            <span className="font-medium text-amber-700"> | unit mismatch</span>
                                          ) : null}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="flex justify-end p-2">
                                  <button type="button" className="btn btn-xs" onClick={onClosePickKey}>
                                    Close
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {!showMaterials && canRateGenBoq ? (() => {
                          const boqCandidates = getBoqCandidatesForItem?.(item) || [];
                          if (!boqCandidates.length) return null;
                          return (
                            <div className="relative">
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-slate-50"
                                title="Pick a rate from RateGen library"
                                onClick={() => onToggleOpenBoqPickKey?.(row.key)}
                              >
                                <FaSearch className="text-slate-600" />
                              </button>

                              {openBoqPickKey === row.key ? (
                                <div className="absolute right-0 z-30 mt-2 w-96 overflow-hidden rounded-lg border bg-white shadow-lg">
                                  <div className="border-b px-3 py-2 text-xs text-slate-600">
                                    RateGen rates for <b>{String(item?.description || "").trim().slice(0, 60)}</b>
                                  </div>

                                  <div className="max-h-64 overflow-auto">
                                    {boqCandidates.slice(0, 10).map((candidate) => (
                                      <button
                                        key={`${candidate.description}-${candidate.unit}-${candidate.source}`}
                                        type="button"
                                        className="w-full border-b px-3 py-2 text-left hover:bg-slate-50"
                                        onClick={() => onPickBoqCandidate?.(row.i, candidate)}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="truncate font-medium text-slate-900">
                                            {candidate.description}
                                          </div>
                                          <div className="font-semibold text-slate-900 whitespace-nowrap">
                                            {money(candidate.totalCost)}
                                          </div>
                                        </div>
                                        <div className="mt-0.5 text-xs text-slate-500">
                                          {candidate.unit} | {candidate.sectionLabel} | {candidate.source}
                                        </div>
                                      </button>
                                    ))}
                                  </div>

                                  <div className="flex justify-end p-2">
                                    <button type="button" className="btn btn-xs" onClick={onCloseBoqPickKey}>
                                      Close
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })() : null}
                      </div>
                    </td>

                    {showActualColumns ? (
                      <td className="px-4 py-3">
                        <input
                          className="input !h-9 !w-[120px] !px-2 !py-1"
                          type="number"
                          step="any"
                          value={actualQtyValue}
                          placeholder="Measured qty"
                          onChange={(e) => onActualQtyChange?.(row.i, e.target.value)}
                        />
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-4 py-3">
                        <input
                          className="input !h-9 !w-[120px] !px-2 !py-1"
                          type="number"
                          step="any"
                          value={actualRateValue}
                          placeholder="Measured rate"
                          onChange={(e) => onActualRateChange?.(row.i, e.target.value)}
                        />
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.actualHasData ? money(row.actualAmount) : "-"}
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-4 py-3 text-[11px] text-slate-500">
                        {actualDateLabel || (row.actualHasData ? "Pending save" : "-")}
                      </td>
                    ) : null}

                    <td className="px-4 py-3 font-medium text-slate-900">{money(row.fullAmount)}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{money(row.valuedAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{money(row.amount)}</td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot className="bg-slate-50">
              <tr className="border-t font-semibold text-slate-900">
                <td className="px-4 py-3" colSpan={6}>
                  Totals
                </td>
                {showActualColumns ? <td className="px-4 py-3" /> : null}
                {showActualColumns ? <td className="px-4 py-3" /> : null}
                {showActualColumns ? <td className="px-4 py-3 text-blue-700">{money(actualTrackedAmount)}</td> : null}
                {showActualColumns ? <td className="px-4 py-3" /> : null}
                <td className="px-4 py-3">{money(grossAmount)}</td>
                <td className="px-4 py-3 text-emerald-700">{money(valuedAmount)}</td>
                <td className="px-4 py-3">{money(remainingAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
