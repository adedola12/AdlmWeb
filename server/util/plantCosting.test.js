// The plant library: a machine priced per day from its parts, used by the hour.
//
// Worked figures used throughout (a site in Lagos, September 2026):
//
//   Concrete mixer (1-bag)            per working day
//     hire                1 day  × ₦25,000   = ₦25,000
//     diesel             15 L    × ₦1,000    = ₦15,000
//     operator            1 day  × ₦8,000    = ₦8,000
//     maintenance         1 day  × ₦2,000    = ₦2,000
//     transport (spread)  1 day  × ₦4,000    = ₦4,000
//                                     day cost ₦54,000
//     ÷ 8 working hours                     = ₦6,750 per hour
//
//   Poker vibrator
//     hire 1 × ₦8,000 + petrol 3 L × ₦1,000  = ₦11,000 per day
//     ÷ 8 hours                              = ₦1,375 per hour
//
//   Concrete 1:2:4, per m³: 0.25 h of each
//     mixer    0.25 × ₦6,750 = ₦1,687.50
//     vibrator 0.25 × ₦1,375 =   ₦343.75
//     plant per m³            = ₦2,031.25
//
//   The same mixer booked as "1 day per m³" would have put ₦54,000 of plant
//   on every cubic metre. That is the error this library exists to remove.

import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanPlantInput,
  mergePlantLibrary,
  plantCosting,
  plantLine,
  PlantUnpricedError,
} from "./plantCosting.js";
import {
  buildRateComposition,
  compositionSubtotals,
  normalizeCustomRate,
  preservePlantLines,
  toUserRateDefinition,
} from "./rategenUserRates.js";
import { makePlantFor } from "./plantAllowance.js";

const mixer = (over = {}) => ({
  sn: 1,
  name: "Concrete mixer (1-bag)",
  hoursPerDay: 8,
  parts: [
    { kind: "hire", description: "Mixer hire", quantity: 1, unit: "day", unitPrice: 25000 },
    { kind: "fuel", description: "Diesel", quantity: 15, unit: "L", unitPrice: 1000 },
    { kind: "operator", description: "Operator", quantity: 1, unit: "day", unitPrice: 8000 },
    { kind: "maintenance", description: "Servicing", quantity: 1, unit: "day", unitPrice: 2000 },
    { kind: "transport", description: "Delivery, spread", quantity: 1, unit: "day", unitPrice: 4000 },
  ],
  priceAsOf: new Date("2026-09-27T00:00:00Z"),
  ...over,
});

const vibrator = (over = {}) => ({
  sn: 2,
  name: "Poker vibrator",
  hoursPerDay: 8,
  parts: [
    { kind: "hire", description: "Vibrator hire", quantity: 1, unit: "day", unitPrice: 8000 },
    { kind: "fuel", description: "Petrol", quantity: 3, unit: "L", unitPrice: 1000 },
  ],
  ...over,
});

// ── per day from its parts, per hour at the stated working day ─────────────

test("a mixer costs ₦54,000 a day and ₦6,750 an hour on an 8-hour day", () => {
  const c = plantCosting(mixer());
  assert.equal(c.dayCost, 54000);
  assert.equal(c.hoursPerDay, 8);
  assert.equal(c.hourlyRate, 6750);
  assert.equal(c.priced, true);
  assert.deepEqual(c.problems, []);
});

test("the working day is a stated figure: 10 hours makes the same mixer ₦5,400 an hour", () => {
  assert.equal(plantCosting(mixer({ hoursPerDay: 10 })).hourlyRate, 5400);
});

// ── a missing price is never a silent zero ─────────────────────────────────

test("a part with a quantity and no price leaves the machine unpriced, and says which", () => {
  const m = mixer();
  m.parts[1] = { kind: "fuel", description: "Diesel", quantity: 15, unit: "L", unitPrice: 0 };
  const c = plantCosting(m);
  assert.equal(c.priced, false);
  assert.equal(c.hourlyRate, null, "null, not ₦0");
  assert.deepEqual(c.problems, ["Diesel has no price"]);
});

test("no hours per day, or no priced part, is unpriced too", () => {
  assert.equal(plantCosting(mixer({ hoursPerDay: 0 })).hourlyRate, null);
  assert.equal(plantCosting(mixer({ hoursPerDay: null })).hourlyRate, null);
  assert.equal(plantCosting({ name: "Empty", hoursPerDay: 8, parts: [] }).hourlyRate, null);
});

test("a rate cannot be given a line for an unpriced machine", () => {
  assert.throws(
    () => plantLine(mixer({ hoursPerDay: 0 }), 0.25),
    (e) => e instanceof PlantUnpricedError && e.code === "PLANT_UNPRICED",
  );
});

