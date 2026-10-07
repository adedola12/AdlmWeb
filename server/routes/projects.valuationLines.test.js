// server/routes/projects.valuationLines.test.js
//
// THE SCENARIO THIS FILE EXISTS FOR (owner, 7 Oct 2026)
//
//   One work item on a locked contract.
//   4 June : 60% is certified.
//   5 July : the balance is certified.
//
// He asked whether each valuation shows that line, with the amount earned in
// that period, and whether the actual value is captured against the individual
// valuation. Three things were wrong, and all three were invisible:
//
//   1. The per-line event valued a transition at the CONTRACT qty × rate while
//      the certificate valued the same work at the ACTUAL figures
//      (earnedLineValue). On any re-measured line the log and the certificate
//      above it disagreed.
//   2. A change to actualQty/actualRate emitted NO event at all, while the
//      certificate total absorbed it in full — a real payment with an empty
//      line log.
//   3. Every forward progress row rendered as a flat badge instead of its
//      "60% → 100%" transition, because markedValue is true for any forward
//      move and the display test included it. The only row that ever showed
//      its percentages was a reversal.
//
// The invariant that ties it together, and the thing to protect: FOR ANY PERIOD,
// THE EVENTS FOR A LINE SUM TO THE CHANGE IN THAT LINE'S CUMULATIVE VALUE — which
// is what the certificate's cumulative-less-previous reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "./projects.js";
import { earnedLineValue, certificateMoney, certifiedSoFar } from "../util/certificateMaths.js";

const { applyValuationTracking, buildValuationLogs, computeValueToDate, valuationFactor } = __test;

const PRODUCT = "revit";

/** 100 m3 at ₦1,000 — the whole line is worth ₦100,000. */
const line = (over = {}) => ({
  code: "BQ-1",
  sn: 1,
  description: "Mass concrete",
  unit: "m3",
  qty: 100,
  rate: 1000,
  percentComplete: 0,
  completed: false,
  ...over,
});

/**
 * One save: hand the tracker the previous items and the incoming ones.
 *
 * `on` stamps the events this save added with a calendar day. applyValuationTracking
 * reads the clock itself, so without it every save in a test lands on today — and
 * the day log aggregates one line's events per DAY, which would fold 4 June and
 * 5 July into a single row. That folding is correct behaviour (a line taken from
 * 0% to 100% within one day IS one "Completed" row); it just is not the scenario.
 */
function save(previousItems, nextItems, previousEvents = [], on = null) {
  const out = applyValuationTracking({
    productKey: PRODUCT,
    previousItems,
    nextItems,
    previousEvents,
  });
  if (on) {
    for (let i = previousEvents.length; i < out.valuationEvents.length; i += 1) {
      out.valuationEvents[i].markedDay = on;
      out.valuationEvents[i].markedAt = new Date(`${on}T09:00:00.000Z`);
    }
  }
  return out;
}

const JUNE = "2026-06-04";
const JULY = "2026-07-05";

/** What a certificate issued now would say, through the real maths. */
function certify(items, certsSoFar) {
  const rollup = computeValueToDate({ productKey: PRODUCT, items, contract: {} });
  const m = certificateMoney({
    cumulativeValue: rollup.cumulativeValue,
    lessPrevious: certifiedSoFar(certsSoFar),
    retentionPct: 5,
    retentionReleased: 0,
    vatPct: 7.5,
    whtPct: 2.5,
  });
  return { ...m, cumulativeValue: rollup.cumulativeValue, status: "approved" };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

/* ── the owner's scenario, with no re-measure ───────────────────────────── */

test("4 June 60% then 5 July the balance: the two certificates sum to the line", () => {
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));
  near(certs[0].thisCertificate, 60_000, "IPC 1 is 60% of the line");

  const july = save(june.items, [line({ percentComplete: 100, completed: true })], june.valuationEvents);
  certs.push(certify(july.items, certs));
  near(certs[1].thisCertificate, 40_000, "IPC 2 is the 40% balance");
  near(sum(certs.map((c) => c.thisCertificate)), 100_000, "the two together are the whole line");
});

test("each period's events sum to that period's certificate", () => {
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));
  near(sum(june.valuationEvents.map((e) => e.amount)), certs[0].thisCertificate, "June reconciles");

  const july = save(june.items, [line({ percentComplete: 100, completed: true })], june.valuationEvents);
  certs.push(certify(july.items, certs));
  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  near(sum(julyOnly.map((e) => e.amount)), certs[1].thisCertificate, "July reconciles");
});

/* ── a re-measure, which is the case that was broken ────────────────────── */

