import test from "node:test";
import assert from "node:assert/strict";
import {
  parseComposition,
  normalizeComposition,
  enforceCeiling,
  expectedTotal,
  compPlantCost,
  compMaterialCost,
  compLabourCost,
  costLine,
  deriveLabour,
} from "./archicadCosting.js";

// S18 review, findings 1 and 2: what the costing engine makes of a rate the
// CUSTOMER built or edited on the website.
//
// Both defects cost money in the same direction. The engine reads a build-up,
// adds the rate's overhead and profit to it, and enforceCeiling() then refuses
// any headline that exceeds what it can see. So every line the engine cannot
// see is money taken OFF the rate: the takeoff a QS hands a client comes out
// cheaper than the rate they published.

const rawLine = {
  itemRef: "2.1",
  category: "externalWalls",
  description: "Blockwork 225mm in cement mortar",
  unit: "m2",
  quantity: 10,
};

/** The shape costLine() gets from selectBestRate(). */
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

/* ── Finding 1: a custom rate with a plant line ─────────────────────────────
 *
 * As the website stores it (normalizeCustomRate in util/rategenUserRates.js):
 * breakdown[] is the whole build-up, materials[]/labour[] a projection of it
 * for the desktop — and a plant line cannot live in that pair at all, because
 * UserCustomRateLineSchema.rateType is material|labour.
 *
 *   material 7,000 + labour 2,000 + plant 1,000 = net 10,000
 *   + 10% overhead (1,000) + 25% profit (2,500)  = 13,500 the rate per m²
 *
 * Reading the pair saw 9,000 of it, expected 9,000 + 1,000 + 2,500 = 12,500,
 * and clamped the rate to that: the plant hire, 1,000/m², simply gone.
 */
