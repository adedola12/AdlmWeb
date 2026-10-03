import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineKey,
  similarLines,
  suggestRatesForLine,
  suggestionMapForBill,
  usageIndex,
} from "./rateSuggestions.js";

// The descriptions a QUIV bill really carries (Shonibare, Oct 2026).
const L01 = "Blockwork - Lintel Concrete [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]";
const L02 = "Blockwork - Lintel Concrete [L:02 GROUND FLOOR | T:Generic - 230mm]";
const L03_150 = "Blockwork - Lintel Concrete [L:03 FIRST FLOOR | T:Generic - 150mm]";

test("the level is not part of the item; the type is", () => {
  assert.equal(lineKey(L01), lineKey(L02));
  assert.notEqual(lineKey(L01), lineKey(L03_150));
  assert.equal(lineKey(L01), "blockwork - lintel concrete [t:generic - 230mm]");
});

test("a description with no brackets is its own key", () => {
  assert.equal(lineKey("  Excavate   to reduce level "), "excavate to reduce level");
  assert.equal(lineKey("Column [L:01 GROUND]"), "column");
});

const bill = [
  { code: "A.1", description: L01, unit: "m3", qty: 1.26, rate: 0 },
  { code: "A.2", description: L02, unit: "m3", qty: 0.11, rate: 0 },
  { code: "A.3", description: L03_150, unit: "m3", qty: 0.15, rate: 0 },
  { code: "A.4", description: L02.replace("L:02", "L:04"), unit: "m3", qty: 3.25, rate: 9000 },
  { code: "A.5", description: L02.replace("L:02", "L:05"), unit: "m2", qty: 3, rate: 0 },
  { code: "", description: L02, unit: "m3", qty: 1, rate: 0 },
];

test("similar lines: same item, same unit, unpriced, addressable, not itself", () => {
  const got = similarLines(bill, bill[0]).map((it) => it.code);
  assert.deepEqual(got, ["A.2"]);
});

test("similar lines can include priced ones when asked", () => {
  const got = similarLines(bill, bill[0], { unpricedOnly: false }).map((it) => it.code);
  assert.deepEqual(got, ["A.2", "A.4"]);
});

const rates = [
  { rateId: "c20", description: "Concrete (1:2:4) grade 20 in foundation or slab", unit: "m3", unitPrice: 154916 },
  { rateId: "c30", description: "Concrete (1:1:2) grade 30 in foundation or slab", unit: "m3", unitPrice: 235876 },
  { rateId: "lin", description: "Lintel concrete reinforced", unit: "m3", unitPrice: 200000 },
];

const usage = usageIndex([
  { key: lineKey(L01), unit: "m3", rateId: "c20", projectId: "p1", projectName: "Sunrise Estate", at: "2026-09-01" },
  { key: lineKey(L02), unit: "m3", rateId: "c20", projectId: "p2", projectName: "Oak Villa", at: "2026-09-20" },
  { key: lineKey(L02), unit: "cu.m", rateId: "c20", projectId: "p2", projectName: "Oak Villa", at: "2026-09-21" },
]);

test("usage is grouped by item and unit, counting lines and projects", () => {
  const slot = usage.get(`${lineKey(L01)}|m3`);
  assert.equal(slot.length, 1);
  assert.equal(slot[0].uses, 3);
  assert.equal(slot[0].projects.size, 2);
  assert.equal(slot[0].lastProject, "Oak Villa");
});

test("A RATE USED BEFORE ON THIS ITEM COMES FIRST, even with few shared words", () => {
  const out = suggestRatesForLine(bill[0], rates, { usage });
  assert.equal(out[0].rateId, "c20");
  assert.ok(out[0].usedBefore?.exact);
  assert.match(out[0].why, /You used this on 3 lines across 2 projects, last on Oak Villa/);
  // Without history the word match wins and c20 is not even offered.
  const plain = suggestRatesForLine(bill[0], rates);
  assert.notEqual(plain[0]?.rateId, "c20");
});

test("history never beats the unit gate", () => {
  const out = suggestRatesForLine({ description: L01, unit: "m2" }, rates, { usage });
  assert.equal(out.length, 0);
});

test("the price is today's library price, not the old one", () => {
  const today = rates.map((r) => (r.rateId === "c20" ? { ...r, unitPrice: 170000 } : r));
  assert.equal(suggestRatesForLine(bill[0], today, { usage })[0].unitPrice, 170000);
});

test("a near-identical item borrows the history, ranked lower", () => {
  const out = suggestRatesForLine(
    { description: "Blockwork Lintel Concrete [T:Generic 230mm]", unit: "m3" },
    rates,
    { usage },
  );
  const c20 = out.find((r) => r.rateId === "c20");
  assert.ok(c20);
  assert.equal(c20.usedBefore.exact, false);
  assert.match(c20.why, /similar item/);
});

test("the bill-wide map uses the history too", () => {
  const { byCode } = suggestionMapForBill(bill, rates, { usage });
  assert.equal(byCode["a.1"].rateId, "c20");
});
