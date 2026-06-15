// Unit tests for the budget↔bill linker and bill-rate derivation.
// Run: node --test server/util/budget.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTitle,
  buildBillIndex,
  resolveBillIdentity,
  resolveAll,
  backfillBudgetLinks,
} from "./budgetBillLink.js";
import {
  deriveLineRate,
  deriveBillRatesFromBudget,
} from "./deriveBillRates.js";

// ── budgetBillLink ──────────────────────────────────────────────────

test("normalizeTitle keeps bracket content so variants stay distinct", () => {
  assert.equal(
    normalizeTitle("Ceiling → Area [L:All Floors | T:Plain | 600mm]"),
    "ceiling area l all floors t plain 600mm",
  );
  assert.equal(normalizeTitle("  Oversite – Blinding  "), "oversite blinding");
  // Two wall-type variants must NOT collapse to the same key.
  assert.notEqual(
    normalizeTitle("Blockwork – Lintel Concrete [T:225mm Masonry]"),
    normalizeTitle("Blockwork – Lintel Concrete [T:Interior - Blockwork 140]"),
  );
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
  // Same takeoff title as the bill line (plugin emits matching strings).
  const labour = { takeoffLine: "Ceiling → Area" };
  assert.equal(resolveBillIdentity(labour, idx), "C-CEIL");
});

test("resolveBillIdentity: no match without an element majority (no collapse)", () => {
  const items = [
    { code: "A", elementIds: [1, 2, 3, 4] },
    { code: "B", elementIds: [5, 6, 7, 8] },
  ];
  const idx = buildBillIndex(items);
  // Shares only 1 of its 4 elements with A → not a majority → stays unlinked
  // (rather than being dumped onto A).
  assert.equal(resolveBillIdentity({ elementIds: [1, 90, 91, 92] }, idx), "");
});

test("resolveAll: a foreign material does NOT collapse onto an unrelated bill line", () => {
  // Bill: a tiny "Blinding" line + a big "Blockwork" line, distinct elements.
  const items = [
    { code: "BLIND", description: "Strip – Blinding", elementIds: [1, 2] },
    { code: "BLOCK", description: "Blockwork – Wall", elementIds: [10, 11, 12, 13] },
  ];
  const lines = [
    { componentKind: "Labour", sourceTakeoffCode: "BLIND", elementIds: [1, 2] },
    // Blocks live on the blockwork elements — must land on BLOCK, never BLIND.
    { componentKind: "Material", materialName: "Blocks", elementIds: [10, 11, 12] },
  ];
  const codes = resolveAll(items, lines);
  assert.equal(codes[0], "BLIND");
  assert.equal(codes[1], "BLOCK");
});

test("resolveAll: material bundles onto its labour's bill code via shared element", () => {
  // Bill line carries NO elementIds, so the material can only reach it through
  // the labour line (which has the bill code + the work item's elements).
  const items = [
    { code: "C-CEIL", description: "Ceiling – Area", takeoffLine: "Ceiling → Area", elementIds: [] },
  ];
  const lines = [
    { componentKind: "Labour", sourceTakeoffCode: "C-CEIL", elementIds: [11, 12] },
    { componentKind: "Material", materialName: "Ceiling board", takeoffLine: "Ceiling → Materials", elementIds: [12] },
  ];
  const codes = resolveAll(items, lines);
  assert.equal(codes[0], "C-CEIL"); // labour by explicit code
  assert.equal(codes[1], "C-CEIL"); // material anchored to labour via element 12
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
