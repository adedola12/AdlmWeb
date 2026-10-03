// The carbon of a priced rate, from its own build-up (port of the desktop
// RateGen's CarbonRates.cs). What these defend: the carbon follows the price
// build-up line for line, labour carries none, a batch build-up is divided down
// the way its price is, a rate that reuses another carries that rate's carbon,
// and anything that cannot be worked out lowers coverage instead of being guessed.

import test from "node:test";
import assert from "node:assert/strict";

import { assessCarbon } from "./carbonEngine.js";
import { buildCarbonRates } from "./carbonRates.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg ?? ""} ${a} != ${b}`);

const MATS = [
  { name: "Cement (50kg bag)", category: "Cement Based Products", unit: "Bag", price: 10000 },
  { name: "Sharp sand", category: "Earthwork And Filling Materials", unit: "Tonne", price: 8000 },
  { name: "Diesel", category: "Fuels", unit: "Litre", price: 1200 },
  { name: "Loading and unloading cement", category: "Cement Based Products", unit: "Bag", price: 100 },
];
const LABOUR = ["Mason", "Semi skilled"];

const cement = (bags) => assessCarbon("Cement Based Products", "Cement (50kg bag)", "Bag", bags).total;

test("a material line carries its carbon; labour carries none and stays covered", () => {
  const [c] = buildCarbonRates(
    [{
      sectionKey: "blockwork",
      description: "Cement only",
      unit: "m2",
      netCost: 25000,
      breakdown: [
        { componentName: "Cement (50kg bag)", quantity: 2, unit: "Bag", unitPrice: 10000, totalPrice: 20000, refKind: "material" },
        { componentName: "Mason", quantity: 1, unit: "day", unitPrice: 5000, totalPrice: 5000, refKind: "labour" },
      ],
    }],
    MATS, LABOUR,
  );
  assert.equal(c.trade, "Block Works");
  near(c.total, cement(2));
  assert.equal(c.coverage, 1);
  assert.equal(c.breakdown[1].carbonKg, 0);
});

test("a line saved at an old price still finds its row by unit", () => {
  // the concrete rates say "Cement" at 10,200 a bag; the library has moved on, and
  // also holds a jumbo bag sold by the tonne
  const mats = [...MATS, { name: "Cement (Jumbo bag)", category: "Cement Based Products", unit: "Tonne", price: 105000 }];
  const [c] = buildCarbonRates(
    [{
      description: "Concrete (1:2:4)",
      unit: "m3",
      netCost: 62832,
      breakdown: [{ componentName: "Cement", quantity: 6.16, unit: "bag/m3", unitPrice: 10200, totalPrice: 62832 }],
    }],
    mats, LABOUR,
  );
  assert.equal(c.breakdown[0].refName, "Cement (50kg bag)");
  // library quantity = cost / today's price, exactly as the desktop does it
  near(c.total, cement(62832 / 10000));
});

test("a line the library cannot weigh lowers coverage and is not guessed", () => {
  const [c] = buildCarbonRates(
    [{
      description: "Cement and an unknown fixing",
      unit: "No",
      netCost: 30000,
      breakdown: [
        { componentName: "Cement (50kg bag)", quantity: 2, unit: "Bag", unitPrice: 10000, totalPrice: 20000 },
        { componentName: "Proprietary anchor kit", quantity: 1, unit: "No", unitPrice: 10000, totalPrice: 10000 },
      ],
    }],
    MATS, LABOUR,
  );
  near(c.total, cement(2));
  near(c.coverage, 20000 / 30000);
  assert.equal(c.breakdown[1].carbonKg, null);
});

test("a build-up written for a mixer load is divided down as its price is", () => {
  // build-up costs 100,000; the rate's net cost is 10,000 per unit => x 0.1
  const [c] = buildCarbonRates(
    [{
      description: "Batch of mortar",
      unit: "m3",
      netCost: 10000,
      breakdown: [{ componentName: "Cement (50kg bag)", quantity: 10, unit: "Bag", unitPrice: 10000, totalPrice: 100000 }],
    }],
    MATS, LABOUR,
  );
  near(c.total, cement(10) * 0.1);
});

test("a rate that names another rate carries that rate's carbon per unit", () => {
  const [mortar, wall] = buildCarbonRates(
    [
      {
        sectionKey: "blockwork",
        description: "Cement mortar (1:6)",
        unit: "m3",
        netCost: 40000,
        breakdown: [{ componentName: "Cement (50kg bag)", quantity: 4, unit: "Bag", unitPrice: 10000, totalPrice: 40000 }],
      },
      {
        sectionKey: "blockwork",
        description: "225mm blockwall",
        unit: "m2",
        netCost: 4000,
        // 0.1 m3 of the mortar rate, at the mortar rate's own unit cost
        breakdown: [{ componentName: "Mortar per square meter", quantity: 0.1, unit: "m3", unitPrice: 40000, totalPrice: 4000 }],
      },
    ],
    MATS, LABOUR,
  );
  near(mortar.total, cement(4));
  near(wall.total, mortar.total * 0.1);
  assert.match(wall.breakdown[0].carbonBasis, /Cement mortar/);
});

test("plant fuel is site energy (A5a), even when the cloud tags the line as plant", () => {
  const [c] = buildCarbonRates(
    [{
      description: "Excavate by machine",
      unit: "m3",
      netCost: 12000,
      breakdown: [{ componentName: "Diesel", quantity: 10, unit: "Litre", unitPrice: 1200, totalPrice: 12000, refKind: "plant" }],
    }],
    MATS, LABOUR,
  );
  near(c.a5, 10 * 2.66155);
  near(c.a13, 0);
});

test("handling is labour, never matched to the material it moves", () => {
  const out = buildCarbonRates(
    [{
      description: "Handling only",
      unit: "Bag",
      netCost: 100,
      breakdown: [{ componentName: "Loading and unloading cement", quantity: 1, unit: "Bag", unitPrice: 100, totalPrice: 100 }],
    }],
    MATS, LABOUR,
  );
  assert.equal(out[0], null); // no carbon at all: not a carbon rate
});

test("a rate with no build-up has no carbon", () => {
  assert.deepEqual(buildCarbonRates([{ description: "Lump sum", unit: "item", netCost: 5 }], MATS, LABOUR), [null]);
});
