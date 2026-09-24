import React, { useRef, useCallback, useState, useEffect } from "react";
import { FaArrowDown, FaArrowUp, FaChevronDown, FaChevronUp, FaClipboardList, FaCogs, FaFileInvoiceDollar, FaGripVertical, FaInfoCircle, FaLink, FaListUl, FaPlus, FaSearch, FaSync, FaTimes, FaTrashAlt } from "../../components/icons.jsx";
import SectionRail from "./SectionRail.jsx";
import { useFeedback } from "../../ds/feedback/feedbackContext.js";
import {
  EN_DASH,
  projectTotals,
  splitProvisionalSums,
} from "./lib/projectTotals.js";
import {
  variationKpis,
  variationStatusClass,
  variationStatusLabel,
} from "../../lib/variations.js";

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

// Rows inside the bill's table, in his manner. His bill is a grid of divs
// (.wk-qg / .wk-qgh / .wk-qtot); this one is a real <table> with editable
// cells, so the same look is carried by his tokens on the rows instead.
//
//   section heading  his alt surface with a firmer rule above; while a line is
//                    dragged over it, his light-blue wash and an action outline
//   subtotal         the alt surface, a rule above, tabular figures
//   total            his heavy rule (.wk-tot) above the bill's totals
const sectionRowStyle = (dropping) => ({
  background: dropping ? "var(--pal-light-wash)" : "var(--bg-alt)",
  borderTop: "1px solid var(--line-2)",
  outline: dropping ? "2px dashed var(--action)" : "none",
  outlineOffset: -2,
});
const SUBTOTAL_ROW = {
  background: "var(--bg-alt)",
  borderTop: "1px solid var(--line-2)",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};
const TOTAL_ROW = {
  // 2px, not his 1.5px: in a collapsed table border a 1.5px rule rounds down to 1.
  borderTop: "2px solid var(--ink)",
  fontSize: 13.5,
  fontWeight: 500,
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};
const READING = { color: "var(--ink)", fontWeight: 500, fontVariantNumeric: "tabular-nums" };

// One of his palettes, for a .wk-src chip or a toggled button.
function palChip(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
// His .wk-dd-m surface, for popovers that are open whenever they render.
const POP = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  boxShadow: "0 3px 10px rgba(var(--shadow-c),.08), 0 20px 46px rgba(var(--shadow-c),.20)",
};
// A compact ds-btn holding just an icon.
const ICON_BTN = { padding: "6px 8px" };
const ROW_BTN = { padding: "4px 6px" };

// Why every delete control is dead for a collaborator without RateGen: they
// read this project with every rate and amount zeroed, so they cannot see what
// removing a row would throw away. The server keeps the owner's pricing on
// anything they save (guardMaskedWrite in server/routes/projects.js), but it
// takes a deletion at its word — the row, and the money on it, would simply be
// gone. This message is what stops the click being made in the first place.
const RATES_HIDDEN_NO_DELETE =
  "Rates are hidden on this project, so rows cannot be removed. Ask the project owner, or subscribe to RateGen.";

// A bill row's state in his tokens: a dragged row fades, a marked row takes
// his light wash, and the drop target shows an action-coloured line.
function billRowStyle({ dragging, marked, dropAbove, dropBelow }) {
  return {
    ...(dragging
      ? { opacity: 0.4, background: "var(--bg-alt)" }
      : marked
        ? { background: "var(--pal-light-wash)" }
        : null),
    ...(dropAbove ? { borderTop: "2px solid var(--action)" } : null),
    ...(dropBelow ? { borderBottom: "2px solid var(--action)" } : null),
  };
}

