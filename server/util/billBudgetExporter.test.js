// Bill + Budget exporter tests.
//
// Two things have to hold for this workbook to be worth downloading:
//   1. the totals it shows are the project's own totals, and the schedules
//      reconcile with the bill they were built from; and
//   2. it survives the round trip back through boqExcelImport — the export is
//      the file a QS edits in Excel and uploads again.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { exportBillAndBudget } from "./billBudgetExporter.js";
import { parseBoqWorkbook } from "./boqExcelImport.js";

const ITEMS = [
  {
    code: "BQ-a1",
    category: "Substructure",
    takeoffLine: "Excavation",
    description: "Excavate foundation trench n.e. 1.5m deep",
    unit: "m3",
    qty: 120,
    rate: 2500,
  },
  {
    code: "BQ-a2",
    category: "Substructure",
    takeoffLine: "Excavation",
    description: "Backfill and compact in layers",
    unit: "m3",
    qty: 60,
    rate: 1800,
  },
  {
    code: "BQ-a3",
    category: "Substructure",
    takeoffLine: "Plain in-situ concrete; mix 1:4:8",
    description: "Blinding 50mm thick",
    unit: "m2",
    qty: 85,
    rate: 4200,
  },
  {
    code: "BQ-b1",
    category: "Frame",
    description: "Reinforced concrete grade 25 in columns",
    unit: "m3",
    qty: 32,
    rate: 65000,
  },
];

const BUDGET = [
  { billIdentity: "BQ-a3", componentKind: "Material", materialName: "Cement (50kg)", unit: "bags", qty: 30, rate: 9500, overheadPercent: 5, profitPercent: 10 },
  { billIdentity: "BQ-a3", componentKind: "Material", materialName: "Sharp sand", unit: "m3", qty: 6, rate: 18000, overheadPercent: 5, profitPercent: 10 },
  { billIdentity: "BQ-a3", componentKind: "Labour", materialName: "Concrete gang", unit: "m2", qty: 85, rate: 450, overheadPercent: 5, profitPercent: 10 },
  { billIdentity: "BQ-b1", componentKind: "Material", materialName: "Cement (50kg)", unit: "bags", qty: 224, rate: 9500, overheadPercent: 8, profitPercent: 12 },
  { billIdentity: "BQ-b1", componentKind: "Material", materialName: "Granite", unit: "m3", qty: 25, rate: 42000, overheadPercent: 8, profitPercent: 12 },
  { billIdentity: "BQ-b1", componentKind: "Labour", materialName: "Carpenter - formwork", unit: "m2", qty: 180, rate: 1200, overheadPercent: 8, profitPercent: 12 },
  { billIdentity: "BQ-b1", componentKind: "Plant", materialName: "Concrete mixer hire", unit: "day", qty: 6, rate: 35000, overheadPercent: 8, profitPercent: 12 },
];

const MEASURED = ITEMS.reduce((a, i) => a + i.qty * i.rate, 0);
const sumOf = (kind) =>
  BUDGET.filter((b) => b.componentKind === kind).reduce((a, b) => a + b.qty * b.rate, 0);

