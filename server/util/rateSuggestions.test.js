import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billLineText,
  needsRate,
  normaliseUnit,
  suggestRatesForLine,
  suggestionMapForBill,
  unitsAgree,
  worthOffering,
} from "./rateSuggestions.js";

const rates = [
  { rateId: "r1", description: "Reinforced concrete 1:2:4 in columns", unit: "m3", unitPrice: 220000, isCustom: true },
  { rateId: "r2", description: "Reinforced concrete 1:2:4 in beams", unit: "m3", unitPrice: 210000 },
  { rateId: "r3", description: "225mm sandcrete blockwork in walls", unit: "m2", unitPrice: 13000 },
  { rateId: "r4", description: "Reinforced concrete 1:2:4 in columns", unit: "m2", unitPrice: 9999 },
  { rateId: "r5", description: "Something with no price", unit: "m3", unitPrice: 0 },
];

test("a matching rate in the same unit is offered", () => {
  const out = suggestRatesForLine({ description: "Reinforced concrete columns", unit: "m3" }, rates);
  assert.ok(out.length > 0);
  assert.equal(out[0].unit, "m3");
  assert.match(out[0].description, /concrete/i);
});

test("A UNIT MISMATCH IS EXCLUDED, NOT RANKED LOWER", () => {
  // r4 has the SAME words as r1 but is per m2. Offering it against an m3 line
  // gives a number wrong by the thickness, and it looks right.
  const out = suggestRatesForLine({ description: "Reinforced concrete 1:2:4 in columns", unit: "m3" }, rates);
  assert.ok(!out.some((s) => s.rateId === "r4"), "an m2 rate was offered for an m3 line");
});

test("units a QS writes differently still agree", () => {
  assert.equal(unitsAgree("m2", "SQ M"), true);
  assert.equal(unitsAgree("m3", "CU M"), true);
  assert.equal(unitsAgree("nr", "No."), true);
  assert.equal(unitsAgree("m2", "m3"), false);
  assert.equal(unitsAgree("", "m2"), false);
  assert.equal(normaliseUnit("Square Metre"), "m2");
});

test("a rate with no money in it prices nothing", () => {
  const out = suggestRatesForLine({ description: "Something with no price", unit: "m3" }, rates);
  assert.ok(!out.some((s) => s.rateId === "r5"));
});

test("a coincidence is not a suggestion", () => {
  const out = suggestRatesForLine({ description: "Excavate topsoil and cart away", unit: "m3" }, rates);
  assert.equal(out.length, 0, "an unrelated line got a suggestion");
});

test("the QS's own rate wins a tie with the master library", () => {
  const tied = [
    { rateId: "master", description: "Blockwork 225mm", unit: "m2", unitPrice: 1 },
    { rateId: "mine", description: "Blockwork 225mm", unit: "m2", unitPrice: 2, isCustom: true },
  ];
  const out = suggestRatesForLine({ description: "Blockwork 225mm", unit: "m2" }, tied);
  assert.equal(out[0].rateId, "mine");
  assert.equal(out[0].own, true);
});

test("every suggestion says how sure it is, so a pick is never blind", () => {
  for (const s of suggestRatesForLine({ description: "Reinforced concrete columns", unit: "m3" }, rates)) {
    assert.ok(s.why.length > 10);
    assert.ok(s.score > 0 && s.score <= 1);
  }
});

test("a weak match warns rather than reassures", () => {
  const out = suggestRatesForLine(
    { description: "Concrete blinding to foundations", unit: "m3" },
    rates,
    { minScore: 0.1 },
  );
  const weak = out.find((s) => s.score < 0.65);
  if (weak) assert.match(weak.why, /check it/i);
});

test("a line with no unit or no words gets nothing, rather than everything", () => {
  assert.deepEqual(suggestRatesForLine({ description: "Concrete", unit: "" }, rates), []);
  assert.deepEqual(suggestRatesForLine({ description: "", unit: "m3" }, rates), []);
  assert.deepEqual(suggestRatesForLine(null, rates), []);
});

test("rubbish in the rate set does not throw", () => {
  assert.deepEqual(suggestRatesForLine({ description: "x", unit: "m3" }, null), []);
  assert.deepEqual(
    suggestRatesForLine({ description: "x", unit: "m3" }, [null, {}, { description: "" }]),
    [],
  );
});