function InfoTip({ text }) {
  return (
    <span className="relative inline-flex items-center group">
      <FaInfoCircle size={13} className="text-slate-500" />
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
function PercentInline({
  row,
  percentMap,
  onPercentChange,
  showLabel = false,
}) {
  const isRatified = Boolean(row?.isMarked);
  const value =
    percentMap?.[row.key] != null
      ? Math.max(0, Math.min(100, Number(percentMap[row.key]) || 0))
      : Math.max(0, Math.min(100, Number(row?.percentComplete) || 0));
  return (
    <span
      className="wk-src sm"
      style={isRatified ? palChip("light") : value > 0 ? palChip("orange") : undefined}
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
        style={{ border: 0, color: "inherit", font: "inherit" }}
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
    const value = Function('"use strict"; return (' + translated + ");")();
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
  const raw = String(u || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!raw) return "";
  if (raw === "m³" || raw === "cum" || raw === "m3") return "m3";
  if (raw === "m²" || raw === "sqm" || raw === "m2") return "m2";
  if (raw === "m" || raw === "lm" || raw === "rm") return "m";
  if (
    raw === "kg" ||
    raw === "kgs" ||
    raw === "kilogram" ||
    raw === "kilograms"
  )
    return "kg";
  if (
    raw === "t" ||
    raw === "ton" ||
    raw === "tons" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "ton";
  if (raw === "bag" || raw === "bags") return "bag";
  if (raw === "nr" || raw === "no" || raw === "nos" || raw === "number")
    return "nr";
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
 *
 * onChange(value, meta) — meta describes WHERE the figure came from:
 *   { source: "rategen", rateKey, rateUnit } for a pick out of the library,
 *   { source: "typed" } for a figure the QS entered or worked out by formula.
 *   Callers that ignore the second argument behave exactly as before.
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
  disabledHint = "Locked. Unlock the contract to edit rates.",
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

  // Did the QS empty this cell during THIS visit to it? It matters because
  // EVERY untouched cell is empty — the stored rate is only the placeholder —
  // so leaving a cell can only mean "cleared" when he actually cleared it.
  const clearedRef = useRef(false);
  // Committing an empty cell is the deliberate "this line has no rate of its
  // own": it releases the lock and hands the line back to its Budget build-up,
  // which changes the line's rate on the next save. A keystroke on the way to
  // retyping the figure is not that, so the release waits for the commit —
  // blur, Enter, or clicking away. Held in a ref because the outside-click
  // effect is registered once per focus and would otherwise call a stale
  // onChange.
  const commitClearRef = useRef(null);
  commitClearRef.current = () => {
    if (!clearedRef.current) return;
    clearedRef.current = false;
    onChange?.("", { source: "cleared" });
  };

  // Close popup when clicking outside
  useEffect(() => {
    if (!focused) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        commitClearRef.current?.();
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
  }, [searchQuery, canRateGenBoq]); // removed onSearchRateGen. Use ref instead

  const handleFocus = () => {
    setFocused(true);
    clearedRef.current = false;
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
      clearedRef.current = false;
      // A figure the QS worked out himself — stamp it so the save keeps it.
      onChange?.(String(rounded), { source: "typed" });
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
      // He is working out a figure, not giving the line up.
      clearedRef.current = false;
      setFormulaDraft(v);
      setSearchQuery("");
      setSearchResults([]);
      return;
    }
    // Clear any previous formula draft when the user leaves formula mode.
    if (formulaDraft) setFormulaDraft("");
    // If it's a number, treat as direct rate input
    if (/^[\d.,]*$/.test(v)) {
      const cleaned = v.replace(/,/g, "");
      const empty = cleaned.trim() === "";
      clearedRef.current = empty;
      // Typed straight into the cell. Stamped as applied so the server stops
      // re-deriving the line from a build-up the QS did not price.
      //
      // An EMPTY cell is not that. This regex matches "" too, so emptying the
      // field used to stamp the line as the QS's for ever — with no way on
      // screen to take it back. Clearing a rate means "I have no rate", so a
      // COMMITTED empty cell releases the stamp and the line goes back to
      // being derived from its Budget build-up.
      //
      // But the keystroke that empties the field on the way to retyping the
      // figure is not a decision about anything. It used to report itself as
      // cleared there and then, which released the lock, dropped the line back
      // into the Budget-driven set on the same render, and replaced the input
      // the QS was typing into with a read-only lock chip — and a save from
      // there wrote the OLD figure with the lock stripped, so the server
      // re-derived the line and the rate silently changed. So the empty cell
      // reports itself as `editing`: the text changes, nothing else does, and
      // the release waits for the commit (see commitClearRef).
      onChange?.(cleaned, { source: empty ? "editing" : "typed" });
      setSearchQuery("");
      setSearchResults([]);
    } else {
      // Text — search RateGen. He is looking for a rate to put in, so an
      // abandoned search leaves the line exactly as it was rather than
      // releasing it.
      clearedRef.current = false;
      setSearchQuery(v);
    }
  };

  const pickRate = (candidate, useConverted = false) => {
    let cost = safeNum(candidate?.totalCost);

    if (useConverted && candidate?._conversion) {
      cost = candidate._conversion.convertedCost;
    } else {
      // Auto-convert if units differ
      const conversion = convertRateUnit(
        cost,
        candidate?.unit,
        itemUnit,
        itemDescription,
      );
      if (conversion) {
        cost = conversion.convertedCost;
      }
    }

    // Round to 2 decimal places
    cost = Math.round(cost * 100) / 100;
    clearedRef.current = false;
    // Carry WHICH rate priced the line, not just the number. The parent stamps
    // it onto the bill line as appliedRateKey, which is what stops the save
    // re-deriving the rate away from under the pick.
    onChange?.(String(cost), {
      source: "rategen",
      rateKey: String(candidate?.description || "").trim(),
      rateUnit: String(candidate?.unit || "").trim(),
    });
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
        <span aria-hidden="true" className="text-[10px] text-slate-400">
          🔒
        </span>
        <span className="truncate">
          {displayValue || (
            <span className="text-slate-400">
              {formatRate(placeholder) || "0"}
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Static display, shown when not focused */}
      {!focused ? (
        <button
          type="button"
          className="input !h-8 w-full !min-w-0 !px-1.5 !py-0.5 text-xs text-left cursor-text"
          onClick={handleFocus}
        >
          {displayValue || (
            <span className="text-slate-400">
              {formatRate(placeholder) || "0"}
            </span>
          )}
        </button>
      ) : (
        /* Expanded popup overlay on focus */
        <div className="absolute left-0 top-0 z-40 w-80" style={POP}>
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
              placeholder={
                canRateGenBoq
                  ? "Enter rate, =formula, or type a name…"
                  : "Enter rate or =formula…"
              }
              onChange={handleInputChange}
              onBlur={() => {
                // Commit formula on blur if we have a valid result —
                // mirrors Excel's behaviour. Invalid formulas stay in
                // the draft so the user can fix them without losing
                // their work.
                if (formulaResult && formulaResult.ok) commitFormula();
                // Leaving an emptied cell is the commit that releases the
                // lock. Does nothing on a cell the QS merely looked at.
                commitClearRef.current?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Escape abandons the edit. Nothing is committed, so an
                  // emptied cell keeps the rate and the lock it arrived with.
                  clearedRef.current = false;
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
                    return;
                  }
                  // Enter on an emptied cell commits the release, the same as
                  // clicking away — one keystroke does not, two do.
                  if (clearedRef.current) {
                    e.preventDefault();
                    commitClearRef.current?.();
                    setFocused(false);
                  }
                }
              }}
            />
            {/* Live formula preview / hint strip */}
            {formulaResult ? (
              <div
                className="mt-1 rounded-md border px-2 py-1 text-[11px]"
                style={palChip(formulaResult.ok ? "light" : "orange")}
              >
                {formulaResult.ok ? (
                  <span>
                    <span className="opacity-70">= </span>
                    <strong>
                      {formatRate(formulaResult.value) || formulaResult.value}
                    </strong>
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
                Tip: start with{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-mono">
                  =
                </code>{" "}
                for a formula, e.g.{" "}
                <code className="font-mono">=1.2*1.5*95000</code>
                {canRateGenBoq ? " · or type a name to search RateGen" : ""}
              </div>
            )}
          </div>

          {/* Search results / candidates dropdown */}
          {searchResults.length > 0 || searching ? (
            <div className="border-t">
              {searching && (
                <div className="px-3 py-2 text-xs text-slate-500 animate-pulse">
                  Searching rates...
                </div>
              )}
              <div className="max-h-60 overflow-auto">
                {searchResults.slice(0, 10).map((c, idx) => {
                  const conversion = convertRateUnit(
                    safeNum(c.totalCost),
                    c.unit,
                    itemUnit,
                    itemDescription,
                  );
                  const convertedCost = conversion
                    ? Math.round(conversion.convertedCost * 100) / 100
                    : null;
                  const unitMismatch =
                    itemUnit &&
                    c.unit &&
                    normUnit(c.unit) !== normUnit(itemUnit);

                  return (
                    <button
                      key={`${c.description}-${c.unit}-${idx}`}
                      type="button"
                      className="w-full border-b px-3 py-1.5 text-left hover:bg-blue-50 last:border-b-0"
                      onClick={() =>
                        pickRate({ ...c, _conversion: conversion })
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-medium text-slate-800">
                          {c.description}
                        </div>
                        <div className="text-right">
                          {conversion ? (
                            <>
                              <div className="whitespace-nowrap text-xs font-semibold text-adlm-blue-700">
                                {formatRate(convertedCost)}/
                                {normUnit(itemUnit) || itemUnit}
                              </div>
                              <div className="whitespace-nowrap text-[9px] text-slate-400 line-through">
                                {formatRate(c.totalCost)}/{c.unit}
                              </div>
                            </>
                          ) : (
                            <div className="whitespace-nowrap text-xs font-semibold text-adlm-blue-700">
                              {formatRate(c.totalCost)}/{c.unit || "–"}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {c.unit}
                        {c.sectionLabel ? ` | ${c.sectionLabel}` : ""}
                        {c.source ? ` | ${c.source}` : ""}
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
                  {searchResults.length} rate
                  {searchResults.length !== 1 ? "s" : ""} found
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
          onChange?.(String(Math.round(formulaResult.value * 100) / 100));
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
        {value !== "" && value != null ? (
          <span>{type === "number" ? formatRate(value) : value}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
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
      {/* Live formula preview: green when valid, rose when not. Hides
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
          Tip: start with{" "}
          <code className="rounded bg-slate-100 px-1 font-mono">=</code> for a
          formula (e.g. <code className="font-mono">=1.2*1.5</code>)
        </div>
      )}
    </div>
  );
}

// ── Summary rows (his .pj-sumbox pieces) ──────────────────────────────────
// A percentage row: the label, an inline % input while the contract is open,
// and the money it works out to. Read-only after lock, where it prints the
// percentage as text so the figure is still explained.
function SummaryPercentRow({
  label,
  percent,
  amount,
  editable,
  onChange,
  onCommit,
  title,
}) {
  return (
    <div className="r">
      <span className="l" title={title}>
        {label}
        {editable && onChange ? (
          <>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              data-pct={label}
              value={safeNum(percent)}
              aria-label={`${label} percent`}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => onCommit?.()}
            />
            %
          </>
        ) : (
          <span style={{ color: "var(--ink-3)" }}>· {safeNum(percent)}%</span>
        )}
      </span>
      <b>{money(amount)}</b>
    </div>
  );
}

// One named group of sums — PC or provisional — with its own sub-total, its
// rows, and an add link. Each row keeps the index it holds in the single
// stored provisionalSums array, so an edit writes back to the right row.
function SummarySumGroup({
  kind,
  label,
  addLabel,
  rows,
  total,
  editable,
  onAdd,
  onUpdate,
  onRemove,
  // Dead while rates are hidden: removing a sum throws away an amount this
  // viewer was served as zero. Everything else in the group stays editable.
  removeDisabled = false,
  onCommit,
  checkboxCls,
}) {
  return (
    <div className="grp">
      <div className="r h">
        <span className="l">{label}</span>
        <b>{money(total)}</b>
      </div>
      {rows.map(({ sum, index }) => (
        <div className="r s" key={`${kind}-${index}`}>
          {editable ? (
            <>
              <input
                type="text"
                value={sum?.description || ""}
                aria-label="Description"
                placeholder={kind === "pc" ? "e.g. Lift installation" : "e.g. Drainage allowance"}
                onChange={(e) => onUpdate?.(index, { description: e.target.value })}
              />
              <input
                type="number"
                step="1000"
                value={sum?.amount === 0 || sum?.amount == null ? "" : sum.amount}
                aria-label="Amount"
                placeholder="0"
                onChange={(e) =>
                  onUpdate?.(index, {
                    amount: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
                onBlur={() => onCommit?.()}
              />
              {/* Ours, not his: the tick that says this allowance has actually
                been executed. It is what lets the sum count toward earned
                value, so dropping it to match his design would lose data. */}
              <label
                className="pj-sum-done"
                title="Tick once this allowance has been executed, so it counts toward earned value."
              >
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={Boolean(sum?.completed)}
                  onChange={(e) => onUpdate?.(index, { completed: e.target.checked })}
                />
                Executed
              </label>
              <button
                type="button"
                className="x"
                aria-label={`Remove ${sum?.description || label}`}
                title={removeDisabled ? RATES_HIDDEN_NO_DELETE : "Remove this sum"}
                disabled={removeDisabled}
                onClick={() => {
                  if (removeDisabled) return;
                  onRemove?.(index);
                }}
              >
                <FaTimes size={13} aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <span className="l">
                {sum?.description || EN_DASH}
                {sum?.completed ? (
                  <em style={{ fontStyle: "normal", color: "var(--fb-ok)", fontSize: 12 }}>
                    Executed
                  </em>
                ) : null}
              </span>
              <b>{money(sum?.amount)}</b>
            </>
          )}
        </div>
      ))}
      {rows.length === 0 ? (
        <div className="r s">
          <span className="l">None</span>
          <b>{EN_DASH}</b>
        </div>
      ) : null}
      {editable && onAdd ? (
        <button type="button" className="pj-lnk add" onClick={() => onAdd(kind)}>
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function ProjectBillTable({
  // P0.4: the line to bring into view when the bill opens ("continue where
  // you left off"), and a callback told which line was last worked on.
  focusLine = "",
  onLine,
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
  // Map of item index -> { state, budgetRate } for lines whose rate the QS
  // applied himself and whose Budget build-up does not agree with it. Empty
  // for every project nobody has re-priced, so the table is unchanged.
  rateNotes = null,
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
  // Ordered source-project names for a merged project, so the Bill sections
  // appear in the order the disciplines were merged rather than alphabetically.
  sourceOptions = [],
  onGroupByModeChange,
  // False when this viewer is a collaborator without RateGen, so every rate and
  // amount reached them as zero (the server's maskRates). They may still
  // measure, mark progress, edit and add rows — the server keeps the owner's
  // pricing on whatever they save — but removing a row is a decision about
  // money they cannot see, so the delete controls are dead for them. Already
  // passed by ProjectOpenView; it was simply not read here.
  canSeeRates = true,
  contractLocked = false,
  contractLockedAt = null,
  contractApprovedAt = null,
  contractSum = 0,
  // S18 bill: the measured work on its own. `grossAmount` reaches this table
  // already carrying the project's whole scope (the Overview needs it that
  // way), so using it as the base of the grand summary counted the sums and
  // the preliminaries a second time. The Summary uses this instead, and falls
  // back to grossAmount for any caller that does not pass it.
  measuredAmount = null,
  // S18 bill: the bill went out to tender on this date (PR2-25), and the
  // Summary's "See variations" link (PR2-05).
  tenderedAt = null,
  onMarkTendered,
  onOpenVariations,
  // S18 bill: put a removed sum back at the index it came from, for the
  // toast's Undo.
  onRestoreProvisionalSum,
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
  stepUpEnabled = false,
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
  showActualColumns = false,
  showMaterials = false,
  statusLabel = "Completed",
  linkedSummaries = [],
  onRemoveCategory,
}) {
  const statusLabelLower = String(statusLabel || "Completed").toLowerCase();
  const statusActionText = showMaterials
    ? "Mark as purchased"
    : "Mark as completed";
  const statusOffText = showMaterials ? "Not purchased" : "Not completed";
  const statusPendingText = showMaterials
    ? "Save to log this purchase date and deduct it from the balance."
    : "Save to log this completion date and deduct it from the balance.";

  // The site-wide toast (his feedback.js). Declared before the callbacks that
  // close over it, so its dependency arrays can name it.
  const fb = useFeedback();

  const handleColResize = useColResize();

  // Column sorting state
  const [sortCol, setSortCol] = useState(null); // "sn" | "description" | "qty" | "unit" | "rate" | "grossAmt" | "balance" | null
  const [sortAsc, setSortAsc] = useState(true);

  // Drag-and-drop reorder state
  const [dragIdx, setDragIdx] = useState(null); // items-array index being dragged
  const [dragOverIdx, setDragOverIdx] = useState(null); // items-array index being hovered
  // Category/section header being hovered while dragging a row — drop there to
  // re-assign the dragged item to that category (or trade in trade mode).
  const [dragOverCat, setDragOverCat] = useState(null);

  // Assign the dragged bill item to a category/section. Marks dirty → Save
  // persists it and the server learns the mapping for future projects.
  const assignDraggedToCategory = useCallback(
    (category) => {
      if (dragIdx == null) return;
      const trade = String(groupByMode || "category") === "trade";
      if (trade) onTradeChange?.(dragIdx, category);
      else onCategoryChange?.(dragIdx, category);
      setDragIdx(null);
      setDragOverIdx(null);
      setDragOverCat(null);
      // His "Moved to X" (PR2-12). Dropping a row onto a section is a small
      // gesture with no other confirmation, so it says what it did.
      fb.toast({ tone: "info", title: `Moved to ${category}`, ms: 2200 });
    },
    [dragIdx, groupByMode, onTradeChange, onCategoryChange, fb],
  );

  // Ribbon tab state — mirrors MS Office ribbon (Home / Rates / Navigate / Extras)
  const [ribbonTab, setRibbonTab] = useState("home");

  // Build a Map<identity → {count, taskNames}> from the PM dashboard's
  // boqItems list. The server already computes linkCount + linkedTaskNames
  // for every BoQ entry by walking projectManagement.tasks. We just need
  // a quick lookup keyed by identity so each row can read its own stats.
  const boqLinkStats = React.useMemo(() => {
    const map = new Map();
    const boqs = Array.isArray(pmDashboard?.boqItems)
      ? pmDashboard.boqItems
      : [];
    for (const entry of boqs) {
      const count = Number(entry?.linkCount) || 0;
      if (count > 0) {
        map.set(String(entry.identity), {
          count,
          taskNames: Array.isArray(entry.linkedTaskNames)
            ? entry.linkedTaskNames
            : [],
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
      String(item?.code || "")
        .trim()
        .toLowerCase(),
      String(item?.description || "")
        .trim()
        .toLowerCase(),
      String(item?.takeoffLine || "")
        .trim()
        .toLowerCase(),
      String(item?.materialName || "")
        .trim()
        .toLowerCase(),
      String(item?.unit || "")
        .trim()
        .toLowerCase(),
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
      } catch {
        /* ignore */
      }
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
  // P0.4: open on the line somebody was last working on, and mark it briefly.
  // Rows can take a moment to arrive, so it looks for the row for a few seconds.
  const focusedLineRef = useRef("");
  useEffect(() => {
    if (!focusLine || focusedLineRef.current === focusLine) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      const sel = `tr[data-line="${String(focusLine).replace(/["\\]/g, "")}"]`;
      const el = document.querySelector(sel);
      if (el || ++tries > 20) clearInterval(t);
      if (!el) return;
      focusedLineRef.current = focusLine;
      el.scrollIntoView({ block: "center" });
      el.style.outline = "2px solid var(--action)";
      el.style.outlineOffset = "-2px";
      setTimeout(() => {
        el.style.outline = "";
        el.style.outlineOffset = "";
      }, 2500);
    }, 150);
    return () => clearInterval(t);
  }, [focusLine]);

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
      setShowFloatNav(
        window.innerHeight < document.documentElement.scrollHeight - 200,
      );
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

  const handleSort = useCallback(
    (col) => {
      if (sortCol === col) {
        setSortAsc((prev) => !prev);
      } else {
        setSortCol(col);
        setSortAsc(true);
      }
    },
    [sortCol],
  );

  // Apply sorting to computedShown
  const sortedShown = React.useMemo(() => {
    if (!sortCol) return computedShown;
    const sorted = [...computedShown];
    const dir = sortAsc ? 1 : -1;

    sorted.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "sn":
          va = a.sn;
          vb = b.sn;
          break;
        case "description":
          va = (a.description || "").toLowerCase();
          vb = (b.description || "").toLowerCase();
          return dir * va.localeCompare(vb);
        case "qty":
          va = a.qty || 0;
          vb = b.qty || 0;
          break;
        case "unit":
          va = (a.unit || "").toLowerCase();
          vb = (b.unit || "").toLowerCase();
          return dir * va.localeCompare(vb);
        case "rate":
          va = a.fullAmount / (a.qty || 1);
          vb = b.fullAmount / (b.qty || 1);
          break;
        case "grossAmt":
          va = a.fullAmount || 0;
          vb = b.fullAmount || 0;
          break;
        case "deducted":
          va = a.valuedAmount || 0;
          vb = b.valuedAmount || 0;
          break;
        case "balance":
          va = a.amount || 0;
          vb = b.amount || 0;
          break;
        default:
          return 0;
      }
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
    return sorted;
  }, [computedShown, sortCol, sortAsc]);

  // Group rows by either category (building element) or trade (work section)
  // depending on groupByMode. Canonical order first, unknowns last.
  const mode = String(groupByMode || "category");
  const isTradeGrouping = mode === "trade";
  // "source" groups a MERGED project by the discipline project each line came
  // from — the default there, because a QS reading a combined bill wants to see
  // architectural and structural as distinct sections before anything else.
  const isSourceGrouping = mode === "source";
  const activeCanonical = isSourceGrouping
    ? Array.isArray(sourceOptions)
      ? sourceOptions
      : []
    : isTradeGrouping
      ? Array.isArray(tradeOptions)
        ? tradeOptions
        : []
      : Array.isArray(categoryOptions)
        ? categoryOptions
        : [];

  const groupedRows = React.useMemo(() => {
    const map = new Map();
    for (const row of sortedShown) {
      const key = isSourceGrouping
        ? String(row.sourceName || "Unassigned").trim() || "Unassigned"
        : isTradeGrouping
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
  }, [sortedShown, activeCanonical, isTradeGrouping, isSourceGrouping]);

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

  // ── What the table's own money columns add up to (S18 review) ───────────
  // Every money column in this table lists the MEASURED WORK: one row per item
  // of work, priced qty × rate. So the row that closes those columns, and the
  // total under "Summary by category", add up those same rows.
  //
  // They used to print the whole project scope instead — measured work plus
  // the sums plus preliminaries plus approved variations — which is a larger
  // and different figure, so the Bill contradicted itself on one screen. The
  // estimated total, the full cascade, is the Summary box's job and it is
  // labelled as such; these are labelled "measured work".
  const shownTotals = React.useMemo(
    () =>
      sortedShown.reduce(
        (acc, row) => ({
          full: acc.full + safeNum(row.fullAmount),
          valued: acc.valued + safeNum(row.valuedAmount),
          balance: acc.balance + safeNum(row.amount),
        }),
        { full: 0, valued: 0, balance: 0 },
      ),
    [sortedShown],
  );

  const totalCols = showActualColumns ? 14 : 10;

  // ── The project's totals ────────────────────────────────────────────────
  // One module does this arithmetic for every screen now (PR2-08). The
  // cascade is unchanged: prelims on measured work plus the sums, contingency
  // on the sub-total, VAT on sub-total plus contingency, approved variations
  // after VAT — the same order the server freezes at contract lock.
  const measuredWork = measuredAmount == null ? grossAmount : safeNum(measuredAmount);
  const totals = React.useMemo(
    () =>
      projectTotals({
        measured: measuredWork,
        provisionalSums,
        variations,
        preliminaryPercent,
        contingencyPercent,
        taxPercent,
        linkedSummaries,
      }),
    [
      measuredWork,
      provisionalSums,
      variations,
      preliminaryPercent,
      contingencyPercent,
      taxPercent,
      linkedSummaries,
    ],
  );

  // Approved variations only (S18 valuations). A row with no status is
  // approved — that is every row written before the field existed — so no
  // existing project's figure moves. A pending one is worth nothing here
  // until somebody approves it on the Valuation tab.
  const variationsTotal = totals.variations;
  const variationCounts = React.useMemo(
    () => variationKpis(variations),
    [variations],
  );
  const provisionalTotal = totals.sums;
  const preliminaryAmount = totals.prelims;

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
  const preliminaryOutstanding = Math.max(
    0,
    preliminaryAmount - preliminaryDone,
  );

  // The Summary is editable while the contract is open. After lock it stays
  // on screen and stays readable, but nothing in it can be changed: that is
  // what "changes go through variations" means.
  const summaryEditable = !contractLocked;

  // Rates are hidden from this viewer. Only the delete controls read it — the
  // rest of the table stays exactly as editable as it was, because measuring
  // and marking progress is what a rate-blind collaborator is here to do.
  const ratesMasked = canSeeRates === false;
  const sumGroups = React.useMemo(
    () => splitProvisionalSums(provisionalSums),
    [provisionalSums],
  );

  // His toast after every Summary edit, so a change to a percentage or a sum
  // reports what it did to the figure that matters.
  const sayUpdated = React.useCallback(() => {
    fb.toast({
      tone: "info",
      title: "Summary updated",
      msg: `Estimated total ${money(totals.total)}`,
      ms: 2400,
    });
  }, [fb, totals.total]);

  const addSum = React.useCallback(
    (kind) => {
      // A row with no description and no amount is dropped by the server's
      // sanitiser, so a new sum starts with a name it can be saved under.
      onAddProvisionalSum?.(kind === "pc" ? "pc" : "provisional");
    },
    [onAddProvisionalSum],
  );

  const removeSum = React.useCallback(
    (index) => {
      const list = Array.isArray(provisionalSums) ? provisionalSums : [];
      const gone = list[index];
      if (!gone) return;
      onRemoveProvisionalSum?.(index);
      fb.toast({
        tone: "info",
        title: `Removed ${gone.description || "the sum"}`,
        ...(onRestoreProvisionalSum
          ? {
              action: {
                label: "Undo",
                run: () => onRestoreProvisionalSum(index, gone),
              },
            }
          : {}),
      });
    },
    [provisionalSums, onRemoveProvisionalSum, onRestoreProvisionalSum, fb],
  );

  // projectTotal is the LIVE total — what users actually owe today
  // (planned + approved variations issued so far).
  const projectTotal = totals.total;

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
          <span style={{ color: "var(--action)" }}>{sortAsc ? "▲" : "▼"}</span>
        ) : (
          <span style={{ color: "var(--ink-3)", opacity: 0.6 }}>⇅</span>
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

  // A group of bill tools: his .wk-grp title above, the controls below.
  const RibbonGroup = ({ title, children }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 120,
        padding: "10px 14px",
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--bg-alt)",
      }}
    >
      <div className="wk-grp" style={{ padding: 0 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {children}
      </div>
    </div>
  );

  // His small outline button; the "active" state is his primary.
  const RibbonButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
    title,
    active,
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={`ds-btn ds-btn-sm ${active ? "btn-p" : "btn-o"}`}
    >
      {Icon ? <Icon size={13} /> : null}
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
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
    // Empty categories/sections (e.g. one you just created) — surfaced so they
    // are findable in Quick Jump and you can scroll to their drop zone.
    if (!itemQuery) {
      for (const cat of Array.isArray(activeCanonical) ? activeCanonical : []) {
        const c = String(cat || "").trim();
        if (!c || c === "Uncategorized" || c === "Other") continue;
        if (groupedRows.some((g) => g.category === c)) continue;
        out.push({
          id: `cat-${c}`,
          label: c,
          badge: isTradeGrouping ? "Trade" : "Cat",
          refGetter: () => categoryAnchorRef.current?.[c] || null,
        });
      }
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
        // The sums now live in the Summary, which is where this ref sits.
        id: "provisional",
        label: "Summary",
        badge: "Σ",
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
  }, [groupedRows, isTradeGrouping, activeCanonical, itemQuery]);

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

        {/* Floating Undo bar, sticky at top while any delete is in the
          stack. Lets users recover from accidental trash clicks. */}
        {Array.isArray(boqUndoStack) && boqUndoStack.length > 0 ? (
          <BoqUndoBar
            stack={boqUndoStack}
            onUndo={onBoqUndo}
            onClear={onBoqUndoClear}
          />
        ) : null}

        {/* The bill's tools, in his pieces: .wk-tabs for the ribbon's tabs,
            the running totals as his readings, and the tools below in titled
            groups. The totals stay visible when the tools are hidden. */}
        <div className="wk-panel">
          <div className="wk-ph" style={{ flexWrap: "wrap", gap: 12 }}>
            <div
              className="wk-tabs"
              role="tablist"
              aria-label="Bill tools"
              style={{ maxWidth: "100%", overflowX: "auto" }}
            >
              {RIBBON_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={ribbonTab === tab.id}
                  className={ribbonTab === tab.id ? "on" : ""}
                  onClick={() => setRibbonTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: "6px 14px",
                marginLeft: "auto",
              }}
            >
              <span className="wk-locnote">
                Measured <b style={READING}>{money(totals.measured)}</b>
              </span>
              {provisionalTotal > 0 ? (
                <span className="wk-locnote">
                  PC <b style={READING}>{money(provisionalTotal)}</b>
                </span>
              ) : null}
              {variationsTotal !== 0 ? (
                <span className="wk-locnote">
                  Variations{" "}
                  <b style={{ ...READING, color: "var(--pal-orange-key)" }}>
                    {money(variationsTotal)}
                  </b>
                </span>
              ) : null}
              <span className="wk-locnote" style={{ color: "var(--ink-2)" }}>
                Project total{" "}
                <b style={{ ...READING, fontSize: 15, color: "var(--action)" }}>
                  {money(projectTotal)}
                </b>
              </span>
              <button
                type="button"
                onClick={toggleRibbonCollapsed}
                aria-expanded={!ribbonCollapsed}
                aria-controls="boq-ribbon-body"
                className="ds-btn ds-btn-sm btn-o"
                title={ribbonCollapsed ? "Show the bill tools" : "Hide the bill tools"}
              >
                {ribbonCollapsed ? "Show tools" : "Hide tools"}
              </button>
            </div>
          </div>

          {ribbonCollapsed ? null : (
            <div
              id="boq-ribbon-body"
              style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "14px 20px" }}
            >
              {ribbonTab === "home" ? (
                <>
                  <RibbonGroup title="View">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={onlyFillEmpty}
                        onChange={(e) =>
                          onToggleOnlyFillEmpty?.(e.target.checked)
                        }
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
                      className="wk-loc-sw"
                      role="tablist"
                      aria-label="Group BoQ items by"
                    >
                      <button
                        type="button"
                        onClick={() => onGroupByModeChange?.("category")}
                        className={!isTradeGrouping && !isSourceGrouping ? "on" : ""}
                        title="Group by building element (Substructure / Superstructure / HVAC / Plumbing / Electrical)"
                      >
                        By element
                      </button>
                      <button
                        type="button"
                        onClick={() => onGroupByModeChange?.("trade")}
                        className={isTradeGrouping ? "on" : ""}
                        title="Group by trade / work section (Concrete Works, Formwork, Reinforcement, Masonry, Finishes, etc.)"
                      >
                        By trade
                      </button>
                      {sourceOptions.length ? (
                        <button
                          type="button"
                          onClick={() => onGroupByModeChange?.("source")}
                          className={isSourceGrouping ? "on" : ""}
                          title="Group by the discipline project each line was measured in (architectural, structural, ...)"
                        >
                          Discipline
                        </button>
                      ) : null}
                    </div>
                    <div className="wk-fx" style={{ maxWidth: 220, lineHeight: 1.45 }}>
                      {isSourceGrouping
                        ? "Grouped by the discipline project each line came from. Switch to element or trade to arrange the combined bill the usual way."
                        : isTradeGrouping
                        ? "Grouped by the work being done. Drag a row onto a section to re-file it, learned for next time."
                        : "Grouped by the element they belong to. Drag a row onto a category to re-file it, learned for next time."}
                    </div>
                    {(isTradeGrouping ? onAddTrade : onAddCategory) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const label = isTradeGrouping
                            ? "work section"
                            : "category";
                          const name =
                            typeof window !== "undefined"
                              ? window.prompt(`New ${label} name`)
                              : "";
                          const t = String(name || "").trim();
                          if (!t) return;
                          if (isTradeGrouping) onAddTrade?.(t);
                          else onAddCategory?.(t);
                        }}
                        className="ds-btn ds-btn-sm btn-o"
                        style={{ alignSelf: "flex-start" }}
                        title="Create a new category / work section, remembered for your future projects"
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
                        <b className="text-slate-800">
                          {money(actualTrackedAmount)}
                        </b>
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
                          onChange={(e) =>
                            onToggleAutoFillBoq?.(e.target.checked)
                          }
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
                      {/* His .pj-switch (work-proj.js wireAuto(), 17 Sep 2026).
                        Same setting as before — valuationSettings.rateSyncEnabled
                        — in his toggle, with the two toasts that say plainly
                        which way round the bill now is. */}
                      <label
                        className="pj-switch"
                        title="While this is on, a rate changed in your RateGen library is applied to this bill. Turn it off before the bill goes out."
                      >
                        <input
                          type="checkbox"
                          checked={rateSyncEnabled}
                          onChange={(e) => {
                            const on = e.target.checked;
                            onToggleRateSyncEnabled?.(on);
                            fb.toast(
                              on
                                ? {
                                    tone: "info",
                                    title: "This bill now follows RateGen",
                                    msg: "A rate changed in your library is applied here. Turn it off before the bill goes out.",
                                  }
                                : {
                                    tone: "info",
                                    title: "This bill keeps its own prices",
                                    msg: "Library changes no longer reach it.",
                                  },
                            );
                          }}
                        />
                        <i aria-hidden="true" />
                        Follow RateGen changes
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
                  <RibbonGroup
                    title={
                      isTradeGrouping ? "Jump to trade" : "Jump to category"
                    }
                  >
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
                    title="Add a variation from a site instruction. It waits for approval before it counts."
                  />
                  <RibbonButton
                    icon={FaListUl}
                    label="Go to list"
                    onClick={() => scrollToRef(variationsSectionRef.current)}
                  />
                  {onOpenVariations ? (
                    <RibbonButton
                      icon={FaClipboardList}
                      label="Approve / reject"
                      onClick={onOpenVariations}
                      title="Open the Valuation tab's Variations view, where variations are decided"
                    />
                  ) : null}
                  <div className="text-[11px] text-slate-600">
                    Approved total:{" "}
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
                            stepUpEnabled
                              ? onUnlockContract?.({})
                              : setPinModal({
                                  mode: "unlock",
                                  pin: "",
                                  confirm: "",
                                  err: "",
                                  busy: false,
                                })
                          }
                          disabled={contractBusy || !onUnlockContract}
                          title={
                            stepUpEnabled
                              ? "Unlock the contract, we'll email you a verification code."
                              : "Unlock the contract. You'll need the 4-digit PIN that was used to lock it."
                          }
                        />
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] text-amber-700">
                          ✎ Draft, editable
                        </div>
                        <RibbonButton
                          icon={FaFileInvoiceDollar}
                          label={contractBusy ? "Locking..." : "Lock contract"}
                          onClick={() =>
                            stepUpEnabled
                              ? onLockContract?.({ preliminaryPercent })
                              : setPinModal({
                                  mode: "lock",
                                  pin: "",
                                  confirm: "",
                                  err: "",
                                  busy: false,
                                })
                          }
                          disabled={contractBusy || !onLockContract}
                          title={
                            stepUpEnabled
                              ? "Freeze the priced scope. We'll email you a verification code to confirm."
                              : "Freeze the priced scope. You'll choose a 4-digit PIN to protect the lock."
                          }
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
                      <b className="text-slate-800">
                        {money(preliminaryAmount)}
                      </b>
                    </div>
                  </RibbonGroup>

                  <RibbonGroup title="Contract sum">
                    <div className="text-[11px] text-slate-600 leading-tight">
                      Measured: <b>{money(totals.measured)}</b>
                    </div>
                    <div className="text-[11px] text-slate-600 leading-tight">
                      PC and provisional sums: <b>{money(totals.sums)}</b>
                    </div>
                    <div className="text-[11px] text-slate-600 leading-tight">
                      Preliminaries: <b>{money(totals.prelims)}</b>
                    </div>
                    <div className="text-[12px] font-semibold text-adlm-blue-700">
                      Total: {money(totals.planned)}
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
                <RibbonGroup title="PC and provisional sums">
                  {[
                    { kind: "pc", label: "Add PC sum" },
                    { kind: "provisional", label: "Add provisional sum" },
                  ].map(({ kind, label }) => (
                    <RibbonButton
                      key={kind}
                      icon={FaPlus}
                      label={label}
                      onClick={() => {
                        if (contractLocked) return;
                        onAddProvisionalSum?.(kind);
                        setTimeout(
                          () => scrollToRef(provisionalSectionRef.current),
                          30,
                        );
                      }}
                      title={
                        contractLocked
                          ? "Contract locked. Unlock to add sums"
                          : kind === "pc"
                            ? "Add a prime-cost sum for a nominated supplier or subcontractor"
                            : "Add an allowance for work that is not yet defined"
                      }
                      disabled={!onAddProvisionalSum || contractLocked}
                    />
                  ))}
                  <RibbonButton
                    icon={FaListUl}
                    label="Go to Summary"
                    onClick={() => scrollToRef(provisionalSectionRef.current)}
                  />
                  <div className="text-[11px] text-slate-600">
                    PC <b className="text-slate-800">{money(totals.pc)}</b> ·
                    provisional{" "}
                    <b className="text-slate-800">{money(totals.provisional)}</b>
                  </div>
                </RibbonGroup>
              ) : null}
            </div>
          )}

          {!ribbonCollapsed && showActualColumns && ribbonTab === "home" ? (
            <p className="wk-note" style={{ borderTop: "1px solid var(--line)" }}>
              Actual amount uses the entered actual qty and actual rate. If only
              one actual field is entered, the other value falls back to the
              planned quantity or rate for comparison.
            </p>
          ) : null}
        </div>

        <div className="wk-bar" style={{ marginBottom: 0 }}>
          <label className="wk-find">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-search" />
            </svg>
            <input
              type="search"
              placeholder="Search items (description / group / S/N)..."
              aria-label="Search bill items"
              autoComplete="off"
              value={itemQuery}
              onChange={(e) => onItemQueryChange?.(e.target.value)}
            />
          </label>
          {itemQuery ? (
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-o"
              onClick={onClearItemQuery}
              title="Clear the search"
            >
              Clear
            </button>
          ) : null}
        </div>

        {!items.length ? (
          <div className="wk-empty">
            <b>No bill yet</b>
            <p>
              The bill is the measured work: every item, its quantity and the rate it is priced
              at. Items are not written here. They arrive with the project, from the takeoff it
              was measured in or from the Excel bill it was imported from.
            </p>
            <p>
              Save the project again from where it was measured, and the items land here to
              price, value and programme.
            </p>
          </div>
        ) : null}

        {items.length && !computedShown.length ? (
          <div className="wk-empty">
            No items match the current search.
          </div>
        ) : null}

        {computedShown.length ? (
          <div className="wk-panel" style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table
              className="w-full text-sm"
              style={{ tableLayout: "auto", minWidth: 0 }}
            >
              <colgroup>
                <col className="w-10" />{/* S/N */}
                <col
                  className={showActualColumns ? "w-10" : "w-[130px]"}
                />
                {/* Status */}
                <col
                  style={{ width: showActualColumns ? "22%" : "28%" }}
                />
                {/* Description, % based */}
                <col className="w-16" />{/* Qty */}
                <col className="w-10" />{/* Unit */}
                <col
                  style={{ width: showActualColumns ? "12%" : "16%" }}
                />
                {/* Rate */}
                {showActualColumns ? <col className="w-[100px]" /> : null}
                {/* Actual qty */}
                {showActualColumns ? <col className="w-[100px]" /> : null}
                {/* Actual rate */}
                {showActualColumns ? <col className="w-[90px]" /> : null}
                {/* Actual amount */}
                {showActualColumns ? <col className="w-[72px]" /> : null}
                {/* Actual added */}
                <col className="w-[90px]" />{/* Gross amount */}
                <col className="w-[72px]" />{/* Deducted */}
                <col className="w-[72px]" />{/* Balance */}
                <col className="w-[80px]" />{/* Actions */}
              </colgroup>
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <SortHeader col="sn">S/N</SortHeader>
                  <th className="px-2 py-2 text-xs" title={statusLabel}>
                    {showActualColumns ? "✓" : statusLabel}
                  </th>
                  <SortHeader
                    col="description"
                    className="relative px-2 py-2 text-xs cursor-pointer select-none hover:bg-slate-100"
                  >
                    Description
                  </SortHeader>
                  <SortHeader col="qty">Qty</SortHeader>
                  <SortHeader col="unit">Unit</SortHeader>
                  <SortHeader col="rate">Rate</SortHeader>
                  {showActualColumns ? (
                    <th className="px-2 py-2 text-xs">Actual qty</th>
                  ) : null}
                  {showActualColumns ? (
                    <th className="px-2 py-2 text-xs">Actual rate</th>
                  ) : null}
                  {showActualColumns ? (
                    <th className="px-2 py-2 text-xs">Actual amt</th>
                  ) : null}
                  {showActualColumns ? (
                    <th className="px-2 py-2 text-xs">Added</th>
                  ) : null}
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
                      className="scroll-mt-24 transition-colors"
                      style={sectionRowStyle(dragOverCat === category && dragIdx != null)}
                      data-section={`cat-${category}`}
                      onDragOver={(e) => {
                        if (dragIdx == null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverCat(category);
                      }}
                      onDragLeave={() =>
                        setDragOverCat((prev) =>
                          prev === category ? null : prev,
                        )
                      }
                      onDrop={(e) => {
                        e.preventDefault();
                        assignDraggedToCategory(category);
                      }}
                    >
                      <td colSpan={totalCols} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="wk-grp" style={{ padding: 0 }}>
                            {category}
                          </span>
                          <span className="wk-locnote">
                            {dragOverCat === category && dragIdx != null ? (
                              <span style={{ color: "var(--action)", fontWeight: 500 }}>
                                Drop to move here
                              </span>
                            ) : (
                              `${rows.length} ${rows.length === 1 ? "item" : "items"}`
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {rows.map((row, displayIndex) => {
                      const item = items[row.i] || {};
                      const groupId = row.groupId;
                      const canLink = Boolean(groupId) && row.groupCount >= 2;
                      const linked =
                        Boolean(groupId) && isGroupLinked?.(groupId);
                      const candidates = showMaterials
                        ? getCandidatesForItem?.(item) || []
                        : [];
                      const rateValue = rates?.[row.key] ?? "";
                      // Null unless this line's rate was applied by the QS and
                      // its Budget build-up disagrees with it.
                      const rateNote = rateNotes?.get?.(row.i) || null;
                      const actualQtyValue = actualQtyInputs?.[row.key] ?? "";
                      const actualRateValue = actualRateInputs?.[row.key] ?? "";
                      const actualDateLabel = formatDateTime(
                        row.actualUpdatedAt || row.actualRecordedAt,
                      );

                      const isDragging = dragIdx === row.i;
                      const isOver = dragOverIdx === row.i;

                      const lineKey = String(row.key ?? row.i);
                      return (
                        <tr
                          key={row.key || row.i}
                          data-line={lineKey}
                          onFocusCapture={() =>
                            onLine?.(
                              lineKey,
                              `line ${displayIndex + 1}${item.description ? `: ${String(item.description).slice(0, 60)}` : ""}`,
                            )
                          }
                          draggable={!sortCol}
                          onDragStart={(e) => {
                            setDragIdx(row.i);
                            e.dataTransfer.effectAllowed = "move";
                            // Make the drag image semi-transparent
                            if (e.currentTarget) {
                              e.dataTransfer.setDragImage(
                                e.currentTarget,
                                0,
                                0,
                              );
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
                            setDragOverIdx((prev) =>
                              prev === row.i ? null : prev,
                            );
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
                          className="border-t align-top transition-colors"
                          style={billRowStyle({
                            dragging: isDragging,
                            marked: row.isMarked,
                            dropAbove: isOver && dragIdx != null && dragIdx > row.i,
                            dropBelow: isOver && dragIdx != null && dragIdx < row.i,
                          })}
                        >
                          {/* Drag handle + S/N */}
                          <td className="px-1 py-2">
                            <div className="flex items-center gap-1">
                              {!sortCol && (
                                <span
                                  className="cursor-grab active:cursor-grabbing touch-none"
                                  style={{ color: "var(--ink-3)", display: "inline-flex" }}
                                  title="Drag to reorder"
                                >
                                  <FaGripVertical size={13} />
                                </span>
                              )}
                              <span className="font-medium text-slate-700">
                                {displayIndex + 1}
                              </span>
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
                                  onChange={(e) =>
                                    onStatusToggle?.(row.i, e.target.checked)
                                  }
                                  aria-label={statusActionText}
                                  title={
                                    row.isMarked ? statusLabel : statusOffText
                                  }
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
                                    onChange={(e) =>
                                      onStatusToggle?.(row.i, e.target.checked)
                                    }
                                    aria-label={statusActionText}
                                  />
                                  <span className="text-xs">
                                    {row.isMarked ? statusLabel : statusOffText}
                                  </span>
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

                          <td
                            className="px-2 py-2 overflow-hidden"
                            title={row.description}
                          >
                            <div className="font-medium text-slate-900 text-xs break-words leading-snug">
                              {row.description}
                            </div>
                            {/* WBS / Task link indicator. Renders a colour-coded
                          chip when this BoQ row is linked to one or more
                          PM tasks. Single link = green (healthy). 2+ = amber
                          (potential double-count in EV). 3+ = rose (likely
                          imbalance). Hover shows the task names. */}
                            <WbsLinkChip
                              stats={boqLinkStats.get(
                                boqItemIdentity(row, row.i),
                              )}
                            />
                            {row.groupId ? (
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                Group:{" "}
                                <span className="text-slate-700">
                                  {row.groupLabel} ({row.groupCount})
                                </span>
                                {linked ? (
                                  <span className="font-medium text-adlm-blue-700">
                                    {" "}
                                    | linked
                                  </span>
                                ) : null}
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
                                          const trimmed = String(
                                            name || "",
                                          ).trim();
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
                                      !categoryOptions.includes(
                                        row.category,
                                      ) ? (
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
                                          const trimmed = String(
                                            name || "",
                                          ).trim();
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
                                        <option value={row.trade}>
                                          {row.trade}
                                        </option>
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

                          <td className="px-2 py-2 text-xs text-slate-700">
                            {row.qty.toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-700">
                            {row.unit}
                          </td>

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
                                    placeholder={String(
                                      Number(item?.rate || 0),
                                    )}
                                    onChange={(v, meta) =>
                                      onRateChange?.(row.i, v, meta)
                                    }
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
                                    disabledHint="Contract locked. Unlock it to edit rates"
                                  />

                                  {candidates.length ? (
                                    <div className="relative">
                                      <button
                                        type="button"
                                        className="ds-btn ds-btn-sm btn-o"
                                        style={ICON_BTN}
                                        aria-label="Pick a matching material price"
                                        title="Pick a matching material price"
                                        onClick={() =>
                                          onToggleOpenPickKey?.(row.key)
                                        }
                                      >
                                        <FaSearch size={13} />
                                      </button>

                                      {openPickKey === row.key ? (
                                        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden" style={POP}>
                                          <div className="border-b px-3 py-2 text-xs text-slate-600">
                                            Choose a price for{" "}
                                            <b>
                                              {String(
                                                item?.materialName || "",
                                              ).trim()}
                                            </b>
                                          </div>

                                          <div className="max-h-64 overflow-auto">
                                            {candidates
                                              .slice(0, 10)
                                              .map((candidate) => {
                                                const unitMismatch =
                                                  String(
                                                    item?.unit || "",
                                                  ).trim() &&
                                                  String(
                                                    candidate?.unit || "",
                                                  ).trim() &&
                                                  String(item.unit)
                                                    .trim()
                                                    .toLowerCase() !==
                                                    String(candidate.unit)
                                                      .trim()
                                                      .toLowerCase();

                                                return (
                                                  <button
                                                    key={`${candidate.description || "candidate"}-${candidate.unit || ""}-${candidate.source || ""}`}
                                                    type="button"
                                                    className="w-full border-b px-3 py-2 text-left hover:bg-slate-50"
                                                    onClick={() =>
                                                      onPickCandidate?.(
                                                        row.i,
                                                        candidate,
                                                      )
                                                    }
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
                                                      {candidate.unit} |{" "}
                                                      {candidate.source}
                                                      {unitMismatch ? (
                                                        <span className="font-medium text-amber-700">
                                                          {" "}
                                                          | unit mismatch
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                          </div>

                                          <div className="flex justify-end p-2">
                                            <button
                                              type="button"
                                              className="ds-btn ds-btn-sm btn-o"
                                              onClick={onClosePickKey}
                                            >
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
                                    placeholder={String(
                                      Number(item?.rate || 0),
                                    )}
                                    onChange={(v, meta) =>
                                      onRateChange?.(row.i, v, meta)
                                    }
                                    onSearchRateGen={onSearchRateGen}
                                    canRateGenBoq={canRateGenBoq}
                                    boqCandidates={
                                      getBoqCandidatesForItem?.(item) || []
                                    }
                                    itemUnit={row.unit || item?.unit || ""}
                                    itemDescription={
                                      row.description || item?.description || ""
                                    }
                                    // Lock the rate as soon as the contract is
                                    // locked. Editing rates after sign-off would
                                    // silently drift the contract sum away from
                                    // the signed value — variations are the
                                    // proper channel for any rate change. Also lock
                                    // when the rate is derived from a priced Budget
                                    // build-up. That build-up is the NET of every
                                    // row under the line whatever its kind —
                                    // material, labour, plant, consumable — so the
                                    // words must not name two of them.
                                    disabled={
                                      contractLocked ||
                                      Boolean(
                                        budgetDrivenCodes &&
                                        budgetDrivenCodes.has(
                                          String(item?.code || "")
                                            .trim()
                                            .toLowerCase(),
                                        ),
                                      )
                                    }
                                    disabledHint={
                                      contractLocked
                                        ? "Contract locked. Unlock it on the Contract Admin tab to edit rates, or raise a variation."
                                        : "Rate derived from the Budget build-up (net of every resource row + O&P). Edit the prices on the Budget tab."
                                    }
                                  />

                                  <button
                                    type="button"
                                    className="ds-btn ds-btn-sm btn-o"
                                    style={{ ...ICON_BTN, ...(linked ? palChip("light") : null) }}
                                    aria-pressed={linked}
                                    aria-label="Link similar items"
                                    title={
                                      canLink
                                        ? linked
                                          ? "Linked: rate changes propagate to similar items"
                                          : "Link similar items"
                                        : "No similar items found to link"
                                    }
                                    disabled={!canLink}
                                    onClick={() =>
                                      onToggleGroupLink?.(groupId, row.i)
                                    }
                                  >
                                    <FaLink size={13} />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* The honest state of a rate the QS applied
                          himself: it is the line's rate now, but the Budget
                          prices the same line differently, so say so instead
                          of showing two figures that quietly disagree. Only a
                          real contradiction appears here — a line with nothing
                          priced against it has nothing to reconcile with and
                          says nothing at all.

                          A released rate is the other note, and the urgent
                          one: the cell is empty, the line still shows the old
                          figure, and the NEXT SAVE hands it to the Budget. He
                          reads which figure is coming before he writes it. */}
                            {rateNote?.state === "released" ? (
                              <div
                                className="mt-0.5 text-[11px] text-amber-700"
                                title="The rate cell is empty, so this line goes back to being priced by its Budget build-up. Type a rate again to keep the one on screen."
                              >
                                {"Rate released. Saving prices this line from the Budget build-up: "}
                                {rateNote.budgetRate == null
                                  ? EN_DASH
                                  : money(rateNote.budgetRate)}
                              </div>
                            ) : rateNote ? (
                              <div
                                className="mt-0.5 text-[11px] text-amber-700"
                                title="This rate is the one applied to the line. The Budget build-up still prices it differently, so the two do not reconcile."
                              >
                                {"Rate applied. Budget build-up: "}
                                {money(rateNote.budgetRate)}
                                <span className="text-slate-500">
                                  {" (not reconciled)"}
                                </span>
                              </div>
                            ) : null}
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
                            to search RateGen, same behaviour as the
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
                                boqCandidates={
                                  getBoqCandidatesForItem?.(item) || []
                                }
                                itemUnit={row.unit || item?.unit || ""}
                                itemDescription={
                                  row.description || item?.description || ""
                                }
                              />
                            </td>
                          ) : null}

                          {showActualColumns ? (
                            <td className="px-2 py-2 text-xs font-medium text-slate-900">
                              {row.actualHasData
                                ? money(row.actualAmount)
                                : "-"}
                            </td>
                          ) : null}

                          {showActualColumns ? (
                            <td className="px-2 py-2 text-[10px] text-slate-500">
                              {actualDateLabel ||
                                (row.actualHasData ? "Pending save" : "-")}
                            </td>
                          ) : null}

                          <td className="px-2 py-2 text-xs font-medium text-slate-900">
                            {money(row.fullAmount)}
                          </td>
                          <td className="px-2 py-2 text-xs font-medium text-emerald-700">
                            {money(row.valuedAmount)}
                          </td>
                          <td className="px-2 py-2 text-xs font-semibold text-slate-900">
                            {money(row.amount)}
                          </td>

                          {/* Actions: move up / move down / delete */}
                          <td className="px-1 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                className="ds-btn ds-btn-sm btn-o"
                                style={ROW_BTN}
                                title="Move up"
                                disabled={row.i === 0}
                                onClick={() => onMoveItem?.(row.i, row.i - 1)}
                              >
                                <FaArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="ds-btn ds-btn-sm btn-o"
                                style={ROW_BTN}
                                title="Move down"
                                disabled={row.i >= items.length - 1}
                                onClick={() => onMoveItem?.(row.i, row.i + 1)}
                              >
                                <FaArrowDown size={12} />
                              </button>
                              <button
                                type="button"
                                className="ds-btn ds-btn-sm btn-o"
                                style={ROW_BTN}
                                title={
                                  ratesMasked
                                    ? RATES_HIDDEN_NO_DELETE
                                    : contractLocked
                                      ? "Contract locked. Unlock it to delete measured items, or raise a variation"
                                      : "Delete row (you'll be able to undo)"
                                }
                                disabled={contractLocked || ratesMasked}
                                onClick={() => {
                                  if (contractLocked || ratesMasked) return;
                                  onDeleteItem?.(row.i);
                                }}
                              >
                                <FaTrashAlt size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={SUBTOTAL_ROW}>
                      <td colSpan={6} className="px-2 py-2 text-right">
                        Subtotal, {category}
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

                {/* Empty categories/sections (e.g. ones you just created) render
                  as drop zones so you can drag work items into them. Hidden
                  while searching to avoid clutter. */}
                {!itemQuery
                  ? activeCanonical
                      .filter(
                        (c) =>
                          c &&
                          c !== "Uncategorized" &&
                          c !== "Other" &&
                          !groupedRows.some((g) => g.category === c),
                      )
                      .map((category) => (
                        <React.Fragment key={`empty-cat-${category}`}>
                          <tr
                            ref={(el) => {
                              categoryAnchorRef.current[category] = el;
                            }}
                            className="scroll-mt-24 transition-colors"
                      style={sectionRowStyle(dragOverCat === category && dragIdx != null)}
                            data-section={`cat-${category}`}
                            onDragOver={(e) => {
                              if (dragIdx == null) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              setDragOverCat(category);
                            }}
                            onDragLeave={() =>
                              setDragOverCat((prev) =>
                                prev === category ? null : prev,
                              )
                            }
                            onDrop={(e) => {
                              e.preventDefault();
                              assignDraggedToCategory(category);
                            }}
                          >
                            <td colSpan={totalCols} className="px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="wk-grp" style={{ padding: 0 }}>
                                  {category}
                                </span>
                                <span className="wk-locnote">
                                  {dragOverCat === category &&
                                  dragIdx != null ? (
                                    <span style={{ color: "var(--action)", fontWeight: 500 }}>
                                      Drop to move here
                                    </span>
                                  ) : (
                                    "empty"
                                  )}
                                </span>
                              </div>
                            </td>
                          </tr>
                          <tr
                            onDragOver={(e) => {
                              if (dragIdx == null) return;
                              e.preventDefault();
                              setDragOverCat(category);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              assignDraggedToCategory(category);
                            }}
                          >
                            <td
                              colSpan={totalCols}
                              className="px-3 py-4 text-center text-[11px] text-slate-400"
                            >
                              Drag a work item here to file it under “{category}
                              ”.
                            </td>
                          </tr>
                        </React.Fragment>
                      ))
                  : null}
              </tbody>

              <tfoot>
                <tr style={TOTAL_ROW}>
                  <td
                    className="px-2 py-2"
                    colSpan={6}
                    title="The measured work these columns list. Preliminaries, PC and provisional sums, contingency, VAT and approved variations are in the Summary below, which gives the estimated total."
                  >
                    Totals · measured work
                  </td>
                  {showActualColumns ? <td className="px-2 py-2" /> : null}
                  {showActualColumns ? <td className="px-2 py-2" /> : null}
                  {showActualColumns ? (
                    <td className="px-2 py-2 text-adlm-blue-700">
                      {money(actualTrackedAmount)}
                    </td>
                  ) : null}
                  {showActualColumns ? <td className="px-2 py-2" /> : null}
                  <td className="px-2 py-2">{money(shownTotals.full)}</td>
                  <td className="px-2 py-2 text-emerald-700">
                    {money(shownTotals.valued)}
                  </td>
                  <td className="px-2 py-2">{money(shownTotals.balance)}</td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {computedShown.length && categoryTotals.length > 1 ? (() => {
          const activeSummaries = linkedSummaries.filter(
            (l) => l && (l.live?.total || l.snapshot?.total),
          );
          const linkedGrandTotal = activeSummaries.reduce(
            (s, l) => s + (Number(l.live?.total ?? l.snapshot?.total) || 0),
            0,
          );
          const grandTotal = shownTotals.full + linkedGrandTotal;
          return (
            <div className="wk-panel">
              <div className="wk-ph">
                <h2>Summary by category</h2>
              </div>
              <div style={{ overflowX: "auto", padding: "4px 20px 16px" }}>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2 text-right">Items</th>
                      <th className="px-2 py-2 text-right">Gross</th>
                      <th className="px-2 py-2 text-right">Deducted</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      {onRemoveCategory && <th className="px-2 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryTotals.map((t) => (
                      <tr key={`sum-${t.category}`} className="border-t group">
                        <td className="px-2 py-2 font-medium text-slate-800">
                          {t.category}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-700">
                          {t.count}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-900">
                          {money(t.fullAmount)}
                        </td>
                        <td className="px-2 py-2 text-right text-emerald-700">
                          {money(t.valuedAmount)}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-900">
                          {money(t.balance)}
                        </td>
                        {onRemoveCategory && (
                          <td className="px-2 py-2 text-right">
                            {t.count === 0 && (
                              <button
                                type="button"
                                title={`Remove category "${t.category}"`}
                                className="hidden group-hover:inline text-[10px] text-red-500 hover:underline"
                                onClick={() => onRemoveCategory(t.category)}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {activeSummaries.map((l) => {
                      const liveTotal = Number(l.live?.total ?? l.snapshot?.total) || 0;
                      const fromSnap = !l.live;
                      return (
                        <tr key={`linked-${l.id}`} className="border-t bg-adlm-blue-50/40">
                          <td className="px-2 py-2 font-medium text-adlm-blue-800">
                            {l.label || l.name || "Linked project"}
                            <span className="ml-1.5 rounded bg-adlm-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-adlm-blue-600">
                              {l.productKey || "linked"}
                            </span>
                            {fromSnap && (
                              <span className="ml-1 text-[9px] text-slate-400">(snapshot)</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-400">–</td>
                          <td className="px-2 py-2 text-right text-adlm-blue-800 font-semibold">
                            {money(liveTotal)}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-400">–</td>
                          <td className="px-2 py-2 text-right text-adlm-blue-800 font-semibold">
                            {money(liveTotal)}
                          </td>
                          {onRemoveCategory && <td />}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-900">
                    <tr className="border-t">
                      <td
                        className="px-2 py-2"
                        title="The measured work in the column above. The estimated total, with preliminaries, sums, contingency and VAT, is in the Summary."
                      >
                        {activeSummaries.length > 0
                          ? "Grand Total (incl. linked)"
                          : "Measured work total"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {categoryTotals.reduce((acc, t) => acc + t.count, 0)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {money(grandTotal)}
                      </td>
                      <td className="px-2 py-2 text-right text-emerald-700">
                        {money(shownTotals.valued)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {money(shownTotals.balance + linkedGrandTotal)}
                      </td>
                      {onRemoveCategory && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })() : null}

        {onAddVariation ? (
          <div
            ref={variationsSectionRef}
            className="wk-panel scroll-mt-24"
            style={{ padding: 20 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <div className="text-sm font-semibold text-slate-900">
                  Variations, Site Instructions / Change Orders
                </div>
                {/* S18: one rule for variations, wherever they are keyed in.
                    A new one is raised WAITING FOR APPROVAL and is worth
                    nothing until it is approved on the Valuation tab, which
                    is where approving and rejecting live. This section keeps
                    the working columns the Valuation view has no answer for —
                    the quantity and rate behind the figure, the instruction
                    reference, and the tick that says the work was executed on
                    site — and shows, read-only, where each row stands. */}
                <div className="text-[11px] text-slate-500">
                  Log variations that come from architect's instructions, client
                  changes or site directives. A new variation waits for
                  approval and moves nothing until it is approved on the
                  Valuation tab; only approved ones are in the project total.
                </div>
              </div>
              <div className="flex items-center gap-3">
                {onOpenVariations ? (
                  <button
                    type="button"
                    className="pj-lnk"
                    onClick={onOpenVariations}
                    title="Approve or reject variations on the Valuation tab"
                  >
                    Approve or reject
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={onAddVariation}
                  title="Add a variation. It waits for approval before it counts."
                >
                  + Add variation
                </button>
              </div>
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
                      <th
                        className="px-2 py-2 w-28"
                        title="Approved on the Valuation tab. Only an approved variation counts."
                      >
                        Status
                      </th>
                      <th className="px-2 py-2 w-28">Issued</th>
                      <th
                        className="px-2 py-2 w-16 text-center"
                        title="Tick when variation has been executed on site, flows into earned value."
                      >
                        Done
                      </th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variations.map((v, i) => {
                      const qty = safeNum(v?.qty);
                      const rate = safeNum(v?.rate);
                      const amount = qty * rate;
                      return (
                        <tr
                          key={i}
                          className={`border-t ${v?.completed ? "bg-emerald-50/50" : ""}`}
                        >
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
                          {/* Read-only on purpose: a decision is an act, and
                              it is taken on the Valuation tab's Variations
                              view, never by typing in the bill. */}
                          <td className="px-2 py-2">
                            <span
                              className={`pj-stage ${variationStatusClass(v?.status)}`}
                              title={
                                onOpenVariations
                                  ? "Approve or reject this on the Valuation tab"
                                  : undefined
                              }
                            >
                              {variationStatusLabel(v?.status)}
                            </span>
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
                                onUpdateVariation?.(i, {
                                  completed: e.target.checked,
                                })
                              }
                              title="Mark as executed, flows into earned value (EV)"
                            />
                          </td>
                          <td className="px-1 py-2 text-center">
                            <button
                              type="button"
                              className={`inline-flex h-6 w-6 items-center justify-center rounded transition ${
                                ratesMasked
                                  ? "text-slate-300 cursor-not-allowed"
                                  : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                              }`}
                              title={
                                ratesMasked ? RATES_HIDDEN_NO_DELETE : "Remove this variation"
                              }
                              disabled={ratesMasked}
                              onClick={() => {
                                if (ratesMasked) return;
                                onRemoveVariation?.(i);
                              }}
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
                        Total approved variations
                      </td>
                      <td className="px-2 py-2 text-right">
                        {money(variationsTotal)}
                      </td>
                      <td className="px-2 py-2 text-[11px] font-normal text-slate-500" colSpan={4}>
                        {variationCounts.pendingCount
                          ? `${variationCounts.pendingCount} waiting for approval, not counted`
                          : EN_DASH}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              // His .wk-empty, not the slate Tailwind box that was here: that
              // box painted its own border, background and text colour as
              // literals, so it stayed a light-grey card in dark and in his
              // black theme.
              <div className="wk-empty" style={{ marginTop: 12, padding: "20px 18px" }}>
                <b>No variations logged yet</b>
                <p>
                  A variation is a site instruction or change order recorded against the
                  contract. It waits for approval on the Valuation tab, and only then does it
                  count toward the project total, so logging one changes no figure on its own.
                </p>
                <p>Add variation, above, records the first one.</p>
              </div>
            )}
          </div>
        ) : null}

        {onUpdatePreliminaryItem && Array.isArray(preliminaryItems) ? (
          <div
            ref={preliminarySectionRef}
            className="wk-panel scroll-mt-24"
            style={{ padding: 20 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Preliminary items done
                </div>
                <div className="text-[11px] text-slate-500">
                  BESMM4 preliminary checklist. Allocate a percentage of the
                  preliminary pool to each item, tick off as executed: done
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
                        ? "Contract locked. Unlock to rebalance allocations"
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
                        ? "Contract locked. Unlock to add a preliminary item"
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
                      {/* Actual column, QS-entered spend per prelim row.
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
                              p?.completed
                                ? "font-semibold text-emerald-700"
                                : "text-slate-900"
                            }`}
                          >
                            {money(amount)}
                          </td>
                          {/* Actual cell, number input + variance hint. */}
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
                                      : Math.max(
                                          0,
                                          Number(e.target.value) || 0,
                                        ),
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
                                      ? "Actual is below planned share, saving on this row"
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
                              : "–"}
                          </td>
                          <td className="px-1 py-2 text-center">
                            {onRemovePreliminaryItem ? (
                              <button
                                type="button"
                                className={`inline-flex h-6 w-6 items-center justify-center rounded ${
                                  contractLocked || ratesMasked
                                    ? "text-slate-300 cursor-not-allowed"
                                    : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                                }`}
                                disabled={contractLocked || ratesMasked}
                                onClick={() => {
                                  if (contractLocked || ratesMasked) return;
                                  onRemovePreliminaryItem(i);
                                }}
                                title={
                                  ratesMasked
                                    ? RATES_HIDDEN_NO_DELETE
                                    : contractLocked
                                      ? "Contract locked. Unlock to remove preliminaries"
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
                          return totActual > 0 ? money(totActual) : "–";
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
                                    ? "Total actual is below pool, saving overall"
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
              // Same again: his .wk-empty in place of the slate literals.
              <div className="wk-empty" style={{ marginTop: 12, padding: "20px 18px" }}>
                <b>No preliminary items yet</b>
                <p>
                  Preliminaries are the site-wide costs that belong to no single measured item:
                  supervision, site accommodation, plant standing, insurances. They are priced
                  here and carried into the bill total.
                </p>
                <p>
                  Opening the project once seeds the BESMM4 defaults, and &ldquo;+ Add item&rdquo;
                  adds one of your own.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* ── Summary (his .pj-sumbox, work-proj.js summary(), 17 Sep 2026) ──
          One box under the bill holding everything below the measured work:
          preliminaries, the two named groups of sums, contingency, VAT and the
          estimated total. It replaces the old slate/adlm-blue "Project total"
          card and the separate provisional-sums table, which showed the same
          money twice in two different shapes.

          The arithmetic is unchanged and comes from the shared module, so this
          box, the Overview tile, the final account and the contract sum the
          server freezes at lock all read the same figure. Once the contract is
          locked the whole box is read-only, because from then on money moves
          through variations. */}
        <section
          ref={provisionalSectionRef}
          className="pj-sumbox scroll-mt-24"
          aria-label="Bill summary"
        >
          <div className="hd">
            <h3>Summary</h3>
            <span>
              {contractLocked ? (
                `Contract locked${
                  contractLockedAt
                    ? ` ${new Date(contractLockedAt).toLocaleDateString()}`
                    : ""
                }, changes go through variations${
                  contractSum ? ` · contract sum ${money(contractSum)}` : ""
                }`
              ) : tenderedAt ? (
                <>
                  {`Tendered ${new Date(tenderedAt).toLocaleDateString()}`}
                  {onMarkTendered ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="pj-lnk"
                        onClick={() => onMarkTendered(false)}
                      >
                        Not tendered after all
                      </button>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Everything below the measured work, edited here
                  {onMarkTendered && measuredWork > 0 ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="pj-lnk"
                        onClick={() => onMarkTendered(true)}
                        title="Record the day this priced bill went out to tender."
                      >
                        Mark as tendered
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </span>
          </div>

          <div className="r">
            <span className="l">Measured work</span>
            <b>{money(totals.measured)}</b>
          </div>

          <SummaryPercentRow
            label="Preliminaries"
            percent={preliminaryPercent}
            amount={totals.prelims}
            editable={summaryEditable}
            onChange={onPreliminaryPercentChange}
            onCommit={sayUpdated}
            title="Preliminaries as a percentage of measured work plus the sums. Typical range 5 – 10%."
          />

          <SummarySumGroup
            kind="pc"
            label="PC sums"
            addLabel="+ Add a PC sum"
            rows={sumGroups.pc}
            total={totals.pc}
            editable={summaryEditable}
            onAdd={addSum}
            onUpdate={onUpdateProvisionalSum}
            onRemove={removeSum}
            removeDisabled={ratesMasked}
            onCommit={sayUpdated}
            checkboxCls={checkboxCls}
          />
          <SummarySumGroup
            kind="provisional"
            label="Provisional sums"
            addLabel="+ Add a provisional sum"
            rows={sumGroups.provisional}
            total={totals.provisional}
            editable={summaryEditable}
            onAdd={addSum}
            onUpdate={onUpdateProvisionalSum}
            onRemove={removeSum}
            removeDisabled={ratesMasked}
            onCommit={sayUpdated}
            checkboxCls={checkboxCls}
          />

          <SummaryPercentRow
            label="Contingency"
            percent={contingencyPercent}
            amount={totals.contingency}
            editable={summaryEditable && !!onContingencyPercentChange}
            onChange={onContingencyPercentChange}
            onCommit={sayUpdated}
            title="Contingency as a percentage of the sub-total."
          />

          {contractLocked ? (
            <div className="r">
              <span className="l">
                Approved variations
                {onOpenVariations ? (
                  <button type="button" className="pj-lnk" onClick={onOpenVariations}>
                    See variations
                  </button>
                ) : null}
              </span>
              <b>{money(totals.variations)}</b>
            </div>
          ) : null}

          <SummaryPercentRow
            label="VAT"
            percent={taxPercent}
            amount={totals.tax}
            editable={summaryEditable && !!onTaxPercentChange}
            onChange={onTaxPercentChange}
            onCommit={sayUpdated}
            title="VAT as a percentage of the sub-total plus contingency."
          />

          {/* Named in full, because the table above ends in a "measured work"
            total and the two are different questions: that one is what the
            items of work come to, this one is what the project is estimated
            to cost once everything in this box is on top. */}
          <div
            className="r t"
            title="Measured work plus preliminaries, PC and provisional sums, contingency, VAT and approved variations. The table above totals the measured work alone."
          >
            <span className="l">Estimated total</span>
            <b>{money(totals.total)}</b>
          </div>

          {/* Linked services sit OUTSIDE the cascade, and the row says so
            rather than leaving a figure that does not add up. That project
            carries its own preliminaries, contingency and VAT and is valued
            on its own certificates, so folding it in would count it twice. */}
          {totals.linked ? (
            <div className="r">
              <span className="l">
                Linked services
                <em style={{ color: "var(--ink-3)", fontStyle: "normal", fontSize: 12 }}>
                  priced and valued on their own project
                </em>
              </span>
              <b>{money(totals.linked)}</b>
            </div>
          ) : null}
        </section>

        <div
          ref={bottomAnchorRef}
          className="scroll-mb-24"
          aria-hidden="true"
        />

        {/* Floating go-to-top / go-to-bottom buttons, always reachable on long
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
            onChange={(patch) =>
              setPinModal((s) => (s ? { ...s, ...patch } : s))
            }
            onClose={() => setPinModal(null)}
            onSubmit={async () => {
              const state = pinModal;
              if (!state) return;
              const isLock = state.mode === "lock";
              const cleanPin = String(state.pin || "").trim();
              if (!/^\d{4}$/.test(cleanPin)) {
                setPinModal((s) =>
                  s ? { ...s, err: "PIN must be exactly 4 digits." } : s,
                );
                return;
              }
              if (isLock && cleanPin !== String(state.confirm || "").trim()) {
                setPinModal((s) =>
                  s ? { ...s, err: "PINs don't match." } : s,
                );
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
                  s
                    ? {
                        ...s,
                        busy: false,
                        err: result.message || "PIN check failed.",
                      }
                    : s,
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
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 4);
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
            {isLock
              ? "Set a 4-digit lock PIN"
              : "Enter your 4-digit PIN to unlock"}
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
              ? "Choose a PIN you'll remember. You'll need the same 4 digits to unlock the contract later. Store it somewhere safe; lost PINs cannot be recovered without a server-side reset."
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
              onChange={(e) =>
                onChange?.({ pin: sanitize(e.target.value), err: "" })
              }
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
    explanation = `Sum of link weights = ${total}%. Only ${total}% of this BoQ line's value is currently represented in the WBS, the rest won't appear in EV. Add a task or raise an existing weight.`;
  } else {
    tone = "emerald";
    stateText = "balanced";
    explanation = `Sum of link weights = ${total}%. This BoQ line is correctly allocated across the WBS.`;
  }

  // Balanced reads in his light palette, over-allocated in his warning
  // orange, under-allocated stays his neutral chip.
  const palette = { emerald: palChip("light"), rose: palChip("orange"), slate: undefined }[tone];

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
        className="wk-src sm"
        style={palette}
      >
        <span aria-hidden="true">🔗</span>
        {n} link{n === 1 ? "" : "s"} · {total}%
        {!isBalanced ? (
          <span className="font-bold ml-0.5">· {stateText}</span>
        ) : null}
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
            const badge =
              BOQ_UNDO_KIND_LABEL[entry.kind] || BOQ_UNDO_KIND_LABEL.measured;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onUndo?.(entry.id)}
                title={`Restore "${entry.label}" to position #${(entry.index || 0) + 1}`}
                className="group inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] hover:border-emerald-400 hover:bg-emerald-50 transition dark:bg-slate-800 dark:border-amber-600 dark:hover:bg-emerald-900/30"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold ${badge.cls}`}
                >
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
