// Three small places where plant quietly stopped being plant.
//
// (a) boqExcelImport decided a schedule sheet's kind with "labour or else
//     material", so a Plant Schedule imported as Material.
// (b) budgetCoverage tested the material bucket as "not labour", so a Plant
//     row counted as material and suppressed the synthetic material line.
// (c) elementalBoqExporter named a sheet and a caption "Material + Labour"
//     while the formula under them summed every kind.
//
// Plant is its own resource class, not a slice of labour and not a kind of
// material. None of this moves a figure: (a) and (b) change how a row is
// CLASSED on a fresh import or heal, (c) changes words only.
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseBoqWorkbook } from "./boqExcelImport.js";
import { ensureBillItemCoverage } from "./budgetCoverage.js";
import { exportElementalBoQ } from "./elementalBoqExporter.js";

async function toBuffer(workbook) {
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

/* ── (a) a Plant Schedule imports as Plant ──────────────────────────────── */

function workbookWithSchedules(scheduleSheetName, rows) {
  const wb = new ExcelJS.Workbook();
  const bill = wb.addWorksheet("BoQ");
  bill.addRow(["Item", "Description", "Qty", "Unit", "Rate", "Amount"]);
  bill.addRow(["A", "Concrete 1:2:4 in foundation", 100, "m3", 45000, null]);

  const sched = wb.addWorksheet(scheduleSheetName);
  sched.addRow(["Description", "Unit", "Qty", "Rate"]);
  for (const r of rows) sched.addRow(r);
  return wb;
}

test("a Plant Schedule sheet imports its rows as Plant, not Material", async () => {
  const wb = workbookWithSchedules("Plant & Equipment Schedule", [
    ["Concrete mixer hire", "hr", 40, 2000],
    ["Poker vibrator hire", "hr", 20, 1500],
  ]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  const kinds = parsed.budgetItems.map((b) => b.componentKind);

  assert.ok(kinds.length >= 2, "the plant sheet was read as a schedule sheet");
  assert.deepEqual([...new Set(kinds)], ["Plant"]);
});

test("an Equipment Schedule imports as Equipment", async () => {
  const wb = workbookWithSchedules("Equipment Schedule", [["Tower crane hire", "wk", 4, 900000]]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  assert.deepEqual(
    [...new Set(parsed.budgetItems.map((b) => b.componentKind))],
    ["Equipment"],
  );
});

test("a plant row is not dragged back into labour by the word in its description", async () => {
  // "incl. operator labour" used to force the row to Labour whatever sheet it
  // was on. On a plant sheet the sheet's kind wins.
  const wb = workbookWithSchedules("Plant Schedule", [
    ["Excavator hire incl. operator labour", "hr", 30, 12000],
  ]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  assert.equal(parsed.budgetItems[0].componentKind, "Plant");
});

test("the sheets that imported before import exactly as they did", async () => {
  // Material Schedule → Material. Labour Schedule → Labour. A combined
  // "Material & Labour" sheet → Labour by fallback, with the description guess
  // untouched on a Material sheet.
  const material = workbookWithSchedules("Material Schedule", [["Cement", "bag", 600, 9000]]);
  const labour = workbookWithSchedules("Labour Schedule", [["Mason gang", "day", 20, 25000]]);
  const combined = workbookWithSchedules("Material & Labour", [["Cement", "bag", 600, 9000]]);
  const guessed = workbookWithSchedules("Material Schedule", [
    ["Labour for placing concrete", "m3", 100, 3000],
  ]);

  assert.equal((await parseBoqWorkbook(await toBuffer(material))).budgetItems[0].componentKind, "Material");
  assert.equal((await parseBoqWorkbook(await toBuffer(labour))).budgetItems[0].componentKind, "Labour");
  assert.equal((await parseBoqWorkbook(await toBuffer(combined))).budgetItems[0].componentKind, "Labour");
  assert.equal((await parseBoqWorkbook(await toBuffer(guessed))).budgetItems[0].componentKind, "Labour");
});

/* ── (b) a Plant row is not the material bucket ─────────────────────────── */

const billItem = {
  code: "BQ-1",
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
};

// What ensureBillItemCoverage ADDED to the budget it was handed.
const added = (budget) => {
  const before = new Set(budget);
  return ensureBillItemCoverage([billItem], budget).filter((b) => !before.has(b));
};

test("a bill line whose only non-labour row is plant still gets a material line", () => {
  const lines = added([
    { billIdentity: "BQ-1", componentKind: "Labour", description: "Mason gang", qty: 100, rate: 1200 },
    { billIdentity: "BQ-1", componentKind: "Plant", description: "Mixer hire", qty: 20, rate: 2000 },
  ]);

  assert.deepEqual(lines.map((l) => l.componentKind), ["Material"]);
  // Synthesised unpriced, so it adds nothing to the Budget total: no figure
  // on an existing project can move when this runs on a heal.
  assert.equal(lines[0].rate, 0);
  assert.equal(lines[0].budgetRate, 0);
});

test("a real material row still suppresses the synthetic one", () => {
  assert.deepEqual(
    added([
      { billIdentity: "BQ-1", componentKind: "Labour", description: "Mason gang", qty: 100, rate: 1200 },
      { billIdentity: "BQ-1", componentKind: "Material", description: "Cement", qty: 600, rate: 9000 },
    ]),
    [],
  );
});

test("a row with no kind at all is still the material bucket", () => {
  // Unstamped rows have always meant material here; nothing about them changes.
  assert.deepEqual(
    added([
      { billIdentity: "BQ-1", componentKind: "", description: "Cement", qty: 600, rate: 9000 },
      { billIdentity: "BQ-1", componentKind: "Labour", description: "Mason gang", qty: 100, rate: 1200 },
    ]),
    [],
  );
});

test("a plant-only bill line still gets its labour line too", () => {
  const kinds = added([
    { billIdentity: "BQ-1", componentKind: "Plant", description: "Mixer hire", qty: 20, rate: 2000 },
  ])
    .map((l) => l.componentKind)
    .sort();
  assert.deepEqual(kinds, ["Labour", "Material"]);
});

/* ── (c) the words match the arithmetic ─────────────────────────────────── */

test("the build-up sheet is not named for two of the kinds it sums", async () => {
  const out = await exportElementalBoQ({
    projectName: "Plant Test",
    productKey: "revit",
    items: [{ code: "BQ-1", category: "Substructure", description: "Concrete 1:2:4", unit: "m3", qty: 100, rate: 13500 }],
    budgetItems: [
      { billIdentity: "BQ-1", componentKind: "Material", description: "Cement", unit: "bag", qty: 600, rate: 9000 },
      { billIdentity: "BQ-1", componentKind: "Labour", description: "Mason gang", unit: "day", qty: 20, rate: 25000 },
      { billIdentity: "BQ-1", componentKind: "Plant", description: "Mixer hire", unit: "hr", qty: 40, rate: 2000 },
    ],
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  const names = wb.worksheets.map((w) => w.name);

  assert.ok(names.includes("Resource Build-up"), names.join(", "));
  assert.ok(!names.includes("Material & Labour"));

  const ws = wb.getWorksheet("Resource Build-up");
  const captions = [];
  const types = [];
  ws.eachRow((row) => {
    captions.push(String(row.getCell(1).value ?? ""));
    types.push(String(row.getCell(2).value ?? ""));
  });

  // The sheet prints a Plant row, so neither the sheet name nor the derived
  // rate caption may claim to be material and labour only.
  assert.ok(types.includes("Plant"), types.join(", "));
  assert.ok(captions.some((c) => c === "Bill rate (Net build-up + O&P)"), captions.join(" | "));
  assert.ok(!captions.some((c) => /Material \+ Labour/.test(c)));
});
