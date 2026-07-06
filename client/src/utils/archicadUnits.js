// src/utils/archicadUnits.js
// QUIV for ArchiCAD — display-time unit conversion.
//
// EVERYTHING the API stores/returns is metric (m, m², m³). Imperial display
// is a pure view-layer concern: convert at render time only, never mutate the
// fetched data. Currency amounts are NEVER converted.
//
// Exact factors (per api-contract.md):
//   1 m  = 3.28084 ft
//   1 m² = 10.7639 ft²
//   1 m³ = 35.3147 ft³
//   1 m  = 39.3701 in   (cross-sections / thicknesses shown in inches)

export const FT_PER_M = 3.28084;
export const FT2_PER_M2 = 10.7639;
export const FT3_PER_M3 = 35.3147;
export const IN_PER_M = 39.3701;

export function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalise a unit key: "m²"/"M2" → "m2", "nr" stays "nr". */
export function normalizeUnitKey(unit) {
  return String(unit || "")
    .toLowerCase()
    .replace("²", "2")
    .replace("³", "3")
    .trim();
}

const QTY_FACTORS = { m: FT_PER_M, m2: FT2_PER_M2, m3: FT3_PER_M3 };
const METRIC_LABELS = { m: "m", m2: "m²", m3: "m³", nr: "nr" };
const IMPERIAL_LABELS = { m: "ft", m2: "ft²", m3: "ft³", nr: "nr" };

/** Conversion factor from the metric canonical unit to its imperial display unit (1 for nr/unknown). */
export function imperialFactor(unit) {
  return QTY_FACTORS[normalizeUnitKey(unit)] || 1;
}

/** Convert a metric quantity for display. `units` = "metric" | "imperial". */
export function convertQuantity(value, unit, units) {
  const v = safeNum(value);
  if (units !== "imperial") return v;
  return v * imperialFactor(unit);
}

/** Display label for a canonical metric unit key under the active unit system. */
export function unitLabel(unit, units) {
  const key = normalizeUnitKey(unit);
  const map = units === "imperial" ? IMPERIAL_LABELS : METRIC_LABELS;
  return map[key] || unit || "";
}

export function formatQty(value, digits = 3) {
  return safeNum(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Currency amounts are NOT converted between unit systems. NGN → ₦ symbol. */
export function fmtMoney(value, currency = "NGN") {
  const num = safeNum(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!currency || currency === "NGN") return `₦${num}`;
  return `${currency} ${num}`;
}

/* ------------------------------------------------------------------ */
/* quantitiesBreakdown field helpers (element panel / BoQ extras)      */
/* ------------------------------------------------------------------ */

const RE_AREA = /area/i;
const RE_VOLUME = /volume/i;
// Cross-sections & thicknesses display in INCHES under imperial.
const RE_CROSS_SECTION = /(thickness|width|depth|diameter|section)/i;
const RE_LENGTH = /(length|height|perimeter|girth|rise|span)/i;
const RE_COUNT = /(count|number|leaves)/i;

/** "netArea" → "Net area" */
export function breakdownFieldLabel(key) {
  const spaced = String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Format a quantitiesBreakdown field with the proper unit label for the
 * active unit system. Non-numeric values pass through untouched.
 */
export function formatBreakdownValue(key, value, units) {
  const v = Number(value);
  if (!Number.isFinite(v)) return value == null || value === "" ? "—" : String(value);
  const k = String(key || "");
  if (RE_AREA.test(k)) {
    return `${formatQty(convertQuantity(v, "m2", units))} ${unitLabel("m2", units)}`;
  }
  if (RE_VOLUME.test(k)) {
    return `${formatQty(convertQuantity(v, "m3", units))} ${unitLabel("m3", units)}`;
  }
  if (RE_CROSS_SECTION.test(k)) {
    return units === "imperial" ? `${formatQty(v * IN_PER_M)} in` : `${formatQty(v)} m`;
  }
  if (RE_LENGTH.test(k)) {
    return `${formatQty(convertQuantity(v, "m", units))} ${unitLabel("m", units)}`;
  }
  if (RE_COUNT.test(k)) return `${formatQty(v)} nr`;
  return formatQty(v);
}
