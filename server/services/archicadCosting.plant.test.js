// ArchiCAD costing: the plant the engine already computes now has a name.
//
// compPlantCost() and compOtherCost() were computed and discarded, so a costed
// line reported materialAmount + labourAmount and those two did not reconcile
// to totalAmount — a mixer or an excavator read as margin. Plant is its own
// resource class, not a slice of labour.
//
// These tests also pin the other half of the change: no figure that existed
// before moves. unitRate, netUnitCost, marginAmount, directCost and grandTotal
// are asserted to the same numbers the engine produced before plant was named.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseComposition,
  costLine,
  buildCategories,
  buildTotals,
} from "./archicadCosting.js";

const rawLine = {
  itemRef: "2.1",
  category: "externalWalls",
  description: "Blockwork 225mm in cement mortar",
  unit: "m2",
  quantity: 10,
};

const matchFor = (rate) => ({
  cand: {
    id: "r1",
    groupKey: "r1",
    source: "custom",
    section: "blockwork",
    description: rate.description || rate.title || "",
    composition: parseComposition(rate),
  },
  score: 2,
  unit: { compatible: true, exact: true, soft: false, factor: 1 },
});

// material 7,000 + labour 2,000 + plant 1,000 = net 10,000
// + 10% overhead (1,000) + 25% profit (2,500)  = 13,500/m²
const rateWithPlant = {
  customRateId: "cr1",
  description: "Blockwork 225mm in cement mortar",
  unit: "m2",
  breakdown: [
    { refKind: "material", componentName: "Sandcrete block", quantity: 10, unit: "nr", unitPrice: 700, lineTotal: 7000 },
    { refKind: "labour", componentName: "Mason gang", quantity: 0.1, unit: "day", unitPrice: 20000, lineTotal: 2000 },
    { refKind: "plant", componentName: "Mixer hire", quantity: 0.5, unit: "hr", unitPrice: 2000, lineTotal: 1000 },
  ],
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  overheadValue: 1000,
  profitValue: 2500,
  totalCost: 13500,
};

test("a costed line reports the plant in its build-up", () => {
  const line = costLine(rawLine, matchFor(rateWithPlant), []);

  assert.equal(line.plantUnitCost, 1000);
  assert.equal(line.plantAmount, 10000); // 1,000/m² × 10 m²
  assert.equal(line.otherAmount, 0);
});

test("Material + Labour + Plant + Other + margin reconciles to the total", () => {
  const line = costLine(rawLine, matchFor(rateWithPlant), []);

  const resources =
    line.materialAmount + line.labourAmount + line.plantAmount + line.otherAmount;
  assert.equal(resources, 100000); // the net, 10,000/m² × 10 m²
  assert.equal(resources + line.marginAmount, line.totalAmount - 10000); // less overhead
  // Before this change Material + Labour was 90,000 and the missing 10,000 of
  // mixer hire had nowhere to be.
  assert.equal(line.materialAmount + line.labourAmount, 90000);
});

test("naming the plant moves no money at all", () => {
  const line = costLine(rawLine, matchFor(rateWithPlant), []);

  // Every figure that existed before, unchanged.
  assert.equal(line.unitRate, 13500);
  assert.equal(line.totalAmount, 135000);
  assert.equal(line.netUnitCost, 10000);
  assert.equal(line.materialUnitCost, 7000);
  assert.equal(line.materialAmount, 70000);
  assert.equal(line.labourAmount, 20000);
  assert.equal(line.marginAmount, 25000); // 135,000 − 10,000×1.10×10
  assert.equal(line.marginPercent, 25);
});

test("a rate with no plant still reports zero, and its other figures stand", () => {
  const noPlant = {
    ...rateWithPlant,
    breakdown: rateWithPlant.breakdown.slice(0, 2),
    netCost: 9000,
    overheadValue: 900,
    profitValue: 2250,
    totalCost: 12150,
  };
  const line = costLine(rawLine, matchFor(noPlant), []);

  assert.equal(line.plantAmount, 0);
  assert.equal(line.otherAmount, 0);
  assert.equal(line.unitRate, 12150);
  assert.equal(line.materialAmount, 70000);
  assert.equal(line.labourAmount, 20000);
});

test("an unpriced line carries zero plant rather than undefined", () => {
  const line = costLine(rawLine, null, []);

  assert.equal(line.plantUnitCost, 0);
  assert.equal(line.plantAmount, 0);
  assert.equal(line.otherAmount, 0);
  assert.ok(line.flags.includes("unpriced"));
});

test("a consumable in the build-up lands in otherAmount, not in plant or material", () => {
  const withConsumable = {
    ...rateWithPlant,
    breakdown: [
      ...rateWithPlant.breakdown,
      { refKind: "consumable", componentName: "Binding wire", quantity: 1, unit: "kg", unitPrice: 500, lineTotal: 500 },
    ],
    netCost: 10500,
    overheadValue: 1050,
    profitValue: 2625,
    totalCost: 14175,
  };
  const line = costLine(rawLine, matchFor(withConsumable), []);

  assert.equal(line.plantAmount, 10000);
  assert.equal(line.otherAmount, 5000); // 500/m² × 10 m²
  assert.equal(
    line.materialAmount + line.labourAmount + line.plantAmount + line.otherAmount,
    105000,
  );
});

test("the category roll-up and the totals carry plant, and the grand total does not move", () => {
  const lines = [
    costLine(rawLine, matchFor(rateWithPlant), []),
    costLine({ ...rawLine, itemRef: "2.2", quantity: 5 }, matchFor(rateWithPlant), []),
  ];

  const cat = buildCategories(lines).find((c) => c.key === "externalWalls");
  assert.equal(cat.plantAmount, 15000); // 1,000/m² × 15 m²
  assert.equal(cat.otherAmount, 0);
  assert.equal(cat.materialAmount, 105000);
  assert.equal(cat.labourAmount, 30000);
  assert.equal(cat.totalAmount, 202500);

  const totals = buildTotals(lines);
  assert.equal(totals.plantAmount, 15000);
  assert.equal(totals.otherAmount, 0);
  // Unchanged: plant was always inside these, it just had no name.
  assert.equal(totals.materialAmount, 105000);
  assert.equal(totals.labourAmount, 30000);
  assert.equal(totals.grandTotal, 202500);
  assert.equal(totals.marginAmount, 37500);
  assert.equal(totals.directCost, 165000);
});

test("lines stored before plant had a name roll up to the same totals as before", () => {
  // Exactly what a version saved last week holds: no plantAmount key at all.
  const stored = [
    { category: "externalWalls", materialAmount: 70000, labourAmount: 20000, totalAmount: 135000, marginAmount: 24000, quivType: "wall" },
  ];

  const totals = buildTotals(stored);
  assert.equal(totals.plantAmount, 0);
  assert.equal(totals.otherAmount, 0);
  assert.equal(totals.materialAmount, 70000);
  assert.equal(totals.labourAmount, 20000);
  assert.equal(totals.grandTotal, 135000);
  assert.equal(totals.marginAmount, 24000);
  assert.equal(totals.directCost, 111000);

  const cat = buildCategories(stored).find((c) => c.key === "externalWalls");
  assert.equal(cat.plantAmount, 0);
  assert.equal(cat.totalAmount, 135000);
});
