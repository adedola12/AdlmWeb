// A picked Rate Gen rate, written into the Budget.
//
// The invariant every test here defends: deriveBillRatesFromBudget re-derives
// the bill rate from the build-up on save AND on read, so if the Budget does
// not reproduce the picked rate to the kobo, the pick silently reverts and the
// QS is told "Saved" over a number that changed back.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveConstants, MC } from "./materialConstants.js";
import {
  buildRateBudgetRows,
  applyRateRows,
  isRateGenRow,
  splitRateByKind,
  RATEGEN_SOURCE,
} from "./rateToBudget.js";
import { deriveLineRate, deriveBillRatesFromBudget } from "./deriveBillRates.js";
import { isGeneratedRow } from "./mlSchedule.js";
import { ensureBillItemCoverage } from "./budgetCoverage.js";

const K = resolveConstants();

const item = (over = {}) => ({
  code: "C-101",
  description: "Reinforced concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 0,
  ...over,
});

// The owner's own worked example: a concrete rate per m³ whose build-up
// carries material, labour AND plant. Net 10,000; +10% overhead +25% profit
// = 13,500/m³. Per 100 m³ the Budget must say cost 1,000,000 and profit
// 260,000 — not cost 900,000 and profit 360,000, which is what booking the
// plant as profit produced.
const concreteRate = (over = {}) => ({
  description: "Reinforced concrete 1:2:4",
  unit: "m3",
  netCost: 10000,
  overheadPercent: 10,
  profitPercent: 25,
  totalCost: 13500,
  breakdown: [
    { componentName: "Cement", refKind: "material", quantity: 6.4, unit: "bags", unitPrice: 800, totalPrice: 5120 },
    { componentName: "Sharp sand", refKind: "material", quantity: 0.45, unit: "tons", unitPrice: 4000, totalPrice: 1800 },
    { componentName: "Granite", refKind: "material", quantity: 0.9, unit: "tons", unitPrice: 1200, totalPrice: 1080 },
    { componentName: "Mason", refKind: "labour", quantity: 1, unit: "m3", unitPrice: 1000, totalPrice: 1000 },
    { componentName: "Concrete mixer 10/7", refKind: "plant", quantity: 1, unit: "m3", unitPrice: 1000, totalPrice: 1000 },
  ],
  ...over,
});

const priceFor = (name) => {
  const p = { Cement: 900, "Sharp sand": 3500, Granite: 1100 };
  return p[name] || 0;
};

const netOf = (rows) => rows.reduce((a, r) => a + r.qty * r.rate, 0);
const byKind = (rows, kind) => rows.filter((r) => r.componentKind === kind);

// ── the split ───────────────────────────────────────────────────────────────

test("plant is its own class, not a slice of labour", () => {
  const s = splitRateByKind(concreteRate());
  assert.equal(s.material, 8000);
  assert.equal(s.labour, 1000);
  assert.equal(s.plant, 1000);
  assert.equal(s.net, 10000);
});

test("cost a rate's build-up does not itemise stays with the materials", () => {
  // netCost 10,000 but the lines only add to 9,000 — the missing 1,000 is real
  // money and must not vanish.
  const s = splitRateByKind(
    concreteRate({
      breakdown: [
        { componentName: "Cement", refKind: "material", quantity: 6.4, unit: "bags", unitPrice: 800, totalPrice: 5120 },
        { componentName: "Sharp sand", refKind: "material", quantity: 0.47, unit: "tons", unitPrice: 4000, totalPrice: 1880 },
        { componentName: "Mason", refKind: "labour", quantity: 1, unit: "m3", unitPrice: 1000, totalPrice: 1000 },
        { componentName: "Concrete mixer 10/7", refKind: "plant", quantity: 1, unit: "m3", unitPrice: 1000, totalPrice: 1000 },
      ],
    }),
  );
  assert.equal(s.unexplained, 1000);
  assert.equal(s.material + s.labour + s.plant, 10000);
});

// ── the pick sticks ─────────────────────────────────────────────────────────

test("a picked rate's Budget reproduces the rate exactly", () => {
  const it = item();
  const { rows } = buildRateBudgetRows(it, concreteRate(), K, { priceFor });

  const derived = deriveLineRate(it.qty, rows);
  assert.equal(derived.rate, 13500, "the bill rate must come back as the rate that was picked");
});