// ── used by the hour ──────────────────────────────────────────────────────

test("0.25 h of mixer per m³ is ₦1,687.50, as a plant line in hours", () => {
  const line = plantLine(mixer(), 0.25);
  assert.deepEqual(
    { ...line, priceAsOf: undefined },
    {
      componentName: "Concrete mixer (1-bag)",
      quantity: 0.25,
      unit: "hr",
      unitPrice: 6750,
      lineTotal: 1687.5,
      refKind: "plant",
      refSn: 1,
      refName: "Concrete mixer (1-bag)",
      priceAsOf: undefined,
    },
  );
});

// ── the contract the plugins read ─────────────────────────────────────────

const concreteRate = () => {
  const plant = [plantLine(mixer(), 0.25), plantLine(vibrator(), 0.25)];
  const breakdown = [
    { componentName: "Cement", quantity: 6.4, unit: "bags", unitPrice: 9500, lineTotal: 60800, refKind: "material" },
    { componentName: "Concreting gang", quantity: 0.5, unit: "day", unitPrice: 12000, lineTotal: 6000, refKind: "labour" },
    ...plant,
  ];
  return {
    sectionKey: "concrete",
    description: "Plain concrete 1:2:4",
    unit: "m3",
    netCost: 60800 + 6000 + 2031.25,
    overheadPercent: 10,
    profitPercent: 25,
    breakdown,
  };
};

test("composition: an hourly plant line reaches QUIV/HERON as kind plant, with a stored total", () => {
  const comp = buildRateComposition(concreteRate());
  const plant = comp.components.filter((c) => c.kind === "plant");
  assert.equal(plant.length, 2);
  assert.deepEqual(
    plant.map((c) => [c.name, c.quantity, c.unit, c.unitPrice, c.totalCost]),
    [
      ["Concrete mixer (1-bag)", 0.25, "hr", 6750, 1687.5],
      ["Poker vibrator", 0.25, "hr", 1375, 343.75],
    ],
  );
  // HERON sums stored totals only: every plant component carries one.
  assert.ok(plant.every((c) => c.totalCost > 0));
  // Material + labour + plant is the whole net, so no money is lost or added.
  const sub = compositionSubtotals(comp);
  assert.equal(sub.materialCost, 60800);
  assert.equal(sub.labourCost, 6000);
  assert.equal(sub.plantCost, 2031.25);
  assert.equal(sub.materialCost + sub.labourCost + sub.plantCost + sub.otherCost, comp.netCost);
  assert.equal(comp.netCost, 68831.25);
});

test("a website custom rate carries its plant in materials[] (rateType plant) and the breakdown", () => {
  // The shape client/src/ds/rategen/customRateDraft.js draftToPayload sends.
  const mixerLine = plantLine(mixer(), 0.25);
  const raw = {
    customRateId: "cr-conc",
    sectionKey: "concrete",
    title: "Concrete 1:2:4",
    unit: "m3",
    materials: [
      { rateType: "material", description: "Cement", quantity: 6.4, unit: "bags", unitPrice: 9500, totalCost: 60800 },
      { rateType: "plant", description: mixerLine.componentName, quantity: 0.25, unit: "hr", unitPrice: 6750, totalCost: 1687.5, refSn: 1 },
    ],
    labour: [{ rateType: "labour", description: "Concreting gang", quantity: 0.5, unit: "day", unitPrice: 12000, totalCost: 6000 }],
    breakdown: [
      { componentName: "Cement", quantity: 6.4, unit: "bags", unitPrice: 9500, lineTotal: 60800, refKind: "material" },
      { ...mixerLine },
      { componentName: "Concreting gang", quantity: 0.5, unit: "day", unitPrice: 12000, lineTotal: 6000, refKind: "labour" },
    ],
    netCost: 68487.5,
    overheadPercent: 10,
    profitPercent: 10,
  };
  const stored = normalizeCustomRate(raw);
  const def = toUserRateDefinition(stored, { source: "user-custom", customRateId: "cr-conc" });
  // QUIV main merges materials[] + labour[] and classifies by rateType.
  const plantInMaterials = def.materials.filter((l) => l.rateType === "plant");
  assert.equal(plantInMaterials.length, 1);
  assert.equal(plantInMaterials[0].totalCost, 1687.5);
  assert.equal(compositionSubtotals(def.composition).plantCost, 1687.5);

  // Rate Gen desktop re-pushes from its own two lists, without plant...
  const desktop = normalizeCustomRate({
    customRateId: "cr-conc",
    sectionKey: "concrete",
    title: "Concrete 1:2:4",
    unit: "m3",
    materials: [raw.materials[0]],
    labour: raw.labour,
    breakdown: [raw.breakdown[0], raw.breakdown[2]],
    netCost: 66800,
    overheadPercent: 10,
    profitPercent: 10,
  });
  // ...and the plant line and its ₦1,687.50 survive it.
  const kept = preservePlantLines(desktop, stored);
  assert.equal(kept.netCost, 68487.5);
  assert.ok(kept.breakdown.some((l) => l.refKind === "plant" && l.lineTotal === 1687.5));
});

