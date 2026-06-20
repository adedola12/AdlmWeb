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
import { ensureBillItemCoverage } from "./budgetCoverage.js";

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

test("resolveBillIdentity: bracket-stripped title links a coarse material (unique)", () => {
  const items = [
    { code: "SB", description: "Strip – Blinding [L:Multiple | T:Oversite]" },
    { code: "OC", description: "Oversite – Concrete [L:All | T:Oversite]" },
  ];
  const idx = buildBillIndex(items);
  // Material module groups it as "Strip → Blinding" — no code, no brackets.
  assert.equal(
    resolveBillIdentity({ materialName: "Cement", takeoffLine: "Strip → Blinding" }, idx),
    "SB",
  );
});

test("resolveBillIdentity: ambiguous stripped title does NOT link (variants)", () => {
  const items = [
    { code: "LC1", description: "Blockwork – Lintel Concrete [T:225mm Masonry]" },
    { code: "LC2", description: "Blockwork – Lintel Concrete [T:Interior - 140]" },
  ];
  const idx = buildBillIndex(items);
  // Maps to BOTH variants → skipped so it is never mis-filed.
  assert.equal(
    resolveBillIdentity({ takeoffLine: "Blockwork → Lintel Concrete" }, idx),
    "",
  );
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

test("resolveAll: rescues a stranded breakdown by element plurality (no majority)", () => {
  // A concrete line + a blockwork line. The cement row arrived code-less with a
  // variant takeoffLine that doesn't title-match, and shares only ONE of its
  // four elements with the concrete line (the rest are ghost/unmodelled ids) —
  // so the conservative majority gate leaves it unlinked. The plurality rescue
  // rehomes it onto the concrete line so the breakdown isn't stranded/shadowed.
  const items = [
    { code: "OVC", description: "Oversite – Concrete [T:Mass]", elementIds: [1] },
    { code: "BLK", description: "Blockwork – Wall [T:225]", elementIds: [9] },
  ];
  const cement = {
    componentKind: "Material",
    materialName: "Cement",
    // A generic module title that neither exact- nor stripped-matches a bill
    // line, so the only remaining signal is the elements.
    takeoffLine: "Concrete Works → Materials → Cement",
    elementIds: [1, 80, 81, 82],
  };
  // The single-line conservative resolver leaves it unlinked (1 of 4 ≠ majority).
  assert.equal(resolveBillIdentity(cement, buildBillIndex(items)), "");
  // resolveAll's final rescue places it on its unique plurality home.
  assert.equal(resolveAll(items, [cement])[0], "OVC");
});

test("resolveAll: a plurality tie stays unlinked (never mis-filed)", () => {
  const items = [
    { code: "A", description: "Strip – Blinding", elementIds: [1, 2] },
    { code: "B", description: "Blockwork – Wall", elementIds: [3, 4] },
  ];
  // Shares 1 element with A, 1 with B, plus 2 ghosts → no majority, exact tie.
  const mystery = { componentKind: "Material", materialName: "Mystery", elementIds: [1, 3, 90, 91] };
  assert.equal(resolveBillIdentity(mystery, buildBillIndex(items)), ""); // no majority
  assert.equal(resolveAll(items, [mystery])[0], ""); // tie → rescue declines
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

// ── ensureBillItemCoverage ──────────────────────────────────────────

test("ensureBillItemCoverage: adds Labour + Material for a bare bill item", () => {
  const items = [
    { code: "DPM", description: "Oversite – DPM [L:.. | T:Oversite]", qty: 254, unit: "m2" },
    { code: "CON", description: "Oversite – Concrete", qty: 38, unit: "m3" },
  ];
  const budget = [
    { billIdentity: "CON", componentKind: "Material", materialName: "Cement", qty: 100, unit: "bag" },
    { billIdentity: "CON", componentKind: "Labour", materialName: "Labour", qty: 38, unit: "m3" },
  ];
  const out = ensureBillItemCoverage(items, budget);
  const dpm = out.filter((b) => b.billIdentity === "DPM");
  assert.equal(dpm.length, 2); // synthesised labour + material
  assert.ok(dpm.some((b) => b.componentKind === "Labour" && b.qty === 254));
  assert.ok(dpm.some((b) => b.componentKind === "Material" && b.qty === 254));
  // The complete CON item is left untouched.
  assert.equal(out.filter((b) => b.billIdentity === "CON").length, 2);
});

test("ensureBillItemCoverage: fills only the missing side (labour present)", () => {
  const items = [{ code: "BRC", description: "Oversite – BRC Mesh", qty: 254, unit: "m2" }];
  const budget = [
    { billIdentity: "BRC", componentKind: "Labour", materialName: "Labour", qty: 254, unit: "m2" },
  ];
  const out = ensureBillItemCoverage(items, budget);
  const brc = out.filter((b) => b.billIdentity === "BRC");
  assert.equal(brc.length, 2);
  assert.equal(brc.filter((b) => b.componentKind === "Material").length, 1);
});

test("ensureBillItemCoverage: labour-only items get NO synthetic material", () => {
  const items = [
    { code: "EXC", description: "Strip – Footing Excavation", qty: 88, unit: "m3" },
    { code: "DISP", description: "Strip – Disposal", qty: 30, unit: "m3" },
    { code: "BF", description: "Strip – Backfill", qty: 60, unit: "m2" },
    { code: "ES", description: "Strip – Earthwork Support", qty: 295, unit: "m2" },
    { code: "LVL", description: "Strip – Leveling & Compacting", qty: 197, unit: "m2" },
  ];
  const out = ensureBillItemCoverage(items, []);
  // Each is labour-only → exactly one Labour line, no Material.
  assert.equal(out.length, items.length);
  assert.ok(out.every((b) => b.componentKind === "Labour"));
});

test("ensureBillItemCoverage: deterministic sn (stable across re-runs)", () => {
  const items = [{ code: "DPM", description: "Oversite – DPM", qty: 254, unit: "m2" }];
  const a = ensureBillItemCoverage(items, []);
  const b = ensureBillItemCoverage(items, []);
  assert.equal(a.length, 2); // material + labour
  assert.deepEqual(
    a.map((x) => x.sn).sort(),
    b.map((x) => x.sn).sort(),
  );
});

test("ensureBillItemCoverage: a rescued breakdown is NOT shadowed by a synthetic line", () => {
  // The reported bug, end to end: a concrete item whose real cement/sand/granite
  // rows arrived code-less and below the majority gate. backfillBudgetLinks now
  // rescues them by plurality, so coverage sees real materials and adds ONLY a
  // Labour line — never a generic "Material" line that hides the breakdown.
  const items = [
    { code: "OVC", description: "Oversite – Concrete [T:Mass]", qty: 38, unit: "m3", elementIds: [1] },
  ];
  const budget = [
    { componentKind: "Material", materialName: "Cement", qty: 100, unit: "bag", elementIds: [1, 80, 81, 82] },
    { componentKind: "Material", materialName: "Sand", qty: 5, unit: "m3", elementIds: [1, 80, 81, 82] },
    { componentKind: "Material", materialName: "Granite", qty: 8, unit: "m3", elementIds: [1, 80, 81, 82] },
  ];
  backfillBudgetLinks(items, budget); // rescue links all three to OVC
  const out = ensureBillItemCoverage(items, budget);
  const ovc = out.filter((b) => String(b.billIdentity).toUpperCase() === "OVC");
  const materials = ovc.filter((b) => b.componentKind === "Material");
  assert.equal(materials.length, 3); // the real breakdown survives, un-shadowed
  assert.deepEqual(
    materials.map((b) => b.materialName).sort(),
    ["Cement", "Granite", "Sand"],
  );
  assert.equal(ovc.filter((b) => b.componentKind === "Labour").length, 1); // gap-filled
});

test("ensureBillItemCoverage: synthetic lines carry the item's per-element split", () => {
  const items = [
    {
      code: "DPM",
      description: "Oversite – DPM",
      qty: 254,
      unit: "m2",
      elementIds: [5, 6],
      elementQuantities: [{ id: 5, qty: 154 }, { id: 6, qty: 100 }],
    },
  ];
  const out = ensureBillItemCoverage(items, []);
  assert.equal(out.length, 2); // material + labour, both synthetic
  for (const b of out) {
    assert.deepEqual(b.elementQuantities, [{ id: 5, qty: 154 }, { id: 6, qty: 100 }]);
  }
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