test("it reproduces across quantities, units and mixes, to the kobo", () => {
  const cases = [
    { qty: 1, rate: concreteRate() },
    { qty: 7.35, rate: concreteRate() },
    { qty: 1000, rate: concreteRate() },
    { qty: 100, rate: concreteRate({ netCost: 25000, totalCost: 33750 }) },
    { qty: 100, rate: concreteRate({ overheadPercent: 0, profitPercent: 0, totalCost: 10000 }) },
    { qty: 250, rate: concreteRate({ overheadPercent: 15, profitPercent: 40, totalCost: 15500 }) },
  ];
  for (const c of cases) {
    const it = item({ qty: c.qty });
    const { rows } = buildRateBudgetRows(it, c.rate, K, { priceFor });
    const derived = deriveLineRate(it.qty, rows);
    assert.equal(
      derived.rate,
      c.rate.totalCost,
      `qty ${c.qty}, rate ${c.rate.totalCost}`,
    );
  }
});

test("the whole save path leaves the picked rate where the QS put it", () => {
  // deriveBillRatesFromBudget is what runs on every save and every read.
  const it = item({ rate: 13500 });
  const { rows } = buildRateBudgetRows(it, concreteRate(), K, { priceFor });
  const project = { items: [it], budgetItems: rows };

  deriveBillRatesFromBudget(project);
  assert.equal(project.items[0].rate, 13500);

  // …and again, because a GET re-derives too. It must be idempotent.
  const second = deriveBillRatesFromBudget(project);
  assert.equal(second.updated, 0, "a second read must not move the money");
  assert.equal(project.items[0].rate, 13500);
});

test("the coverage heal adds nothing to a rate-priced line, so the bill cannot drift", () => {
  const it = item();
  const { rows } = buildRateBudgetRows(it, concreteRate(), K, { priceFor });
  const healed = ensureBillItemCoverage([it], rows);
  assert.equal(healed.length, rows.length, "no synthetic row should be needed");
  assert.equal(deriveLineRate(it.qty, healed).rate, 13500);
});

// ── the owner's rules about the rows themselves ─────────────────────────────

test("one Labour row and one Plant row — the gang detail is not in the Budget", () => {
  const { rows } = buildRateBudgetRows(item(), concreteRate(), K, { priceFor });
  assert.equal(byKind(rows, "Labour").length, 1);
  assert.equal(byKind(rows, "Plant").length, 1);
});

test("plant carries its own cost, and is not reported as profit", () => {
  const it = item();
  const { rows } = buildRateBudgetRows(it, concreteRate(), K, { priceFor });

  const plant = byKind(rows, "Plant")[0];
  assert.equal(plant.qty, 100, "plant is carried on the bill quantity");
  assert.equal(plant.rate, 1000);
  assert.equal(plant.qty * plant.rate, 100000, "₦100,000 of plant hire on 100 m³");

  // The defect, measured. Run the SAME rate with its plant line deleted — which
  // is what every layer below the rate library used to see — and the ₦100,000
  // of mixer hire moves out of cost and into profit.
  const blind = buildRateBudgetRows(
    it,
    concreteRate({ breakdown: concreteRate().breakdown.filter((l) => l.refKind !== "plant") }),
    K,
    { priceFor },
  ).rows;

  const billAmount = 13500 * 100;
  const costWithPlant = netOf(rows);
  const costWithoutPlant = netOf(blind);

  assert.equal(
    Math.round(costWithPlant - costWithoutPlant),
    100000,
    "the Budget's cost is ₦100,000 higher because the plant is in it",
  );
  assert.equal(
    Math.round(billAmount - costWithPlant) + 100000,
    Math.round(billAmount - costWithoutPlant),
    "…and that is exactly the ₦100,000 that used to be booked as profit",
  );
});