test("A RE-RATE IN JULY still reconciles, because it is its own event", () => {
  // The line is re-rated to ₦1,200 in the same save that takes it to 100%.
  // The certificate moves by ₦60,000, not ₦48,000, because the 60% already
  // certified in June is re-priced too. Before this, the log showed ₦40,000 at
  // the contract rate and nothing explained the other ₦20,000.
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));

  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true, actualRate: 1200 })],
    june.valuationEvents,
  );
  certs.push(certify(july.items, certs));
  near(certs[1].thisCertificate, 60_000, "the certificate absorbs the re-rate");

  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  near(sum(julyOnly.map((e) => e.amount)), 60_000, "and the events reconcile to it");

  const progress = julyOnly.filter((e) => e.eventType !== "rerate");
  const rerate = julyOnly.filter((e) => e.eventType === "rerate");
  assert.equal(progress.length, 1, "one progress event");
  assert.equal(rerate.length, 1, "one re-rate event");
  near(progress[0].amount, 48_000, "the 40% balance, at the rate actually paid");
  near(rerate[0].amount, 12_000, "the June 60% re-priced from 1,000 to 1,200");
});

test("A RE-RATE ON ITS OWN emits an event, where nothing used to", () => {
  // The percentage is untouched; only the rate changes. The certificate moves by
  // ₦12,000 and the period's line log used to be completely empty.
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));

  const july = save(june.items, [line({ percentComplete: 60, actualRate: 1200 })], june.valuationEvents);
  certs.push(certify(july.items, certs));
  near(certs[1].thisCertificate, 12_000, "a real certificate for the re-rate");

  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  assert.equal(julyOnly.length, 1, "exactly one event, and it is not empty");
  assert.equal(julyOnly[0].eventType, "rerate");
  near(julyOnly[0].amount, 12_000, "which reconciles to the certificate");
  assert.equal(julyOnly[0].markedValue, false, "a re-rate is not work done");
  assert.equal(
    julyOnly[0].previousPercent,
    julyOnly[0].nextPercent,
    "and it claims no progress",
  );
});

test("a DOWNWARD re-rate gives a signed event, so the log still adds up", () => {
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));

  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true, actualRate: 900 })],
    june.valuationEvents,
  );
  certs.push(certify(july.items, certs));
  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  near(sum(julyOnly.map((e) => e.amount)), certs[1].thisCertificate, "reconciles when the rate falls");
  const rerate = julyOnly.find((e) => e.eventType === "rerate");
  assert.ok(rerate.amount < 0, "the re-rate is negative");
});

test("an actual EQUAL to the contract figure puts no row in anybody's valuation", () => {
  const june = save([line()], [line({ percentComplete: 60 })]);
  const july = save(june.items, [line({ percentComplete: 60, actualRate: 1000 })], june.valuationEvents);
  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  assert.deepEqual(julyOnly, [], "nothing moved, so nothing is recorded");
});

test("a re-measured QUANTITY reconciles the same way as a rate", () => {
  const certs = [];
  const june = save([line()], [line({ percentComplete: 60 })]);
  certs.push(certify(june.items, certs));
  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true, actualQty: 120 })],
    june.valuationEvents,
  );
  certs.push(certify(july.items, certs));
  const julyOnly = july.valuationEvents.slice(june.valuationEvents.length);
  near(sum(julyOnly.map((e) => e.amount)), certs[1].thisCertificate, "quantity re-measure reconciles");
});

/* ── the event's own figures ────────────────────────────────────────────── */

test("the log prints the rate the money was worked out at, not the contract one", () => {
  // Otherwise the qty and rate columns describe one figure and the amount
  // another, on the same row.
  const june = save([line()], [line({ percentComplete: 60 })]);
  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true, actualRate: 1200, actualQty: 110 })],
    june.valuationEvents,
  );
  const ev = july.valuationEvents.at(-1);
  assert.equal(ev.rate, 1200, "the actual rate");
  assert.equal(ev.qty, 110, "the actual quantity");
});

test("a status flip with no percentage still values the whole line, signed", () => {
  // The old code had a special case for this. It is gone; expressing the flip as
  // 0% -> 100% through the same arithmetic gives the same answer.
  const on = save([line()], [line({ completed: true })]);
  near(on.valuationEvents.at(-1).amount, 100_000, "ratifying earns the line");
  const off = save(on.items, [line({ completed: false })], on.valuationEvents);
  near(off.valuationEvents.at(-1).amount, -100_000, "un-ratifying gives it back");
});

/* ── what the day log shows ─────────────────────────────────────────────── */

const logFor = (items, events) =>
  buildValuationLogs({ items, valuationEvents: events, productKey: PRODUCT }, PRODUCT);

