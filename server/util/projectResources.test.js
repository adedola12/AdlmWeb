// Project resources — the gang behind a Budget Labour row.
//
// THE TEST THAT MATTERS is "resources rows never reach deriveBillRates". The
// Budget carries ONE Labour row per item, holding the whole labour cost. The
// gang that explains it — three masons, two labourers, a mixer operator —
// sums to the same money. Put both in budgetItems and
// deriveBillRatesFromBudget adds them together and drives the bill rate off
// the doubled figure, on a plain GET. The client's bill would rise by roughly
// the labour content because somebody opened the project.

import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeResourceItems,
  buildResourcesFromRate,
  applyResourceRows,
  summariseResources,
  resourceCost,
  RESOURCE_SOURCE_RATE,
} from "./projectResources.js";
import { deriveLineRate, deriveBillRatesFromBudget } from "./deriveBillRates.js";
import { ensureBillItemCoverage } from "./budgetCoverage.js";
import { backfillBudgetLinks } from "./budgetBillLink.js";
import { buildRateBudgetRows } from "./rateToBudget.js";
import { resolveConstants } from "./materialConstants.js";

const K = resolveConstants();

const item = () => ({
  code: "C-101",
  description: "Reinforced concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 13500,
});

const rate = () => ({
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
});

// ── the invariant ───────────────────────────────────────────────────────────

test("resources rows never reach deriveBillRates", () => {
  const it = item();
  const budget = buildRateBudgetRows(it, rate(), K, { priceFor: () => 0 }).rows;
  const resources = buildResourcesFromRate(it, rate());

  assert.ok(resources.length > 0, "there IS gang detail to misplace");

  // The project as it is actually stored: two separate arrays.
  const project = { items: [it], budgetItems: budget, resourceItems: resources };
  deriveBillRatesFromBudget(project);
  assert.equal(project.items[0].rate, 13500, "the bill rate is the rate that was picked");

  // …and the proof it is the SEPARATION doing the work: put the same rows in
  // budgetItems and the bill jumps.
  const wrong = { items: [item()], budgetItems: budget.concat(resources.map(asBudgetRow)) };
  deriveBillRatesFromBudget(wrong);
  assert.ok(
    wrong.items[0].rate > 13500,
    "gang rows inside budgetItems DO inflate the bill — which is why they are not there",
  );
});

// What a resource row would look like if someone filed it as a budget row.
const asBudgetRow = (r) => ({
  billIdentity: r.billIdentity,
  sn: 5000 + r.sn,
  description: r.name,
  materialName: r.name,
  componentKind: r.componentKind,
  unit: r.unit,
  qty: r.quantity,
  rate: r.rate,
  overheadPercent: 10,
  profitPercent: 25,
});

test("the budget heal cannot see them either", () => {
  const it = item();
  const budget = buildRateBudgetRows(it, rate(), K, { priceFor: () => 0 }).rows;
  const resources = buildResourcesFromRate(it, rate());

  // Both helpers take budgetItems explicitly; neither has a route to the
  // project's other arrays. Passing the resources alongside must change
  // nothing about the budget.
  const healed = ensureBillItemCoverage([it], budget);
  assert.equal(healed.length, budget.length);

  const { linked } = backfillBudgetLinks([it], budget);
  assert.equal(typeof linked, "number");
  assert.equal(deriveLineRate(it.qty, healed).rate, 13500);

  // And a sanity check that the resources array is untouched by any of it.
  assert.equal(resources.length, buildResourcesFromRate(it, rate()).length);
});

test("a project that stores resources still reads back the same bill", () => {
  const it = item();
  const project = {
    items: [it],
    budgetItems: buildRateBudgetRows(it, rate(), K, { priceFor: () => 0 }).rows,
    resourceItems: buildResourcesFromRate(it, rate()),
  };
  deriveBillRatesFromBudget(project);
  const first = project.items[0].rate;
  // Three more reads, as three more page loads.
  for (let i = 0; i < 3; i += 1) deriveBillRatesFromBudget(project);
  assert.equal(project.items[0].rate, first);
  assert.equal(first, 13500);
});

// ── building the gang from a rate ───────────────────────────────────────────