test("quantities come from the bill and the constants; prices come from the rate", () => {
  const { rows } = buildRateBudgetRows(item(), concreteRate(), K, { priceFor });
  const cement = rows.find((r) => /cement/i.test(r.description));
  assert.ok(cement, "the Material Constants library decides the cement quantity");

  // 100 m³ of 1:2:4 is ~6 bags/m³ — the constants' number, NOT the 6.4 the
  // rate happens to carry. A rate never says how much cement a m³ needs.
  assert.ok(cement.qty > 500 && cement.qty < 700, `cement qty was ${cement.qty}`);
  assert.equal(cement.rate, 800, "…but the PRICE is the rate's 800, not the master list's 900");
});

test("a material the rate does not name falls back to the master price list", () => {
  const rateWithoutSand = concreteRate({
    breakdown: concreteRate().breakdown.filter((l) => l.componentName !== "Sharp sand"),
  });
  const { rows } = buildRateBudgetRows(item(), rateWithoutSand, K, { priceFor });
  const sand = rows.find((r) => /sand/i.test(r.description));
  assert.ok(sand);
  assert.equal(sand.rate, 3500, "the master price list, because the rate is silent");
});

// ── a project with no plant behaves as it did ───────────────────────────────

test("a rate with no plant writes no Plant row and behaves exactly as today", () => {
  const noPlant = concreteRate({
    netCost: 9000,
    totalCost: 12150,
    breakdown: concreteRate().breakdown.filter((l) => l.refKind !== "plant"),
  });
  const it = item();
  const { rows } = buildRateBudgetRows(it, noPlant, K, { priceFor });

  assert.equal(byKind(rows, "Plant").length, 0, "no plant, no Plant row");
  assert.equal(byKind(rows, "Labour").length, 1);
  assert.equal(deriveLineRate(it.qty, rows).rate, 12150);
});

test("a rate that itemises no labour still gets a Labour row, from the constants", () => {
  const materialOnly = {
    description: "Concrete",
    unit: "m3",
    netCost: 8000,
    overheadPercent: 10,
    profitPercent: 25,
    totalCost: 10800,
    breakdown: concreteRate().breakdown.filter((l) => l.refKind === "material"),
  };
  const it = item();
  const { rows, warnings } = buildRateBudgetRows(it, materialOnly, K, { priceFor });
  assert.equal(byKind(rows, "Labour").length, 1);
  assert.ok(warnings.some((w) => /itemises no labour/i.test(w)));
  assert.equal(deriveLineRate(it.qty, rows).rate, 10800, "and the rate still reproduces");
});

// ── a rate below its own build-up ───────────────────────────────────────────

test("a rate priced below its build-up still holds the bill rate, and says so", () => {
  // Today's prices cost more than this old rate sells the work for. The bill
  // must NOT rise on a read.
  const cheap = concreteRate({ netCost: 10000, totalCost: 2000, overheadPercent: 10, profitPercent: 25 });
  const it = item();
  const { rows, warnings } = buildRateBudgetRows(it, cheap, K, { priceFor });

  assert.equal(deriveLineRate(it.qty, rows).rate, 2000, "the bill rate is exactly what was picked");
  assert.ok(warnings.some((w) => /costs more than the picked rate/i.test(w)));
  const adj = rows.find((r) => r.description === "Rate reconciliation");
  assert.ok(adj, "the difference is on one named, visible line");
  assert.ok(adj.rate < 0);
});

// ── stamping: a re-pick replaces its own rows and nothing else ──────────────

test("every row the pick writes is stamped, in its own sn band", () => {
  const { rows } = buildRateBudgetRows(item(), concreteRate(), K, { priceFor });
  for (const r of rows) {
    assert.equal(r.rateSource, RATEGEN_SOURCE);
    assert.ok(r.sn >= 700000000 && r.sn < 800000000, `sn ${r.sn} is outside the band`);
    assert.equal(isRateGenRow(r), true);
    // …and it must not look like a schedule row, or the generator would
    // replace it on the next import.
    assert.equal(isGeneratedRow(r), false, "the two bands must not overlap");
  }
});

