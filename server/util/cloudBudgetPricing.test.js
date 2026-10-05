// QUIV measures, ADLM Cloud prices: unpriced QUIV rows get the cloud's prices,
// uncovered lines get built, and nothing the QS priced moves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { priceBudgetFromCloud, CLOUD_PRICE_SOURCE } from "./cloudBudgetPricing.js";
import { resolveConstants, MC } from "./materialConstants.js";
import { deriveBillRatesFromBudget } from "./deriveBillRates.js";

const K = resolveConstants();
const PRICES = { cement: 5200, "sharp sand": 18000 };
const ctx = {
  K,
  priceFor: (name) => PRICES[String(name).toLowerCase()] || 0,
};

const bill = () => [
  { code: "c1", description: "Strip - Concrete in Footing", unit: "m3", qty: 14.68, rate: 0 },
  { code: "c2", description: "Oversite - Blinding", unit: "m3", qty: 8.16, rate: 0 },
];

/** What QUIV sends for c1: quantities, no prices. Nothing for c2. */
const quivRows = () => [
  { billIdentity: "c1", materialName: "Cement", unit: "bag", qty: 100, rate: 0, componentKind: "Material" },
  { billIdentity: "c1", materialName: "Sharp sand", unit: "ton", qty: 8, rate: 0, componentKind: "Material" },
  { billIdentity: "c1", materialName: "Granite", unit: "ton", qty: 12, rate: 0, componentKind: "Material" },
  { billIdentity: "c1", materialName: "Labour", unit: "m3", qty: 14.68, rate: 0, componentKind: "Labour" },
];

test("unpriced QUIV rows get the cloud's material and labour prices", () => {
  const { budgetItems, priced } = priceBudgetFromCloud(bill(), quivRows(), ctx);
  const by = (n) => budgetItems.find((b) => b.billIdentity === "c1" && b.materialName === n);
  assert.equal(by("Cement").rate, 5200);
  assert.equal(by("Cement").rateSource, CLOUD_PRICE_SOURCE);
  assert.equal(by("Sharp sand").rate, 18000);
  assert.equal(by("Granite").rate, 0, "no price found: left for the QS");
  assert.equal(by("Labour").rate, K.get(MC.LabourConcretePerM3));
  assert.equal(priced, 3);
});

test("a priced line gets the Markup constants, so its bill rate is a selling rate", () => {
  const { budgetItems } = priceBudgetFromCloud(bill(), quivRows(), ctx);
  const cement = budgetItems.find((b) => b.materialName === "Cement");
  assert.equal(cement.overheadPercent, K.get(MC.MarkupOverheadPercent));
  assert.equal(cement.profitPercent, K.get(MC.MarkupProfitPercent));

  const project = { items: bill(), budgetItems };
  deriveBillRatesFromBudget(project);
  const net = 100 * 5200 + 8 * 18000 + 14.68 * K.get(MC.LabourConcretePerM3);
  const markup = 1 + (K.get(MC.MarkupOverheadPercent) + K.get(MC.MarkupProfitPercent)) / 100;
  assert.equal(project.items[0].rate, Math.round((net * markup / 14.68) * 100) / 100);
});

test("nothing the QS priced moves: a typed price and his own markup stay", () => {
  const rows = quivRows();
  rows[0].rate = 6000;                                    // typed on the web
  rows[0].overheadPercent = 5;
  const { budgetItems } = priceBudgetFromCloud(bill(), rows, ctx);
  const cement = budgetItems.find((b) => b.materialName === "Cement");
  assert.equal(cement.rate, 6000);
  assert.equal(cement.rateSource, undefined);
  assert.equal(cement.overheadPercent, 5, "his markup on the group is kept");
  const sand = budgetItems.find((b) => b.materialName === "Sharp sand");
  assert.equal(sand.overheadPercent, undefined, "and not overwritten on the group's other rows");
});

test("a line QUIV did not cover is built; a covered line is not built twice", () => {
  const { budgetItems, covered } = priceBudgetFromCloud(bill(), quivRows(), ctx);
  assert.ok(covered >= 1, "the blinding line got a schedule");
  assert.ok(budgetItems.some((b) => b.billIdentity === "c2"));
  const c1Cement = budgetItems.filter((b) => b.billIdentity === "c1" && /cement/i.test(b.materialName || ""));
  assert.equal(c1Cement.length, 1, "QUIV's own cement row, no generated duplicate");
});

test("labour on a different unit from its bill line is not guessed", () => {
  const rows = [{ billIdentity: "c1", materialName: "Labour", unit: "day", qty: 3, rate: 0, componentKind: "Labour" }];
  const { budgetItems } = priceBudgetFromCloud(bill(), rows, ctx);
  assert.equal(budgetItems.find((b) => b.unit === "day").rate, 0);
});

test("the input is not mutated, and empty input is fine", () => {
  const rows = quivRows();
  priceBudgetFromCloud(bill(), rows, ctx);
  assert.equal(rows[0].rate, 0);
  assert.deepEqual(priceBudgetFromCloud([], [], ctx).priced, 0);
  assert.deepEqual(priceBudgetFromCloud(null, null, {}).budgetItems, []);
});