const customRateWithPlant = {
  customRateId: "cr1",
  title: "Blockwork 225mm in cement mortar",
  description: "Blockwork 225mm in cement mortar",
  unit: "m2",
  materials: [
    { rateType: "material", description: "Sandcrete block", quantity: 10, unit: "nr", unitPrice: 700, totalCost: 7000 },
  ],
  labour: [
    { rateType: "labour", description: "Mason gang", quantity: 0.1, unit: "day", unitPrice: 20000, totalCost: 2000 },
  ],
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

test("a custom rate's plant line is part of its build-up", () => {
  const comp = parseComposition(customRateWithPlant);
  assert.equal(comp.components.length, 3);
  assert.equal(compMaterialCost(comp), 7000);
  assert.equal(compLabourCost(comp), 2000);
  assert.equal(compPlantCost(comp), 1000);
  assert.equal(comp.netCost, 10000);
});

test("a custom rate with a plant line prices at the rate the library published", () => {
  const comp = parseComposition(customRateWithPlant);
  assert.equal(expectedTotal(comp), 13500);
  // The headline is not clamped: it is exactly what the build-up explains.
  assert.equal(enforceCeiling(comp, 13500), 13500);

  const line = costLine(rawLine, matchFor(customRateWithPlant), []);
  assert.equal(line.unitRate, 13500);
  assert.equal(line.totalAmount, 135000);
  assert.equal(line.netUnitCost, 10000);
  assert.equal(line.materialUnitCost, 7000);
  assert.equal(line.labourAmount, 20000); // 2,000/m² × 10m²
  assert.equal(line.labourProvenance.method, "rate-breakdown");
});

test("the desktop's projection still prices a rate that predates the breakdown", () => {
  // Same rate as saved before breakdown[] was written: materials[] + labour[]
  // are all there is, they ARE the whole build-up, and it prices off them.
  const legacy = {
    customRateId: "cr0",
    title: "Blockwork 225mm in cement mortar",
    unit: "m2",
    materials: customRateWithPlant.materials,
    labour: customRateWithPlant.labour,
    netCost: 9000,
    overheadPercent: 10,
    profitPercent: 25,
    overheadValue: 900,
    profitValue: 2250,
    totalCost: 12150,
  };
  const comp = parseComposition(legacy);
  assert.equal(comp.components.length, 2);
  assert.equal(comp.netCost, 9000);
  assert.equal(enforceCeiling(comp, 12150), 12150);
  assert.equal(costLine(rawLine, matchFor(legacy), []).unitRate, 12150);
});

test("a stale breakdown never replaces a fuller materials[]+labour[] pair", () => {
  // The breakdown wins on evidence, not on being present: one that explains
  // LESS money than the pair is the partial copy and is left alone.
  const stale = {
    ...customRateWithPlant,
    breakdown: [
      { refKind: "material", componentName: "Sandcrete block", quantity: 10, unit: "nr", unitPrice: 700, lineTotal: 7000 },
    ],
  };
  const comp = parseComposition(stale);
  assert.equal(comp.components.length, 2);
  assert.equal(compLabourCost(comp), 2000);
});

/* ── Finding 2: the unexplained remainder ───────────────────────────────────
 *
 * A published rate's net cost is often larger than the lines behind it. The
 * build-up screen shows the difference as "Not itemised" and carries it
 * through an edit, so the customer's own copy is worth what the library said:
 *
 *   lines 8,000 + not itemised 2,000 = net 10,000
 *   + 10% overhead (1,000) + 25% profit (2,500) = 13,500
 *
 * The engine used to overwrite netCost with the 8,000 it could itemise and
 * clamp the rate to 11,500 — 2,000/m² below the customer's own figure.
 */
const rateWithRemainder = {
  rateId: "a1",
  description: "Concrete 1:2:4 in foundations",
  unit: "m3",
  breakdown: [
    { refKind: "material", componentName: "Cement", quantity: 6, unit: "bag", unitPrice: 1000, lineTotal: 6000 },
    { refKind: "labour", componentName: "Mason gang", quantity: 0.1, unit: "day", unitPrice: 20000, lineTotal: 2000 },
  ],
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  overheadValue: 1000,
  profitValue: 2500,
  totalCost: 13500,
};

test("a rate's unexplained remainder survives the engine", () => {
  const comp = parseComposition(rateWithRemainder);
  const itemised = comp.components.reduce((s, c) => s + c.totalCost, 0);
  assert.equal(itemised, 8000);
  // Net is the rate's own figure, to the kobo: Σ lines + the remainder, which
  // is what totalsFrom(components, oh, pr, carriedNet) reads on screen.
  assert.equal(comp.netCost, 10000);
  assert.equal(comp.netCost - itemised, 2000);
  assert.equal(expectedTotal(comp), 13500);
  assert.equal(enforceCeiling(comp, 13500), 13500);

  const line = costLine({ ...rawLine, unit: "m3" }, matchFor(rateWithRemainder), []);
  assert.equal(line.unitRate, 13500);
  assert.equal(line.netUnitCost, 10000);
});

test("a build-up with no stored net cost is still footed from its lines", () => {
  // Compute items carry lines and percentages and no netCost at all, so the
  // sum is the only figure there is — and the guardrail still bites.
  const computeItem = {
    _id: "ci1",
    name: "Concrete 1:2:4",
    unit: "m3",
    poPercent: 35,
    lines: [
      { kind: "material", description: "Cement", unit: "bag", qtyPerUnit: 6, factor: 1, unitPriceAtBuild: 1000 },
      { kind: "labour", description: "Mason gang", unit: "day", qtyPerUnit: 0.1, factor: 1, unitPriceAtBuild: 20000 },
    ],
  };
  const comp = parseComposition(computeItem);
  assert.equal(comp.netCost, 8000);
  assert.equal(expectedTotal(comp), 10800);
  assert.equal(enforceCeiling(comp, 25000), 10800);
});

test("the guardrail still refuses a headline its build-up cannot explain", () => {
  const overstated = { ...rateWithRemainder, totalCost: 25000 };
  const comp = parseComposition(overstated);
  assert.equal(enforceCeiling(comp, 25000), 13500);
  assert.equal(costLine({ ...rawLine, unit: "m3" }, matchFor(overstated), []).unitRate, 13500);
});

test("a rate that itemises no labour still back-calculates it", () => {
  // The residual tier is untouched: headline 200, 35% markup, 100 material
  // ⇒ trueNet 148.148… ⇒ labour 48.148…
  const materialOnly = {
    description: "Test residual",
    unit: "m2",
    totalCost: 200,
    overheadPercent: 10,
    profitPercent: 25,
    breakdown: [
      { refKind: "material", componentName: "Blocks", quantity: 1, unit: "m2", unitPrice: 100, lineTotal: 100 },
    ],
  };
  const comp = normalizeComposition(parseComposition(materialOnly));
  const labour = deriveLabour({ comp, description: "Blockwork", unit: "m2", labourLibrary: [] });
  assert.equal(labour.method, "residual");
  assert.ok(Math.abs(labour.labourUnitRate - 48.148148) < 0.001);
});
