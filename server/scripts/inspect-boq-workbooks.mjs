// Dump the structure of real-world BoQ workbooks so the importer can be
// tuned to them. Temporary tooling — safe to delete.
// Usage: node scripts/inspect-boq-workbooks.mjs <file.xlsx> [maxRows]
import ExcelJS from "exceljs";

const file = process.argv[2];
const maxRows = Number(process.argv[3] || 25);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r?.text || "").join("");
    if (v.result !== undefined && v.result !== null) return String(v.result);
    if (v.formula) return "="; // formula with no cached result
    if (v.text !== undefined) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

console.log(`FILE: ${file}`);
console.log(`sheets (${wb.worksheets.length}):`);
for (const ws of wb.worksheets) {
  console.log(`  - "${ws.name}"  rows=${ws.rowCount} cols=${ws.columnCount} state=${ws.state}`);
}

for (const ws of wb.worksheets) {
  if (ws.state && ws.state !== "visible") continue;
  console.log(`\n=== SHEET "${ws.name}" (first ${maxRows} rows) ===`);
  const last = Math.min(ws.rowCount, maxRows);
  for (let r = 1; r <= last; r += 1) {
    const row = ws.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = cellText(cell).replace(/\s+/g, " ").trim();
      if (t) cells.push(`${col}:${t.slice(0, 40)}`);
    });
    if (cells.length) console.log(`  r${r}: ${cells.join(" | ")}`);
  }
}
