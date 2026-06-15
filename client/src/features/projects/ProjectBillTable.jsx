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
  FaChevronUp,
  FaChevronDown,
} from "react-icons/fa";
import SectionRail from "./SectionRail.jsx";

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

// Compact percent-complete input for the BoQ row's status column. When the
// item is already ratified the input is locked to 100 — the user toggles
// the checkbox to free it back up. Any partial value flows through to
// valuation immediately because the BoQ summary derives valuedAmount
// from the same valuationFactor (see computedAll in ProjectsGeneric).
function PercentInline({ row, percentMap, onPercentChange, showLabel = false }) {
  const isRatified = Boolean(row?.isMarked);
  const value =
    percentMap?.[row.key] != null
      ? Math.max(0, Math.min(100, Number(percentMap[row.key]) || 0))
      : Math.max(0, Math.min(100, Number(row?.percentComplete) || 0));
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1 py-0.5 text-[10px] ${
        isRatified
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : value > 0
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-500"
      }`}
      title={
        isRatified
          ? "Fully ratified (100%)"
          : "Enter the percentage of this line that's been done. Partial values are paid pro-rata at valuation."
      }
    >
      {showLabel ? <span className="font-medium">Done</span> : null}
      <input
        type="number"
        min="0"
        max="100"
        step="5"
        value={isRatified ? 100 : value}
        disabled={isRatified}
        onChange={(e) => {
          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
          onPercentChange?.(row.i, v);
        }}
        className="w-10 bg-transparent text-right tabular-nums focus:outline-none disabled:opacity-70"
      />
      <span>%</span>
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

// ────────────────────────────────────────────────────────────────────
// Excel-style formula evaluator for the BoQ Rate cell.
//
// Users often paste expressions like `=1.2*1.5*95000` (width × height ×
// unit rate) or `=(45+12)*250` (multiple components × rate). The cell
// detects the leading `=`, validates the expression with a strict
// regex (digits, decimals, +-*/(), %, whitespace only), and evaluates
// via Function() so we don't fall into eval()'s global scope.
//
// Returns { ok, value, error }:
//   • ok=true  → value is the evaluated number
//   • ok=false → error describes why (invalid chars, parse fail, etc.)
//
// This is exposed at module scope (not just RateCell) so the formula
// tool can be reused in any numeric cell later (qty, etc.).
// ────────────────────────────────────────────────────────────────────
function evaluateFormula(raw) {
  if (typeof raw !== "string") return { ok: false, error: "Not a string" };
  const stripped = raw.replace(/^=/, "").trim();
  if (!stripped) return { ok: false, error: "Empty formula" };
  // Whitelist: digits, dot, basic operators, parentheses, whitespace.
  // % is allowed so `=1500*5%` works (we translate % → /100 below).
  if (!/^[\d.+\-*/()\s%]+$/.test(stripped)) {
    return { ok: false, error: "Only +, -, *, /, (, ), %, digits allowed" };
  }
  // Translate trailing-% notation: e.g. `25%` → `(25/100)`.
  const translated = stripped.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  try {
    // eslint-disable-next-line no-new-func
    const value = Function("\"use strict\"; return (" + translated + ");")();
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Result is not finite" };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err?.message || "Parse error" };
  }
}

function isFormulaInput(s) {
  return typeof s === "string" && s.trim().startsWith("=");
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
export function RateCell({
  value,
  placeholder,
  onChange,
  onSearchRateGen,
  canRateGenBoq,
  boqCandidates = [],
  itemUnit = "",
  itemDescription = "",
  // When true the cell renders as a read-only chip with a lock icon.
  // The popup never opens and onChange never fires, so the rate is
  // frozen until the contract is unlocked.
  disabled = false,
  disabledHint = "Locked — unlock the contract to edit rates.",
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

  // Track the in-progress formula text. While the user is typing
  // `=1.2*1.5*95000` we keep the raw expression in state and only
  // commit the evaluated number to the parent on Enter / blur.
  const [formulaDraft, setFormulaDraft] = useState("");
  const formulaResult = isFormulaInput(formulaDraft)
    ? evaluateFormula(formulaDraft)
    : null;

  const commitFormula = () => {
    if (!formulaResult) return false;
    if (formulaResult.ok) {
      const rounded = Math.round(formulaResult.value * 100) / 100;
      onChange?.(String(rounded));
      setFormulaDraft("");
      setSearchQuery("");
      setSearchResults([]);
      setFocused(false);
      return true;
    }
    return false;
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    // Formula mode — starts with `=`. Store the raw text and show a
    // live preview underneath the input; commit on Enter / blur via
    // commitFormula.
    if (isFormulaInput(v)) {
      setFormulaDraft(v);
      setSearchQuery("");
      setSearchResults([]);
      return;
    }
    // Clear any previous formula draft when the user leaves formula mode.
    if (formulaDraft) setFormulaDraft("");
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

  // Hard-block focus + change when disabled. Keeps the same look-and-feel
  // as an editable cell so the layout doesn't shift, but the popup never
  // opens and the value can't drift.
  if (disabled) {
    return (
      <div
        className="input !h-8 w-full !min-w-0 !px-1.5 !py-0.5 text-xs text-left text-slate-600 bg-slate-50 cursor-not-allowed border-slate-200 flex items-center gap-1"
        title={disabledHint}
      >
        <span aria-hidden="true" className="text-[10px] text-slate-400">🔒</span>
        <span className="truncate">
          {displayValue || (
            <span className="text-slate-400">{formatRate(placeholder) || "0"}</span>
          )}
        </span>
      </div>
    );
  }

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
              className={`input !h-9 w-full !px-2 !py-1 text-sm ${
                formulaResult && !formulaResult.ok ? "!border-rose-400" : ""
              } ${
                formulaResult && formulaResult.ok ? "!border-emerald-400" : ""
              }`}
              type="text"
              value={
                formulaDraft ||
                searchQuery ||
                (value != null && value !== "" ? String(value) : "")
              }
              placeholder={canRateGenBoq ? "Enter rate, =formula, or type a name…" : "Enter rate or =formula…"}
              onChange={handleInputChange}
              onBlur={() => {
                // Commit formula on blur if we have a valid result —
                // mirrors Excel's behaviour. Invalid formulas stay in
                // the draft so the user can fix them without losing
                // their work.
                if (formulaResult && formulaResult.ok) commitFormula();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setFocused(false);
                  setSearchQuery("");
                  setFormulaDraft("");
                  return;
                }
                if (e.key === "Enter") {
                  // Enter while in formula mode commits the result
                  // (and closes the popup). Default behaviour for
                  // other inputs handled elsewhere.
                  if (formulaResult) {
                    e.preventDefault();
                    commitFormula();
                  }
                }
              }}
            />
            {/* Live formula preview / hint strip */}
            {formulaResult ? (
              <div
                className={`mt-1 rounded-md border px-2 py-1 text-[11px] ${
                  formulaResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {formulaResult.ok ? (
                  <span>
                    <span className="opacity-70">= </span>
                    <strong>{formatRate(formulaResult.value) || formulaResult.value}</strong>
                    <span className="ml-2 text-[10px] opacity-70">
                      Press Enter or click away to apply
                    </span>
                  </span>
                ) : (
                  <span>
                    <strong>Formula error:</strong> {formulaResult.error}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-slate-400">
                Tip: start with <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-mono">=</code> for a formula
                — e.g. <code className="font-mono">=1.2*1.5*95000</code>
                {canRateGenBoq ? " · or type a name to search RateGen" : ""}
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
 * for Actual Qty / Actual Rate fields and the materials view.
 *
 * Supports Excel-style formula entry: anything starting with "=" is
 * parsed by evaluateFormula (=1.2*1.5*95000 → 171000) and the result
 * is committed on Enter or blur. A small live-preview strip shows
 * the evaluated number while you type, with a red error chip when
 * the expression is invalid.
 */
function ExpandInput({ value, placeholder, onChange, type = "number" }) {
  const [focused, setFocused] = useState(false);
  // Holds the raw =-prefixed expression while the user is typing it.
  // Cleared once committed (commitFormula clears it; switching away
  // from formula mode also clears it).
  const [formulaDraft, setFormulaDraft] = useState("");
  const wrapRef = useRef(null);

  const formulaResult = isFormulaInput(formulaDraft)
    ? evaluateFormula(formulaDraft)
    : null;

  useEffect(() => {
    if (!focused) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        // Commit a pending valid formula before closing on outside click.
        if (formulaResult && formulaResult.ok) {
          onChange?.(
            String(Math.round(formulaResult.value * 100) / 100),
          );
        }
        setFocused(false);
        setFormulaDraft("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [focused, formulaResult, onChange]);

  const commitFormula = () => {
    if (!formulaResult || !formulaResult.ok) return false;
    onChange?.(String(Math.round(formulaResult.value * 100) / 100));
    setFormulaDraft("");
    setFocused(false);
    return true;
  };

  const handleChange = (e) => {
    const v = e.target.value;
    if (isFormulaInput(v)) {
      // Stash the formula text; don't propagate to parent until commit.
      setFormulaDraft(v);
      return;
    }
    if (formulaDraft) setFormulaDraft("");
    onChange?.(v);
  };

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
        className={`input !h-9 w-full !px-2 !py-1 text-sm shadow-lg rounded-lg ${
          formulaResult && !formulaResult.ok
            ? "border-rose-400"
            : formulaResult && formulaResult.ok
              ? "border-emerald-400"
              : "border-blue-300"
        }`}
        // Allow text input when the user is typing a formula
        // (numbers don't permit "=").
        type={formulaDraft ? "text" : type}
        step="any"
        value={formulaDraft || value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFormulaDraft("");
            setFocused(false);
            return;
          }
          if (e.key === "Enter") {
            if (formulaResult) {
              e.preventDefault();
              commitFormula();
            } else {
              setFocused(false);
            }
          }
        }}
      />
      {/* Live formula preview — green when valid, rose when not. Hides
          when the input isn't a formula. */}
      {formulaResult ? (
        <div
          className={`mt-1 rounded-md border px-2 py-1 text-[11px] ${
            formulaResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {formulaResult.ok ? (
            <span>
              <span className="opacity-70">= </span>
              <strong>
                {formatRate(formulaResult.value) || formulaResult.value}
              </strong>
              <span className="ml-2 text-[10px] opacity-70">
                Enter to apply
              </span>
            </span>
          ) : (
            <span>
              <strong>Formula error:</strong> {formulaResult.error}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-slate-400 px-1">
          Tip: start with <code className="rounded bg-slate-100 px-1 font-mono">=</code>{" "}
          for a formula (e.g. <code className="font-mono">=1.2*1.5</code>)
        </div>
      )}
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
  // PM dashboard payload — used here only to read its boqItems, which
  // carry linkCount + linkedTaskNames per identity. Lets us render a
  // small "Linked to N task(s)" chip on each BoQ row.
  pmDashboard,
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
  percentMap = {},
  onPercentChange,
  onCategoryChange,
  onAddCategory,
  onAddTrade,
  categoryOptions = [],
  // Set of bill codes (lowercased) whose rate is derived from a priced
  // material/labour build-up — those rate cells render read-only.
  budgetDrivenCodes,
  tradeOptions = [],
  onTradeChange,
  groupByMode = "category",
  onGroupByModeChange,
  contractLocked = false,
  contractLockedAt = null,
  contractApprovedAt = null,
  contractSum = 0,
  preliminaryPercent = 7.5,
  // Contingency + tax (VAT) as percentages of (measured + prov + prelim)
  // and (subtotal + contingency) respectively. The QS grand summary
  // cascade: Sub-total → +Contingency → +VAT → Planned Total. Default
  // values match Nigerian QS practice but are user-editable.
  contingencyPercent = 5,
  taxPercent = 7.5,
  onContingencyPercentChange,
  onTaxPercentChange,
  contractBusy = false,
  onLockContract,
  onUnlockContract,
  onPreliminaryPercentChange,
  provisionalSums = [],
  onAddProvisionalSum,
  onUpdateProvisionalSum,
  onRemoveProvisionalSum,
  variations = [],
  onAddVariation,
  onUpdateVariation,
  onRemoveVariation,
  preliminaryItems = [],
  onUpdatePreliminaryItem,
  onAddPreliminaryItem,
  onRemovePreliminaryItem,
  onNormalizePreliminaryAllocations,
  // ── Undo stack for accidental deletes ─────────────────────────────
  // boqUndoStack: array of { id, kind, item, index, label, ts } —
  //   most recent first, capped at 5 entries by the parent.
  // onBoqUndo(id): restore the entry with that id.
  // onBoqUndoClear: dismiss the entire stack (used when user is sure).
  boqUndoStack = [],
  onBoqUndo,
  onBoqUndoClear,
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

  // Build a Map<identity → {count, taskNames}> from the PM dashboard's
  // boqItems list. The server already computes linkCount + linkedTaskNames
  // for every BoQ entry by walking projectManagement.tasks. We just need
  // a quick lookup keyed by identity so each row can read its own stats.
  const boqLinkStats = React.useMemo(() => {
    const map = new Map();
    const boqs = Array.isArray(pmDashboard?.boqItems) ? pmDashboard.boqItems : [];
    for (const entry of boqs) {
      const count = Number(entry?.linkCount) || 0;
      if (count > 0) {
        map.set(String(entry.identity), {
          count,
          taskNames: Array.isArray(entry.linkedTaskNames) ? entry.linkedTaskNames : [],
          // totalLinkWeight is the sum of weights across every task
          // linking to this item. 100 = balanced, <100 = under-allocated
          // (gap in WBS coverage), >100 = over-allocated (double-count).
          totalWeight: Number(entry?.totalLinkWeight) || 0,
        });
      }
    }
    return map;
  }, [pmDashboard?.boqItems]);

  // Client-side mirror of the server's itemIdentity hashing (see
  // server/services/pmCompute.js → itemIdentity). MUST stay in sync —
  // otherwise the row's identity won't match the boqLinkStats key.
  function boqItemIdentity(item, index) {
    const sn = Number(item?.sn) || index + 1;
    return [
      sn,
      String(item?.code || "").trim().toLowerCase(),
      String(item?.description || "").trim().toLowerCase(),
      String(item?.takeoffLine || "").trim().toLowerCase(),
      String(item?.materialName || "").trim().toLowerCase(),
      String(item?.unit || "").trim().toLowerCase(),
    ].join("::");
  }
  // PIN modal state — mode is 'lock' (set a new PIN) or 'unlock' (verify
  // the saved PIN). null = closed. busy/err drive in-modal feedback so
  // wrong-PIN attempts don't fall through to a global toast.
  const [pinModal, setPinModal] = useState(null); // { mode, pin, confirm, err, busy } | null
  // Collapsed state for the BoQ ribbon. Persisted in localStorage so users
  // who don't need the tools strip can keep it folded across sessions.
  const [ribbonCollapsed, setRibbonCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("adlm:boqRibbonCollapsed") === "1";
    } catch {
      return false;
    }
  });
  function toggleRibbonCollapsed() {
    setRibbonCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("adlm:boqRibbonCollapsed", next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }

  // Anchors for jump-to-section
  const categoryAnchorRef = useRef({});
  const provisionalSectionRef = useRef(null);
  const variationsSectionRef = useRef(null);
  const preliminarySectionRef = useRef(null);
  const topAnchorRef = useRef(null);
  const bottomAnchorRef = useRef(null);

  // Section jumps use behavior: "auto" (instant) instead of "smooth".
  // Long smooth-scrolls give users a "dizzy" feeling — the user feedback
  // was that on a 50+ item BoQ, an animated scroll across 4 screens of
  // content is more disorienting than helpful. Instant jumps put the
  // target on screen immediately so the eye can re-anchor faster.
  const scrollToRef = useCallback((node) => {
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: "auto", block: "start" });
    } catch {
      node.scrollIntoView();
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (topAnchorRef.current) {
      scrollToRef(topAnchorRef.current);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [scrollToRef]);

  const scrollToBottom = useCallback(() => {
    if (bottomAnchorRef.current) {
      try {
        bottomAnchorRef.current.scrollIntoView({
          behavior: "auto",
          block: "end",
        });
      } catch {
        bottomAnchorRef.current.scrollIntoView();
      }
    } else {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "auto",
      });
    }
  }, []);

  // Track whether the floating nav should show (hide when content fits on
  // screen so we don't clutter short BoQs).
  const [showFloatNav, setShowFloatNav] = useState(false);
  useEffect(() => {
    function compute() {
      setShowFloatNav(window.innerHeight < document.documentElement.scrollHeight - 200);
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, { passive: true });
    const id = window.setInterval(compute, 1500); // catches DOM growth from late renders
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute);
      window.clearInterval(id);
    };
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

  // Group rows by either category (building element) or trade (work section)
  // depending on groupByMode. Canonical order first, unknowns last.
  const isTradeGrouping = String(groupByMode || "category") === "trade";
  const activeCanonical = isTradeGrouping
    ? Array.isArray(tradeOptions)
      ? tradeOptions
      : []
    : Array.isArray(categoryOptions)
    ? categoryOptions
    : [];

  const groupedRows = React.useMemo(() => {
    const map = new Map();
    for (const row of sortedShown) {
      const key = isTradeGrouping
        ? String(row.trade || "Other").trim() || "Other"
        : String(row.category || "Uncategorized").trim() || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    const ordered = [
      ...activeCanonical
        .filter((c) => map.has(c))
        .map((c) => ({ category: c, rows: map.get(c) })),
      ...[...map.entries()]
        .filter(([c]) => !activeCanonical.includes(c))
        .map(([c, rows]) => ({ category: c, rows })),
    ];
    return ordered;
  }, [sortedShown, activeCanonical, isTradeGrouping]);

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

  // Preliminaries are a % of (measured + provisional). Variations are tracked
  // separately and added to the planned contract sum so the client sees the
  // true project cost.
  const preliminaryAmount =
    ((grossAmount + provisionalTotal) * safeNum(preliminaryPercent)) / 100;

  // Preliminary done: share of the preliminary pool "earned" by completed
  // preliminary line items (weighted by allocation %).
  const preliminaryAllocTotal = React.useMemo(() => {
    return (Array.isArray(preliminaryItems) ? preliminaryItems : []).reduce(
      (acc, p) => acc + safeNum(p?.allocation),
      0,
    );
  }, [preliminaryItems]);
  const preliminaryAllocCompleted = React.useMemo(() => {
    return (Array.isArray(preliminaryItems) ? preliminaryItems : []).reduce(
      (acc, p) => (p?.completed ? acc + safeNum(p?.allocation) : acc),
      0,
    );
  }, [preliminaryItems]);
  const preliminaryAllocBase =
    preliminaryAllocTotal > 0 ? preliminaryAllocTotal : 100;
  const preliminaryDone =
    (preliminaryAmount * preliminaryAllocCompleted) / preliminaryAllocBase;
  const preliminaryOutstanding = Math.max(0, preliminaryAmount - preliminaryDone);

  // QS grand-summary cascade:
  //   Sub-total = measured + provisional + preliminaries
  //   Contingency = sub-total × contingency%
  //   Tax (VAT) = (sub-total + contingency) × tax%
  //   Planned Total = sub-total + contingency + tax
  //   Current Total = Planned + variations (claimed during execution)
  const boqSubtotal = grossAmount + provisionalTotal + preliminaryAmount;
  const contingencyAmount =
    (boqSubtotal * safeNum(contingencyPercent)) / 100;
  const taxAmount =
    ((boqSubtotal + contingencyAmount) * safeNum(taxPercent)) / 100;
  const plannedProjectTotal =
    boqSubtotal + contingencyAmount + taxAmount;
  // projectTotal is the LIVE total — what users actually owe today
  // (planned + variations issued so far).
  const projectTotal = plannedProjectTotal + variationsTotal;

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
    { id: "contract", label: "Contract", icon: FaFileInvoiceDollar },
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

  // ── Build the side-rail section list ────────────────────────────────
  // Pull together every navigable anchor (categories from the current
  // grouping + the prelim / PC / variations sections) into one list the
  // rail can render. Each entry is a getter so the rail reads the LIVE
  // DOM node — anchors mounted late (e.g. variations only appears once
  // a variation exists) won't be missed.
  const railSections = React.useMemo(() => {
    const out = [];
    // Categories from the active grouping. Use groupedRows so the
    // order matches what the user actually sees.
    for (const grp of groupedRows) {
      const cat = String(grp?.category || "").trim();
      if (!cat) continue;
      out.push({
        id: `cat-${cat}`,
        label: cat,
        badge: isTradeGrouping ? "Trade" : "Cat",
        refGetter: () => categoryAnchorRef.current?.[cat] || null,
      });
    }
    // The three "extra scope" sections — only added when they have
    // mount targets in the DOM. preliminarySectionRef etc. are nulled
    // when the section isn't rendered, so refGetter returning null
    // hides the row automatically.
    if (preliminarySectionRef.current) {
      out.push({
        id: "preliminaries",
        label: "Preliminaries",
        badge: "Pre",
        refGetter: () => preliminarySectionRef.current,
      });
    }
    if (provisionalSectionRef.current) {
      out.push({
        id: "provisional",
        label: "Provisional sums",
        badge: "PC",
        refGetter: () => provisionalSectionRef.current,
      });
    }
    if (variationsSectionRef.current) {
      out.push({
        id: "variations",
        label: "Variations",
        badge: "Var",
        refGetter: () => variationsSectionRef.current,
      });
    }
    return out;
    // groupedRows + the section refs change rarely, so this memo is
    // cheap; the refs themselves don't trigger a recompute by design
    // (they're populated by mount callbacks).
  }, [groupedRows, isTradeGrouping]);

  return (
    <div className="relative flex gap-4">
      {/* Persistent jump-to-section rail. On xl+ this is a sticky
          vertical menu; on smaller screens it collapses to a floating
          pill in the bottom-right that opens a drawer. */}
      <SectionRail
        title="Bill of Quantities"
        sections={railSections}
        scrollOffset={96}
        onScrollTop={scrollToTop}
        onScrollBottom={scrollToBottom}
      />

      <div className="flex-1 min-w-0 space-y-4">
      <div ref={topAnchorRef} className="scroll-mt-24" aria-hidden="true" />

      {/* Floating Undo bar — sticky at top while any delete is in the
          stack. Lets users recover from accidental trash clicks. */}
      {Array.isArray(boqUndoStack) && boqUndoStack.length > 0 ? (
        <BoqUndoBar
          stack={boqUndoStack}
          onUndo={onBoqUndo}
          onClear={onBoqUndoClear}
        />
      ) : null}

      {/* Office-style ribbon: tab strip + contextual groups */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-depth">
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
            {/* Collapse / expand the entire ribbon panel. The summary row
                (Measured / PC / Variations / Project total) stays visible
                either way so users keep their at-a-glance totals. */}
            <button
              type="button"
              onClick={toggleRibbonCollapsed}
              aria-expanded={!ribbonCollapsed}
              aria-controls="boq-ribbon-body"
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              title={ribbonCollapsed ? "Show toolbar" : "Hide toolbar"}
            >
              <span aria-hidden="true" className={`inline-block transition-transform ${ribbonCollapsed ? "" : "rotate-180"}`}>▾</span>
              {ribbonCollapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>

        {ribbonCollapsed ? null : (
        <div id="boq-ribbon-body" className="flex flex-wrap gap-2 p-3">
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

              <RibbonGroup title="Grouping">
                <div
                  className="inline-flex items-center overflow-hidden rounded-md border border-slate-200 bg-white text-[11px]"
                  role="tablist"
                  aria-label="Group BoQ items by"
                >
                  <button
                    type="button"
                    onClick={() => onGroupByModeChange?.("category")}
                    className={[
                      "px-2.5 py-1 transition",
                      !isTradeGrouping
                        ? "bg-adlm-blue-700 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                    title="Group by building element (Substructure / Superstructure / HVAC / Plumbing / Electrical)"
                  >
                    Category
                  </button>
                  <button
                    type="button"
                    onClick={() => onGroupByModeChange?.("trade")}
                    className={[
                      "px-2.5 py-1 transition border-l border-slate-200",
                      isTradeGrouping
                        ? "bg-adlm-blue-700 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                    title="Group by trade / work section (Concrete Works, Formwork, Reinforcement, Masonry, Finishes, etc.)"
                  >
                    Trade
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 max-w-[160px] leading-tight">
                  {isTradeGrouping
                    ? "Items are grouped by the work being done. Overrides train the learner."
                    : "Items are grouped by the element they belong to."}
                </div>
                {(isTradeGrouping ? onAddTrade : onAddCategory) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const label = isTradeGrouping ? "work section" : "category";
                      const name =
                        typeof window !== "undefined"
                          ? window.prompt(`New ${label} name`)
                          : "";
                      const t = String(name || "").trim();
                      if (!t) return;
                      if (isTradeGrouping) onAddTrade?.(t);
                      else onAddCategory?.(t);
                    }}
                    className="mt-1 inline-flex items-center gap-1 self-start rounded-md border border-dashed border-adlm-blue-300 bg-white px-2 py-1 text-[10px] font-semibold text-adlm-blue-700 hover:bg-blue-50"
                    title="Create a new category / work section — remembered for your future projects"
                  >
                    + New {isTradeGrouping ? "section" : "category"}
                  </button>
                ) : null}
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
            <>
              <RibbonGroup title={isTradeGrouping ? "Jump to trade" : "Jump to category"}>
                {activeCanonical.length
                  ? activeCanonical.map((cat) => (
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
                  icon={FaClipboardList}
                  label="Preliminaries"
                  onClick={() => scrollToRef(preliminarySectionRef.current)}
                />
                <RibbonButton
                  icon={FaFileInvoiceDollar}
                  label="Provisional"
                  onClick={() => scrollToRef(provisionalSectionRef.current)}
                />
              </RibbonGroup>

              <RibbonGroup title="Page">
                <RibbonButton
                  icon={FaChevronUp}
                  label="Top"
                  onClick={scrollToTop}
                  title="Scroll to top of BoQ"
                />
                <RibbonButton
                  icon={FaChevronDown}
                  label="Bottom"
                  onClick={scrollToBottom}
                  title="Scroll to bottom of BoQ"
                />
              </RibbonGroup>
            </>
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

          {ribbonTab === "contract" ? (
            <>
              <RibbonGroup title="Approval">
                {contractLocked ? (
                  <>
                    <div className="text-[11px] text-emerald-700 font-semibold">
                      🔒 Locked
                      {contractLockedAt
                        ? ` on ${new Date(contractLockedAt).toLocaleDateString()}`
                        : ""}
                    </div>
                    <RibbonButton
                      icon={FaTimes}
                      label={contractBusy ? "..." : "Unlock"}
                      onClick={() =>
                        setPinModal({
                          mode: "unlock",
                          pin: "",
                          confirm: "",
                          err: "",
                          busy: false,
                        })
                      }
                      disabled={contractBusy || !onUnlockContract}
                      title="Unlock the contract — you'll need the 4-digit PIN that was used to lock it."
                    />
                  </>
                ) : (
                  <>
                    <div className="text-[11px] text-amber-700">
                      ✎ Draft — editable
                    </div>
                    <RibbonButton
                      icon={FaFileInvoiceDollar}
                      label={contractBusy ? "Locking..." : "Lock contract"}
                      onClick={() =>
                        setPinModal({
                          mode: "lock",
                          pin: "",
                          confirm: "",
                          err: "",
                          busy: false,
                        })
                      }
                      disabled={contractBusy || !onLockContract}
                      title="Freeze the priced scope. You'll choose a 4-digit PIN to protect the lock."
                    />
                  </>
                )}
              </RibbonGroup>

              <RibbonGroup title="Preliminaries %">
                <label
                  className="inline-flex items-center gap-2 text-[11px] text-slate-700"
                  title="Preliminaries as a percentage of measured + provisional. Typical range 5 – 10%."
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={preliminaryPercent ?? 7.5}
                    onChange={(e) =>
                      onPreliminaryPercentChange?.(e.target.value)
                    }
                    disabled={contractLocked}
                    className="input !h-7 !w-20 !px-2 text-[11px] text-right"
                  />
                  <span>%</span>
                </label>
                <div className="text-[11px] text-slate-600">
                  ≈{" "}
                  <b className="text-slate-800">{money(preliminaryAmount)}</b>
                </div>
              </RibbonGroup>

              <RibbonGroup title="Contract sum">
                <div className="text-[11px] text-slate-600 leading-tight">
                  Measured: <b>{money(grossAmount)}</b>
                </div>
                <div className="text-[11px] text-slate-600 leading-tight">
                  PC Sums: <b>{money(provisionalTotal)}</b>
                </div>
                <div className="text-[11px] text-slate-600 leading-tight">
                  Preliminaries: <b>{money(preliminaryAmount)}</b>
                </div>
                <div className="text-[12px] font-semibold text-adlm-blue-700">
                  Total: {money(projectTotal - variationsTotal)}
                </div>
                {variationsTotal !== 0 ? (
                  <div className="text-[10px] text-amber-700">
                    + Variations: {money(variationsTotal)}
                  </div>
                ) : null}
              </RibbonGroup>
            </>
          ) : null}

          {ribbonTab === "provisional" ? (
            <RibbonGroup title="Provisional sums">
              <RibbonButton
                icon={FaPlus}
                label="Add sum"
                onClick={() => {
                  if (contractLocked) return;
                  onAddProvisionalSum?.();
                  setTimeout(
                    () => scrollToRef(provisionalSectionRef.current),
                    30,
                  );
                }}
                title={
                  contractLocked
                    ? "Contract locked — unlock to add PC sums"
                    : "Add a provisional / PC sum"
                }
                disabled={!onAddProvisionalSum || contractLocked}
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
        )}

        {!ribbonCollapsed && showActualColumns && ribbonTab === "home" ? (
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
                        /* Compact: checkbox + small % when actual cols are visible */
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            className={checkboxCls}
                            checked={row.isMarked}
                            onChange={(e) => onStatusToggle?.(row.i, e.target.checked)}
                            aria-label={statusActionText}
                            title={row.isMarked ? statusLabel : statusOffText}
                          />
                          <PercentInline
                            row={row}
                            percentMap={percentMap}
                            onPercentChange={onPercentChange}
                          />
                        </div>
                      ) : (
                        /* Full: checkbox + % input + info text */
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
                          <div className="mt-1 flex items-center gap-1.5">
                            <PercentInline
                              row={row}
                              percentMap={percentMap}
                              onPercentChange={onPercentChange}
                              showLabel
                            />
                          </div>
                          <div className="mt-0.5 text-[10px] leading-tight text-slate-500">
                            {row.isMarked
                              ? row.markedAt
                                ? `Logged ${formatDateTime(row.markedAt)}`
                                : statusPendingText
                              : row.isPartial
                                ? `${row.percentComplete}% earned · ${row.valuedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} valued`
                                : `Unchecked items stay in the outstanding balance until marked ${statusLabelLower}.`}
                          </div>
                        </>
                      )}
                    </td>

                    <td className="px-2 py-2 overflow-hidden" title={row.description}>
                      <div className="font-medium text-slate-900 text-xs break-words leading-snug">{row.description}</div>
                      {/* WBS / Task link indicator. Renders a colour-coded
                          chip when this BoQ row is linked to one or more
                          PM tasks. Single link = green (healthy). 2+ = amber
                          (potential double-count in EV). 3+ = rose (likely
                          imbalance). Hover shows the task names. */}
                      <WbsLinkChip
                        stats={boqLinkStats.get(boqItemIdentity(row, row.i))}
                      />
                      {row.groupId ? (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          Group: <span className="text-slate-700">{row.groupLabel} ({row.groupCount})</span>
                          {linked ? <span className="font-medium text-adlm-blue-700"> | linked</span> : null}
                        </div>
                      ) : null}
                      {(onCategoryChange && categoryOptions?.length) ||
                      (onTradeChange && tradeOptions?.length) ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          {onCategoryChange && categoryOptions?.length ? (
                            <span className="inline-flex items-center gap-1">
                              <span>Category:</span>
                              <select
                                className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700 focus:border-adlm-blue-500 focus:outline-none"
                                value={row.category || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "__add_category__") {
                                    const name =
                                      typeof window !== "undefined"
                                        ? window.prompt(
                                            "New category name (e.g. External Works)",
                                          )
                                        : "";
                                    const trimmed = String(name || "").trim();
                                    if (trimmed && onAddCategory) {
                                      onAddCategory(trimmed);
                                      onCategoryChange(row.i, trimmed);
                                    }
                                    return;
                                  }
                                  onCategoryChange(row.i, v);
                                }}
                                title="Re-classify this item by building element"
                              >
                                {categoryOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                {row.category &&
                                !categoryOptions.includes(row.category) ? (
                                  <option value={row.category}>
                                    {row.category}
                                  </option>
                                ) : null}
                                {onAddCategory ? (
                                  <option value="__add_category__">
                                    + New category…
                                  </option>
                                ) : null}
                              </select>
                            </span>
                          ) : null}
                          {onTradeChange && tradeOptions?.length ? (
                            <span className="inline-flex items-center gap-1">
                              <span>Trade:</span>
                              <select
                                className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700 focus:border-adlm-blue-500 focus:outline-none"
                                value={row.trade || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "__add_trade__") {
                                    const name =
                                      typeof window !== "undefined"
                                        ? window.prompt(
                                            "New work section name (e.g. Waterproofing)",
                                          )
                                        : "";
                                    const trimmed = String(name || "").trim();
                                    if (trimmed && onAddTrade) {
                                      onAddTrade(trimmed);
                                      onTradeChange(row.i, trimmed);
                                    }
                                    return;
                                  }
                                  onTradeChange(row.i, v);
                                }}
                                title="Re-classify this item by work section / trade. Saved overrides train the self-learning classifier."
                              >
                                {tradeOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                {row.trade &&
                                !tradeOptions.includes(row.trade) ? (
                                  <option value={row.trade}>{row.trade}</option>
                                ) : null}
                                {onAddTrade ? (
                                  <option value="__add_trade__">
                                    + New work section…
                                  </option>
                                ) : null}
                              </select>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-2 py-2 text-xs text-slate-700">{row.qty.toFixed(2)}</td>
                    <td className="px-2 py-2 text-xs text-slate-700">{row.unit}</td>

                    <td className="px-2 py-2 relative">
                      <div className="flex items-start gap-1">
                        {showMaterials ? (
                          /* Materials view — uses the full RateCell so users
                             get name search + formula + number input. The
                             standalone "Pick" button (kept below) still works
                             as an alternative rapid-pick UX. */
                          <>
                            <RateCell
                              value={rateValue}
                              placeholder={String(Number(item?.rate || 0))}
                              onChange={(v) => onRateChange?.(row.i, v)}
                              onSearchRateGen={onSearchRateGen}
                              canRateGenBoq={canRateGen || canRateGenBoq}
                              boqCandidates={candidates || []}
                              itemUnit={row.unit || item?.unit || ""}
                              itemDescription={
                                row.description ||
                                item?.description ||
                                item?.materialName ||
                                ""
                              }
                              disabled={contractLocked}
                              disabledHint="Contract locked — unlock it to edit rates"
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
                              // Lock the rate as soon as the contract is
                              // locked. Editing rates after sign-off would
                              // silently drift the contract sum away from
                              // the signed value — variations are the
                              // proper channel for any rate change. Also lock
                              // when the rate is derived from a priced Budget
                              // build-up (Material + Labour + O&P).
                              disabled={
                                contractLocked ||
                                Boolean(
                                  budgetDrivenCodes &&
                                    budgetDrivenCodes.has(
                                      String(item?.code || "").trim().toLowerCase(),
                                    ),
                                )
                              }
                              disabledHint={
                                contractLocked
                                  ? "Contract locked — unlock it on the Contract Admin tab to edit rates, or raise a variation."
                                  : "Rate derived from the Budget build-up (Material + Labour + O&P). Edit the prices on the Budget tab."
                              }
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
                        {/* Actual Rate cell uses the full RateCell so
                            users can: (a) type a number, (b) start
                            with "=" for a formula, or (c) type a name
                            to search RateGen — same behaviour as the
                            contract Rate cell, but writes to actualRate
                            instead of rate. NOT locked when the
                            contract is locked because actuals are
                            valuation entries, not contract edits. */}
                        <RateCell
                          value={actualRateValue}
                          placeholder="Measured rate"
                          onChange={(v) => onActualRateChange?.(row.i, v)}
                          onSearchRateGen={onSearchRateGen}
                          canRateGenBoq={canRateGenBoq}
                          boqCandidates={getBoqCandidatesForItem?.(item) || []}
                          itemUnit={row.unit || item?.unit || ""}
                          itemDescription={row.description || item?.description || ""}
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
                          className={`inline-flex h-6 w-6 items-center justify-center rounded transition ${
                            contractLocked
                              ? "text-slate-300 cursor-not-allowed"
                              : "hover:bg-red-50 text-slate-400 hover:text-red-600"
                          }`}
                          title={
                            contractLocked
                              ? "Contract locked — unlock it to delete measured items, or raise a variation"
                              : "Delete row (you'll be able to undo)"
                          }
                          disabled={contractLocked}
                          onClick={() => {
                            if (contractLocked) return;
                            onDeleteItem?.(row.i);
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
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth">
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
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth scroll-mt-24"
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
                    <th className="px-2 py-2 w-16 text-center" title="Tick when variation has been executed on site — flows into earned value.">Done</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {variations.map((v, i) => {
                    const qty = safeNum(v?.qty);
                    const rate = safeNum(v?.rate);
                    const amount = qty * rate;
                    return (
                      <tr key={i} className={`border-t ${v?.completed ? "bg-emerald-50/50" : ""}`}>
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
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className={checkboxCls}
                            checked={Boolean(v?.completed)}
                            onChange={(e) =>
                              onUpdateVariation?.(i, { completed: e.target.checked })
                            }
                            title="Mark as executed — flows into earned value (EV)"
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

      {onUpdatePreliminaryItem && Array.isArray(preliminaryItems) ? (
        <div
          ref={preliminarySectionRef}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth scroll-mt-24"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Preliminary items done
              </div>
              <div className="text-[11px] text-slate-500">
                BESMM4 preliminary checklist. Allocate a percentage of the
                preliminary pool to each item, tick off as executed — done
                portion is deducted from the outstanding preliminary cost and
                feeds into certificates and EVM.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onNormalizePreliminaryAllocations ? (
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={onNormalizePreliminaryAllocations}
                  disabled={contractLocked}
                  title={
                    contractLocked
                      ? "Contract locked — unlock to rebalance allocations"
                      : "Reset to an even allocation across all listed items"
                  }
                >
                  Even split
                </button>
              ) : null}
              {onAddPreliminaryItem ? (
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={onAddPreliminaryItem}
                  disabled={contractLocked}
                  title={
                    contractLocked
                      ? "Contract locked — unlock to add a preliminary item"
                      : undefined
                  }
                >
                  + Add item
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Preliminary pool</div>
              <div className="text-sm font-semibold text-slate-900">
                {money(preliminaryAmount)}
              </div>
              <div className="text-[10px] text-slate-400">
                {safeNum(preliminaryPercent).toFixed(1)}% of measured + PC
              </div>
            </div>
            <div>
              <div className="text-slate-500">Allocated</div>
              <div
                className={`text-sm font-semibold ${
                  Math.abs(preliminaryAllocTotal - 100) <= 0.5
                    ? "text-slate-900"
                    : "text-amber-700"
                }`}
              >
                {preliminaryAllocTotal.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400">
                Should sum to 100%
              </div>
            </div>
            <div>
              <div className="text-slate-500">Done</div>
              <div className="text-sm font-semibold text-emerald-700">
                {money(preliminaryDone)}
              </div>
              <div className="text-[10px] text-slate-400">
                {preliminaryAllocCompleted.toFixed(1)}% of pool
              </div>
            </div>
            <div>
              <div className="text-slate-500">Outstanding</div>
              <div className="text-sm font-semibold text-adlm-blue-700">
                {money(preliminaryOutstanding)}
              </div>
            </div>
          </div>

          {preliminaryItems.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-2 w-10">#</th>
                    <th className="px-2 py-2 w-10 text-center">Done</th>
                    <th className="px-2 py-2">Preliminary item</th>
                    <th className="px-2 py-2 w-24 text-right">Alloc %</th>
                    <th className="px-2 py-2 w-32 text-right">Planned ₦</th>
                    {/* Actual column — QS-entered spend per prelim row.
                        Variance vs Planned surfaces underneath. */}
                    <th className="px-2 py-2 w-36 text-right">Actual ₦</th>
                    <th className="px-2 py-2 w-24">Done date</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {preliminaryItems.map((p, i) => {
                    const alloc = safeNum(p?.allocation);
                    const amount =
                      (preliminaryAmount * alloc) / preliminaryAllocBase;
                    const actualAmount = safeNum(p?.actualAmount);
                    const variance = actualAmount - amount;
                    const hasActual = actualAmount > 0;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className={checkboxCls}
                            checked={Boolean(p?.completed)}
                            onChange={(e) =>
                              onUpdatePreliminaryItem?.(i, {
                                completed: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs"
                            type="text"
                            placeholder="Preliminary item"
                            value={p?.name || ""}
                            onChange={(e) =>
                              onUpdatePreliminaryItem?.(i, {
                                name: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input !h-8 w-full !px-2 text-xs text-right"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={
                              p?.allocation === 0 || p?.allocation == null
                                ? ""
                                : p.allocation
                            }
                            onChange={(e) =>
                              onUpdatePreliminaryItem?.(i, {
                                allocation:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td
                          className={`px-2 py-2 text-right ${
                            p?.completed ? "font-semibold text-emerald-700" : "text-slate-900"
                          }`}
                        >
                          {money(amount)}
                        </td>
                        {/* Actual cell — number input + variance hint. */}
                        <td className="px-2 py-2 text-right">
                          <input
                            className="input !h-8 w-full !px-2 text-xs text-right"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={money(amount)}
                            value={
                              actualAmount === 0 || p?.actualAmount == null
                                ? ""
                                : p.actualAmount
                            }
                            onChange={(e) =>
                              onUpdatePreliminaryItem?.(i, {
                                actualAmount:
                                  e.target.value === ""
                                    ? 0
                                    : Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            title="What the contractor actually spent on this prelim. Compare against the planned allocation."
                          />
                          {hasActual ? (
                            <div
                              className={`mt-0.5 text-[10px] font-medium ${
                                variance > 0
                                  ? "text-rose-600"
                                  : variance < 0
                                    ? "text-emerald-600"
                                    : "text-slate-400"
                              }`}
                              title={
                                variance > 0
                                  ? "Actual exceeds planned share of the preliminary pool"
                                  : variance < 0
                                    ? "Actual is below planned share — saving on this row"
                                    : "Actual matches planned exactly"
                              }
                            >
                              {variance === 0
                                ? "On plan"
                                : `${variance > 0 ? "+" : "−"}${money(Math.abs(variance))}`}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-slate-500">
                          {p?.completedAt
                            ? new Date(p.completedAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-1 py-2 text-center">
                          {onRemovePreliminaryItem ? (
                            <button
                              type="button"
                              className={`inline-flex h-6 w-6 items-center justify-center rounded ${
                                contractLocked
                                  ? "text-slate-300 cursor-not-allowed"
                                  : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                              }`}
                              disabled={contractLocked}
                              onClick={() => {
                                if (contractLocked) return;
                                onRemovePreliminaryItem(i);
                              }}
                              title={
                                contractLocked
                                  ? "Contract locked — unlock to remove preliminaries"
                                  : "Remove this row"
                              }
                            >
                              <FaTrashAlt className="text-[10px]" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900">
                  <tr className="border-t">
                    <td colSpan={3} className="px-2 py-2 text-right">
                      Done
                    </td>
                    <td className="px-2 py-2 text-right">
                      {preliminaryAllocCompleted.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-700">
                      {money(preliminaryDone)}
                    </td>
                    {/* Total of all actual amounts entered so far. */}
                    <td className="px-2 py-2 text-right text-slate-700">
                      {(() => {
                        const totActual = (preliminaryItems || []).reduce(
                          (acc, p) => acc + safeNum(p?.actualAmount),
                          0,
                        );
                        return totActual > 0 ? money(totActual) : "—";
                      })()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-right">
                      Outstanding
                    </td>
                    <td className="px-2 py-2 text-right">
                      {(100 - preliminaryAllocCompleted).toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-right text-adlm-blue-700">
                      {money(preliminaryOutstanding)}
                    </td>
                    {/* Variance: total actual vs preliminary pool */}
                    <td className="px-2 py-2 text-right">
                      {(() => {
                        const totActual = (preliminaryItems || []).reduce(
                          (acc, p) => acc + safeNum(p?.actualAmount),
                          0,
                        );
                        if (totActual <= 0) return null;
                        const variance = totActual - preliminaryAmount;
                        return (
                          <span
                            className={
                              variance > 0
                                ? "text-rose-700 text-[10px]"
                                : variance < 0
                                  ? "text-emerald-700 text-[10px]"
                                  : "text-slate-500 text-[10px]"
                            }
                            title={
                              variance > 0
                                ? "Actual spend has exceeded the preliminary pool"
                                : variance < 0
                                  ? "Total actual is below pool — saving overall"
                                  : "Actual spend equals the pool"
                            }
                          >
                            {variance === 0
                              ? "On plan"
                              : `${variance > 0 ? "+" : "−"}${money(Math.abs(variance))}`}
                          </span>
                        );
                      })()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No preliminary items yet. Open the project once to seed the
              BESMM4 defaults, or click "+ Add item".
            </div>
          )}
        </div>
      ) : null}

      {onAddProvisionalSum ? (
        <div
          ref={provisionalSectionRef}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth scroll-mt-24"
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
                    <th className="px-2 py-2 w-20 text-center" title="Tick when the PC scope has been executed — earned value will then include it.">Done</th>
                    <th className="px-2 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {provisionalSums.map((s, i) => (
                    <tr key={i} className={`border-t ${s?.completed ? "bg-emerald-50/50" : ""}`}>
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
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className={checkboxCls}
                          checked={Boolean(s?.completed)}
                          onChange={(e) =>
                            onUpdateProvisionalSum?.(i, { completed: e.target.checked })
                          }
                          title="Mark as executed — flows into earned value (EV)"
                        />
                      </td>
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          className={`inline-flex h-6 w-6 items-center justify-center rounded transition ${
                            contractLocked
                              ? "text-slate-300 cursor-not-allowed"
                              : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                          }`}
                          title={
                            contractLocked
                              ? "Contract locked — unlock to remove PC sums"
                              : "Remove this row"
                          }
                          disabled={contractLocked}
                          onClick={() => {
                            if (contractLocked) return;
                            onRemoveProvisionalSum?.(i);
                          }}
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
                    <td className="px-2 py-2 text-center text-[10px] text-slate-500">
                      {provisionalSums.filter((s) => s?.completed).length}
                      /{provisionalSums.length}
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
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-800/60 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Project total
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {contractLocked
                ? `Contract locked · baseline ${money(contractSum)}`
                : "Draft — lock contract to freeze the baseline."}
            </div>
          </div>

          {/* Sub-total breakdown — three rows that add up to the BoQ
              subtotal (measured + prov + prelim). */}
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Measured work</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {money(grossAmount)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Provisional sums</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {money(provisionalTotal)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                Preliminaries ({safeNum(preliminaryPercent).toFixed(1)}%)
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {money(preliminaryAmount)}
              </div>
              {preliminaryDone > 0 ? (
                <div className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                  Done: {money(preliminaryDone)}
                </div>
              ) : null}
              {preliminaryOutstanding > 0 && preliminaryDone > 0 ? (
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Outstanding: {money(preliminaryOutstanding)}
                </div>
              ) : null}
            </div>
          </div>

          {/* Sub-total line — bold, separates BoQ from add-ons */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              BoQ sub-total
            </div>
            <div className="font-bold text-slate-900 dark:text-slate-100">
              {money(boqSubtotal)}
            </div>
          </div>

          {/* Contingency + Tax row — editable percent inputs inline.
              The cascade follows the standard QS grand-summary
              convention: Sub-total → +Contingency → +Tax → Planned. */}
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-md bg-white dark:bg-slate-700/40 px-2 py-1.5 border border-slate-100 dark:border-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400">Contingency</span>
                {onContingencyPercentChange ? (
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={safeNum(contingencyPercent)}
                    onChange={(e) =>
                      onContingencyPercentChange(
                        Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      )
                    }
                    disabled={contractLocked}
                    className="w-12 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-1 py-0.5 text-[10px] text-right disabled:opacity-50"
                  />
                ) : (
                  <span className="text-[10px] text-slate-600 dark:text-slate-300">
                    {safeNum(contingencyPercent).toFixed(1)}
                  </span>
                )}
                <span className="text-[10px] text-slate-500 dark:text-slate-400">%</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {money(contingencyAmount)}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-white dark:bg-slate-700/40 px-2 py-1.5 border border-slate-100 dark:border-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400">Tax / VAT</span>
                {onTaxPercentChange ? (
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={safeNum(taxPercent)}
                    onChange={(e) =>
                      onTaxPercentChange(
                        Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      )
                    }
                    disabled={contractLocked}
                    className="w-12 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-1 py-0.5 text-[10px] text-right disabled:opacity-50"
                  />
                ) : (
                  <span className="text-[10px] text-slate-600 dark:text-slate-300">
                    {safeNum(taxPercent).toFixed(1)}
                  </span>
                )}
                <span className="text-[10px] text-slate-500 dark:text-slate-400">%</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {money(taxAmount)}
              </div>
            </div>
          </div>

          {/* Planned project total — what was agreed at lock. */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              Planned project total
            </div>
            <div className="font-bold text-adlm-blue-700 dark:text-adlm-blue-400">
              {money(plannedProjectTotal)}
            </div>
          </div>

          {/* Variations (only visible when there are any) and current total */}
          {variationsTotal !== 0 ? (
            <>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div className="text-slate-600 dark:text-slate-300">
                  + Variations (instructions during execution)
                </div>
                <div
                  className={`font-semibold ${
                    variationsTotal > 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {money(variationsTotal)}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t-2 border-adlm-blue-200 dark:border-adlm-blue-700 pt-2 text-sm">
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Current total project cost
                </div>
                <div className="text-lg font-bold text-adlm-blue-700 dark:text-adlm-blue-300">
                  {money(projectTotal)}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div ref={bottomAnchorRef} className="scroll-mb-24" aria-hidden="true" />

      {/* Floating go-to-top / go-to-bottom buttons — always reachable on long
          Bill of Quantity pages. Hidden automatically when the content fits
          on screen. */}
      {showFloatNav ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col gap-2">
          <button
            type="button"
            onClick={scrollToTop}
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg hover:bg-adlm-blue-700 hover:text-white hover:border-adlm-blue-700 transition"
            title="Go to top of BoQ"
            aria-label="Go to top of BoQ"
          >
            <FaChevronUp className="text-sm" />
          </button>
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg hover:bg-adlm-blue-700 hover:text-white hover:border-adlm-blue-700 transition"
            title="Go to bottom of BoQ"
            aria-label="Go to bottom of BoQ"
          >
            <FaChevronDown className="text-sm" />
          </button>
        </div>
      ) : null}

      {/* ── Contract lock PIN modal ──────────────────────────────────────
          Centralised here so it shares state with the Lock / Unlock
          ribbon buttons. Lock mode requires PIN + confirmation; unlock
          mode just asks for the saved PIN. Wrong-PIN attempts surface as
          inline error text and keep the modal open. */}
      {pinModal ? (
        <PinDialog
          mode={pinModal.mode}
          state={pinModal}
          onChange={(patch) => setPinModal((s) => (s ? { ...s, ...patch } : s))}
          onClose={() => setPinModal(null)}
          onSubmit={async () => {
            const state = pinModal;
            if (!state) return;
            const isLock = state.mode === "lock";
            const cleanPin = String(state.pin || "").trim();
            if (!/^\d{4}$/.test(cleanPin)) {
              setPinModal((s) => (s ? { ...s, err: "PIN must be exactly 4 digits." } : s));
              return;
            }
            if (isLock && cleanPin !== String(state.confirm || "").trim()) {
              setPinModal((s) => (s ? { ...s, err: "PINs don't match." } : s));
              return;
            }
            setPinModal((s) => (s ? { ...s, busy: true, err: "" } : s));
            const result = isLock
              ? await onLockContract?.({
                  preliminaryPercent,
                  lockPin: cleanPin,
                })
              : await onUnlockContract?.({ lockPin: cleanPin });
            // The handler returns either the success payload OR an
            // { error, message } object for PIN failures. Close on
            // success, show inline error otherwise.
            if (result && result.error) {
              setPinModal((s) =>
                s ? { ...s, busy: false, err: result.message || "PIN check failed." } : s,
              );
              return;
            }
            setPinModal(null);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}

// Reusable 4-digit PIN dialog. Single component handles both lock (set +
// confirm) and unlock (verify) flows — the `mode` prop toggles the
// confirm field and label copy. Auto-focuses the first input on open and
// submits on Enter.
function PinDialog({ mode, state, onChange, onClose, onSubmit }) {
  const isLock = mode === "lock";
  const pinRef = React.useRef(null);
  React.useEffect(() => {
    pinRef.current?.focus();
  }, []);
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !state.busy) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, state.busy]);

  function sanitize(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 4);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !state.busy) onClose?.();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-5 py-3 text-white">
          <div className="text-xs uppercase tracking-widest opacity-80">
            Contract security
          </div>
          <div className="text-base font-bold">
            {isLock ? "Set a 4-digit lock PIN" : "Enter your 4-digit PIN to unlock"}
          </div>
        </div>
        <form
          className="px-5 py-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!state.busy) onSubmit?.();
          }}
        >
          <p className="text-xs text-slate-600">
            {isLock
              ? "Choose a PIN you'll remember — you'll need the same 4 digits to unlock the contract later. Store it somewhere safe; lost PINs cannot be recovered without a server-side reset."
              : "This contract was locked with a 4-digit PIN. Enter it to unlock and resume editing the priced scope."}
          </p>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              PIN
            </span>
            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={state.pin || ""}
              onChange={(e) => onChange?.({ pin: sanitize(e.target.value), err: "" })}
              placeholder="••••"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
            />
          </label>
          {isLock ? (
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Confirm PIN
              </span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={state.confirm || ""}
                onChange={(e) =>
                  onChange?.({ confirm: sanitize(e.target.value), err: "" })
                }
                placeholder="••••"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
              />
            </label>
          ) : null}
          {state.err ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {state.err}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={state.busy}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={state.busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {state.busy ? (
                <>
                  <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Working…
                </>
              ) : (
                <>{isLock ? "Lock contract" : "Unlock contract"}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// WbsLinkChip — small pill on each BoQ row that surfaces how this item
// is allocated across PM tasks. The primary signal is the SUM OF
// WEIGHTS across every linking task:
//
//   No links             → nothing rendered (keeps clean rows clean)
//   sum = 100% exactly   → emerald, "balanced" (or "1 task @ 100%")
//   sum < 100%           → slate, "under-allocated · X%" (WBS gap)
//   sum > 100%           → rose, "over-allocated · X%" (EV double-count)
//
// Hover tooltip shows the linked task names and explains the state in
// plain QS terms so the user can act immediately.
// ────────────────────────────────────────────────────────────────────
function WbsLinkChip({ stats }) {
  if (!stats || !stats.count) return null;
  const n = Number(stats.count) || 0;
  // Round to 1 decimal for display; tolerance of ±0.5% counts as balanced.
  const total = Math.round((Number(stats.totalWeight) || 0) * 10) / 10;
  const tolerance = 0.5;
  const isBalanced = Math.abs(total - 100) <= tolerance;
  const isOver = total > 100 + tolerance;
  const isUnder = total < 100 - tolerance;

  let tone;
  let stateText;
  let explanation;
  if (isOver) {
    tone = "rose";
    stateText = "over-allocated";
    explanation = `Sum of link weights = ${total}%. The same baseline value is being summed into more than one task's EV. Reduce the weight on one or more links so they total 100%.`;
  } else if (isUnder) {
    tone = "slate";
    stateText = "under-allocated";
    explanation = `Sum of link weights = ${total}%. Only ${total}% of this BoQ line's value is currently represented in the WBS — the rest won't appear in EV. Add a task or raise an existing weight.`;
  } else {
    tone = "emerald";
    stateText = "balanced";
    explanation = `Sum of link weights = ${total}%. This BoQ line is correctly allocated across the WBS.`;
  }

  const palette = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40",
    rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/40",
    slate: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  }[tone];

  const names = Array.isArray(stats.taskNames) ? stats.taskNames : [];
  const previewNames = names.slice(0, 6);
  const moreCount = Math.max(0, names.length - previewNames.length);
  const title = [
    explanation,
    "",
    `Linked from ${n} PM task${n === 1 ? "" : "s"}:`,
    ...previewNames.map((nm) => "• " + nm),
    moreCount > 0 ? `+ ${moreCount} more` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mt-1 inline-flex items-center">
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${palette}`}
      >
        <span aria-hidden="true">🔗</span>
        {n} link{n === 1 ? "" : "s"} · {total}%
        {!isBalanced ? <span className="font-bold ml-0.5">· {stateText}</span> : null}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// BoqUndoBar — sticky banner that surfaces the last N deletes so users
// can recover from accidental trash clicks. Visible only while the
// stack is non-empty.
//
// Layout:
//   • Most-recent entry on the left, oldest on the right
//   • Each entry shows the kind badge + label + "Undo" button
//   • "Dismiss all" on the right clears the stack
//
// Why a banner instead of a toast: deletes happen quickly in QS work
// (cleaning up imported BoQs), so users often want to see *several*
// recent deletes simultaneously rather than one-at-a-time toasts that
// dismiss themselves.
// ────────────────────────────────────────────────────────────────────
const BOQ_UNDO_KIND_LABEL = {
  measured: { label: "BoQ row", cls: "bg-slate-100 text-slate-700" },
  preliminary: { label: "Prelim", cls: "bg-purple-100 text-purple-700" },
  provisional: { label: "PC sum", cls: "bg-amber-100 text-amber-800" },
  variation: { label: "Variation", cls: "bg-rose-100 text-rose-700" },
};

function BoqUndoBar({ stack, onUndo, onClear }) {
  if (!Array.isArray(stack) || stack.length === 0) return null;
  return (
    <div className="sticky top-16 z-30 -mx-1 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2 shadow-sm backdrop-blur dark:border-amber-700 dark:bg-amber-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          <FaTrashAlt className="text-[10px]" />
          Recently deleted
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-800 dark:text-amber-100">
            {stack.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {stack.map((entry) => {
            const badge = BOQ_UNDO_KIND_LABEL[entry.kind] || BOQ_UNDO_KIND_LABEL.measured;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onUndo?.(entry.id)}
                title={`Restore "${entry.label}" to position #${(entry.index || 0) + 1}`}
                className="group inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] hover:border-emerald-400 hover:bg-emerald-50 transition dark:bg-slate-800 dark:border-amber-600 dark:hover:bg-emerald-900/30"
              >
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                  {entry.label}
                </span>
                <span className="ml-1 shrink-0 text-[10px] font-semibold text-emerald-700 group-hover:text-emerald-800 dark:text-emerald-300">
                  ↶ Undo
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-white hover:text-slate-700 transition dark:hover:bg-slate-700"
          title="Dismiss undo history"
        >
          Dismiss all
        </button>
      </div>
    </div>
  );
}