test("A PART-EARNED LINE KEEPS ITS TRANSITION, which no forward row used to", () => {
  // markedValue is true for ANY forward move, and it used to be in the display
  // test — so every progress row collapsed to a flat badge and the "60% → 100%"
  // chip was unreachable except on a reversal.
  const june = save([line()], [line({ percentComplete: 60 })], [], JUNE);
  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true })],
    june.valuationEvents,
    JULY,
  );
  const days = logFor(july.items, july.valuationEvents);
  assert.equal(days.length, 2, "two valuation days, 4 June and 5 July");
  const rows = days.flatMap((d) => d.items);

  const partial = rows.filter((r) => r.eventType === "partial");
  assert.ok(partial.length >= 1, "at least one row shows its transition");
  const balance = rows.find((r) => r.previousPercent === 60 && r.nextPercent === 100);
  assert.ok(balance, "the 60% -> 100% move is on the log");
  assert.equal(balance.eventType, "partial", "and it is rendered as a transition, not 'Completed'");
});

test("a line taken straight from nothing to finished still reads as Completed", () => {
  // The intent the old condition described, kept and narrowed to what it said.
  const done = save([line()], [line({ percentComplete: 100, completed: true })]);
  const rows = logFor(done.items, done.valuationEvents).flatMap((d) => d.items);
  const row = rows.find((r) => r.nextPercent >= 100);
  assert.equal(row.eventType, "binary", "0 -> 100 is a single Completed badge");
});

test("the day's total is right even though the re-rate has no row of its own yet", () => {
  // Both events for one line on one day aggregate into one row, so the amount a
  // QS reads is the full movement including the re-rate. The row is flagged so a
  // screen can say so once there is a design for it.
  const june = save([line()], [line({ percentComplete: 60 })], [], JUNE);
  const july = save(
    june.items,
    [line({ percentComplete: 100, completed: true, actualRate: 1200 })],
    june.valuationEvents,
    JULY,
  );
  const days = logFor(july.items, july.valuationEvents);
  const julyDay = days.find((d) => d.date === JULY);
  const row = julyDay.items.find((r) => r.nextPercent >= 100);
  near(row.amount, 60_000, "the row carries progress and re-rate together");
  assert.equal(row.reRated, true, "and is flagged as including a re-rate");
});

test("a re-rate on a line since zeroed is dropped, like the progress that earned it", () => {
  const june = save([line()], [line({ percentComplete: 60 })], [], JUNE);
  const rerated = save(
    june.items,
    [line({ percentComplete: 60, actualRate: 1200 })],
    june.valuationEvents,
    JULY,
  );
  // The line is reverted to nothing.
  const zeroed = save(rerated.items, [line({ percentComplete: 0 })], rerated.valuationEvents, "2026-08-01");
  const rows = logFor(zeroed.items, zeroed.valuationEvents).flatMap((d) => d.items);
  assert.equal(
    rows.filter((r) => r.reRated).length,
    0,
    "no money shown against a line showing no progress",
  );
});

/* ── the guard that ties it all together ────────────────────────────────── */

test("the invariant: events always sum to the change in cumulative value", () => {
  // Walked over a sequence a QS might really produce, re-measuring as they go.
  const steps = [
    line({ percentComplete: 20 }),
    line({ percentComplete: 60 }),
    line({ percentComplete: 60, actualRate: 1150 }),
    line({ percentComplete: 85, actualRate: 1150 }),
    line({ percentComplete: 85, actualQty: 105, actualRate: 1150 }),
    line({ percentComplete: 70, actualQty: 105, actualRate: 1150 }),
    line({ percentComplete: 100, completed: true, actualQty: 105, actualRate: 1100 }),
  ];
  let items = [line()];
  let events = [];
  for (const [i, next] of steps.entries()) {
    const before = earnedLineValue(items[0], valuationFactor(items[0], "completed") * 100);
    const out = save(items, [next], events);
    const added = out.valuationEvents.slice(events.length);
    const after = earnedLineValue(out.items[0], valuationFactor(out.items[0], "completed") * 100);
    near(
      sum(added.map((e) => e.amount)),
      after - before,
      `step ${i + 1} (${next.percentComplete}%) must account for every naira`,
    );
    items = out.items;
    events = out.valuationEvents;
  }
  // And end to end: every event ever written sums to the line's final value.
  near(sum(events.map((e) => e.amount)), 105 * 1100, "the whole history adds up to the final value");
});

test("0% to 100% WITHIN ONE DAY is still one Completed row", () => {
  // The day log's unit is a day, so two moves on one line on one day aggregate.
  // That is right, and it is why the scenario above stamps real dates.
  const a = save([line()], [line({ percentComplete: 60 })], [], JUNE);
  const b = save(a.items, [line({ percentComplete: 100, completed: true })], a.valuationEvents, JUNE);
  const days = logFor(b.items, b.valuationEvents);
  assert.equal(days.length, 1, "one day");
  assert.equal(days[0].items.length, 1, "one row for the line");
  near(days[0].items[0].amount, 100_000, "carrying the whole line");
  assert.equal(days[0].items[0].eventType, "binary", "and reading as Completed");
});
