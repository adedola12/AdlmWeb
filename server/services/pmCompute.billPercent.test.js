import test from "node:test";
import assert from "node:assert/strict";
import { _billPercentForTask } from "./pmCompute.js";

// S18 PR2-16: what a task's own bill lines read, weighted by value.
// DISPLAY ONLY — progress is still recorded on the task and pushed down to
// its lines. This figure never feeds a total.
const index = new Map([
  ["a", { plannedAmount: 1000, percentComplete: 100 }],
  ["b", { plannedAmount: 3000, percentComplete: 0 }],
  ["zero", { plannedAmount: 0, percentComplete: 50 }],
]);

test("a task with no linked bill line has no reading from the bill", () => {
  assert.equal(_billPercentForTask({}, index), null);
  assert.equal(_billPercentForTask({ linkedBoqIdentities: [] }, index), null);
});

test("the bill's reading is weighted by value, not by line count", () => {
  const r = _billPercentForTask({ linkedBoqIdentities: ["a", "b"] }, index);
  // 1000 done of 4000 linked = 25%, not the 50% a line count would give.
  assert.equal(r.percent, 25);
  assert.equal(r.lineCount, 2);
});

test("a part share of a line counts only that share", () => {
  const r = _billPercentForTask(
    { linkedBoqIdentities: ["a", "b"], linkedBoqWeights: [50, 50] },
    index,
  );
  assert.equal(r.percent, 25);
});

test("lines worth nothing give no percentage rather than a made-up one", () => {
  assert.equal(_billPercentForTask({ linkedBoqIdentities: ["zero"] }, index), null);
  assert.equal(_billPercentForTask({ linkedBoqIdentities: ["gone"] }, index), null);
});
