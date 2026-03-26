import React, { useRef, useCallback, useState, useEffect } from "react";
import { FaInfoCircle, FaLink, FaSearch, FaTimes } from "react-icons/fa";

/**
 * Draggable column-resize handle.
 * Attach to a <th> — it tracks horizontal mouse movement and adjusts
 * the column width via the nearest <col> in the table's <colgroup>.
 */
function useColResize() {
  const colRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    const th = e.currentTarget.closest("th");
    if (!th) return;
    const table = th.closest("table");
    if (!table) return;
    const thIndex = Array.from(th.parentElement.children).indexOf(th);
    const col = table.querySelector("colgroup")?.children[thIndex];
    if (!col) return;
    colRef.current = col;

    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;

    const onMove = (ev) => {
      const newW = Math.max(40, startW + ev.clientX - startX);
      col.style.width = newW + "px";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  }, []);

  return onMouseDown;
}

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

/**
 * Format a number with thousands separator and 2 decimal places.
 * e.g. 138625.24 → "138,625.24", 2138 → "2,138.00"
 */
function formatRate(value) {
  const n = safeNum(value);
  if (n === 0) return "";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Normalize a unit string for comparison.
 */
function normUnit(u) {
  const raw = String(u || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw === "m³" || raw === "cum" || raw === "m3") return "m3";
  if (raw === "m²" || raw === "sqm" || raw === "m2") return "m2";
  if (raw === "m" || raw === "lm" || raw === "rm") return "m";
  if (raw === "kg" || raw === "kgs" || raw === "kilogram" || raw === "kilograms") return "kg";
  if (raw === "t" || raw === "ton" || raw === "tons" || raw === "tonne" || raw === "tonnes") return "ton";
  if (raw === "bag" || raw === "bags") return "bag";
  if (raw === "nr" || raw === "no" || raw === "nos" || raw === "number") return "nr";
  return raw;
}

/**
 * Convert a rate's totalCost from the rate's unit to the BOQ item's unit.
 * Returns { convertedCost, conversionNote } or null if no conversion needed.
 *
 * Supported conversions:
 * - m2 → m: multiply by default slab thickness (0.15m)
 * - ton → kg: divide by 1000
 * - kg → ton: multiply by 1000
 */
function convertRateUnit(rateCost, rateUnit, boqUnit, boqDescription) {
  const from = normUnit(rateUnit);
  const to = normUnit(boqUnit);

  if (!from || !to || from === to) return null;

  // m2 → m (e.g., formwork rate per m2, but BOQ item is linear metres)
  if (from === "m2" && to === "m") {
    // Try to extract slab thickness from description, default 0.15m
    let thickness = 0.15;
    const desc = String(boqDescription || "").toLowerCase();
    // Look for patterns like "150mm", "200mm", "0.15m"
    const mmMatch = desc.match(/(\d{2,4})\s*mm/);
    const mMatch = desc.match(/(\d+\.?\d*)\s*m\b/);
    if (mmMatch) {
      const mm = Number(mmMatch[1]);
      if (mm > 0 && mm < 2000) thickness = mm / 1000;
    } else if (mMatch) {
      const m = Number(mMatch[1]);
      if (m > 0 && m < 2) thickness = m;
    }
    return {
      convertedCost: rateCost * thickness,
      conversionNote: `m² → m (×${thickness}m thickness)`,
    };
  }

  // m → m2 (reverse)
  if (from === "m" && to === "m2") {
    return {
      convertedCost: rateCost / 0.15,
      conversionNote: "m → m² (÷0.15m)",
    };
  }

  // ton → kg
  if (from === "ton" && to === "kg") {
    return {
      convertedCost: rateCost / 1000,
      conversionNote: "ton → kg (÷1,000)",
    };
  }

  // kg → ton
  if (from === "kg" && to === "ton") {
    return {
      convertedCost: rateCost * 1000,
      conversionNote: "kg → ton (×1,000)",
    };
  }

  // m3 → m2 (e.g., concrete rate per m3, item is m2 — multiply by thickness)
  if (from === "m3" && to === "m2") {
    let thickness = 0.15;
    const desc = String(boqDescription || "").toLowerCase();
    const mmMatch = desc.match(/(\d{2,4})\s*mm/);
    if (mmMatch) {
      const mm = Number(mmMatch[1]);
      if (mm > 0 && mm < 2000) thickness = mm / 1000;
    }
    return {
      convertedCost: rateCost * thickness,
      conversionNote: `m³ → m² (×${thickness}m thickness)`,
    };
  }

  return null; // no known conversion
}

/**
 * RateCell — An inline rate input that:
 * 1. Shows formatted value with thousands separators when not focused
 * 2. On focus, expands into a popup overlay with a full-width input
 * 3. Supports typing a rate name to search RateGen library suggestions
 * 4. Clicking a suggestion fills the totalCost into the rate (with unit conversion)
 */
function RateCell({
  value,
  placeholder,
  onChange,
  onSearchRateGen,
  canRateGenBoq,
  boqCandidates = [],
  itemUnit = "",
  itemDescription = "",
}) {
  const [focused, setFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  // Stable ref for the search callback so the effect doesn't re-run on every render
  const searchFnRef = useRef(onSearchRateGen);
  searchFnRef.current = onSearchRateGen;

  // Close popup when clicking outside
  useEffect(() => {
    if (!focused) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFocused(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [focused]);

  // Debounced search when typing a name
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !canRateGenBoq) {
      if (!searchQuery) setSearchResults((prev) => prev); // keep existing candidates
      return;
    }
    // If it looks like a number, don't search
    if (/^\d+\.?\d*$/.test(searchQuery.trim())) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const fn = searchFnRef.current;
        const results = fn ? await fn(searchQuery) : [];
        setSearchResults(Array.isArray(results) ? results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(debounceRef.current);
      setSearching(false);
    };
  }, [searchQuery, canRateGenBoq]); // removed onSearchRateGen — use ref instead

  const handleFocus = () => {
    setFocused(true);
    setSearchQuery("");
    // Existing candidates from batch sync
    setSearchResults(boqCandidates.length ? boqCandidates : []);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    // If it's a number, treat as direct rate input
    if (/^[\d.,]*$/.test(v)) {
      onChange?.(v.replace(/,/g, ""));
      setSearchQuery("");
      setSearchResults([]);
    } else {
      // Text — search RateGen
      setSearchQuery(v);
    }
  };

  const pickRate = (candidate, useConverted = false) => {
    let cost = safeNum(candidate?.totalCost);

    if (useConverted && candidate?._conversion) {
      cost = candidate._conversion.convertedCost;
    } else {
      // Auto-convert if units differ
      const conversion = convertRateUnit(cost, candidate?.unit, itemUnit, itemDescription);
      if (conversion) {
        cost = conversion.convertedCost;
      }
    }

    // Round to 2 decimal places
    cost = Math.round(cost * 100) / 100;
    onChange?.(String(cost));
    setFocused(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const displayValue = value !== "" && value != null ? formatRate(value) : "";

  return (
    <div ref={wrapRef} className="relative">
      {/* Static display — shown when not focused */}
      {!focused ? (
        <button
          type="button"
          className="input !h-8 w-full !min-w-0 !px-1.5 !py-0.5 text-xs text-left cursor-text"
          onClick={handleFocus}
        >
          {displayValue || <span className="text-slate-400">{formatRate(placeholder) || "0"}</span>}
        </button>
      ) : (
        /* Expanded popup overlay on focus */
        <div className="absolute left-0 top-0 z-40 w-80 rounded-lg border border-blue-300 bg-white shadow-xl">
          <div className="p-2">
            <input
              ref={inputRef}
              autoFocus
              className="input !h-9 w-full !px-2 !py-1 text-sm"
              type="text"
              value={searchQuery || (value != null && value !== "" ? String(value) : "")}
              placeholder={canRateGenBoq ? "Enter rate or type name to search..." : "Enter rate..."}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setFocused(false);
                  setSearchQuery("");
                }
              }}
            />
            {canRateGenBoq && (
              <div className="mt-1 text-[10px] text-slate-400">
                Type a number for direct rate, or a name to search RateGen
              </div>
            )}
          </div>

          {/* Search results / candidates dropdown */}
          {(searchResults.length > 0 || searching) ? (
            <div className="border-t">
              {searching && (
                <div className="px-3 py-2 text-xs text-slate-500 animate-pulse">Searching rates...</div>
              )}
              <div className="max-h-60 overflow-auto">
                {searchResults.slice(0, 10).map((c, idx) => {
                  const conversion = convertRateUnit(
                    safeNum(c.totalCost), c.unit, itemUnit, itemDescription
                  );
                  const convertedCost = conversion
                    ? Math.round(conversion.convertedCost * 100) / 100
                    : null;
                  const unitMismatch = itemUnit && c.unit &&
                    normUnit(c.unit) !== normUnit(itemUnit);

                  return (
                    <button
                      key={`${c.description}-${c.unit}-${idx}`}
                      type="button"
                      className="w-full border-b px-3 py-1.5 text-left hover:bg-blue-50 last:border-b-0"
                      onClick={() => pickRate({ ...c, _conversion: conversion })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-medium text-slate-800">
                          {c.description}
                        </div>
                        <div className="text-right">
                          {conversion ? (
                            <>
                              <div className="whitespace-nowrap text-xs font-semibold text-adlm-blue-700">
                                {formatRate(convertedCost)}/{normUnit(itemUnit) || itemUnit}
                              </div>
                              <div className="whitespace-nowrap text-[9px] text-slate-400 line-through">
                                {formatRate(c.totalCost)}/{c.unit}
                              </div>
                            </>
                          ) : (
                            <div className="whitespace-nowrap text-xs font-semibold text-adlm-blue-700">
                              {formatRate(c.totalCost)}/{c.unit || "—"}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {c.unit}{c.sectionLabel ? ` | ${c.sectionLabel}` : ""}{c.source ? ` | ${c.source}` : ""}
                        {conversion ? (
                          <span className="ml-1 font-medium text-amber-600">
                            • {conversion.conversionNote}
                          </span>
                        ) : unitMismatch ? (
                          <span className="ml-1 font-medium text-amber-600">
                            • unit mismatch ({c.unit} → {itemUnit})
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              {searchResults.length > 0 && (
                <div className="border-t px-3 py-1.5 text-[10px] text-slate-400">
                  {searchResults.length} rate{searchResults.length !== 1 ? "s" : ""} found
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * ExpandInput — On focus, shows a popup overlay with full-width input
 * for Actual Qty and Actual Rate fields.
 */
function ExpandInput({ value, placeholder, onChange, type = "number" }) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!focused) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [focused]);

  if (!focused) {
    return (
      <button
        type="button"
        className="input !h-8 w-full !min-w-0 !px-1.5 !py-0.5 text-xs text-left cursor-text"
        onClick={() => setFocused(true)}
      >
        {value !== "" && value != null
          ? <span>{type === "number" ? formatRate(value) : value}</span>
          : <span className="text-slate-400">{placeholder}</span>
        }
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="absolute left-0 top-0 z-40 w-56">
      <input
        autoFocus
        className="input !h-9 w-full !px-2 !py-1 text-sm shadow-lg border-blue-300 rounded-lg"
        type={type}
        step="any"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFocused(false);
          if (e.key === "Enter") setFocused(false);
        }}
      />
    </div>
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
  onSearchRateGen,
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
  rateGenPoolCount = 0,
  rateGenPoolLoading = false,
  rateGenPoolLoaded = false,
  onReloadRateGenPool,
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

  const handleColResize = useColResize();

  // Column sorting state
  const [sortCol, setSortCol] = useState(null);   // "sn" | "description" | "qty" | "unit" | "rate" | "grossAmt" | "balance" | null
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }, [sortCol]);

  // Apply sorting to computedShown
  const sortedShown = React.useMemo(() => {
    if (!sortCol) return computedShown;
    const sorted = [...computedShown];
    const dir = sortAsc ? 1 : -1;

    sorted.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "sn": va = a.sn; vb = b.sn; break;
        case "description": va = (a.description || "").toLowerCase(); vb = (b.description || "").toLowerCase();
          return dir * va.localeCompare(vb);
        case "qty": va = a.qty || 0; vb = b.qty || 0; break;
        case "unit": va = (a.unit || "").toLowerCase(); vb = (b.unit || "").toLowerCase();
          return dir * va.localeCompare(vb);
        case "rate": va = a.fullAmount / (a.qty || 1); vb = b.fullAmount / (b.qty || 1); break;
        case "grossAmt": va = a.fullAmount || 0; vb = b.fullAmount || 0; break;
        case "deducted": va = a.valuedAmount || 0; vb = b.valuedAmount || 0; break;
        case "balance": va = a.amount || 0; vb = b.amount || 0; break;
        default: return 0;
      }
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
    return sorted;
  }, [computedShown, sortCol, sortAsc]);

  // Helper for sortable header
  const SortHeader = ({ col, children, className = "", ...rest }) => (
    <th
      className={`px-2 py-2 text-xs cursor-pointer select-none hover:bg-slate-100 transition-colors ${className}`}
      onClick={() => handleSort(col)}
      title={`Sort by ${children}`}
      {...rest}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortCol === col ? (
          <span className="text-adlm-blue-700">{sortAsc ? "▲" : "▼"}</span>
        ) : (
          <span className="text-slate-300">⇅</span>
        )}
      </span>
    </th>
  );

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
            {!showMaterials && canRateGenBoq ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    rateGenPoolLoading ? "bg-amber-400 animate-pulse" :
                    rateGenPoolLoaded ? "bg-emerald-500" :
                    "bg-slate-300"
                  }`}
                />
                {rateGenPoolLoading ? (
                  "Loading rates..."
                ) : rateGenPoolLoaded ? (
                  <>
                    <b className="text-slate-700">{rateGenPoolCount}</b> RateGen rates loaded
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-adlm-blue-700 hover:underline"
                    onClick={onReloadRateGenPool}
                  >
                    Load RateGen rates
                  </button>
                )}
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
        <div className="overflow-x-auto overflow-y-visible rounded-xl border border-slate-200 bg-white max-w-full">
          <table className="w-full text-sm" style={{ tableLayout: "auto", minWidth: 0 }}>
            <colgroup>
              <col className="w-10" />                                         {/* S/N */}
              <col className={showActualColumns ? "w-10" : "w-[130px]"} />     {/* Status */}
              <col style={{ width: showActualColumns ? "22%" : "30%" }} />      {/* Description — % based */}
              <col className="w-16" />                                          {/* Qty */}
              <col className="w-10" />                                          {/* Unit */}
              <col style={{ width: showActualColumns ? "12%" : "18%" }} />      {/* Rate */}
              {showActualColumns ? <col className="w-[100px]" /> : null}        {/* Actual qty */}
              {showActualColumns ? <col className="w-[100px]" /> : null}        {/* Actual rate */}
              {showActualColumns ? <col className="w-[90px]" /> : null}         {/* Actual amount */}
              {showActualColumns ? <col className="w-[72px]" /> : null}         {/* Actual added */}
              <col className="w-[90px]" />                                      {/* Gross amount */}
              <col className="w-[72px]" />                                      {/* Deducted */}
              <col className="w-[72px]" />                                      {/* Balance */}
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <SortHeader col="sn">S/N</SortHeader>
                <th className="px-2 py-2 text-xs" title={statusLabel}>{showActualColumns ? "✓" : statusLabel}</th>
                <SortHeader col="description" className="relative px-2 py-2 text-xs cursor-pointer select-none hover:bg-slate-100">
                  Description
                </SortHeader>
                <SortHeader col="qty">Qty</SortHeader>
                <SortHeader col="unit">Unit</SortHeader>
                <SortHeader col="rate">Rate</SortHeader>
                {showActualColumns ? <th className="px-2 py-2 text-xs">Actual qty</th> : null}
                {showActualColumns ? <th className="px-2 py-2 text-xs">Actual rate</th> : null}
                {showActualColumns ? <th className="px-2 py-2 text-xs">Actual amt</th> : null}
                {showActualColumns ? <th className="px-2 py-2 text-xs">Added</th> : null}
                <SortHeader col="grossAmt">Gross amt</SortHeader>
                <SortHeader col="deducted">Deducted</SortHeader>
                <SortHeader col="balance">Balance</SortHeader>
              </tr>
            </thead>

            <tbody>
              {sortedShown.map((row) => {
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
                    <td className="px-2 py-2 font-medium text-slate-700">{row.sn}</td>

                    <td className="px-2 py-2">
                      {showActualColumns ? (
                        /* Compact: checkbox only when actual columns are visible */
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className={checkboxCls}
                            checked={row.isMarked}
                            onChange={(e) => onStatusToggle?.(row.i, e.target.checked)}
                            aria-label={statusActionText}
                            title={row.isMarked ? statusLabel : statusOffText}
                          />
                        </div>
                      ) : (
                        /* Full: checkbox + label + info text when space is available */
                        <>
                          <label className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                            <input
                              type="checkbox"
                              className={checkboxCls}
                              checked={row.isMarked}
                              onChange={(e) => onStatusToggle?.(row.i, e.target.checked)}
                              aria-label={statusActionText}
                            />
                            <span className="text-xs">{row.isMarked ? statusLabel : statusOffText}</span>
                          </label>
                          <div className="mt-0.5 text-[10px] leading-tight text-slate-500">
                            {row.isMarked
                              ? row.markedAt
                                ? `Logged ${formatDateTime(row.markedAt)}`
                                : statusPendingText
                              : `Unchecked items stay in the outstanding balance until marked ${statusLabelLower}.`}
                          </div>
                        </>
                      )}
                    </td>

                    <td className="px-2 py-2 overflow-hidden" title={row.description}>
                      <div className="font-medium text-slate-900 text-xs break-words leading-snug">{row.description}</div>
                      {row.groupId ? (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          Group: <span className="text-slate-700">{row.groupLabel} ({row.groupCount})</span>
                          {linked ? <span className="font-medium text-adlm-blue-700"> | linked</span> : null}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-2 py-2 text-xs text-slate-700">{row.qty.toFixed(2)}</td>
                    <td className="px-2 py-2 text-xs text-slate-700">{row.unit}</td>

                    <td className="px-2 py-2 relative">
                      <div className="flex items-start gap-1">
                        {showMaterials ? (
                          /* Materials view — keep simple number input + picker */
                          <>
                            <input
                              className="input !h-8 !w-full !min-w-0 !px-1.5 !py-0.5 text-xs"
                              type="number"
                              step="any"
                              value={rateValue}
                              placeholder={formatRate(item?.rate || 0)}
                              onChange={(e) => onRateChange?.(row.i, e.target.value)}
                            />

                            {candidates.length ? (
                              <div className="relative">
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border hover:bg-slate-50"
                                  title="Pick a matching material price"
                                  onClick={() => onToggleOpenPickKey?.(row.key)}
                                >
                                  <FaSearch className="text-xs text-slate-600" />
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
                          </>
                        ) : (
                          /* BOQ view — smart RateCell with formatting + RateGen search */
                          <>
                            <RateCell
                              value={rateValue}
                              placeholder={String(Number(item?.rate || 0))}
                              onChange={(v) => onRateChange?.(row.i, v)}
                              onSearchRateGen={onSearchRateGen}
                              canRateGenBoq={canRateGenBoq}
                              boqCandidates={getBoqCandidatesForItem?.(item) || []}
                              itemUnit={row.unit || item?.unit || ""}
                              itemDescription={row.description || item?.description || ""}
                            />

                            <button
                              type="button"
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${canLink ? linked ? "border-blue-300 bg-blue-50" : "hover:bg-slate-50" : "cursor-not-allowed opacity-40"}`}
                              title={canLink ? linked ? "Linked: rate changes propagate to similar items" : "Link similar items" : "No similar items found to link"}
                              disabled={!canLink}
                              onClick={() => onToggleGroupLink?.(groupId, row.i)}
                            >
                              <FaLink className={`text-xs ${linked ? "text-adlm-blue-700" : "text-slate-600"}`} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {showActualColumns ? (
                      <td className="px-2 py-2 relative">
                        <ExpandInput
                          value={actualQtyValue}
                          placeholder="Measured qty"
                          onChange={(v) => onActualQtyChange?.(row.i, v)}
                        />
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-2 py-2 relative">
                        <ExpandInput
                          value={actualRateValue}
                          placeholder="Measured rate"
                          onChange={(v) => onActualRateChange?.(row.i, v)}
                        />
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-2 py-2 text-xs font-medium text-slate-900">
                        {row.actualHasData ? money(row.actualAmount) : "-"}
                      </td>
                    ) : null}

                    {showActualColumns ? (
                      <td className="px-2 py-2 text-[10px] text-slate-500">
                        {actualDateLabel || (row.actualHasData ? "Pending save" : "-")}
                      </td>
                    ) : null}

                    <td className="px-2 py-2 text-xs font-medium text-slate-900">{money(row.fullAmount)}</td>
                    <td className="px-2 py-2 text-xs font-medium text-emerald-700">{money(row.valuedAmount)}</td>
                    <td className="px-2 py-2 text-xs font-semibold text-slate-900">{money(row.amount)}</td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot className="bg-slate-50">
              <tr className="border-t font-semibold text-slate-900 text-xs">
                <td className="px-2 py-2" colSpan={6}>
                  Totals
                </td>
                {showActualColumns ? <td className="px-2 py-2" /> : null}
                {showActualColumns ? <td className="px-2 py-2" /> : null}
                {showActualColumns ? <td className="px-2 py-2 text-adlm-blue-700">{money(actualTrackedAmount)}</td> : null}
                {showActualColumns ? <td className="px-2 py-2" /> : null}
                <td className="px-2 py-2">{money(grossAmount)}</td>
                <td className="px-2 py-2 text-emerald-700">{money(valuedAmount)}</td>
                <td className="px-2 py-2">{money(remainingAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