test("only labour and plant become resources — materials are not a gang", () => {
  const rows = buildResourcesFromRate(item(), rate());
  assert.deepEqual(
    rows.map((r) => r.name).sort(),
    ["Concrete mixer 10/7", "Mason"],
  );
  assert.equal(rows.find((r) => r.name === "Mason").componentKind, "Labour");
  assert.equal(rows.find((r) => /mixer/i.test(r.name)).componentKind, "Plant");
});

test("the gang is scaled onto the bill quantity", () => {
  const rows = buildResourcesFromRate(item(), rate());
  // 1 mason-unit per m³ of rate × 100 m³ of bill.
  assert.equal(rows.find((r) => r.name === "Mason").quantity, 100);
});

test("the gang explains the Budget's Labour and Plant rows, and does not add to them", () => {
  const it = item();
  const budget = buildRateBudgetRows(it, rate(), K, { priceFor: () => 0 }).rows;
  const summary = summariseResources(buildResourcesFromRate(it, rate()), it.code);

  const labourRow = budget.find((b) => b.componentKind === "Labour");
  const plantRow = budget.find((b) => b.componentKind === "Plant");

  assert.equal(summary.labour, Math.round(labourRow.qty * labourRow.rate));
  assert.equal(summary.plant, Math.round(plantRow.qty * plantRow.rate));
});

test("a resource costs how many × how long × the rate", () => {
  assert.equal(resourceCost({ quantity: 3, duration: 0, rate: 5000 }), 15000);
  assert.equal(resourceCost({ quantity: 3, duration: 4, rate: 5000 }), 60000);
  assert.equal(resourceCost({}), 0);
});

// ── the same replace-only-my-own rule as the Budget ─────────────────────────

test("a re-pick replaces its own resource rows and leaves the QS's alone", () => {
  const it = item();
  const typed = {
    billIdentity: "C-101",
    sn: 99,
    name: "Night shift supervisor",
    componentKind: "Labour",
    quantity: 1,
    duration: 10,
    rate: 15000,
    rateSource: "manual",
  };

  let rows = applyResourceRows([typed], it.code, buildResourcesFromRate(it, rate()));
  assert.ok(rows.some((r) => r.name === "Night shift supervisor"));

  rows = applyResourceRows(rows, it.code, buildResourcesFromRate(it, rate()));
  assert.equal(
    rows.filter((r) => r.name === "Night shift supervisor").length,
    1,
    "still exactly one, untouched",
  );
  assert.equal(rows.filter((r) => r.rateSource === RESOURCE_SOURCE_RATE).length, 2);
});

test("another bill line's resources are not this pick's business", () => {
  const other = {
    billIdentity: "B-200",
    sn: 1,
    name: "Bricklayer",
    componentKind: "Labour",
    quantity: 4,
    rate: 8000,
    rateSource: RESOURCE_SOURCE_RATE,
  };
  const rows = applyResourceRows([other], "C-101", buildResourcesFromRate(item(), rate()));
  assert.ok(rows.some((r) => r.billIdentity === "B-200"));
});

// ── sanitising ──────────────────────────────────────────────────────────────

test("a row with no bill line or no name is dropped, not stored loose", () => {
  const rows = sanitizeResourceItems([
    { billIdentity: "", name: "Mason", quantity: 3 },
    { billIdentity: "C-101", name: "", quantity: 3 },
    { billIdentity: "C-101", name: "Mason", quantity: 3, rate: 5000 },
    null,
    "nonsense",
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Mason");
});

test("the kind is normalised, and a nameless kind is read off the name", () => {
  const rows = sanitizeResourceItems([
    { billIdentity: "C-101", name: "Mason", componentKind: "labour" },
    { billIdentity: "C-101", name: "Concrete mixer 10/7" },
    { billIdentity: "C-101", name: "Crane operator" },
  ]);
  assert.deepEqual(rows.map((r) => r.componentKind), ["Labour", "Plant", "Labour"]);
});

test("nothing that could be mistaken for a budget row survives the sanitiser", () => {
  const rows = sanitizeResourceItems([
    {
      billIdentity: "C-101",
      name: "Mason",
      qty: 999,
      materialName: "Cement",
      procured: true,
      overheadPercent: 10,
      profitPercent: 25,
      netUnitCost: 5000,
    },
  ]);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "billIdentity",
    "componentKind",
    "duration",
    "name",
    "notes",
    "quantity",
    "rate",
    "rateSource",
    "sn",
    "trade",
    "unit",
  ]);
});
