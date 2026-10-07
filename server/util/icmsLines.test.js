// A bill as ICMS 3 lines and totals (util/icmsLines.js). What these defend: a
// line's carbon comes from a rate in the same unit and says where it came from,
// the QS's own placement wins, Groups 10, 11 and 13 carry no carbon (ICMS 3 "not
// used"), and what is not placed is reported, not hidden.

import test from "node:test";
import assert from "node:assert/strict";

import { icmsLines, icmsSummary } from "./icmsLines.js";

const RATES = [
  { description: "Concrete (1:2:4) grade 20 in foundation or slab.", unit: "m3", netCost: 120000, carbon: { total: 299.232, low: 214.908, coverage: 1 } },
  { description: "Concrete (1:2:4) grade 20 in foundation or slab.", unit: "m2", netCost: 1, carbon: { total: 1, low: 1, coverage: 1 } },
];

test("a line priced from a rate carries that rate's carbon, in the same unit", () => {
  const [l] = icmsLines(
    [{ description: "Strip – Concrete in Footing", unit: "m3", qty: 10, rate: 150000, appliedRateKey: "Concrete (1:2:4) grade 20 in foundation or slab." }],
    { productKey: "revit", carbonRates: RATES },
  );
  assert.equal(l.group, "02");
  assert.equal(l.code, "2.02.020");
  assert.equal(l.amount, 1500000);
  assert.equal(l.carbonSource, "applied");
  assert.equal(l.carbonKg, 2992.32);
});

test("no rate in the line's unit means no carbon, said plainly", () => {
  const [l] = icmsLines([{ description: "Upstand", unit: "m", qty: 3, rate: 1000 }], { carbonRates: RATES });
  assert.equal(l.carbonSource, "none");
  assert.equal(l.carbonKg, null);
  assert.equal(l.group, null);
});

test("the QS's own placement wins over the mapper", () => {
  const [l] = icmsLines([{ lineId: "a1", description: "Upstand", unit: "m", qty: 3, rate: 1000 }], {
    overrides: { a1: { group: "02", subGroup: "02.020" } },
  });
  assert.equal(l.group, "02");
  assert.equal(l.basis, "placed");
});

test("totals by Group: VAT has money but no carbon, and the unplaced are counted", () => {
  const lines = [
    { key: "1", amount: 1000, group: "02", carbonKg: 50, carbonLowKg: 40, carbonSource: "applied" },
    { key: "2", amount: 75, group: "10", carbonKg: 9, carbonLowKg: 9, carbonSource: "matched" },
    { key: "3", amount: 425, group: null, carbonKg: null, carbonLowKg: null, carbonSource: "none" },
  ];
  const s = icmsSummary(lines);
  const g = (c) => s.groups.find((x) => x.code === c);
  assert.equal(s.total, 1500);
  assert.equal(g("02").carbonKg, 50);
  assert.equal(g("10").amount, 75);
  assert.equal(g("10").carbonKg, 0); // ICMS 3: taxes are "not used" for carbon
  assert.equal(s.unplaced, 425);
  assert.equal(s.unplacedLines, 1);
  assert.equal(s.placedShare, 1075 / 1500);
  assert.equal(s.carbonShare, 1075 / 1500);
});
