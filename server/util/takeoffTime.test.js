// Unit tests for the Takeoff Time Log arithmetic: the idle-gap rule and the
// baseline computation. These are the numbers ADLM quotes publicly, so each
// case pins a worked example that can be checked by hand.
import test from "node:test";
import assert from "node:assert/strict";

import {
  activeSecondsFromTicks,
  calibrationScale,
  estimateManualSeconds,
  humanDuration,
  normalizeCounts,
  normalizeProduct,
  savedSeconds,
  IDLE_GAP_SECONDS,
  CALIBRATION_SCALE_MAX,
  CALIBRATION_SCALE_MIN,
} from "./takeoffTime.js";
import { DEFAULT_BASELINE_RATES } from "../config/takeoffBaselineDefaults.js";

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const s = (n) => T0 + n * 1000;

/* ─── idle-time rule ─── */

test("idle rule: gaps up to 120 s count, longer gaps are dropped", () => {
  assert.equal(IDLE_GAP_SECONDS, 120);
  // 0 → 60 → 180 (gap 120, counted) → 500 (gap 320, idle) → 530 (gap 30)
  const ticks = [s(0), s(60), s(180), s(500), s(530)];
  assert.equal(activeSecondsFromTicks(ticks), 60 + 120 + 30);
});

test("idle rule: a session with one tick, or none, has no active time", () => {
  assert.equal(activeSecondsFromTicks([]), 0);
  assert.equal(activeSecondsFromTicks([s(0)]), 0);
  assert.equal(activeSecondsFromTicks(null), 0);
});

test("idle rule: continuous activity equals wall time; ordering and duplicates do not matter", () => {
  const ticks = [];
  for (let i = 0; i <= 600; i += 30) ticks.push(s(i));
  assert.equal(activeSecondsFromTicks(ticks), 600);
  const shuffled = [s(90), s(0), s(30), s(60), s(60)];
  assert.equal(activeSecondsFromTicks(shuffled), 90);
});

test("idle rule: a gap of exactly the threshold counts, one second more does not", () => {
  assert.equal(activeSecondsFromTicks([s(0), s(120)]), 120);
  assert.equal(activeSecondsFromTicks([s(0), s(121)]), 0);
});

test("idle rule: threshold is configurable and accepts Date objects", () => {
  const ticks = [new Date(s(0)), new Date(s(50)), new Date(s(200))];
  assert.equal(activeSecondsFromTicks(ticks, 60), 50);
  assert.equal(activeSecondsFromTicks(ticks, 200), 200);
});

/* ─── baseline computation ─── */

test("estimate: HERON with a per-kind split uses each kind's rate", () => {
  const counts = {
    sheets: 2,
    items: 10,
    itemsByKind: { area: 4, linear: 3, count: 3 },
    elementTypes: 3,
    boqLines: 5,
  };
  const r = DEFAULT_BASELINE_RATES;
  const minutes =
    2 * r.sheetSetupMinutes +
    4 * r.areaItemMinutes +
    3 * r.linearItemMinutes +
    3 * r.countItemMinutes +
    3 * r.elementTypeMinutes +
    5 * r.boqLineMinutes;
  // 16 + 16 + 7.5 + 3 + 15 + 15 = 72.5 min
  assert.equal(minutes, 72.5);
  assert.equal(estimateManualSeconds(counts, r, "HERON"), 72.5 * 60);
});

test("estimate: an unsplit item total is costed at the mixed rate for HERON and the element rate for QUIV", () => {
  const counts = { sheets: 0, items: 100, elementTypes: 0, boqLines: 0 };
  const r = DEFAULT_BASELINE_RATES;
  assert.equal(estimateManualSeconds(counts, r, "HERON"), 100 * r.mixedItemMinutes * 60);
  assert.equal(estimateManualSeconds(counts, r, "QUIV"), 100 * r.revitElementMinutes * 60);
  assert.equal(estimateManualSeconds(counts, r, "revit"), 100 * r.revitElementMinutes * 60);
});

test("estimate: items beyond the split are costed at the unsplit rate; a split larger than the total repairs the total", () => {
  const r = { ...DEFAULT_BASELINE_RATES, areaItemMinutes: 10, mixedItemMinutes: 1 };
  const partly = { items: 5, itemsByKind: { area: 2, linear: 0, count: 0 } };
  assert.equal(estimateManualSeconds(partly, r, "HERON"), (2 * 10 + 3 * 1) * 60);
  const over = normalizeCounts({ items: 1, itemsByKind: { area: 3, linear: 0, count: 0 } });
  assert.equal(over.items, 3);
});

test("estimate: a custom rate table overrides the defaults key by key, missing keys fall back", () => {
  const counts = { sheets: 1, items: 0, elementTypes: 0, boqLines: 1 };
  const seconds = estimateManualSeconds(counts, { sheetSetupMinutes: 20 }, "HERON");
  assert.equal(seconds, (20 + DEFAULT_BASELINE_RATES.boqLineMinutes) * 60);
});

test("estimate: garbage counts are coerced to zero, never negative", () => {
  const c = normalizeCounts({ sheets: -4, items: "12.9", elementTypes: "x", boqLines: null, fileName: "plan.pdf" });
  assert.deepEqual(c, { sheets: 0, items: 12, elementTypes: 0, boqLines: 0 });
  assert.equal(estimateManualSeconds({}, DEFAULT_BASELINE_RATES, "HERON"), 0);
});

test("saved time is estimate minus active, floored at zero", () => {
  assert.equal(savedSeconds(7800, 840), 6960); // 2 h 10 min - 14 min
  assert.equal(savedSeconds(600, 900), 0);
  assert.equal(savedSeconds(0, 0), 0);
});

test("calibration scale is the user's minutes over the table's minutes, clamped", () => {
  const counts = { sheets: 0, items: 100, elementTypes: 0, boqLines: 0 };
  const r = DEFAULT_BASELINE_RATES; // HERON unsplit → 300 min
  assert.equal(calibrationScale(150, counts, r, "HERON"), 0.5);
  assert.equal(calibrationScale(600, counts, r, "HERON"), 2);
  assert.equal(calibrationScale(10, counts, r, "HERON"), CALIBRATION_SCALE_MIN);
  assert.equal(calibrationScale(100000, counts, r, "HERON"), CALIBRATION_SCALE_MAX);
  assert.equal(calibrationScale(0, counts, r, "HERON"), 1);
  assert.equal(calibrationScale(30, {}, r, "HERON"), 1);
  // and the scale applies multiplicatively
  assert.equal(estimateManualSeconds(counts, r, "HERON", 0.5), 150 * 60);
});

test("product keys from both plugins map to the stored product label", () => {
  assert.equal(normalizeProduct("planswift"), "HERON");
  assert.equal(normalizeProduct("revit"), "QUIV");
  assert.equal(normalizeProduct("quiv"), "QUIV");
  assert.equal(normalizeProduct("Heron"), "HERON");
  assert.equal(normalizeProduct("rategen"), "RATEGEN");
  assert.equal(normalizeProduct("archicad"), "");
});

test("duration labels read the way the plugin line reads", () => {
  assert.equal(humanDuration(840), "14 min");
  assert.equal(humanDuration(7800), "2 h 10 min");
  assert.equal(humanDuration(3600), "1 h");
  assert.equal(humanDuration(45), "45 s");
});
