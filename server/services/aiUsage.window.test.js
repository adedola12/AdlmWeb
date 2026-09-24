// server/services/aiUsage.window.test.js
//
// The daily allowance window. These cover the boundary and the two mistakes
// that would let a cap leak: reading a daily limit off the monthly tally, and
// reusing a snapshot taken yesterday.
//
// Run from server/:  node --test services/aiUsage.window.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { dayStart, monthStart } from "./aiUsage.js";

test("dayStart is midnight UTC of the same day", () => {
  const d = dayStart(new Date("2026-08-31T22:14:03.221Z"));
  assert.equal(d.toISOString(), "2026-08-31T00:00:00.000Z");
});

test("dayStart does not drift to the previous day late in the evening", () => {
  // The bug this guards: using local time here would roll a UTC+ evening back
  // a day for some users and forward for others, so a cap would reset at a
  // different hour depending on where the QS is sitting.
  const late = dayStart(new Date("2026-08-31T23:59:59.999Z"));
  assert.equal(late.toISOString(), "2026-08-31T00:00:00.000Z");

  const justAfter = dayStart(new Date("2026-09-01T00:00:00.000Z"));
  assert.equal(justAfter.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("dayStart and monthStart agree on the first of the month", () => {
  const at = new Date("2026-09-01T09:30:00.000Z");
  assert.equal(dayStart(at).getTime(), monthStart(at).getTime());
});

test("a day is strictly inside its month", () => {
  const at = new Date("2026-08-31T12:00:00.000Z");
  assert.ok(dayStart(at) > monthStart(at));
});

test("the day key changes across midnight, so a cached snapshot is rejected", () => {
  // checkAiAllowance stamps each snapshot with dayStart().getTime() and
  // discards one whose stamp is not today's. Without that, the first callers
  // after midnight would be measured against yesterday's tally for as long as
  // the 30s cache lived - ten free actions, every night.
  const before = dayStart(new Date("2026-08-31T23:59:50Z")).getTime();
  const after = dayStart(new Date("2026-09-01T00:00:10Z")).getTime();
  assert.notEqual(before, after);
});