test("a re-pick replaces only its own rows", () => {
  const it = item();
  const first = buildRateBudgetRows(it, concreteRate(), K, { priceFor }).rows;
  let budget = applyRateRows([], it.code, first);
  assert.equal(budget.length, first.length);

  const dearer = concreteRate({ netCost: 20000, totalCost: 27000 });
  const second = buildRateBudgetRows(it, dearer, K, { priceFor }).rows;
  budget = applyRateRows(budget, it.code, second);

  assert.equal(budget.length, second.length, "the first pick's rows are gone, not doubled");
  assert.equal(deriveLineRate(it.qty, budget).rate, 27000);
});

test("a hand-typed row survives a pick, and a re-pick", () => {
  const it = item();
  const typed = {
    billIdentity: "C-101",
    sn: 42,
    description: "Curing compound the QS added",
    materialName: "Curing compound",
    componentKind: "Material",
    unit: "litres",
    qty: 30,
    rate: 500,
    rateSource: "manual",
  };

  let budget = applyRateRows([typed], it.code, buildRateBudgetRows(it, concreteRate(), K, { priceFor }).rows);
  assert.ok(budget.some((b) => b.description === "Curing compound the QS added"));

  budget = applyRateRows(budget, it.code, buildRateBudgetRows(it, concreteRate({ totalCost: 15000 }), K, { priceFor }).rows);
  const survivor = budget.filter((b) => b.description === "Curing compound the QS added");
  assert.equal(survivor.length, 1, "still exactly one, untouched");
  assert.equal(survivor[0].rate, 500);
  assert.equal(survivor[0].sn, 42);
});

test("a row a plugin sent, and another line's rows, are never touched", () => {
  const fromPlugin = {
    billIdentity: "C-101",
    sn: 89,
    description: "Concrete mixer 10/7",
    materialName: "Concrete mixer 10/7",
    componentKind: "Plant", // exactly the shape production already holds
    unit: "m3",
    qty: 1.01,
    rate: 0,
  };
  const otherLine = {
    billIdentity: "B-200",
    sn: 700000001, // in OUR band, but a different bill line
    description: "Blocks",
    materialName: "Blocks",
    componentKind: "Material",
    unit: "nr",
    qty: 500,
    rate: 450,
    rateSource: RATEGEN_SOURCE,
  };

  const it = item();
  const budget = applyRateRows(
    [fromPlugin, otherLine],
    it.code,
    buildRateBudgetRows(it, concreteRate(), K, { priceFor }).rows,
  );

  assert.ok(
    budget.some((b) => b.sn === 89 && b.componentKind === "Plant"),
    "the plugin's own Plant row is still there",
  );
  assert.ok(
    budget.some((b) => b.billIdentity === "B-200" && b.rate === 450),
    "another bill line's rows are not this pick's business",
  );
});

test("a re-pick keeps the procurement marks the QS set on the last one", () => {
  const it = item();
  let budget = applyRateRows([], it.code, buildRateBudgetRows(it, concreteRate(), K, { priceFor }).rows);

  const cement = budget.find((b) => /cement/i.test(b.description));
  cement.procured = true;
  cement.procuredPercent = 60;
  cement.supplier = "Dangote depot, Ojota";

  budget = applyRateRows(budget, it.code, buildRateBudgetRows(it, concreteRate({ totalCost: 14000 }), K, { priceFor }).rows);

  const after = budget.find((b) => /cement/i.test(b.description));
  assert.equal(after.procured, true);
  assert.equal(after.procuredPercent, 60);
  assert.equal(after.supplier, "Dangote depot, Ojota");
});

// ── refusals ────────────────────────────────────────────────────────────────

test("a rate with no build-up is refused, so the caller can fall back", () => {
  assert.equal(buildRateBudgetRows(item(), { totalCost: 13500, breakdown: [] }, K, {}), null);
  assert.equal(buildRateBudgetRows(item({ qty: 0 }), concreteRate(), K, {}), null);
  assert.equal(buildRateBudgetRows(item({ code: "" }), concreteRate(), K, {}), null);
});

test("a converted rate reproduces the converted figure, not the rate's own", () => {
  // The bill measures in m² what the rate prices in m³; the caller converted
  // and tells us what it showed the QS.
  const it = item({ unit: "m2", qty: 40 });
  const { rows } = buildRateBudgetRows(it, concreteRate(), K, { priceFor, unitCost: 2025 });
  assert.equal(deriveLineRate(it.qty, rows).rate, 2025);
});
