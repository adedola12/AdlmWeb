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

test("handling is labour, never matched to the material it moves: 0, labour only", () => {
  const [c] = buildCarbonRates(
    [{
      description: "Handling only",
      unit: "Bag",
      netCost: 100,
      breakdown: [{ componentName: "Loading and unloading cement", quantity: 1, unit: "Bag", unitPrice: 100, totalPrice: 100 }],
    }],
    MATS, LABOUR,
  );
  assert.equal(c.total, 0);
  assert.equal(c.labourOnly, true);
  assert.equal(c.coverage, 1);
});

test("every built-up rate gets a figure: hand excavation is 0, not missing", () => {
  const [c] = buildCarbonRates(
    [{
      sectionKey: "ground",
      description: "Excavate by hand shallow trench in soft sand",
      unit: "m3",
      netCost: 962.5,
      breakdown: [
        { componentName: "Labourer (soft sand excavation)", quantity: 1.4, unit: "hr/m3", unitPrice: 687.5, totalPrice: 962.5 },
        { componentName: "Total Cost/m3", quantity: 1, unit: "m3", unitPrice: 962.5, totalPrice: 962.5 },
      ],
    }],
    MATS, LABOUR,
  );
  assert.equal(c.total, 0);
  assert.equal(c.labourOnly, true);
  assert.match(c.note, /Labour/);
});

test("a rate with no build-up has no carbon", () => {
  assert.deepEqual(buildCarbonRates([{ description: "Lump sum", unit: "item", netCost: 5 }], MATS, LABOUR), [null]);
});

test("a sheet named only by its size takes its material from the rate's description", () => {
  const sheet = (description) => ({
    sectionKey: "roofing",
    description,
    unit: "m2",
    netCost: 2000,
    breakdown: [
      { componentName: "Sheeting (975 x 2250)", quantity: 2.19, unit: "m2", unitPrice: 250, totalPrice: 547.5 },
      { componentName: "Drive screws", quantity: 4, unit: "No/m2", unitPrice: 35, totalPrice: 140 },
      { componentName: "Add for waste on bolts/screws", quantity: 5, unit: "%", unitPrice: 0, totalPrice: 7 },
    ],
  });
  const [asb, zinc] = buildCarbonRates(
    [sheet("Super lightweight (SLW) asbestos roofing sheet laid on purlins"), sheet("Corrugated zinc galvanised roofing sheet")],
    MATS, LABOUR,
  );
  assert.match(asb.breakdown[0].carbonBasis, /Fibre cement/);
  assert.match(zinc.breakdown[0].carbonBasis, /zinc/i);
  // fibre cement: 2.19 m2 x 14 kg x 0.585, plus transport and waste
  assert.ok(asb.a13 > 2.19 * 14 * 0.585 - 1e-6);
  // screws are steel fixings; the waste line on them is not a fixing
  assert.match(asb.breakdown[1].carbonBasis, /Bolts, drive screws/);
  assert.equal(asb.breakdown[2].carbonKg, 0);
});

test("a window is weighed from its size as named", () => {
  const [c] = buildCarbonRates(
    [{
      sectionKey: "doors_windows",
      description: "Supply and install natural anodised sliding window size 1800 x 1200mm",
      unit: "No",
      netCost: 183061,
      breakdown: [{ componentName: "Window size 1800 x 1200mm high.", quantity: 1, unit: "no", unitPrice: 169344, totalPrice: 169344 }],
    }],
    MATS, LABOUR,
  );
  // 2.16 m2 x 20 kg/m2 = 43.2 kg at 7.22 kgCO2e/kg: about the CIDB figure of 279 per window
  near(c.a13, 43.2 * 7.22);
  assert.equal(c.hasAssumedMass, true);
});

test("an unpriced build-up (Ada's draft) is weighed by its quantities", () => {
  const [c] = buildCarbonRates(
    [{
      description: "Grade 30 concrete",
      unit: "m3",
      netCost: 0,
      breakdown: [
        { componentName: "Cement (Grade 42.5)", quantity: 7, unit: "bag", unitPrice: 0, totalPrice: 0, refKind: "material" },
        { componentName: "Coarse aggregate (20mm stone)", quantity: 0.85, unit: "m3", unitPrice: 0, totalPrice: 0, refKind: "material" },
        { componentName: "Formwork release agent (used engine oil/diesel)", quantity: 0.15, unit: "litre", unitPrice: 0, totalPrice: 0, refKind: "material" },
        { componentName: "Skilled concrete finisher", quantity: 0.025, unit: "day", unitPrice: 0, totalPrice: 0, refKind: "labour" },
      ],
    }],
    MATS, LABOUR,
  );
  assert.ok(c.total > cement(7));
  assert.match(c.breakdown[1].carbonBasis, /rock|granite/i);
  // release agent is not fuel burnt on site
  assert.equal(c.breakdown[2].carbonKg, null);
  near(c.coverage, 3 / 4); // cement, stone and the finisher; not the release agent
});

test("an unpriced line is never weighed in a library row's other unit", () => {
  const mats = [...MATS, { name: "Sawn timber", category: "Timber - Hardwood", unit: "m3", price: 250000 }];
  const [c] = buildCarbonRates(
    [{
      description: "Formwork to edges of slab",
      unit: "m",
      netCost: 0,
      breakdown: [{ componentName: "Sawn timber formwork boards (25mm)", quantity: 1.05, unit: "m2", unitPrice: 0, totalPrice: 0 }],
    }],
    mats, LABOUR,
  );
  // 1.05 m2 x 25 mm x 500 kg/m3 = 13.1 kg of softwood, not 1.05 m3 of hardwood
  assert.match(c.breakdown[0].carbonBasis, /softwood/i);
  assert.ok(c.total < 10, `${c.total}`);
});

test("a day of another rate's plant is followed by its item number and divided by the output", () => {
  const [d8, dig] = buildCarbonRates(
    [
      {
        sectionKey: "ground",
        itemNo: 1,
        description: "Clearing site using D8 bulldozer",
        unit: "m2",
        netCost: 1079.75,
        breakdown: [
          { componentName: "D8 Bulldozer", quantity: 1, unit: "No/Day", unitPrice: 950000, totalPrice: 950000 },
          { componentName: "Diesel", quantity: 304, unit: "Liters", unitPrice: 1200, totalPrice: 364800 },
        ],
      },
      {
        sectionKey: "groundwork",
        itemNo: 2,
        description: "Excavation as before but distance not exceeding 50 meters",
        unit: "m3",
        netCost: 756.73,
        breakdown: [
          { componentName: "Subtotal from Item1 approach", quantity: 1, unit: "Lump", unitPrice: 1377244, totalPrice: 1377244 },
          { componentName: "Output per day", quantity: 1820, unit: "m3/day", unitPrice: 0, totalPrice: 0 },
          { componentName: "Total Cost/m3", quantity: 1, unit: "Unit", unitPrice: 756.73, totalPrice: 756.73 },
        ],
      },
    ],
    MATS, LABOUR,
  );
  const day = 304 * 2.66155;
  near(d8.raw.total, day);
  // a day of the D8's diesel, divided down as the price is (net / cost of the day)
  near(dig.total, day * (756.73 / 1377244));
  assert.equal(dig.coverage, 1);
});
