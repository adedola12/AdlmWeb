// server/services/handoverReview.test.js
//
// The QUIV auto take-off review is the success metric for r2-ai-auto-takeoff.
// A plugin bug must not be able to report more kept steps than the run saved.
import test from "node:test";
import assert from "node:assert/strict";
import { normaliseReview, summariseReviews } from "./handoverReview.js";

test("a run that saved nothing is not a review", () => {
  assert.ok(normaliseReview({ stepsSaved: 0, stepsKept: 0 }).error);
  assert.ok(normaliseReview({}).error);
});

test("kept and rejected never add up to more than was saved", () => {
  const r = normaliseReview({ stepsSaved: 10, stepsKept: 9, stepsRejected: 4 });
  assert.equal(r.stepsRejected, 4);
  assert.equal(r.stepsKept, 6);
});

test("undoing the whole run counts every saved step as rejected", () => {
  const r = normaliseReview({ stepsSaved: 7, stepsKept: 7, undoneWhole: true });
  assert.equal(r.stepsKept, 0);
  assert.equal(r.stepsRejected, 7);
  assert.equal(r.undoneWhole, true);
});

test("counts are whole, non-negative and bounded", () => {
  const r = normaliseReview({ stepsSaved: "12.6", stepsKept: -3, linesKept: 1e12, stepsPlanned: 2 });
  assert.equal(r.stepsSaved, 13);
  assert.equal(r.stepsKept, 0);
  assert.equal(r.linesKept, 200000);
  // Planned can never be fewer than saved.
  assert.equal(r.stepsPlanned, 13);
});

test("the kept share is null, not zero, when nothing has been reviewed", () => {
  assert.equal(summariseReviews(null).keptShare, null);
  assert.equal(summariseReviews({ runs: 2, stepsSaved: 8, stepsKept: 6 }).keptShare, 0.75);
});
