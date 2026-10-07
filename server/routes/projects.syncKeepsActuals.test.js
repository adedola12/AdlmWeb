// server/routes/projects.syncKeepsActuals.test.js
//
// A QUIV OR HERON SYNC MUST NOT MOVE WHAT A LINE HAS ALREADY EARNED.
//
// applyValuationTracking already held the PROGRESS half of the earned position
// across a plugin re-save: a payload with no opinion about percentComplete must
// not be read as "nothing is built". The price half was not held, and the earned
// value is quantity × rate × percent — so two of its three terms were unguarded.
//
// QUIV's takeoff DTO has no rate field and sends the planned rate in actualRate
// (the promotion in sanitizeItems). On a line the QS has NOT priced that is the
// right thing to do. On a line the QS HAS priced the promotion does not fire,
// so the plugin's planned rate landed on top of an actual the QS never recorded —
// and because every certificate values work at the actuals, the line's certified
// value moved without a single number being typed.
//
// The figures below are the real case: 100 m3 priced at 1,000, 60% certified, so
// 60,000 earned. The plugin re-sends the line with its planned rate of 850 and
// the same 60% is suddenly worth 51,000. Nine thousand naira, on a sync, silently
// — and the project's certified-to-date with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { __test } from "./projects.js";

const { applyValuationTracking, carriesValuationState, computeValueToDate } = __test;

/** computeValueToDate takes a project and returns a rollup; `measured` is the bill. */
const billValue = (items) => computeValueToDate({ items, productKey: "revit" }).measured;

/** The line as the QS left it: priced, measured, 60% certified. */
const certifiedLine = () => ({
  sn: 12,
  code: "A1",
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 1000,
  percentComplete: 60,
  completed: false,
  actualQty: 100,
  actualRate: 1000,
  actualRecordedAt: new Date("2026-06-04T09:00:00Z"),
  actualUpdatedAt: new Date("2026-06-04T09:00:00Z"),
});

/**
 * The same line as QUIV re-sends it. No progress fields at all — the DTO has
 * none — and actualRate carrying the plugin's PLANNED price.
 */
const quivPayload = () => ({
  sn: 12,
  code: "A1",
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 1000,
  actualRate: 850,
});

const sync = (previous, next) =>
  applyValuationTracking({
    productKey: "revit",
    previousItems: previous,
    nextItems: next,
    previousEvents: [],
    // exactly what the route computes: !carriesValuationState(items)
    keepEarnedPosition: !carriesValuationState(next),
  });

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

/* ── the money ─────────────────────────────────────────────────────────── */

test("THE PLUGIN'S PLANNED RATE DOES NOT RESTATE A CERTIFIED LINE", () => {
  const before = [certifiedLine()];
  const { items } = sync(before, [quivPayload()]);
  assert.equal(items[0].actualRate, 1000, "the rate the QS recorded is still the rate");
  near(billValue(items), 60_000, "and the line is still worth 60,000");
});

test("without the guard the line would have been worth 51,000", () => {
  // The same payload treated as authoritative — which is what happens when the
  // payload DOES carry progress, i.e. a genuine edit from the website. Proves the
  // fixture really does move the money, so the test above is not vacuous.
  const { items } = applyValuationTracking({
    productKey: "revit",
    previousItems: [certifiedLine()],
    nextItems: [{ ...quivPayload(), percentComplete: 60 }],
    previousEvents: [],
    keepEarnedPosition: false,
  });
  assert.equal(items[0].actualRate, 850);
  near(billValue(items), 51_000, "the 9,000 this guard exists to stop");
});

test("a measured QUANTITY survives a sync too", () => {
  // Over-measure is the commoner case: 110 m3 placed against 100 in the bill.
  const before = [{ ...certifiedLine(), actualQty: 110 }];
  const { items } = sync(before, [{ ...quivPayload(), actualQty: 100 }]);
  assert.equal(items[0].actualQty, 110, "the measured quantity stands");
  near(billValue(items), 110 * 1000 * 0.6, "66,000, not 60,000");
});

test("the progress half is still held, as it was before", () => {
  const { items } = sync([certifiedLine()], [quivPayload()]);
  assert.equal(items[0].percentComplete, 60);
  assert.equal(items[0].completed, false);
});

/* ── the timestamps ────────────────────────────────────────────────────── */

