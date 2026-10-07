// Price-list prices in the units the schedules measure in, using the RateGen
// master list's real wording and units (7 Oct 2026).

import { test } from "node:test";
import assert from "node:assert/strict";
import { convertPrice, convertedPrice, packContent, densityFor, PAINT_DRUM_LITRES } from "./priceConversion.js";
import { resolveConstants, MC } from "./materialConstants.js";

const K = resolveConstants();
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`);

/** The master list as mlScheduleContext keys it: normalised description -> { price, unit }. */
const MASTER = new Map([
  ["sharp sand", { price: 16170, unit: "m3" }],
  ["soft sand", { price: 10339, unit: "m3" }],
  ["granite (including transportation)", { price: 33000, unit: "m3" }],
  ["binding wire - 25kg roll", { price: 32500, unit: "Roll" }],
  ["coloured emulsion (high quality)", { price: 420, unit: "4 Litre" }],
  ["emulsion paint (all colours)", { price: 122500, unit: "20 Litre" }],
  ['225 x 225 x 450mm (9 x 9 x 18") hollow blocks', { price: 1300, unit: "No." }],
  ["drive screws/roofing nails", { price: 35, unit: "No." }],
  ['nails 3"', { price: 32340, unit: "Bag" }],
  ["2x3\"x12' (50x75x3600mm) - hardwood", { price: 865, unit: "Length" }],
  ["cement", { price: 11500, unit: "bag" }],
]);

test("sand in tons is priced from a per-m³ price by the firm's sand density", () => {
  const perTon = convertedPrice(MASTER, "Sharp sand", "tons", K);
  close(perTon, 16170 / (K.get(MC.ConcreteSandKgPerM3) / 1000));
});

test("granite in tons uses the bulk granite density", () => {
  close(convertedPrice(MASTER, "Granite", "tons", K), 33000 / 1.5);
});

test("plaster sand is the list's soft sand", () => {
  close(convertedPrice(MASTER, "Plaster sand", "tons", K), 10339 / 1.44);
});

test("binding wire per kg from a 25 kg roll", () => {
  close(convertedPrice(MASTER, "Binding wire", "kg", K), 32500 / 25);
});

test("emulsion paint per drum is the 20 L item, not the mispriced 4 L tin", () => {
  close(convertedPrice(MASTER, "Emulsion paint", "drums", K), 122500);
  close(convertedPrice(MASTER, "Finishes – Paint Required", "L", K), 122500 / PAINT_DRUM_LITRES);
  close(convertPrice(420, "4 Litre", "coloured emulsion (high quality)", "drums", "x", K), (420 / 4) * PAINT_DRUM_LITRES);
});

test("generic blocks are the list's hollow blocks of that thickness", () => {
  assert.equal(convertedPrice(MASTER, "Blocks (Generic - 230mm)", "nr", K), 1300);
});

test("nails skip the per-piece roofing nails and take the bag", () => {
  assert.equal(convertedPrice(MASTER, "Nails", "bags", K), 32340);
});

test("timber per metre from a 3,600 mm length", () => {
  close(convertedPrice(MASTER, "Bracing timber", "m", K), 865 / 3.6);
});

test("same unit and ton <-> kg still work, and cement is untouched", () => {
  assert.equal(convertedPrice(MASTER, "Cement", "bags", K), 11500);
  close(convertPrice(500000, "ton", "", "kg", "Reinforcement steel", K), 500);
});

test("anything that cannot be converted stays unpriced", () => {
  // a per-m³ price must never price something counted in pieces
  assert.equal(convertPrice(16170, "m3", "sharp sand", "nr", "Sharp sand", K), null);
  // mass <-> volume only for loose bulk materials
  assert.equal(convertPrice(500000, "m3", "steel", "ton", "Reinforcement steel", K), null);
  // a name the list does not have
  assert.equal(convertedPrice(MASTER, "Formwork board", "sheets", K), 0);
});

test("a firm's own library (no unit) is taken as it is", () => {
  assert.equal(convertPrice(9000, "", "", "tons", "Sharp sand", K), 9000);
});

test("pack sizes and densities are read the way the list writes them", () => {
  assert.deepEqual(packContent("4 Litre", ""), { litre: 4 });
  assert.deepEqual(packContent("Roll", "binding wire - 25kg roll"), { kg: 25 });
  assert.deepEqual(packContent("Length", "2x4\"x12' (50x100x3600mm) - softwood"), { m: 3.6 });
  assert.equal(densityFor("Steel sections", K), null);
  assert.equal(densityFor("Laterite filling", K), 1800);
});
