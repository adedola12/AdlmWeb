// Resource-class subtotals off a Rate Gen build-up.
//
// The owner's rule (23 Sep 2026): a rate's build-up carries material, labour
// AND plant lines, and plant is its own resource class — not a slice of labour.
// These tests pin that split, and pin that nothing in a build-up can go missing
// on the way out.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRateComposition,
  compositionSubtotals,
  toUserRateDefinition,
} from "./rategenUserRates.js";

// The owner's worked example, per 1 m³ of concrete: 9,000 of material,
// 1,000 of plant hire, and the gang on top.
const concreteRate = {
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  breakdown: [
    { componentName: "Cement", quantity: 6, unit: "bag", unitPrice: 1000, lineTotal: 6000, refKind: "material" },
    { componentName: "Sharp sand", quantity: 0.5, unit: "m3", unitPrice: 6000, lineTotal: 3000, refKind: "material" },
    { componentName: "Mason gang", quantity: 1, unit: "day", unitPrice: 2000, lineTotal: 2000, refKind: "labour" },
    { componentName: "Concrete mixer hire", quantity: 0.2, unit: "day", unitPrice: 5000, lineTotal: 1000, refKind: "plant" },
  ],
};

test("plant is its own class, not part of labour", () => {
  const comp = buildRateComposition(concreteRate);
  const s = compositionSubtotals(comp);

  assert.equal(s.materialCost, 9000);
  assert.equal(s.labourCost, 2000);
  assert.equal(s.plantCost, 1000);
  assert.equal(s.otherCost, 0);
  // The mixer is NOT in the gang.
  assert.notEqual(s.labourCost, 3000);
});

test("the four subtotals reconcile to the itemised build-up", () => {
  const comp = buildRateComposition({
    ...concreteRate,
    breakdown: [
      ...concreteRate.breakdown,
      { componentName: "Binding wire", quantity: 1, unit: "kg", unitPrice: 500, lineTotal: 500, refKind: "consumable" },
      { componentName: "Scaffold boards", quantity: 1, unit: "item", unitPrice: 700, lineTotal: 700, refKind: "equipment" },
    ],
  });
  const s = compositionSubtotals(comp);
  const componentsNet = comp.components.reduce((a, c) => a + c.totalCost, 0);

  assert.equal(s.materialCost + s.labourCost + s.plantCost + s.otherCost, componentsNet);
  // Equipment is hired kit, so it files with plant; a consumable files with
  // neither and must not vanish.
  assert.equal(s.plantCost, 1700);
  assert.equal(s.otherCost, 500);
});

test("a rate with no build-up gives zeros, not NaN", () => {
  for (const input of [null, undefined, {}, { components: [] }, { components: null }]) {
    assert.deepEqual(compositionSubtotals(input), {
      materialCost: 0,
      labourCost: 0,
      plantCost: 0,
      otherCost: 0,
    });
  }
});

test("plant is recognised from the component name when no refKind was stamped", () => {
  const comp = buildRateComposition({
    netCost: 3000,
    breakdown: [
      { componentName: "Excavator hire", quantity: 1, unit: "hr", unitPrice: 2000, lineTotal: 2000 },
      { componentName: "Labourer", quantity: 1, unit: "day", unitPrice: 1000, lineTotal: 1000 },
    ],
  });
  const s = compositionSubtotals(comp);
  assert.equal(s.plantCost, 2000);
  assert.equal(s.labourCost, 1000);
});

test("subtotals are per one unit of the rate and are not rounded away", () => {
  const comp = buildRateComposition({
    netCost: 0.03,
    breakdown: [
      { componentName: "Nails", quantity: 0.001, unit: "kg", unitPrice: 10, lineTotal: 0.01, refKind: "material" },
      { componentName: "Vibrator poker hire", quantity: 0.001, unit: "hr", unitPrice: 20, lineTotal: 0.02, refKind: "plant" },
    ],
  });
  const s = compositionSubtotals(comp);
  assert.equal(s.materialCost, 0.01);
  assert.equal(s.plantCost, 0.02);
});

test("a rate definition still exposes the composition the subtotals read", () => {
  const def = toUserRateDefinition(concreteRate, { id: "r1", rateId: "r1", source: "master" });
  const s = compositionSubtotals(def.composition);
  assert.equal(s.plantCost, 1000);
  // Nothing existing changed shape: the fields the plugins read are untouched.
  assert.equal(def.totalCost, 0);
  assert.equal(def.netCost, 10000);
  assert.equal(def.composition.components.length, 4);
});