async function build(extra = {}) {
  const out = await exportBillAndBudget({
    projectName: "Test Project",
    clientName: "A Client",
    items: ITEMS,
    budgetItems: BUDGET,
    ...extra,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  return { out, wb };
}

// The cached result of a formula cell — what a reader that does not evaluate
// formulas sees, and what the importer reads.
function valueAt(wb, sheet, addr) {
  const v = wb.getWorksheet(sheet).getCell(addr).value;
  if (v && typeof v === "object" && "formula" in v) return v.result ?? 0;
  return v;
}

function findRow(wb, sheet, col, label) {
  const ws = wb.getWorksheet(sheet);
  let found = null;
  ws.eachRow((row, n) => {
    if (found) return;
    const cell = row.getCell(col).value;
    if (typeof cell === "string" && cell.startsWith(label)) found = n;
  });
  assert.ok(found, `no row starting "${label}" on ${sheet}`);
  return found;
}

test("writes a bill sheet plus separated material, labour and plant schedules", async () => {
  const { out, wb } = await build();
  assert.match(out.filename, /Bill & Budget\.xlsx$/);

  const names = wb.worksheets.map((w) => w.name);
  for (const expected of [
    "Cover",
    "Bill of Quantities",
    "Bill Summary",
    "Schedule of Current Prices",
    "Material Schedule",
    "Labour Schedule",
    "Plant & Equipment Schedule",
    "Material Summary",
    "Budget Summary",
  ]) {
    assert.ok(names.includes(expected), `missing sheet ${expected}`);
  }

  // No labour on the material sheet, and no material on the labour sheet. The
  // title block above the header is merged across the sheet, so only rows
  // below the "Component" header carry a real component value.
  const kinds = (sheet) => {
    const ws = wb.getWorksheet(sheet);
    const set = new Set();
    let started = false;
    ws.eachRow((row) => {
      const k = row.getCell(2).value;
      if (k === "Component") {
        started = true;
        return;
      }
      if (started && typeof k === "string" && k) set.add(k);
    });
    return set;
  };
  assert.deepEqual([...kinds("Material Schedule")].sort(), ["Material"]);
  assert.deepEqual([...kinds("Labour Schedule")].sort(), ["Labour"]);
  assert.deepEqual([...kinds("Plant & Equipment Schedule")].sort(), ["Plant"]);
});

test("keeps the project's own sections, subtitles and totals", async () => {
  const { wb } = await build();
  const ws = wb.getWorksheet("Bill of Quantities");

  const texts = [];
  ws.eachRow((row) => {
    const v = row.getCell(2).value;
    if (typeof v === "string") texts.push(v);
  });
  assert.ok(texts.includes("SUBSTRUCTURE"), "section heading kept");
  assert.ok(texts.includes("FRAME"), "second section heading kept");
  assert.ok(texts.includes("Excavation"), "preamble subtitle kept");
  assert.ok(
    texts.includes("Plain in-situ concrete; mix 1:4:8"),
    "second preamble subtitle kept",
  );
  assert.ok(texts.some((t) => t.startsWith("Subtotal — Substructure")), "section subtotal");

  // Section subtotals and the measured total are the project's own numbers.
  const subRow = findRow(wb, "Bill of Quantities", 2, "Subtotal — Substructure");
  assert.equal(valueAt(wb, "Bill of Quantities", `F${subRow}`), 120 * 2500 + 60 * 1800 + 85 * 4200);

  const measuredRow = findRow(wb, "Bill Summary", 2, "MEASURED WORK — SUBTOTAL");
  assert.equal(valueAt(wb, "Bill Summary", `D${measuredRow}`), MEASURED);
});

test("schedule totals reconcile with the build-up, and the budget summary with the bill", async () => {
  const { wb } = await build();

  const materialTotal = findRow(wb, "Material Schedule", 3, "TOTAL — MATERIAL SCHEDULE");
  assert.equal(valueAt(wb, "Material Schedule", `G${materialTotal}`), sumOf("Material"));

  const labourTotal = findRow(wb, "Labour Schedule", 3, "TOTAL — LABOUR SCHEDULE");
  assert.equal(valueAt(wb, "Labour Schedule", `G${labourTotal}`), sumOf("Labour"));

  const net = findRow(wb, "Budget Summary", 2, "NET BUILD-UP COST");
  assert.equal(
    valueAt(wb, "Budget Summary", `C${net}`),
    sumOf("Material") + sumOf("Labour") + sumOf("Plant"),
  );

  const value = findRow(wb, "Budget Summary", 2, "Measured work — bill value");
  assert.equal(valueAt(wb, "Budget Summary", `C${value}`), MEASURED);
});

test("the schedule of current prices drives the material summary", async () => {
  const { wb } = await build();
  const prices = wb.getWorksheet("Schedule of Current Prices");

  // Cement appears on two bill lines at one rate — one line on the schedule.
  const rows = [];
  prices.eachRow((row, n) => {
    if (n > 5 && row.getCell(2).value) rows.push([row.getCell(2).value, row.getCell(4).value]);
  });
  assert.deepEqual(rows, [
    ["Cement (50kg)", 9500],
    ["Granite", 42000],
    ["Sharp sand", 18000],
  ]);

  // Material Summary aggregates the quantity and reads its rate from there.
  const summary = wb.getWorksheet("Material Summary");
  const cementRow = findRow(wb, "Material Summary", 2, "Cement (50kg)");
  assert.equal(summary.getCell(`D${cementRow}`).value, 30 + 224);
  assert.match(String(summary.getCell(`E${cementRow}`).value.formula), /Schedule of Current Prices/);

  const total = findRow(wb, "Material Summary", 2, "TOTAL — MATERIAL SUMMARY");
  assert.equal(valueAt(wb, "Material Summary", `F${total}`), sumOf("Material"));
});

test("is refused by the importer, so a download cannot become a second project", async () => {
  const { out } = await build({
    provisionalSums: [{ description: "Borehole", amount: 2_500_000 }],
    variations: [{ reference: "VO-01", description: "Extra window", qty: 4, unit: "no", rate: 180_000 }],
    preliminaryItems: [{ name: "Site office", allocation: 40 }, { name: "Insurances", allocation: 60 }],
    preliminaryPercent: 5,
  });

  await assert.rejects(
    () => parseBoqWorkbook(out.buffer),
    (err) => {
      assert.equal(err.code, "ADLM_EXPORT_NOT_IMPORTABLE");
      assert.equal(err.statusCode, 400);
      // The message has to say where an update actually starts.
      assert.match(err.message, /re-measure in the source model/i);
      return true;
    },
  );
});

test("is still refused when the document properties have been stripped", async () => {
  const { out } = await build();

  // A conversion (Sheets, a converter, some export pipelines) can drop
  // docProps entirely. The visible cover stamp is the second line of defence.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  wb.keywords = "";
  wb.category = "";
  wb.subject = "";
  wb.creator = "Someone Else";
  const stripped = await wb.xlsx.writeBuffer();

  await assert.rejects(
    () => parseBoqWorkbook(Buffer.from(stripped)),
    (err) => err.code === "ADLM_EXPORT_NOT_IMPORTABLE",
  );
});

test("exports a bill that has no budget behind it yet", async () => {
  const out = await exportBillAndBudget({ projectName: "Bare", items: ITEMS });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);

  const names = wb.worksheets.map((w) => w.name);
  assert.ok(names.includes("Bill of Quantities"));
  assert.ok(!names.includes("Material Schedule"), "no empty schedule sheets");
  assert.ok(!names.includes("Schedule of Current Prices"));

  const net = findRow(wb, "Budget Summary", 2, "NET BUILD-UP COST");
  assert.equal(valueAt(wb, "Budget Summary", `C${net}`), 0);
});

test("an empty project still produces a readable workbook", async () => {
  const out = await exportBillAndBudget({ projectName: "Empty" });
  assert.ok(out.buffer.length > 0);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  assert.ok(wb.worksheets.map((w) => w.name).includes("Bill of Quantities"));
});
