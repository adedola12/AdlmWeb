// Unit tests for the budget↔bill linker and bill-rate derivation.
// Run: node --test server/util/budget.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTitle,
  buildBillIndex,
  resolveBillIdentity,
  backfillBudgetLinks,
} from "./budgetBillLink.js";
import {
  deriveLineRate,
  deriveBillRatesFromBudget,
} from "./deriveBillRates.js";

// ── budgetBillLink ──────────────────────────────────────────────────

test("normalizeTitle strips [..] qualifiers, arrows and punctuation", () => {
  assert.equal(
    normalizeTitle("Ceiling → Area [L:All Floors | T:Plain | 600mm]"),
    "ceiling area",
  );
  assert.equal(normalizeTitle("  Oversite – Blinding  "), "oversite blinding");
});

const BILL = [
  { code: "C-CEIL", description: "Ceiling – Area", takeoffLine: "Ceiling → Area", elementIds: [11, 12, 13] },
  { code: "C-WALL", description: "Blockwork – Wall", takeoffLine: "Blockwork → Wall", elementIds: [21, 22] },
];

test("resolveBillIdentity: exact code wins", () => {
  const idx = buildBillIndex(BILL);
  assert.equal(resolveBillIdentity({ sourceTakeoffCode: "c-ceil" }, idx), "C-CEIL");
});

test("resolveBillIdentity: element-ID overlap links a code-less material", () => {
  const idx = buildBillIndex(BILL);
  // QUIV material from the Material module: no code, different takeoffLine,
  // but shares Revit elements with the Ceiling bill line.
  const mat = { takeoffLine: "Ceiling → Materials → All Floors → Ceiling", elementIds: [13, 99] };
  assert.equal(resolveBillIdentity(mat, idx), "C-CEIL");
});

test("resolveBillIdentity: title match when no code/elements", () => {
  const idx = buildBillIndex(BILL);
  const labour = { takeoffLine: "Ceiling → Area [L:All Floors | T:Plain]" };
  assert.equal(resolveBillIdentity(labour, idx), "C-CEIL");
});

test("resolveBillIdentity: returns '' when nothing matches", () => {
  const idx = buildBillIndex(BILL);
  assert.equal(resolveBillIdentity({ takeoffLine: "Roof → Sheeting" }, idx), "");
});

test("backfillBudgetLinks bundles material + labour under one bill code", () => {
  const budget = [
    { materialName: "Ceiling board", takeoffLine: "Ceiling → Materials → All Floors → Ceiling", elementIds: [11], billIdentity: "" },
    { materialName: "Labour", componentKind: "Labour", takeoffLine: "Ceiling → Area", billIdentity: "C-CEIL" },
    { materialName: "Blocks", takeoffLine: "Blockwork → Wall", elementIds: [22], billIdentity: "" },
  ];
  const { linked } = backfillBudgetLinks(BILL, budget);
  assert.equal(budget[0].billIdentity, "C-CEIL"); // material linked by element
  assert.equal(budget[1].billIdentity, "C-CEIL"); // labour already linked
  assert.equal(budget[2].billIdentity, "C-WALL"); // material linked by element
  assert.ok(linked >= 2);
});

test("backfillBudgetLinks no-ops when the bill has no codes", () => {
  const budget = [{ materialName: "X", billIdentity: "" }];
  const { linked } = backfillBudgetLinks([{ description: "no code" }], budget);
  assert.equal(linked, 0);
  assert.equal(budget[0].billIdentity, "");
});

// ── deriveBillRates ─────────────────────────────────────────────────

test("deriveLineRate: net × (1 + O&P) / billQty", () => {
  // 10 m³ bill line; build-up nets 100,000; 10% overhead + 15% profit.
  const lines = [
    { qty: 10, rate: 8000, overheadPercent: 10, profitPercent: 15 },
    { qty: 10, rate: 2000, overheadPercent: 10, profitPercent: 15 }, // labour
  ];
  const out = deriveLineRate(10, lines);
  // net = 100,000; amount = 125,000; rate = 12,500
  assert.equal(out.rate, 12500);
  assert.equal(out.netUnitCost, 10000);
  assert.equal(out.overheadPercent, 10);
  assert.equal(out.profitPercent, 15);
});

test("deriveLineRate: null when nothing priced", () => {
  assert.equal(deriveLineRate(5, [{ qty: 3, rate: 0 }]), null);
  assert.equal(deriveLineRate(5, []), null);
});

test("deriveBillRatesFromBudget mutates items[].rate only where priced", () => {
  const project = {
    items: [
      { code: "C-CEIL", qty: 10, rate: 0 },
      { code: "C-WALL", qty: 5, rate: 999 }, // no priced budget → untouched
    ],
    budgetItems: [
      { billIdentity: "C-CEIL", qty: 10, rate: 10000, overheadPercent: 0, profitPercent: 25 },
    ],
  };
  const { updated } = deriveBillRatesFromBudget(project);
  assert.equal(updated, 1);
  assert.equal(project.items[0].rate, 12500); // 100,000 ×1.25 /10
  assert.equal(project.items[1].rate, 999); // manual rate preserved
});