test("the text matched on is the line's own words", () => {
  assert.match(billLineText({ description: "Columns", takeoffLine: "Frames" }), /Columns Frames/);
  assert.equal(billLineText({}), "");
});

test("worthOffering is the editorial gate, in one place", () => {
  assert.equal(worthOffering({ score: 0.9, unitPrice: 10 }), true);
  assert.equal(worthOffering({ score: 0.2, unitPrice: 10 }), false);
  assert.equal(worthOffering({ score: 0.9, unitPrice: 0 }), false);
  assert.equal(worthOffering(null), false);
});

// ── The whole bill's suggestions, in one map ──

const RATES = [
  { rateId: "r1", description: "Excavate foundation trench", unit: "m3", unitPrice: 3200 },
  { rateId: "r2", description: "Ceramic wall tiling 200x300", unit: "m2", unitPrice: 18500 },
];

test("keys on the LOWERCASED code, which the client looks it up by", () => {
  // If either side stopped lowercasing, every line whose code carries a
  // letter would show "No suggestion" while a match existed — silent.
  const { byCode } = suggestionMapForBill(
    [{ code: "BQ-1", description: "Excavate foundation trench n.e. 1.5m", unit: "m3", rate: 0 }],
    RATES,
  );
  assert.equal(Object.keys(byCode)[0], "bq-1");
  assert.equal(byCode["bq-1"].rateId, "r1");
});

test("skips a line that already has a rate", () => {
  const { byCode, unpriced } = suggestionMapForBill(
    [
      { code: "BQ-1", description: "Excavate foundation trench", unit: "m3", rate: 3000 },
      { code: "BQ-2", description: "Ceramic wall tiling 200x300", unit: "m2", rate: 0 },
    ],
    RATES,
  );
  assert.equal(unpriced, 1);
  assert.ok(!byCode["bq-1"]);
  assert.equal(byCode["bq-2"].rateId, "r2");
});

test("treats a missing, zero or unparseable rate as needing one", () => {
  for (const rate of [undefined, null, 0, "", "abc", -5]) {
    assert.equal(needsRate({ rate }), true, `rate ${JSON.stringify(rate)}`);
  }
  for (const rate of [1, "2500", 0.5]) {
    assert.equal(needsRate({ rate }), false, `rate ${JSON.stringify(rate)}`);
  }
});

test("skips a line with no code, which the apply endpoint cannot address", () => {
  const { byCode, unpriced } = suggestionMapForBill(
    [{ code: "", description: "Excavate foundation trench", unit: "m3", rate: 0 }],
    RATES,
  );
  assert.equal(unpriced, 1);
  assert.deepEqual(byCode, {});
});

test("offers ONE rate per line, not five", () => {
  const many = [
    { rateId: "a", description: "Excavate foundation trench", unit: "m3", unitPrice: 3000 },
    { rateId: "b", description: "Excavate foundation trenches", unit: "m3", unitPrice: 3400 },
  ];
  const { byCode } = suggestionMapForBill(
    [{ code: "BQ-1", description: "Excavate foundation trench", unit: "m3", rate: 0 }],
    many,
  );
  assert.equal(typeof byCode["bq-1"], "object");
  assert.ok(!Array.isArray(byCode["bq-1"]));
});

test("says when it stopped short instead of implying the rest have no match", () => {
  const bill = Array.from({ length: 5 }, (_, i) => ({
    code: `BQ-${i}`,
    description: "Excavate foundation trench",
    unit: "m3",
    rate: 0,
  }));
  const { truncated, considered, unpriced } = suggestionMapForBill(bill, RATES, { cap: 2 });
  assert.equal(unpriced, 5);
  assert.equal(considered, 2);
  assert.equal(truncated, true);
  assert.equal(suggestionMapForBill(bill, RATES).truncated, false);
});

test("survives a bill that is not a list", () => {
  assert.deepEqual(suggestionMapForBill(null, RATES).byCode, {});
  assert.deepEqual(suggestionMapForBill([{ code: "A", rate: 0 }], null).byCode, {});
});
