// server/util/takeoffTime.js
//
// Pure arithmetic behind the Takeoff Time Log. Nothing in here touches Mongo or
// Express, so every number the dashboard quotes can be recomputed from a stored
// session plus the baseline version it names, and unit-tested without a DB.
//
//   activeSecondsFromTicks   reference idle-gap rule (the plugins implement the
//                            same rule in C#; this copy is the spec + oracle)
//   estimateManualSeconds    counts x rate table (x user calibration scale)
//   savedSeconds             estimate - active, floored at zero
//   calibrationScale         how a user's own answer rescales the rate table

import { DEFAULT_BASELINE_RATES } from "../config/takeoffBaselineDefaults.js";

// A gap between two activity ticks longer than this is idle and is not counted.
export const IDLE_GAP_SECONDS = 120;

export const PRODUCTS = Object.freeze(["HERON", "QUIV", "RATEGEN"]);

// productKey values the plugins authenticate with -> product label stored on
// the session. Both spellings are accepted from clients.
const PRODUCT_BY_KEY = Object.freeze({
  heron: "HERON",
  planswift: "HERON",
  "planswift-materials": "HERON",
  quiv: "QUIV",
  revit: "QUIV",
  "revit-materials": "QUIV",
  revitmep: "QUIV",
  rategen: "RATEGEN",
});

export function normalizeProduct(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (PRODUCTS.includes(s.toUpperCase())) return s.toUpperCase();
  return PRODUCT_BY_KEY[s.toLowerCase()] || "";
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Reference implementation of the active-time rule.
 *
 * `ticks` are activity timestamps (ms or Date) from session start to session
 * end: the start itself, every user input or measurement event, and the end.
 * Active time is the sum of gaps between consecutive ticks that are no longer
 * than `gapSeconds`; longer gaps are idle and contribute nothing. Unsorted
 * input is sorted; duplicates cost nothing.
 */
export function activeSecondsFromTicks(ticks, gapSeconds = IDLE_GAP_SECONDS) {
  const ts = (ticks || [])
    .map((t) => (t instanceof Date ? t.getTime() : Number(t)))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (ts.length < 2) return 0;
  const gapMs = Math.max(0, num(gapSeconds)) * 1000;
  let activeMs = 0;
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d > 0 && d <= gapMs) activeMs += d;
  }
  return Math.round(activeMs / 1000);
}

/**
 * Coerce whatever a client sent into the counts shape we store. Everything is
 * a non-negative integer; unknown keys are dropped so drawing content can never
 * ride in on this object.
 */
export function normalizeCounts(raw = {}) {
  const c = raw && typeof raw === "object" ? raw : {};
  const int = (v) => Math.max(0, Math.floor(num(v)));
  const byKind = c.itemsByKind && typeof c.itemsByKind === "object" ? c.itemsByKind : null;
  const out = {
    sheets: int(c.sheets),
    items: int(c.items),
    elementTypes: int(c.elementTypes),
    boqLines: int(c.boqLines),
  };
  if (byKind) {
    out.itemsByKind = {
      area: int(byKind.area),
      linear: int(byKind.linear),
      count: int(byKind.count),
    };
    // A split that adds up to more than the total is a client bug; trust the
    // split and repair the total so the estimate stays reproducible.
    const sum = out.itemsByKind.area + out.itemsByKind.linear + out.itemsByKind.count;
    if (sum > out.items) out.items = sum;
  }
  return out;
}

/**
 * Manual-time estimate from counts and a rate table, in seconds.
 *
 * `rates` is a baseline document's `rates` (minutes per unit). `product`
 * decides how an unsplit item total is costed. `scale` is the user
 * calibration multiplier (1 when none).
 */
export function estimateManualSeconds(
  counts,
  rates = DEFAULT_BASELINE_RATES,
  product = "HERON",
  scale = 1,
) {
  const c = normalizeCounts(counts);
  const r = { ...DEFAULT_BASELINE_RATES, ...(rates || {}) };
  let minutes = 0;
  minutes += c.sheets * num(r.sheetSetupMinutes);
  if (c.itemsByKind) {
    minutes += c.itemsByKind.area * num(r.areaItemMinutes);
    minutes += c.itemsByKind.linear * num(r.linearItemMinutes);
    minutes += c.itemsByKind.count * num(r.countItemMinutes);
    const unsplit =
      c.items - (c.itemsByKind.area + c.itemsByKind.linear + c.itemsByKind.count);
    if (unsplit > 0) minutes += unsplit * unsplitRate(r, product);
  } else {
    minutes += c.items * unsplitRate(r, product);
  }
  minutes += c.elementTypes * num(r.elementTypeMinutes);
  minutes += c.boqLines * num(r.boqLineMinutes);
  const s = num(scale) || 1;
  return Math.round(minutes * 60 * s);
}

function unsplitRate(r, product) {
  return normalizeProduct(product) === "QUIV"
    ? num(r.revitElementMinutes)
    : num(r.mixedItemMinutes);
}

export function savedSeconds(estimatedManualSeconds, activeSeconds) {
  return Math.max(0, Math.round(num(estimatedManualSeconds) - num(activeSeconds)));
}

/**
 * A user's calibration answer ("a takeoff of this size takes me about N
 * minutes by hand", given right after a session with `referenceCounts`)
 * becomes a multiplier on the rate table: their minutes divided by what the
 * table would have said for that same session. Clamped so a typo cannot
 * produce a hundredfold claim; 1 when the answer is unusable.
 */
export const CALIBRATION_SCALE_MIN = 0.25;
export const CALIBRATION_SCALE_MAX = 4;

export function calibrationScale(manualMinutes, referenceCounts, rates, product) {
  const manualSec = num(manualMinutes) * 60;
  const tableSec = estimateManualSeconds(referenceCounts, rates, product, 1);
  if (!manualSec || !tableSec) return 1;
  const raw = manualSec / tableSec;
  return Math.min(
    CALIBRATION_SCALE_MAX,
    Math.max(CALIBRATION_SCALE_MIN, Number(raw.toFixed(4))),
  );
}

/** "2 h 10 min" style label used in API responses and the plugins' copy. */
export function humanDuration(seconds) {
  const s = Math.max(0, Math.round(num(seconds)));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
