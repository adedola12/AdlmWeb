import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { exportCashflowForecast } from "./cashflowExporter.js";

const project = {
  name: "Hampshire Road 1",
  clientName: "UPDC",
  contract: { retentionPercent: 5 },
  items: [
    { code: "BQ-1", qty: 10, rate: 100000 },
    { code: "BQ-2", qty: 10, rate: 200000 },
  ],
  budgetItems: [
    { componentKind: "material", billIdentity: "BQ-1", qty: 1, rate: 400000 },
    { componentKind: "labour", billIdentity: "BQ-1", qty: 1, rate: 300000 },
  ],
  pm: { tasks: [
    { name: "External Walls", wbs: "1.1", durationDays: 30, startDate: "2026-03-01", endDate: "2026-03-31", linkedBoqIdentities: ["1::BQ-1::x::::::m"] },
    { name: "Internal Walls", wbs: "1.2", durationDays: 45, startDate: "2026-03-16", endDate: "2026-04-30", linkedBoqIdentities: ["2::BQ-2::y::::::m"] },
  ] },
};

test("the workbook builds with the practice's two sheets plus a basis", async () => {
  const buf = await exportCashflowForecast(project);
  assert.ok(buf.length > 4000, `only ${buf.length} bytes`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), [
    "Project WBS", "Project Cash Gantt Chart", "Basis",
  ]);
});

test("the cash Gantt has their three header rows and a row per activity", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportCashflowForecast(project));
  const ws = wb.getWorksheet("Project Cash Gantt Chart");
  assert.equal(ws.getCell("A1").value, "Activity (expenditure)");
  assert.equal(ws.getCell("B2").value, 1, "month numbers missing");
  assert.match(String(ws.getCell("B3").value), /2026/, "month names missing");
  const col = [];
  ws.eachRow((r) => col.push(String(r.getCell(1).value ?? "")));
  assert.ok(col.some((v) => /External Walls \(NGN/.test(v)), "no bracketed activity caption");
  assert.ok(col.some((v) => /CUMULATIVE BALANCE/.test(v)), "no cumulative balance row");
  assert.ok(col.some((v) => /Cash received/.test(v)), "no received row");
});

test("a month an activity does not touch is blank, not zero", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportCashflowForecast(project));
  const ws = wb.getWorksheet("Project Cash Gantt Chart");
  let row = null;
  ws.eachRow((r) => { if (/External Walls/.test(String(r.getCell(1).value ?? ""))) row = r; });
  assert.ok(row, "activity row missing");
  // External Walls runs only in March, so April must be empty.
  assert.ok(row.getCell(2).value > 0, "March is empty");
  assert.equal(row.getCell(3).value, null, "April is zero rather than blank");
});

test("a project with no programme says so instead of an empty grid", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportCashflowForecast({ name: "Bare", items: project.items }));
  const ws = wb.getWorksheet("Project Cash Gantt Chart");
  assert.match(String(ws.getCell("A1").value), /no programme/i);
});
