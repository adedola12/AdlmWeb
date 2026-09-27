import { test } from "node:test";
import assert from "node:assert/strict";
import { maskArchicadMoney } from "./archicadMask.js";

const doc = () => ({
  projectName: "Ikoyi tower",
  currency: "NGN",
  lines: [
    {
      itemRef: "A1",
      description: "Concrete 1:2:4 in foundation",
      unit: "m3",
      quantity: 184.2,
      unitRate: 185000,
      totalAmount: 34077000,
      materialCost: 120000,
      plantAmount: 5000,
      marginAmount: 20000,
      rateId: "rg-771",
      rateSource: "RateGen (Lagos)",
      elementIds: [418322],
    },
  ],
  totals: { grandTotal: 34077000, subtotal: 30000000, vat: 2500000 },
  categories: [{ name: "Substructure", totalAmount: 34077000, quantity: 184.2 }],
});

test("a reader who may see rates gets the document untouched", () => {
  const d = doc();
  assert.equal(maskArchicadMoney(d, true), d);
});

test("every money field on a line is zeroed for a masked reader", () => {
  const out = maskArchicadMoney(doc(), false);
  const line = out.lines[0];
  assert.equal(line.unitRate, 0);
  assert.equal(line.totalAmount, 0);
  assert.equal(line.materialCost, 0);
  assert.equal(line.plantAmount, 0);
  assert.equal(line.marginAmount, 0);
});

test("what was measured still shows — it is the pricing that is hidden", () => {
  const line = maskArchicadMoney(doc(), false).lines[0];
  assert.equal(line.quantity, 184.2);
  assert.equal(line.unit, "m3");
  assert.equal(line.description, "Concrete 1:2:4 in foundation");
  assert.deepEqual(line.elementIds, [418322]);
});

test("the grand total and the category totals go too", () => {
  const out = maskArchicadMoney(doc(), false);
  assert.equal(out.totals.grandTotal, 0);
  assert.equal(out.totals.subtotal, 0);
  assert.equal(out.totals.vat, 0);
  assert.equal(out.categories[0].totalAmount, 0);
  assert.equal(out.categories[0].quantity, 184.2, "but not the quantity");
});

test("where a rate came from is kept, because the value is what is private", () => {
  const line = maskArchicadMoney(doc(), false).lines[0];
  assert.equal(line.rateId, "rg-771");
  assert.equal(line.rateSource, "RateGen (Lagos)");
});

test("a money field nobody has invented yet is covered too", () => {
  // The line is Mixed on purpose, so an allowlist would stop covering a field
  // the day one is added and the failure would be a silent leak.
  const out = maskArchicadMoney({ lines: [{ escalationCost: 99, someNewPrice: 42, qty: 7 }] }, false);
  assert.equal(out.lines[0].escalationCost, 0);
  assert.equal(out.lines[0].someNewPrice, 0);
  assert.equal(out.lines[0].qty, 7);
});

test("nested structures are masked all the way down", () => {
  const out = maskArchicadMoney(
    { lines: [{ breakdown: [{ name: "Cement", rate: 9500, qty: 665 }] }] },
    false,
  );
  assert.equal(out.lines[0].breakdown[0].rate, 0);
  assert.equal(out.lines[0].breakdown[0].qty, 665);
});

test("the document says it was masked, so a client can show why the figures are zero", () => {
  assert.equal(maskArchicadMoney(doc(), false).ratesMasked, true);
});

test("the stored document is not mutated", () => {
  const d = doc();
  maskArchicadMoney(d, false);
  assert.equal(d.lines[0].unitRate, 185000);
  assert.equal(d.totals.grandTotal, 34077000);
});

test("junk in, junk out rather than a throw inside a response", () => {
  assert.equal(maskArchicadMoney(null, false), null);
  assert.equal(maskArchicadMoney(undefined, false), undefined);
  assert.equal(maskArchicadMoney("nope", false), "nope");
});

test("the tax, retention and provisional words are covered too", () => {
  // vat was missing from the first version of the pattern and this test is
  // what found it, so the rest of the vocabulary is pinned here as well.
  const out = maskArchicadMoney(
    {
      totals: {
        vat: 100,
        taxAmount: 100,
        retention: 100,
        contingency: 100,
        preliminaries: 100,
        provisionalSums: 100,
        discount: 100,
        fee: 100,
      },
      lines: [{ quantity: 12, network: "n/a" }],
    },
    false,
  );
  for (const [k, v] of Object.entries(out.totals)) assert.equal(v, 0, `${k} not masked`);
  assert.equal(out.lines[0].quantity, 12);
  assert.equal(out.lines[0].network, "n/a", "a word that merely contains 'net' is not money");
});