// ── the customer's own versions ─────────────────────────────────────────

test("a customer's own diesel price replaces ADLM's mixer for them only", () => {
  const myMixer = mixer({ key: "copy-1", baseSn: 1 });
  myMixer.parts[1] = { kind: "fuel", description: "Diesel", quantity: 15, unit: "L", unitPrice: 1200 };
  const rows = mergePlantLibrary(
    [mixer(), vibrator()],
    [myMixer, { key: "my-tipper", name: "Tipper 10t", hoursPerDay: 9, parts: [{ kind: "hire", quantity: 1, unitPrice: 90000 }] }],
  );
  const m = rows.find((r) => r.sn === 1);
  assert.equal(m.source, "your-copy");
  assert.equal(m.dayCost, 57000); // 54,000 + 15 × 200
  assert.equal(m.hourlyRate, 7125);
  assert.equal(m.adlm.hourlyRate, 6750, "ADLM's figure is still shown beside it");
  const t = rows.find((r) => r.name === "Tipper 10t");
  assert.equal(t.source, "yours");
  assert.equal(t.hourlyRate, 10000);
  assert.equal(t.sn, null);
});

test("a disabled ADLM machine drops out of the list", () => {
  const rows = mergePlantLibrary([mixer({ enabled: false }), vibrator()], []);
  assert.deepEqual(rows.map((r) => r.name), ["Poker vibrator"]);
});

test("the form is checked before anything is saved", () => {
  assert.equal(cleanPlantInput({ name: "", hoursPerDay: 8, parts: [{ quantity: 1, unitPrice: 1 }] }).problem, "Give the machine a name");
  assert.match(cleanPlantInput({ name: "x", hoursPerDay: 0, parts: [{ quantity: 1, unitPrice: 1 }] }).problem, /more than 0/);
  assert.match(cleanPlantInput({ name: "x", hoursPerDay: 25, parts: [{ quantity: 1, unitPrice: 1 }] }).problem, /24/);
  assert.match(cleanPlantInput({ name: "x", hoursPerDay: 8, parts: [] }).problem, /at least one part/);
  assert.match(cleanPlantInput({ name: "x", hoursPerDay: 8, parts: [{ kind: "rocket", quantity: 1, unitPrice: 1 }] }).problem, /not a kind/);
  // an untouched form row is not a part
  const { plant, problem } = cleanPlantInput({
    name: "Mixer",
    hoursPerDay: 8,
    parts: [{ kind: "hire", quantity: 1, unitPrice: 25000 }, { kind: "other", description: "", quantity: "", unitPrice: "" }],
  });
  assert.equal(problem, null);
  assert.equal(plant.parts.length, 1);
});

// ── the schedule engine's plant allowance (opts.plantFor) ───────────────

test("plantFor: a bill line priced from the concrete rate gets ₦2,031.25 of plant per m³", () => {
  const rate = { ...concreteRate(), id: "r1" };
  rate.composition = buildRateComposition(rate);
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const plantFor = makePlantFor([rate], same);
  assert.equal(plantFor({ appliedRateKey: "Plain concrete 1:2:4", unit: "m3", qty: 100 }), 2031.25);
  // no rate named → 0, and the Plant constants decide as before
  assert.equal(plantFor({ appliedRateKey: "", unit: "m3" }), 0);
  // billed in another unit → 0: the conversion is not ours to guess
  assert.equal(plantFor({ appliedRateKey: "Plain concrete 1:2:4", unit: "m2" }), 0);
});

test("plantFor: two same-named rates that disagree on plant give 0, not a guess", () => {
  const a = { ...concreteRate(), id: "a" };
  const b = { ...concreteRate(), id: "b", breakdown: concreteRate().breakdown.slice(0, 3) };
  const plantFor = makePlantFor([a, b], (x, y) => x === y);
  assert.equal(plantFor({ appliedRateKey: "Plain concrete 1:2:4", unit: "m3" }), 0);
});
