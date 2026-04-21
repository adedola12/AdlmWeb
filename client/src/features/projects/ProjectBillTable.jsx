import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  FaInfoCircle,
  FaLink,
  FaSearch,
  FaTimes,
  FaTrashAlt,
  FaArrowUp,
  FaArrowDown,
  FaGripVertical,
  FaPlus,
  FaListUl,
  FaCogs,
  FaFileInvoiceDollar,
  FaClipboardList,
  FaSync,
} from "react-icons/fa";

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
  onDeleteItem,
  onMoveItem,
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
  onCategoryChange,
  categoryOptions = [],
  provisionalSums = [],
  onAddProvisionalSum,
  onUpdateProvisionalSum,
  onRemoveProvisionalSum,
  variations = [],
  onAddVariation,
  onUpdateVariation,
  onRemoveVariation,
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

  // Drag-and-drop reorder state
  const [dragIdx, setDragIdx] = useState(null);    // items-array index being dragged
  const [dragOverIdx, setDragOverIdx] = useState(null); // items-array index being hovered

  // Ribbon tab state — mirrors MS Office ribbon (Home / Rates / Navigate / Extras)
  const [ribbonTab, setRibbonTab] = useState("home");

  // Anchors for jump-to-section
  const categoryAnchorRef = useRef({});
  const provisionalSectionRef = useRef(null);
  const variationsSectionRef = useRef(null);

  const scrollToRef = useCallback((node) => {
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      node.scrollIntoView();
    }
  }, []);

  const jumpToCategory = useCallback(
    (cat) => scrollToRef(categoryAnchorRef.current?.[cat]),
    [scrollToRef],
  );

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

  // Group rows by category, preserving canonical order, then any extras at the end.
  const groupedRows = React.useMemo(() => {
    const map = new Map();
    for (const row of sortedShown) {
      const cat = String(row.category || "Uncategorized").trim() || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(row);
    }
    const canonical = Array.isArray(categoryOptions) ? categoryOptions : [];
    const ordered = [
      ...canonical.filter((c) => map.has(c)).map((c) => ({ category: c, rows: map.get(c) })),
      ...[...map.entries()]
        .filter(([c]) => !canonical.includes(c))
        .map(([c, rows]) => ({ category: c, rows })),
    ];
    return ordered;
  }, [sortedShown, categoryOptions]);

  // Per-category totals for subtotal rows + summary card.
  const categoryTotals = React.useMemo(() => {
    return groupedRows.map(({ category, rows }) => {
      const fullAmount = rows.reduce((acc, r) => acc + (r.fullAmount || 0), 0);
      const valued = rows.reduce((acc, r) => acc + (r.valuedAmount || 0), 0);
      const balance = rows.reduce((acc, r) => acc + (r.amount || 0), 0);
      return {
        category,
        count: rows.length,
        fullAmount,
        valuedAmount: valued,
        balance,
      };
    });
  }, [groupedRows]);

  const totalCols = showActualColumns ? 14 : 10;

  // Variation totals — Amount = Qty × Rate per row.
  const variationsTotal = React.useMemo(() => {
    return (Array.isArray(variations) ? variations : []).reduce(
      (acc, v) => acc + safeNum(v?.qty) * safeNum(v?.rate),
      0,
    );
  }, [variations]);

  const provisionalTotal = React.useMemo(() => {
    return (Array.isArray(provisionalSums) ? provisionalSums : []).reduce(
      (acc, s) => acc + safeNum(s?.amount),
      0,
    );
  }, [provisionalSums]);

  const projectTotal = grossAmount + provisionalTotal + variationsTotal;

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

  const RIBBON_TABS = [
    { id: "home", label: "Home", icon: FaCogs },
    { id: "rates", label: "Rates", icon: FaSync },
    { id: "navigate", label: "Navigate", icon: FaListUl },
    { id: "variations", label: "Variations", icon: FaClipboardList },
    { id: "provisional", label: "Provisional", icon: FaFileInvoiceDollar },
  ];

  const RibbonGroup = ({ title, children }) => (
    <div className="flex flex-col items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 min-w-[110px]">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {title}
      </div>
    </div>
  );

  const RibbonButton = ({ icon: Icon, label, onClick, disabled, title, active }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={[
        "inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] transition",
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : active
          ? "bg-adlm-blue-700 text-white"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      {Icon ? <Icon className="text-sm" /> : null}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Office-style ribbon: tab strip + contextual groups */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 pt-2">
          {RIBBON_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = ribbonTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRibbonTab(tab.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-slate-50 text-adlm-blue-700 border-x border-t border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
                ].join(" ")}
              >
                <Icon className="text-[11px]" />
                {tab.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-3 px-2 text-[11px] text-slate-500">
            <span>
              Measured: <b className="text-slate-700">{money(grossAmount)}</b>
            </span>
            {provisionalTotal > 0 ? (
              <span>
                PC: <b className="text-slate-700">{money(provisionalTotal)}</b>
              </span>
            ) : null}
            {variationsTotal !== 0 ? (
              <span>
                Variations:{" "}
                <b className={variationsTotal > 0 ? "text-amber-700" : "text-red-700"}>
                  {money(variationsTotal)}
                </b>
              </span>
            ) : null}
            <span className="font-semibold">
              Project total:{" "}
              <b className="text-adlm-blue-700">{money(projectTotal)}</b>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-3">
          {ribbonTab === "home" ? (
            <>
              <RibbonGroup title="View">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyFillEmpty}
                    onChange={(e) => onToggleOnlyFillEmpty?.(e.target.checked)}
                    className={checkboxCls}
                  />
                  Only fill empty rates
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={showActualColumns}
                    onChange={(e) =>
                      onToggleShowActualColumns?.(e.target.checked)
                    }
                    className={checkboxCls}
                  />
                  Show actual qty / rate
                </label>
              </RibbonGroup>

              <RibbonGroup title="Stats">
                <div className="text-[11px] text-slate-600">
                  Linked groups:{" "}
                  <b className="text-slate-800">{linkedGroupsCount}</b>
                </div>
                {showActualColumns ? (
                  <div className="text-[11px] text-slate-600">
                    Actual tracked:{" "}
                    <b className="text-slate-800">{money(actualTrackedAmount)}</b>
                  </div>
                ) : null}
              </RibbonGroup>

              {rateInfoText ? (
                <RibbonGroup title="Info">
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-600 max-w-[240px]">
                    <FaInfoCircle className="mt-0.5 text-slate-400" />
                    <span className="leading-tight">{rateInfoText}</span>
                  </div>
                </RibbonGroup>
              ) : null}
            </>
          ) : null}

          {ribbonTab === "rates" ? (
            <>
              {showMaterials && canRateGen ? (
                <RibbonGroup title="Materials">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoFillMaterialsRates}
                      onChange={(e) => onToggleAutoFill?.(e.target.checked)}
                      disabled={autoFillBusy}
                      className={checkboxCls}
                    />
                    Auto-fill (RateGen)
                  </label>
                  <RibbonButton
                    icon={FaSync}
                    label={autoFillBusy ? "Syncing..." : "Sync prices"}
                    onClick={onSyncPrices}
                    disabled={autoFillBusy}
                    title="Fetch prices and auto-fill again"
                  />
                </RibbonGroup>
              ) : null}

              {canRateGenBoq ? (
                <RibbonGroup title="RateGen">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoFillBoqRates}
                      onChange={(e) => onToggleAutoFillBoq?.(e.target.checked)}
                      disabled={autoFillBoqBusy}
                      className={checkboxCls}
                    />
                    Auto-sync rates
                  </label>
                  <RibbonButton
                    icon={FaSync}
                    label={autoFillBoqBusy ? "Syncing..." : "Sync rates"}
                    onClick={onSyncBoqRates}
                    disabled={autoFillBoqBusy}
                    title="Fetch rates from RateGen library and auto-fill"
                  />
                  <label
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"
                    title="When enabled, project rates auto-update when RateGen rates change"
                  >
                    <input
                      type="checkbox"
                      checked={rateSyncEnabled}
                      onChange={(e) =>
                        onToggleRateSyncEnabled?.(e.target.checked)
                      }
                      className={checkboxCls}
                    />
                    Live rate sync
                  </label>
                </RibbonGroup>
              ) : null}

              {!showMaterials && canRateGenBoq ? (
                <RibbonGroup title="Pool">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        rateGenPoolLoading
                          ? "bg-amber-400 animate-pulse"
                          : rateGenPoolLoaded
                          ? "bg-emerald-500"
                          : "bg-slate-300"
                      }`}
                    />
                    {rateGenPoolLoading ? (
                      "Loading rates..."
                    ) : rateGenPoolLoaded ? (
                      <>
                        <b className="text-slate-700">{rateGenPoolCount}</b>{" "}
                        rates loaded
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
                </RibbonGroup>
              ) : null}
            </>
          ) : null}

          {ribbonTab === "navigate" ? (
            <RibbonGroup title="Jump to section">
              {Array.isArray(categoryOptions) && categoryOptions.length
                ? categoryOptions.map((cat) => (
                    <RibbonButton
                      key={`nav-${cat}`}
                      icon={FaListUl}
                      label={cat}
                      onClick={() => jumpToCategory(cat)}
                      title={`Scroll to ${cat}`}
                    />
                  ))
                : null}
              <RibbonButton
                icon={FaClipboardList}
                label="Variations"
                onClick={() => scrollToRef(variationsSectionRef.current)}
              />
              <RibbonButton
                icon={FaFileInvoiceDollar}
                label="Provisional"
                onClick={() => scrollToRef(provisionalSectionRef.current)}
              />
            </RibbonGroup>
          ) : null}

          {ribbonTab === "variations" ? (
            <RibbonGroup title="Instruction variations">
              <RibbonButton
                icon={FaPlus}
                label="Add variation"
                onClick={() => {
                  onAddVariation?.();
                  setTimeout(
                    () => scrollToRef(variationsSectionRef.current),
                    30,
                  );
                }}
                title="Add a variation from a site instruction"
              />
              <RibbonButton
                icon={FaListUl}
                label="Go to list"
                onClick={() => scrollToRef(variationsSectionRef.current)}
              />
              <div className="text-[11px] text-slate-600">
                Current total:{" "}
                <b
                  className={
                    variationsTotal > 0
                      ? "text-amber-700"
                      : variationsTotal < 0
                      ? "text-red-700"
                      : "text-slate-700"
                  }
                >
                  {money(variationsTotal)}
                </b>
              </div>
            </RibbonGroup>
          ) : null}

          {ribbonTab === "provisional" ? (
            <RibbonGroup title="Provisional sums">
              <RibbonButton
                icon={FaPlus}
                label="Add sum"
                onClick={() => {
                  onAddProvisionalSum?.();
                  setTimeout(
                    () => scrollToRef(provisionalSectionRef.current),
                    30,
                  );
                }}
                title="Add a provisional / PC sum"
                disabled={!onAddProvisionalSum}
              />
              <RibbonButton
                icon={FaListUl}
                label="Go to list"
                onClick={() => scrollToRef(provisionalSectionRef.current)}
              />
              <div className="text-[11px] text-slate-600">
                Current total:{" "}
                <b className="text-slate-800">{money(provisionalTotal)}</b>
              </div>
            </RibbonGroup>
          ) : null}
        </div>

        {showActualColumns && ribbonTab === "home" ? (
          <div className="border-t bg-white px-3 py-2 text-[11px] text-slate-500">
            Actual amount uses the entered actual qty and actual rate. If only
            one actual field is entered, the other value falls back to the
            planned quantity or rate for comparison.
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
              <col style={{ width: showActualColumns ? "22%" : "28%" }} />      {/* Description — % based */}
              <col className="w-16" />                                          {/* Qty */}
              <col className="w-10" />                                          {/* Unit */}
              <col style={{ width: showActualColumns ? "12%" : "16%" }} />      {/* Rate */}
              {showActualColumns ? <col className="w-[100px]" /> : null}        {/* Actual qty */}
              {showActualColumns ? <col className="w-[100px]" /> : null}        {/* Actual rate */}
              {showActualColumns ? <col className="w-[90px]" /> : null}         {/* Actual amount */}
              {showActualColumns ? <col className="w-[72px]" /> : null}         {/* Actual added */}
              <col className="w-[90px]" />                                      {/* Gross amount */}
              <col className="w-[72px]" />                                      {/* Deducted */}
              <col className="w-[72px]" />                                      {/* Balance */}
              <col className="w-[80px]" />                                      {/* Actions */}
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
                <th className="px-2 py-2 text-xs text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {groupedRows.map(({ category, rows }, gIdx) => (
                <React.Fragment key={`cat-${category}`}>
                  <tr
                    ref={(el) => {
                      categoryAnchorRef.current[category] = el;
                    }}
                    className="border-t-2 border-adlm-blue-200 bg-slate-100 scroll-mt-24"
                    data-section={`cat-${category}`}
                  >
                    <td colSpan={totalCols} className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          {category}
                        </span>
                        <span className="text-[11px] text-slate-600">
                          {rows.length} {rows.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {rows.map((row, displayIndex) => {
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

                const isDragging = dragIdx === row.i;
                const isOver = dragOverIdx === row.i;

                return (
                  <tr
                    key={row.key || row.i}
                    draggable={!sortCol}
                    onDragStart={(e) => {
                      setDragIdx(row.i);
                      e.dataTransfer.effectAllowed = "move";
                      // Make the drag image semi-transparent
                      if (e.currentTarget) {
                        e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragIdx != null && row.i !== dragIdx) {
                        setDragOverIdx(row.i);
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverIdx((prev) => (prev === row.i ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx != null && dragIdx !== row.i) {
                        onMoveItem?.(dragIdx, row.i);
                      }
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={[
                      "border-t align-top transition-colors",
                      isDragging ? "opacity-40 bg-slate-100" : row.isMarked ? "bg-emerald-50/40" : "bg-white",
                      isOver && dragIdx != null && dragIdx !== row.i
                        ? dragIdx < row.i
                          ? "border-b-2 border-b-adlm-blue-700"
                          : "border-t-2 border-t-adlm-blue-700"
                        : "",
                    ].join(" ")}
                  >
                    {/* Drag handle + S/N */}
                    <td className="px-1 py-2">
                      <div className="flex items-center gap-1">
                        {!sortCol && (
                          <span
                            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
                            title="Drag to reorder"
                          >
                            <FaGripVertical className="text-[10px]" />
                          </span>
                        )}
                        <span className="font-medium text-slate-700">{displayIndex + 1}</span>
                      </div>
                    </td>

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
                      {onCategoryChange && categoryOptions?.length ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>Category:</span>
                          <select
                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700 focus:border-adlm-blue-500 focus:outline-none"
                            value={row.category || ""}
                            onChange={(e) => onCategoryChange(row.i, e.target.value)}
                            title="Re-classify this item"
                          >
                            {categoryOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                            {row.category && !categoryOptions.includes(row.category) ? (
                              <option value={row.category}>{row.category}</option>
                            ) : null}
                          </select>
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

                    {/* Actions: move up / move down / delete */}
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                          disabled={row.i === 0}
                          onClick={() => onMoveItem?.(row.i, row.i - 1)}
                        >
                          <FaArrowUp className="text-[10px]" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                          disabled={row.i >= items.length - 1}
                          onClick={() => onMoveItem?.(row.i, row.i + 1)}
                        >
                          <FaArrowDown className="text-[10px]" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                          title="Delete row"
                          onClick={() => {
                            if (window.confirm(`Delete "${row.description}"?`)) {
                              onDeleteItem?.(row.i);
                            }
                          }}
                        >
                          <FaTrashAlt className="text-[10px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
                  <tr className="border-t bg-slate-50 text-xs font-medium text-slate-800">
                    <td colSpan={6} className="px-2 py-2 text-right">
                      Subtotal — {category}
                    </td>
                    {showActualColumns ? <td className="px-2 py-2" /> : null}
                    {showActualColumns ? <td className="px-2 py-2" /> : null}
                    {showActualColumns ? <td className="px-2 py-2" /> : null}
                    {showActualColumns ? <td className="px-2 py-2" /> : null}
                    <td className="px-2 py-2">
                      {money(categoryTotals[gIdx]?.fullAmount || 0)}
                    </td>
                    <td className="px-2 py-2 text-emerald-700">
                      {money(categoryTotals[gIdx]?.valuedAmount || 0)}
                    </td>
                    <td className="px-2 py-2">
                      {money(categoryTotals[gIdx]?.balance || 0)}
                    </td>
                    <td className="px-2 py-2" />
                  </tr>
                </React.Fragment>
              ))}
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
                <td className="px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {computedShown.length && categoryTotals.length > 1 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-900">Summary by category</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2 text-right">Items</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">Deducted</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {categoryTotals.map((t) => (
                  <tr key={`sum-${t.category}`} className="border-t">
                    <td className="px-2 py-2 font-medium text-slate-800">{t.category}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{t.count}</td>
                    <td className="px-2 py-2 text-right text-slate-900">{money(t.fullAmount)}</td>
                    <td className="px-2 py-2 text-right text-emerald-700">{money(t.valuedAmount)}</td>
                    <td className="px-2 py-2 text-right text-slate-900">{money(t.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold text-slate-900">
                <tr className="border-t">
                  <td className="px-2 py-2">Total</td>
                  <td className="px-2 py-2 text-right">
                    {categoryTotals.reduce((acc, t) => acc + t.count, 0)}
                  </td>
                  <td className="px-2 py-2 text-right">{money(grossAmount)}</td>
                  <td className="px-2 py-2 text-right text-emerald-700">{money(valuedAmount)}</td>
                  <td className="px-2 py-2 text-right">{money(remainingAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {onAddVariation ? (
        <div
          ref={variationsSectionRef}
          className="rounded-xl border border-slate-200 bg-white p-4 scroll-mt-24"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Variations — Site Instructions / Change Orders
              </div>
              <div className="text-[11px] text-slate-500">
                Log variations that come from architect's instructions, client
                changes or site directives. These are tracked against the
                project total separately from measured-work variance (which is
                captured per item via actual qty / rate).
              </div>
            </div>
            <button
              type="button"
              className="btn btn-xs"
              onClick={onAddVariation}
              title="Add variation row"
            >
              + Add variation
            </button>
          </div>

          {variations.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-2 w-10">#</th>
                    <th className="px-2 py-2 w-28">Reference</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 w-24 text-right">Qty</th>
                    <th className="px-2 py-2 w-20">Unit</th>
                    <th className="px-2 py-2 w-28 text-right">Rate</th>
                    <th className="px-2 py-2 w-32 text-right">Amount</th>
                    <th className="px-2 py-2 w-28">Issued</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {variations.map((v, i) => {
                    const qty = safeNum(v?.qty);
                    const rate = safeNum(v?.rate);
                    const amount = qty * rate;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs"
                            type="text"
                            placeholder="AI-001"
                            value={v?.reference || ""}
                            onChange={(e) =>
                              onUpdateVariation?.(i, {
                                reference: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs"
                            type="text"
                            placeholder="e.g. Additional skirting in owner's study"
                            value={v?.description || ""}
                            onChange={(e) =>
                              onUpdateVariation?.(i, {
                                description: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs text-right"
                            type="number"
                            step="any"
                            placeholder="0"
                            value={
                              v?.qty === 0 || v?.qty == null ? "" : v.qty
                            }
                            onChange={(e) =>
                              onUpdateVariation?.(i, {
                                qty:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs"
                            type="text"
                            placeholder="m, m2, No"
                            value={v?.unit || ""}
                            onChange={(e) =>
                              onUpdateVariation?.(i, { unit: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs text-right"
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={
                              v?.rate === 0 || v?.rate == null ? "" : v.rate
                            }
                            onChange={(e) =>
                              onUpdateVariation?.(i, {
                                rate:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-slate-900">
                          {money(amount)}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs"
                            type="date"
                            value={v?.issuedAt || ""}
                            onChange={(e) =>
                              onUpdateVariation?.(i, {
                                issuedAt: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Remove this variation"
                            onClick={() => onRemoveVariation?.(i)}
                          >
                            <FaTrashAlt className="text-[10px]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900">
                  <tr className="border-t">
                    <td className="px-2 py-2" colSpan={6}>
                      Total variations
                    </td>
                    <td className="px-2 py-2 text-right">
                      {money(variationsTotal)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No variations logged yet. Click "+ Add variation" to record a
              site instruction or change order.
            </div>
          )}
        </div>
      ) : null}

      {onAddProvisionalSum ? (
        <div
          ref={provisionalSectionRef}
          className="rounded-xl border border-slate-200 bg-white p-4 scroll-mt-24"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Provisional Sums</div>
              <div className="text-[11px] text-slate-500">
                Add PC sums and provisional items not derived from the takeoff (e.g. allowances, statutory fees, specialist works). Saved with the project and exported as a separate sheet.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-xs"
              onClick={onAddProvisionalSum}
              title="Add provisional sum row"
            >
              + Add provisional sum
            </button>
          </div>

          {provisionalSums.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-2 w-10">#</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 w-40 text-right">Amount</th>
                    <th className="px-2 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {provisionalSums.map((s, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2">
                        <input
                          className="input !h-8 w-full !px-2 text-xs"
                          type="text"
                          placeholder="e.g. PC sum for kitchen fittings"
                          value={s?.description || ""}
                          onChange={(e) =>
                            onUpdateProvisionalSum?.(i, { description: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="input !h-8 w-full !px-2 text-xs text-right"
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={s?.amount === 0 || s?.amount == null ? "" : s.amount}
                          onChange={(e) =>
                            onUpdateProvisionalSum?.(i, {
                              amount: e.target.value === "" ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Remove this row"
                          onClick={() => onRemoveProvisionalSum?.(i)}
                        >
                          <FaTrashAlt className="text-[10px]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900">
                  <tr className="border-t">
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2">Total provisional sums</td>
                    <td className="px-2 py-2 text-right">
                      {money(
                        provisionalSums.reduce(
                          (acc, s) => acc + (Number(s?.amount) || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No provisional sums added yet. Click "+ Add provisional sum" to start.
            </div>
          )}
        </div>
      ) : null}

      {(provisionalTotal > 0 || variationsTotal !== 0 || computedShown.length) ? (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
          <div className="text-sm font-semibold text-slate-900 mb-2">
            Project total
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Measured work</div>
              <div className="text-sm font-semibold text-slate-900">
                {money(grossAmount)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Provisional sums</div>
              <div className="text-sm font-semibold text-slate-900">
                {money(provisionalTotal)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Variations (instructions)</div>
              <div
                className={`text-sm font-semibold ${
                  variationsTotal > 0
                    ? "text-amber-700"
                    : variationsTotal < 0
                    ? "text-red-700"
                    : "text-slate-900"
                }`}
              >
                {money(variationsTotal)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Total project cost</div>
              <div className="text-base font-bold text-adlm-blue-700">
                {money(projectTotal)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
