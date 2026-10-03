// Strict price matching for services lines (util/serviceMatch.js). The names on
// both sides are real: SERVIQ bill lines and RateGen master items. What these
// defend: a wrong price that looks right is worse than none, so sizes and units
// must agree, a vague word prices nothing, and a tie prices nothing.

import test from "node:test";
import assert from "node:assert/strict";

import { buildPriceIndex, matchPrice, sizesOf } from "./serviceMatch.js";

const IDX = buildPriceIndex([
  { name: "Water closet (WC) suite, complete with cistern, seat and connections", price: 112000, unit: "No.", category: "MEP - Plumbing - Sanitary Ware (installed)" },
  { name: "Wash hand basin (WHB) with pillar tap, waste, trap and brackets", price: 65000, unit: "No.", category: "MEP - Plumbing - Sanitary Ware (installed)" },
  { name: "uPVC soil, waste and vent pipe to BS 4514, 100mm", price: 4000, unit: "m", category: "MEP - Plumbing - Soil, Waste & Vent (supply)" },
  { name: "uPVC liquid waste and vent pipe, 38mm", price: 2800, unit: "m", category: "MEP - Plumbing - Soil, Waste & Vent (supply)" },
  { name: "uPVC pan connector, 100mm", price: 5000, unit: "No.", category: "MEP - Plumbing - Soil, Waste & Vent (supply)" },
  { name: "PPR pressure pipe, PN10 to BS EN ISO 15874, 25mm", price: 2100, unit: "m" },
  { name: "PPR pressure pipe, PN10 to BS EN ISO 15874, 32mm", price: 2300, unit: "m" },
  { name: "Distribution board (DB) with MCBs, complete and labelled", price: 475000, unit: "No.", category: "MEP - Electrical - Distribution (installed)" },
  { name: "Point wiring, lighting point, concealed PVC conduit", price: 30500, unit: "No.", category: "MEP - Electrical - Point Wiring (installed)" },
  { name: "Water pump, 1HP, surface mounted", price: 80000, unit: "No." },
  { name: "Cement (50kg bag)", price: 11500, unit: "Bag" },
]);

test("the exact name, whatever its case and spacing", () => {
  const m = matchPrice(IDX, "  cement (50KG bag) ");
  assert.equal(m.price, 11500);
  assert.equal(m.how, "exact");
});

test("a bill line finds its item by its words, and an installed item says it is all-in", () => {
  const wc = matchPrice(IDX, "Plumbing Fixtures – WC suite", { unit: "nr" });
  assert.equal(wc.price, 112000);
  assert.equal(wc.allIn, true);
  assert.equal(matchPrice(IDX, "Plumbing Fixtures – Wash hand basin", { unit: "nr" }).price, 65000);
  assert.equal(matchPrice(IDX, "Plumbing Equipment – 1HP surface pump", { unit: "nr" }).price, 80000);
  assert.equal(matchPrice(IDX, "PVC - DWV - PVC - DWV - 100 mmø", { unit: "m" }).price, 4000);
});

test("sizes must agree both ways", () => {
  assert.equal(matchPrice(IDX, "Pipes – 25mm PPR pressure pipe", { unit: "m" }).price, 2100);
  assert.equal(matchPrice(IDX, "Pipes – 40mm PPR pressure pipe", { unit: "m" }), null);
  assert.equal(matchPrice(IDX, "PPR pressure pipe", { unit: "m" }), null); // which size?
  assert.deepEqual([...sizesOf("XHHW 2.5mm² cable, 12-way, 1.5HP")].sort(), ["1.5hp", "12way", "2.5mm2"]);
});

test("a W x H size is one size: a 1300 x 1200 window is not the 1200 x 1200 one", () => {
  const idx = buildPriceIndex([
    { name: "Window size 1200 x 1200mm high (Casement)", price: 169344, unit: "No." },
    { name: "Fire alarm control panel, 8 zone, with battery back-up", price: 525000, unit: "No." },
  ]);
  assert.deepEqual([...sizesOf("Windows size 1300 x 1200 mm high")], ["1300x1200"]);
  assert.equal(matchPrice(idx, "Anodised Aluminium casement Windows size 1300 x 1200 mm high", { unit: "nr" }), null);
  assert.equal(matchPrice(idx, "Casement window size 1200 x 1200mm high", { unit: "nr" })?.price, 169344);
  assert.equal(matchPrice(idx, "Fire Alarm Panel", { unit: "EA" }), null); // how many zones?
  // nor is a panel the sounder that shares "fire alarm" with it
  const withSounder = buildPriceIndex([{ name: "Fire alarm sounder/bell", price: 30000, unit: "No." }]);
  assert.equal(matchPrice(withSounder, "Fire Alarm Panel", { unit: "EA" }), null);
});

test("units must agree: a price per metre never prices a count", () => {
  assert.equal(matchPrice(IDX, "uPVC soil waste and vent pipe 100mm", { unit: "nr" }), null);
});

test("a vague word prices nothing (the old lookup priced 'connector' as a pan connector)", () => {
  assert.equal(matchPrice(IDX, "connector", { unit: "nr" }), null);
  assert.equal(matchPrice(IDX, "Lighting - - 43403", { unit: "EA" }), null);
  assert.equal(matchPrice(IDX, "DB - - Uninterruptible Power Supply", { unit: "EA" }), null);
});

test("a generic item prices a sized line; a sized item never prices an unsized one", () => {
  const point = matchPrice(IDX, "Lighting Points – 20mm conduit, 1.5mm2 wiring and switch share", { unit: "nr" });
  assert.equal(point?.price, 30500);
  assert.equal(matchPrice(IDX, "Pipes – PPR pressure pipe", { unit: "m" }), null);
});

test("SERVIQ's category prefix does not dilute the match", () => {
  const idx = buildPriceIndex([{ name: "Smoke/heat detector, complete with base and connection", price: 43750, unit: "No.", category: "MEP - Fire - Protection & Alarm (installed)" }]);
  assert.equal(matchPrice(idx, "Fire Alarm Devices – Smoke detector", { unit: "nr" })?.price, 43750);
});

test("a distribution board line finds the board", () => {
  assert.equal(matchPrice(IDX, "DB - - Distribution Board TP&N", { unit: "EA" }).price, 475000);
});
