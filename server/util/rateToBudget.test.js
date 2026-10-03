// A picked Rate Gen rate, written into the Budget.
//
// The invariant every test here defends: deriveBillRatesFromBudget re-derives
// the bill rate from the build-up on save AND on read, so if the Budget does
// not reproduce the picked rate to the kobo, the pick silently reverts and the
// QS is told "Saved" over a number that changed back.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveConstants, MC } from "./materialConstants.js";
import { generateMlSchedule } from "./mlSchedule.js";
import {
  RATEGEN_SOURCE,
  applyRateRows,
  buildRateBudgetRows,
  isRateGenRow,
  splitRateByKind,
  whyRateCannotPrice,
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

test("the picked rate reproduces to the kobo whatever the bill quantity and constants give", () => {
  // The back-solved O&P is stored rounded. At a fixed 4dp, a ₦12,150 rate on
  // 100 m³ read back ₦12,149.99 once the constants moved (28 Sep 2026). Sweep
  // quantities and rates so no constants change can reopen that.
  const misses = [];
  for (const totalCost of [12150, 13500, 9876.54, 25000.01]) {
    const r = concreteRate({ netCost: totalCost / 1.35, totalCost });
    for (const qty of [1, 3, 7.5, 12.345, 57, 100, 250.8, 999]) {
      const it = item({ qty });
      const { rows } = buildRateBudgetRows(it, r, K, { priceFor });
      const got = deriveLineRate(it.qty, rows).rate;
      if (got !== totalCost) misses.push(`${totalCost} × ${qty} → ${got}`);
    }
  }
  assert.deepEqual(misses, []);
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

// ── Why a rate could not price a line ──
//
// buildRateBudgetRows answers null for three unrelated reasons and the route
// reported all of them as RATE_HAS_NO_BUILDUP. So a preliminaries line imported
// with a unit of "Item" and no quantity — the importer's own amount-only lump
// case — told the QS that a perfectly built-up rate had no build-up, and they
// would go and rebuild a rate that was never the problem.

const builtUp = {
  totalCost: 42_000,
  overheadPercent: 10,
  profitPercent: 10,
  breakdown: [
    { componentName: "Cement", refKind: "material", quantity: 6, unitPrice: 800, lineTotal: 4_800 },
  ],
};

test("a line with no QUANTITY is not told the rate is at fault", () => {
  const why = whyRateCannotPrice({ code: "BQ-1", qty: 0, unit: "Item" }, builtUp);
  assert.equal(why.code, "LINE_HAS_NO_QUANTITY");
  assert.match(why.message, /no quantity/);
  // And it says what to do instead.
  assert.match(why.message, /lump sum/);
});

test("a line with no REFERENCE says so", () => {
  assert.equal(whyRateCannotPrice({ code: "", qty: 10 }, builtUp).code, "LINE_HAS_NO_CODE");
});

test("a rate with no build-up still says exactly that", () => {
  const why = whyRateCannotPrice({ code: "BQ-1", qty: 10 }, { totalCost: 5_000 });
  assert.equal(why.code, "RATE_HAS_NO_BUILDUP");
});

test("a rate that prices to nothing is its own answer", () => {
  // Applying it would leave the line unpriced, which is not the same as having
  // no build-up to split.
  const why = whyRateCannotPrice({ code: "BQ-1", qty: 10 }, { ...builtUp, totalCost: 0 });
  assert.equal(why.code, "RATE_IS_WORTH_NOTHING");
});

test("nothing wrong, nothing said", () => {
  assert.equal(whyRateCannotPrice({ code: "BQ-1", qty: 10 }, builtUp), null);
});

test("the reason agrees with what buildRateBudgetRows actually did", () => {
  // Same guards, same order — so a refusal always has a matching explanation
  // and a success never has one. K is the real constants map: the valid case
  // gets past the guards and into the arithmetic, which reads it.
  const cases = [
    { code: "", qty: 10 },
    { code: "BQ-1", qty: 0 },
    { code: "BQ-1", qty: 10 },
  ];
  for (const item of cases) {
    const built = buildRateBudgetRows(item, builtUp, K, { priceFor: () => 0 });
    const why = whyRateCannotPrice(item, builtUp);
    assert.equal(Boolean(built), !why, JSON.stringify(item));
  }
});

// ── Picking a rate replaces the line's budget, it does not add to it ──
//
// Reported from live testing: "the rates got filled but the material got
// duplicated and labour wasn't priced, and the budget total was more than the
// bill total."
//
// There are TWO automatic sources of budget rows and each has its own sn band:
// the M&L constants generator at 800,000,000+ and rateToBudget at 700,000,000+.
// applyRateRows cleared only its own band, so a line the generator had already
// priced kept those rows AND gained the rate's.

test("a line the generator already priced does not double when a rate is picked", () => {
  const item = { code: "BQ-1", description: "Concrete (1:2:4) in bases", takeoffLine: "", unit: "m3", qty: 10, rate: 50_000 };
  const generated = generateMlSchedule([item], [], K).budgetItems;
  const mineOf = (rows) => rows.filter((b) => String(b.billIdentity || "").toLowerCase() === "bq-1");
  assert.equal(mineOf(generated).length, 4, "cement, sand, granite and labour");

  const rate = {
    rateId: "r1", unit: "m3", totalCost: 52_000, overheadPercent: 10, profitPercent: 10,
    breakdown: [
      { componentName: "Cement", refKind: "material", quantity: 6.5, unitPrice: 5_000, lineTotal: 32_500 },
      { componentName: "Mason", refKind: "labour", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 },
    ],
  };
  const built = buildRateBudgetRows(item, rate, K, { priceFor: () => 0 });
  const after = mineOf(applyRateRows(generated, "BQ-1", built.rows));

  // Was 8 — every material and the labour listed twice.
  assert.equal(after.length, 4, "the rate replaces the line's rows, it does not add to them");
  const names = after.map((b) => `${b.componentKind}/${b.materialName || b.description}`);
  assert.equal(new Set(names).size, names.length, "no duplicate rows");
});

test("the duplication is what pushed the budget over the bill", () => {
  // The symptom the QS actually saw. One line, bill worth ₦500,000.
  const item = { code: "BQ-1", description: "Concrete (1:2:4) in bases", takeoffLine: "", unit: "m3", qty: 10, rate: 50_000 };
  const generated = generateMlSchedule([item], [], K).budgetItems;
  const rate = {
    rateId: "r1", unit: "m3", totalCost: 52_000, overheadPercent: 10, profitPercent: 10,
    breakdown: [
      { componentName: "Cement", refKind: "material", quantity: 6.5, unitPrice: 5_000, lineTotal: 32_500 },
      { componentName: "Mason", refKind: "labour", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 },
    ],
  };
  const built = buildRateBudgetRows(item, rate, K, { priceFor: () => 0 });
  const amount = (b) => Number(b.amount) || Number(b.total) || Number(b.qty) * Number(b.rate) || 0;
  const budget = applyRateRows(generated, "BQ-1", built.rows)
    .filter((b) => String(b.billIdentity || "").toLowerCase() === "bq-1")
    .reduce((a, b) => a + amount(b), 0);

  // The rate re-prices the line to 10 x 52,000; the cost behind it must be less
  // than what it is sold for, or the line loses money.
  assert.ok(budget < 10 * 52_000, `budget ${Math.round(budget)} must sit under the line's value`);
});

test("LABOUR is priced even when the picked rate has none in its build-up", () => {
  // Most of a real library is material-only build-ups ("Mortar Mix (1:3)"), and
  // a line with no labour row prices labour at nothing, silently.
  const item = { code: "BQ-1", description: "Concrete (1:2:4) in bases", takeoffLine: "", unit: "m3", qty: 10, rate: 50_000 };
  const materialOnly = {
    rateId: "r2", unit: "m3", totalCost: 52_000, overheadPercent: 10, profitPercent: 10,
    breakdown: [
      { componentName: "Cement", refKind: "material", quantity: 6.5, unitPrice: 5_000, lineTotal: 32_500 },
      { componentName: "Sharp sand", refKind: "material", quantity: 0.6, unitPrice: 9_000, lineTotal: 5_400 },
    ],
  };
  const built = buildRateBudgetRows(item, materialOnly, K, { priceFor: () => 0 });
  const labour = built.rows.filter((r) => r.componentKind === "Labour");
  assert.equal(labour.length, 1, "a labour row is still produced");
  // From the constants' own output for this work, not zero.
  assert.ok(labour[0].qty * labour[0].rate > 0, "and it carries money");
});

test("a row the QS added by hand is NOT swept away by picking a rate", () => {
  // Only the two AUTOMATIC bands are replaceable. A hand-added row is the QS's
  // own decision and must survive.
  const item = { code: "BQ-1", description: "Concrete (1:2:4) in bases", takeoffLine: "", unit: "m3", qty: 10, rate: 50_000 };
  const byHand = { billIdentity: "BQ-1", sn: 12, componentKind: "Material", materialName: "Curing compound", unit: "L", qty: 5, rate: 2_000 };
  const generated = [...generateMlSchedule([item], [], K).budgetItems, byHand];
  const rate = {
    rateId: "r1", unit: "m3", totalCost: 52_000, overheadPercent: 10, profitPercent: 10,
    breakdown: [{ componentName: "Cement", refKind: "material", quantity: 6.5, unitPrice: 5_000, lineTotal: 32_500 }],
  };
  const built = buildRateBudgetRows(item, rate, K, { priceFor: () => 0 });
  const after = applyRateRows(generated, "BQ-1", built.rows);
  assert.ok(
    after.some((b) => b.materialName === "Curing compound"),
    "the hand-added row survives",
  );
});
