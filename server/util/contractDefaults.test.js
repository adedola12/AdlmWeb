import { test } from "node:test";
import assert from "node:assert/strict";
import { preliminaryPercentOf, DEFAULT_PRELIMINARY_PERCENT } from "./contractDefaults.js";

test("a preliminary percentage the QS set to 0 stays 0", () => {
  // The whole point. `safeNum(x) || 7.5` returned 7.5 here, which put a
  // preliminary pool on a job that has none and moved the PM dashboard's BAC
  // and the printed report away from every other screen.
  assert.equal(preliminaryPercentOf({ preliminaryPercent: 0 }), 0);
  assert.equal(preliminaryPercentOf({ preliminaryPercent: "0" }), 0);
});

test("a real percentage is used as given", () => {
  assert.equal(preliminaryPercentOf({ preliminaryPercent: 12.5 }), 12.5);
  assert.equal(preliminaryPercentOf({ preliminaryPercent: "12.5" }), 12.5);
});

test("only a genuinely absent value falls back to the house default", () => {
  assert.equal(preliminaryPercentOf({}), DEFAULT_PRELIMINARY_PERCENT);
  assert.equal(preliminaryPercentOf(null), DEFAULT_PRELIMINARY_PERCENT);
  assert.equal(preliminaryPercentOf(undefined), DEFAULT_PRELIMINARY_PERCENT);
  assert.equal(preliminaryPercentOf({ preliminaryPercent: null }), DEFAULT_PRELIMINARY_PERCENT);
  assert.equal(preliminaryPercentOf({ preliminaryPercent: "" }), DEFAULT_PRELIMINARY_PERCENT);
  assert.equal(preliminaryPercentOf({ preliminaryPercent: "nonsense" }), DEFAULT_PRELIMINARY_PERCENT);
});

test("a caller can ask for a different fallback without losing the zero rule", () => {
  assert.equal(preliminaryPercentOf({ preliminaryPercent: 0 }, 10), 0);
  assert.equal(preliminaryPercentOf({}, 10), 10);
});
