import test from "node:test";
import assert from "node:assert/strict";
import {
  planBulkPriceChange,
  effectivePrice,
  priceKey,
  toNum,
} from "./rategenBulkPrices.js";

const rows = [
  { description: "Cement", unit: "bag", price: 9000, category: "Concrete" },
  { description: "Sharp sand", unit: "m3", price: 20000, category: "Concrete" },
  { description: "Emulsion paint", unit: "l", price: 4000, category: "Painting" },
];

test("toNum copes with a thousands separator and a blank", () => {
  assert.equal(toNum("12,500"), 12500);
  assert.equal(toNum(""), 0);
  assert.equal(toNum(null, 7), 7);
});

test("priceKey uses name AND unit, because steel is priced per tonne and per kg", () => {
  assert.notEqual(priceKey("Steel", "tonne"), priceKey("Steel", "kg"));
  assert.equal(priceKey(" Cement ", "BAG"), priceKey("cement", "bag"));
});

test("effectivePrice prefers the user's own price for their state", () => {
  const ov = [
    { kind: "material", name: "Cement", unit: "bag", price: 9500, state: "lagos" },
    { kind: "material", name: "Cement", unit: "bag", price: 9200, state: null },
  ];
  assert.equal(effectivePrice(rows[0], ov, "material", "lagos"), 9500);
});

test("effectivePrice falls back to a location-free override, then to the published price", () => {
  const ov = [{ kind: "material", name: "Cement", unit: "bag", price: 9200, state: null }];
  assert.equal(effectivePrice(rows[0], ov, "material", "kano"), 9200);
  assert.equal(effectivePrice(rows[1], ov, "material", "kano"), 20000);
});

test("effectivePrice ignores an override written for somewhere else", () => {
  const ov = [{ kind: "material", name: "Cement", unit: "bag", price: 1, state: "kano" }];
  assert.equal(effectivePrice(rows[0], ov, "material", "lagos"), 9000);
});

test("a category raise touches only that category", () => {
  const out = planBulkPriceChange({
    rows,
    overrides: [],
    kind: "material",
    category: "Concrete",
    percent: 8,
    stateKey: "lagos",
  });
  assert.equal(out.changed, 2);
  assert.equal(out.overrides.length, 2);
  const cement = out.overrides.find((o) => o.name === "Cement");
  assert.equal(cement.price, 9720);
  assert.equal(cement.state, "lagos");
  assert.ok(!out.overrides.some((o) => o.name === "Emulsion paint"));
});

test("a negative percentage reduces", () => {
  const out = planBulkPriceChange({
    rows,
    overrides: [],
    kind: "material",
    category: "Painting",
    percent: -10,
    stateKey: null,
  });
  assert.equal(out.changed, 1);
  assert.equal(out.overrides[0].price, 3600);
});

test("a price never goes below zero, however far it is cut", () => {
  const out = planBulkPriceChange({
    rows: [{ description: "Odd", unit: "no", price: 10, category: "X" }],
    overrides: [],
    kind: "material",
    percent: -500,
  });
  assert.equal(out.overrides[0].price, 0);
});

test("it compounds on the user's own price, not on the published one", () => {
  const overrides = [
    { kind: "material", name: "Cement", unit: "bag", price: 10000, state: "lagos" },
  ];
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides,
    kind: "material",
    percent: 10,
    stateKey: "lagos",
  });
  assert.equal(out.overrides.find((o) => o.name === "Cement").price, 11000);
});

test("zero percent writes nothing at all", () => {
  const out = planBulkPriceChange({ rows, overrides: [], kind: "material", percent: 0 });
  assert.equal(out.changed, 0);
  assert.deepEqual(out.overrides, []);
});

test("a row whose rounded price does not move is not written", () => {
  // 0.00001% of 9000 rounds back to 9000.00: no change, so no override is
  // created that would freeze the row against later published corrections.
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides: [],
    kind: "material",
    percent: 0.00001,
  });
  assert.equal(out.changed, 0);
  assert.equal(out.overrides.length, 0);
});

// S18 review, finding 8: whole-naira rounding quietly ate the kobo off a
// price the customer had set by hand.
test("a customer's own kobo-precise price keeps its kobo", () => {
  const overrides = [
    { kind: "material", name: "Cement", unit: "bag", price: 9500.5, state: "lagos" },
  ];
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides,
    kind: "material",
    percent: 5,
    stateKey: "lagos",
  });
  // 9,500.50 + 5% is 9,975.525, which is 9,975.53 — not 9,976.
  assert.equal(out.overrides.find((o) => o.name === "Cement").price, 9975.53);
});

test("a whole-naira price still comes out whole", () => {
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides: [],
    kind: "material",
    percent: 8,
  });
  assert.equal(out.overrides[0].price, 9720);
});

test("overrides for another kind or another state survive untouched", () => {
  const overrides = [
    { kind: "labour", name: "Mason gang", unit: "day", price: 25000, state: "lagos" },
    { kind: "material", name: "Cement", unit: "bag", price: 8000, state: "kano" },
  ];
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides,
    kind: "material",
    percent: 10,
    stateKey: "lagos",
  });
  assert.ok(out.overrides.some((o) => o.kind === "labour" && o.price === 25000));
  assert.ok(out.overrides.some((o) => o.state === "kano" && o.price === 8000));
  assert.ok(out.overrides.some((o) => o.state === "lagos" && o.price === 9900));
});

test("an existing override for the same row and state is replaced, not duplicated", () => {
  const overrides = [
    { kind: "material", name: "Cement", unit: "bag", price: 10000, state: "lagos" },
  ];
  const out = planBulkPriceChange({
    rows: [rows[0]],
    overrides,
    kind: "material",
    percent: 10,
    stateKey: "lagos",
  });
  assert.equal(out.overrides.filter((o) => o.name === "Cement").length, 1);
});

test("null category means every row of that kind", () => {
  const out = planBulkPriceChange({
    rows,
    overrides: [],
    kind: "material",
    category: null,
    percent: 5,
  });
  assert.equal(out.changed, 3);
});

test("it stops at the cap and says so", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    description: `Item ${i}`,
    unit: "no",
    price: 1000,
    category: "Bulk",
  }));
  const out = planBulkPriceChange({
    rows: many,
    overrides: [],
    kind: "material",
    percent: 5,
    limit: 10,
  });
  assert.equal(out.capped, true);
  assert.equal(out.matched, 12);
  assert.equal(out.changed, 10);
});

test("a row with no name is skipped rather than written as an empty override", () => {
  const out = planBulkPriceChange({
    rows: [{ description: "   ", unit: "no", price: 100, category: "X" }],
    overrides: [],
    kind: "material",
    percent: 10,
  });
  assert.equal(out.changed, 0);
});
