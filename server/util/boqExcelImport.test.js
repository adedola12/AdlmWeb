// Excel BoQ importer tests.
//
// Two rules the feature rests on:
//   • the template we hand users imports cleanly, including the material and
//     labour schedules being separate sheets that both link back to the bill; and
//   • a workbook ADLM exported does NOT import, so a download can never be
//     turned into a second project holding a copy of a bill already on file.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseBoqWorkbook, buildBoqTemplateWorkbook } from "./boqExcelImport.js";
import { exportBillAndBudget } from "./billBudgetExporter.js";
import { exportElementalBoQ } from "./elementalBoqExporter.js";

async function toBuffer(workbook) {
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

test("the import template splits material and labour, and both link to the bill", async () => {
  const wb = buildBoqTemplateWorkbook();
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["Read Me", "BoQ", "Material Schedule", "Labour Schedule"],
  );

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  assert.equal(parsed.items.length, 3);

  const kinds = parsed.budgetItems.map((b) => b.componentKind);
  assert.ok(kinds.includes("Material"), "material rows imported");
  assert.ok(kinds.includes("Labour"), "labour rows imported");

  // Every schedule row resolved to a bill line via its Bill S/N — a split
  // schedule must not cost the linkage the combined sheet had.
  for (const b of parsed.budgetItems) {
    assert.ok(b.billIdentity, `"${b.description}" did not link to a bill line`);
    assert.ok(
      parsed.items.some((it) => it.code === b.billIdentity),
      `"${b.description}" linked to a code no bill line carries`,
    );
  }

  // Both schedules feed the same bill lines, so the build-up bundles per line.
  const byCode = new Map();
  for (const b of parsed.budgetItems) {
    byCode.set(b.billIdentity, (byCode.get(b.billIdentity) || new Set()).add(b.componentKind));
  }
  for (const [code, set] of byCode) {
    assert.deepEqual([...set].sort(), ["Labour", "Material"], `bill line ${code}`);
  }
});

test("a QS's own workbook still imports its preliminaries as measured work", async () => {
  // No ADLM stamp — this is somebody's own bill, and a PRELIMINARIES page in
  // one is real measured work, not a restatement of anything.
  const wb = new ExcelJS.Workbook();

  const prelim = wb.addWorksheet("PRELIMINARIES");
  prelim.addRow(["Item", "Description", "Qty", "Unit", "Rate", "Amount"]);
  prelim.addRow(["A", "Site office and stores", 1, "Item", 1_200_000, null]);

  const main = wb.addWorksheet("MAIN BUILDING");
  main.addRow(["Item", "Description", "Qty", "Unit", "Rate", "Amount"]);
  main.addRow(["A", "Excavate foundation trench", 120, "m3", 2500, null]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  assert.equal(parsed.items.length, 2);
  assert.ok(
    parsed.items.some((it) => /site office/i.test(it.description)),
    "the preliminaries line came through",
  );
});

test("refuses a Bill & Budget export", async () => {
  const out = await exportBillAndBudget({
    projectName: "Any Project",
    items: [{ code: "BQ-1", category: "Substructure", description: "Excavate", unit: "m3", qty: 10, rate: 100 }],
  });
  await assert.rejects(
    () => parseBoqWorkbook(out.buffer),
    (err) => err.code === "ADLM_EXPORT_NOT_IMPORTABLE",
  );
});

test("refuses an elemental BoQ export", async () => {
  const out = await exportElementalBoQ({
    projectName: "Any Project",
    productKey: "revit",
    items: [
      { code: "BQ-1", category: "Substructure", description: "Excavate foundation trench", unit: "m3", qty: 10, rate: 100 },
    ],
  });
  await assert.rejects(
    () => parseBoqWorkbook(out.buffer),
    (err) => err.code === "ADLM_EXPORT_NOT_IMPORTABLE",
  );
});

/* ── a schedule row that ties to nothing ─────────────────────────────────── */

// Found while trying to reproduce a reported procurement loss on re-import.
// The loss did not reproduce — the carry-over works — but a workbook whose
// "Bill S/N" does not resolve strands its schedule rows: they price no bill
// line, the line still reads as unpriced, and the M&L engine then generates a
// whole synthetic schedule on top of the one the QS supplied. The import
// reported its row count and looked like a success.
test("says when a schedule row could not be tied to a bill line", async () => {
  const wb = new ExcelJS.Workbook();
  const bill = wb.addWorksheet("BoQ");
  bill.addRow(["S/N", "Category", "Description", "Unit", "Qty", "Rate"]);
  bill.addRow([1, null, "Reinforced concrete grade 25 in columns", "m3", 32, 65_000]);

  const sched = wb.addWorksheet("Material Schedule");
  sched.addRow(["Bill S/N", "Component", "Description", "Unit", "Qty", "Rate"]);
  sched.addRow([1, "Material", "Cement (50kg bags)", "bags", 224, 9_500]);
  // S/N 9 is not in the bill — a typo, or a sheet copied from another job.
  sched.addRow([9, "Material", "Sharp sand", "m3", 14, 18_000]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  const orphanWarning = parsed.warnings.find((w) => /could not be tied to a bill line/.test(w));
  assert.ok(orphanWarning, `expected an orphan warning, got: ${parsed.warnings.join(" | ")}`);
  assert.match(orphanWarning, /1 material\/labour row/);
  assert.match(orphanWarning, /Sharp sand/);
  assert.match(orphanWarning, /Bill S\/N/);
});

test("a workbook whose schedule all ties up says nothing about orphans", async () => {
  const wb = new ExcelJS.Workbook();
  const bill = wb.addWorksheet("BoQ");
  bill.addRow(["S/N", "Category", "Description", "Unit", "Qty", "Rate"]);
  bill.addRow([1, null, "Reinforced concrete grade 25 in columns", "m3", 32, 65_000]);
  const sched = wb.addWorksheet("Material Schedule");
  sched.addRow(["Bill S/N", "Component", "Description", "Unit", "Qty", "Rate"]);
  sched.addRow([1, "Material", "Cement (50kg bags)", "bags", 224, 9_500]);

  const parsed = await parseBoqWorkbook(await toBuffer(wb));
  assert.equal(
    parsed.warnings.some((w) => /could not be tied to a bill line/.test(w)),
    false,
  );
  // And the row really is tied on, so the engine will not double it up.
  assert.equal(parsed.budgetItems.length, 1);
  assert.equal(parsed.budgetItems[0].billIdentity, parsed.items[0].code);
});