test("a preserved actual is not stamped as newly recorded", () => {
  // The stamping below the guard reads "has an actual now, had none before" as a
  // fresh measurement. Carrying the figures without their dates would make every
  // sync look like the day the line was measured.
  const before = [certifiedLine()];
  const { items } = sync(before, [quivPayload()]);
  assert.deepEqual(
    new Date(items[0].actualRecordedAt).toISOString(),
    "2026-06-04T09:00:00.000Z",
    "still the day the QS measured it",
  );
  assert.deepEqual(
    new Date(items[0].actualUpdatedAt).toISOString(),
    "2026-06-04T09:00:00.000Z",
    "and nothing was updated",
  );
});

test("A SYNC EMITS NO VALUATION EVENT, because nothing happened", () => {
  // The whole point. An event here is a phantom entry in the line's payment
  // history — and before the progress half was guarded, a NEGATIVE one.
  const { valuationEvents } = sync([certifiedLine()], [quivPayload()]);
  assert.equal(valuationEvents.length, 0);
});

test("a re-rate event is NOT suppressed when it is a real edit", () => {
  // The guard must not become a blanket "ignore actuals". A payload that speaks
  // about progress is authoritative, and a rate change in it is a real re-rate
  // that the line log must show.
  const { items, valuationEvents } = applyValuationTracking({
    productKey: "revit",
    previousItems: [certifiedLine()],
    nextItems: [{ ...certifiedLine(), actualRate: 1200 }],
    previousEvents: [],
    keepEarnedPosition: false,
  });
  assert.equal(items[0].actualRate, 1200);
  assert.ok(valuationEvents.length >= 1, "the re-measure is on the record");
  near(billValue(items), 72_000, "and the money followed it");
});

/* ── the unpriced line, where the promotion is RIGHT ───────────────────── */

test("an unpriced line still takes the plugin's rate, which is the point of the promotion", () => {
  // Nothing recorded against the line, so there is no earned position to protect
  // and QUIV's planned rate is the only price there is. Guarding this would stop
  // the plugin pricing a bill at all.
  const unpriced = {
    sn: 13,
    code: "A2",
    description: "Blockwork 225mm",
    unit: "m2",
    qty: 200,
    rate: 0,
  };
  const { items } = sync([unpriced], [{ ...unpriced, actualRate: 2500 }]);
  assert.equal(items[0].actualRate, 2500, "the plugin's price lands");
});

test("a line the plugin has never seen before is added normally", () => {
  const { items } = sync([certifiedLine()], [certifiedLine(), { sn: 14, code: "A3", description: "New", qty: 5, rate: 100, actualRate: 120 }]);
  assert.equal(items.length, 2);
  assert.equal(items[1].actualRate, 120);
});

/* ── the detector the guard hangs on ──────────────────────────────────── */

test("a QUIV payload reads as having no opinion about progress", () => {
  assert.equal(carriesValuationState([quivPayload()]), false);
});

test("a website save reads as having one, even at zero", () => {
  // percentComplete: 0 is an opinion — the QS reversing a line — and must not be
  // mistaken for a plugin's silence.
  assert.equal(carriesValuationState([{ ...quivPayload(), percentComplete: 0 }]), true);
  assert.equal(carriesValuationState([{ ...quivPayload(), completed: false }]), true);
  assert.equal(carriesValuationState([{ ...quivPayload(), purchased: false }]), true);
});

test("a reversal to zero is honoured, not read as plugin silence", () => {
  const { items } = sync([certifiedLine()], [{ ...certifiedLine(), percentComplete: 0 }]);
  assert.equal(items[0].percentComplete, 0);
  near(billValue(items), 0, "the QS really did reverse it");
});

/* ── the route must actually ASK for the guard ─────────────────────────── */

test("every applyValuationTracking call site asks for the guard", () => {
  // The tests above compute keepEarnedPosition the way the route does, which
  // leaves one hole: if a call site stopped passing it, nothing above would fail
  // and a sync would silently restate certified lines again. There are two call
  // sites (the full save and the bill save) and neither can be exercised without
  // a database and a signed-in session, so this reads the source.
  const src = readFileSync(new URL("./projects.js", import.meta.url), "utf8");
  const sites = src.match(/keepEarnedPosition:[^,\n]*/g) || [];
  // one declaration in the signature, plus the call sites
  const calls = sites.filter((s) => !s.includes("= false"));
  assert.ok(calls.length >= 2, `expected at least 2 call sites, found ${calls.length}`);
  for (const site of calls) {
    assert.match(
      site,
      /!carriesValuationState\(/,
      `a call site passes ${JSON.stringify(site)} — a plugin sync will restate ` +
        `certified lines unless it passes !carriesValuationState(items)`,
    );
  }
});
