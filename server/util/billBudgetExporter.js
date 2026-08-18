// Bill + Budget Excel exporter.
//
// This is the export side of the "Import from Excel" feature: it writes a
// project's bill and its material & labour build-up back out as a workbook,
// AS MEASURED — the bill keeps its own sections, preamble subtitles, order and
// totals rather than being re-cut against an elemental / trade mapping the way
// elementalBoqExporter.js does. That matters most for imported bills: a real QS
// workbook rarely matches the mapping, so the elemental export dropped every
// line into "Other items" and lost the structure the QS had uploaded.
//
// The workbook is a REPORT, and is stamped as one (see util/adlmWorkbook.js):
// the Excel importer refuses it, so nobody can turn a download into a second
// copy of a project they already have. Quantities are changed where they are
// measured — the source model, or the bill in this project — and re-exported.
//
// Its layout still follows the importer's conventions (header captions, the
// Subtotal / TOTAL wording, section rows that are neither merged nor styled
// like something they are not), because that is simply how a bill reads. Every
// formula is written with its computed result cached, so a reader that does not
// evaluate formulas still sees the right numbers.
//
// Sheets
//   Cover                        project, client, contents, headline totals
//   Bill of Quantities           sections + preamble subtitles + subtotals
//   Preliminaries                (when the project carries them)
//   Provisional Sums             (when present)
//   Variations                   (when present)
//   Bill Summary                 collection of every bill section → project total
//   Schedule of Current Prices   one line per distinct material + its rate
//   Material Schedule            MATERIAL rows only, grouped per bill line
//   Labour Schedule              LABOUR rows only, grouped per bill line
//   Plant & Equipment Schedule   plant / equipment rows (when present)
//   Material Summary             total quantity of each material across the job
//   Budget Summary               materials + labour + plant + O&P vs the bill
//
// Every schedule keeps a subtotal per bill line and a grand total per sheet,
// and every total is a live Excel formula, so re-pricing in Excel re-totals the
// whole workbook.

import ExcelJS from "exceljs";

import { ADLM_EXPORT_COVER_NOTE, stampAdlmWorkbook } from "./adlmWorkbook.js";

/* ── formatting constants ─────────────────────────────────────────────── */

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
const GROUP_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
const GRAND_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };

const MONEY_FMT = '#,##0.00;[Red]-#,##0.00;-';
const QTY_FMT = '#,##0.00;[Red]-#,##0.00;-';
const PCT_FMT = '0.00"%"';

const THIN_TOP = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
const DOUBLE_TOP = { top: { style: "double", color: { argb: "FF334155" } } };

/* ── small helpers ────────────────────────────────────────────────────── */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function round4(v) {
  return Math.round(num(v) * 10000) / 10000;
}

function txt(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function safeSheetName(name, workbook) {
  const base =
    txt(name)
      .replace(/[[\]:*?/\\]/g, "-")
      .slice(0, 31) || "Sheet";
  const used = new Set(workbook.worksheets.map((w) => w.name));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}

// SUM over a scattered set of rows, chunked so a long bill cannot blow Excel's
// 255-argument / 8192-character formula limits.
function sumRefs(col, rowNumbers) {
  if (!rowNumbers.length) return "0";
  const chunks = [];
  for (let i = 0; i < rowNumbers.length; i += 200) {
    chunks.push(
      `SUM(${rowNumbers
        .slice(i, i + 200)
        .map((r) => `${col}${r}`)
        .join(",")})`,
    );
  }
  return chunks.join("+");
}

// Every formula carries its computed value. Excel recalculates on load anyway,
// but a cached result is what lets ExcelJS (our own importer), LibreOffice and
// any other reader see a number instead of an empty cell.
function setFormula(row, col, formula, result) {
  row.getCell(col).value = { formula, result: round2(result) };
}

function moneyCell(row, col) {
  row.getCell(col).numFmt = MONEY_FMT;
}

function qtyCell(row, col) {
  row.getCell(col).numFmt = QTY_FMT;
}

// Title block: project name / sheet title / context, merged across the sheet.
function writeTitleBlock(ws, lines, span) {
  lines.forEach((line, i) => {
    if (line === null || line === undefined) return;
    const row = ws.addRow([line]);
    ws.mergeCells(row.number, 1, row.number, span);
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (i === 0) row.getCell(1).font = { bold: true, size: 14 };
    else if (i === 1) row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1D4ED8" } };
    else row.getCell(1).font = { size: 10, italic: true, color: { argb: "FF64748B" } };
    row.height = i === 0 ? 22 : 18;
  });
  ws.addRow([]);
}

function writeHeaderRow(ws, captions) {
  const row = ws.addRow(captions);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 24;
  ws.views = [{ state: "frozen", ySplit: row.number }];
  return row;
}

// "Subtotal …" / "TOTAL …" wording is deliberate: boqExcelImport's
// isSummaryText() skips exactly these, so a re-import never reads a total back
// as a bill line.
function writeTotalRow(ws, { label, labelCol, amountCol, span, formula, result, grand = false }) {
  const values = new Array(span).fill(null);
  values[labelCol - 1] = label;
  const row = ws.addRow(values);
  ws.mergeCells(row.number, labelCol, row.number, amountCol - 1);
  row.getCell(labelCol).alignment = { horizontal: "right" };
  setFormula(row, amountCol, formula, result);
  row.font = { bold: true };
  row.fill = grand ? GRAND_FILL : TOTAL_FILL;
  for (let c = 1; c <= span; c += 1) {
    row.getCell(c).border = grand ? DOUBLE_TOP : THIN_TOP;
  }
  moneyCell(row, amountCol);
  return row;
}

/* ── resource bucketing ───────────────────────────────────────────────── */

const BUCKET_MATERIAL = "material";
const BUCKET_LABOUR = "labour";
const BUCKET_PLANT = "plant";

// componentKind → which schedule sheet the row belongs on. An empty kind means
// "Material": that is boqExcelImport's own fallback, so a row that came in with
// a blank Component column keeps the meaning it was imported with.
function bucketFor(kind) {
  const k = txt(kind).toLowerCase();
  if (!k) return BUCKET_MATERIAL;
  if (k.startsWith("lab")) return BUCKET_LABOUR;
  if (k.startsWith("mat")) return BUCKET_MATERIAL;
  if (k.startsWith("consum")) return BUCKET_MATERIAL;
  return BUCKET_PLANT;
}

function kindLabel(kind) {
  const k = txt(kind).toLowerCase();
  if (!k) return "Material";
  if (k.startsWith("lab")) return "Labour";
  if (k.startsWith("mat")) return "Material";
  if (k.startsWith("consum")) return "Consumable";
  if (k.startsWith("plant")) return "Plant";
  if (k.startsWith("equip")) return "Equipment";
  return k[0].toUpperCase() + k.slice(1);
}

function resourceName(line) {
  return txt(line?.materialName || line?.description || line?.takeoffLine) || "(unnamed resource)";
}

/* ── data preparation ─────────────────────────────────────────────────── */

// The bill, laid out the way it will be written: grouped by section, each
// section keeping the project's own item order, with the preamble subtitle
// (takeoffLine) carried through so the export reads like the bill that came in.
function layOutBill(items, { groupBy = "category" } = {}) {
  const useTrade = txt(groupBy).toLowerCase() === "trade";
  const sections = [];
  const byKey = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw) continue;
    const it = typeof raw.toObject === "function" ? raw.toObject() : raw;
    const name =
      txt(useTrade ? it.trade || it.category : it.category || it.trade) || "Measured Works";
    const key = name.toLowerCase();
    if (!byKey.has(key)) {
      const section = { name, rows: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    byKey.get(key).rows.push(it);
  }

  // Display S/N is assigned in WRITTEN order, so the "Bill S/N" column on the
  // schedules points at the row the reader is actually looking at.
  let sn = 0;
  for (const section of sections) {
    for (const it of section.rows) {
      sn += 1;
      it.__sn = sn;
    }
  }
  return { sections, lineCount: sn };
}

// budgetItems keyed by bill code. Rows with no resolvable bill line are kept in
// an "unlinked" bucket so nothing is silently dropped from the totals.
function indexBudget(items, budgetItems) {
  const byCode = new Map();
  const unlinked = [];
  for (const b of Array.isArray(budgetItems) ? budgetItems : []) {
    if (!b) continue;
    const code = txt(b.billIdentity || b.sourceTakeoffCode).toLowerCase();
    if (!code) {
      unlinked.push(b);
      continue;
    }
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }

  // A code with no bill line behind it is unlinked as far as the reader is
  // concerned — show it in the unlinked block rather than lose it.
  const billCodes = new Set(
    (Array.isArray(items) ? items : [])
      .map((it) => txt(it?.code).toLowerCase())
      .filter(Boolean),
  );
  for (const [code, rows] of [...byCode.entries()]) {
    if (!billCodes.has(code)) {
      unlinked.push(...rows);
      byCode.delete(code);
    }
  }
  return { byCode, unlinked };
}

// The group's overhead / profit %, matching deriveBillRates.groupMarkup so the
// exported build-up reconciles with the rate the app derived from it.
function groupMarkup(lines) {
  let overheadPercent = 0;
  let profitPercent = 0;
  for (const l of lines || []) {
    overheadPercent = Math.max(overheadPercent, num(l?.overheadPercent));
    profitPercent = Math.max(profitPercent, num(l?.profitPercent));
  }
  return { overheadPercent, profitPercent };
}

/* ── sheet writers ────────────────────────────────────────────────────── */

const BILL_SPAN = 6; // S/N | Description | Unit | Qty | Rate | Amount
const BILL_WIDTHS = [8, 62, 10, 14, 16, 18];

function writeBillSheet(workbook, { projectName, clientName, generatedLabel, bill }) {
  const ws = workbook.addWorksheet(safeSheetName("Bill of Quantities", workbook));
  ws.columns = BILL_WIDTHS.map((width) => ({ width }));

  writeTitleBlock(
    ws,
    [
      projectName,
      "BILL OF QUANTITIES",
      [clientName ? `Client: ${clientName}` : "", generatedLabel]
        .filter(Boolean)
        .join("    ·    "),
    ],
    BILL_SPAN,
  );
  writeHeaderRow(ws, ["S/N", "Description", "Unit", "Qty", "Rate", "Amount"]);

  const sectionRefs = [];
  const sectionTotalRows = [];
  let measured = 0;

  for (const section of bill.sections) {
    if (!section.rows.length) continue;

    // ALL-CAPS, description-only row: the importer reads exactly this shape
    // back as a section (category) header.
    // Deliberately NOT merged: a merged range repeats its value in every cell
    // of the range, and the importer would read "SUBSTRUCTURE" as this row's
    // unit and quantity instead of as a section header.
    const head = ws.addRow([null, section.name.toUpperCase()]);
    head.font = { bold: true, size: 11 };
    for (let c = 1; c <= BILL_SPAN; c += 1) head.getCell(c).fill = SECTION_FILL;

    let preamble = "";
    let sectionTotal = 0;
    const amountRows = [];

    for (const it of section.rows) {
      // Preamble subtitle ("Plain in-situ concrete; mix 1:4:8") — a mixed-case
      // description-only row, which is how it arrived and how it reads back.
      const line = txt(it.takeoffLine);
      if (line && line.toLowerCase() !== preamble.toLowerCase()) {
        preamble = line;
        // Italic but neither bold nor filled: boqExcelImport reads a bold +
        // filled description-only row as a SECTION header, so styling the
        // preamble that way would turn "Excavation" into its own category.
        const sub = ws.addRow([null, line]);
        sub.font = { italic: true, color: { argb: "FF475569" } };
      } else if (!line) {
        preamble = "";
      }

      const qty = round2(it.qty);
      const rate = round2(it.rate);
      const amount = round2(qty * rate);
      sectionTotal += amount;

      const row = ws.addRow([
        it.__sn,
        txt(it.description) || txt(it.takeoffLine) || "(no description)",
        txt(it.unit),
        qty !== 0 ? qty : null,
        rate !== 0 ? rate : null,
      ]);
      setFormula(row, 6, `IFERROR(D${row.number}*E${row.number},0)`, amount);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      qtyCell(row, 4);
      moneyCell(row, 5);
      moneyCell(row, 6);
      amountRows.push(row.number);
    }

    sectionTotal = round2(sectionTotal);
    measured += sectionTotal;

    const total = writeTotalRow(ws, {
      label: `Subtotal — ${section.name}`,
      labelCol: 2,
      amountCol: 6,
      span: BILL_SPAN,
      formula: `SUM(F${amountRows[0]}:F${amountRows[amountRows.length - 1]})`,
      result: sectionTotal,
    });
    sectionTotalRows.push(total.number);
    sectionRefs.push({
      name: section.name,
      count: section.rows.length,
      addr: `'${ws.name}'!F${total.number}`,
      value: sectionTotal,
    });
    ws.addRow([]);
  }

  measured = round2(measured);
  const grand = writeTotalRow(ws, {
    label: "TOTAL — MEASURED WORK CARRIED TO BILL SUMMARY",
    labelCol: 2,
    amountCol: 6,
    span: BILL_SPAN,
    formula: sumRefs("F", sectionTotalRows),
    result: measured,
    grand: true,
  });

  return { ws, sectionRefs, measured, measuredAddr: `'${ws.name}'!F${grand.number}` };
}

function writePreliminariesSheet(workbook, { projectName, preliminaryItems, pool, percent }) {
  const rows = (Array.isArray(preliminaryItems) ? preliminaryItems : [])
    .map((p) => ({
      name: txt(p?.name),
      allocation: num(p?.allocation),
      completed: Boolean(p?.completed),
    }))
    .filter((p) => p.name || p.allocation > 0);
  if (!rows.length || pool <= 0) return null;

  const allocTotal = rows.reduce((a, p) => a + p.allocation, 0);
  const base = allocTotal > 0 ? allocTotal : 100;

  const ws = workbook.addWorksheet(safeSheetName("Preliminaries", workbook));
  ws.columns = BILL_WIDTHS.map((width) => ({ width }));
  writeTitleBlock(
    ws,
    [
      projectName,
      "PRELIMINARIES",
      `Pool: ${percent.toFixed(2)}% of measured work + provisional sums`,
    ],
    BILL_SPAN,
  );
  writeHeaderRow(ws, ["S/N", "Description", "Unit", "Alloc %", "Rate", "Amount"]);

  const first = ws.rowCount + 1;
  let total = 0;
  rows.forEach((p, i) => {
    const amount = round2((pool * p.allocation) / base);
    total += amount;
    const row = ws.addRow([
      i + 1,
      p.name + (p.completed ? "  (done)" : ""),
      "Item",
      round2(p.allocation),
      null,
      amount,
    ]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).numFmt = PCT_FMT;
    moneyCell(row, 6);
  });
  const last = ws.rowCount;
  const totalRow = writeTotalRow(ws, {
    label: "TOTAL — PRELIMINARIES",
    labelCol: 2,
    amountCol: 6,
    span: BILL_SPAN,
    formula: `SUM(F${first}:F${last})`,
    result: round2(total),
    grand: true,
  });
  return {
    ws,
    addr: `'${ws.name}'!F${totalRow.number}`,
    value: round2(total),
    count: rows.length,
  };
}

function writeProvisionalSumsSheet(workbook, { projectName, provisionalSums }) {
  const rows = (Array.isArray(provisionalSums) ? provisionalSums : [])
    .map((s) => ({ description: txt(s?.description), amount: num(s?.amount) }))
    .filter((s) => s.description || s.amount > 0);
  if (!rows.length) return null;

  const ws = workbook.addWorksheet(safeSheetName("Provisional Sums", workbook));
  ws.columns = BILL_WIDTHS.map((width) => ({ width }));
  writeTitleBlock(ws, [projectName, "PROVISIONAL SUMS", ""], BILL_SPAN);
  writeHeaderRow(ws, ["S/N", "Description", "Unit", "Qty", "Rate", "Amount"]);

  const first = ws.rowCount + 1;
  let total = 0;
  rows.forEach((s, i) => {
    total += round2(s.amount);
    const row = ws.addRow([i + 1, s.description, "Sum", null, null, round2(s.amount)]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    moneyCell(row, 6);
  });
  const last = ws.rowCount;
  const totalRow = writeTotalRow(ws, {
    label: "TOTAL — PROVISIONAL SUMS",
    labelCol: 2,
    amountCol: 6,
    span: BILL_SPAN,
    formula: `SUM(F${first}:F${last})`,
    result: round2(total),
    grand: true,
  });
  return {
    ws,
    addr: `'${ws.name}'!F${totalRow.number}`,
    value: round2(total),
    count: rows.length,
  };
}

function writeVariationsSheet(workbook, { projectName, variations }) {
  const rows = (Array.isArray(variations) ? variations : [])
    .map((v) => ({
      description: txt(v?.description),
      reference: txt(v?.reference),
      qty: num(v?.qty),
      unit: txt(v?.unit),
      rate: num(v?.rate),
    }))
    .filter((v) => v.description || v.qty > 0 || v.rate > 0);
  if (!rows.length) return null;

  const ws = workbook.addWorksheet(safeSheetName("Variations", workbook));
  ws.columns = BILL_WIDTHS.map((width) => ({ width }));
  writeTitleBlock(ws, [projectName, "VARIATIONS", ""], BILL_SPAN);
  writeHeaderRow(ws, ["Ref", "Description", "Unit", "Qty", "Rate", "Amount"]);

  const first = ws.rowCount + 1;
  let total = 0;
  rows.forEach((v, i) => {
    const amount = round2(round2(v.qty) * round2(v.rate));
    total += amount;
    const row = ws.addRow([
      v.reference || i + 1,
      v.description,
      v.unit,
      v.qty !== 0 ? round2(v.qty) : null,
      v.rate !== 0 ? round2(v.rate) : null,
    ]);
    setFormula(row, 6, `IFERROR(D${row.number}*E${row.number},0)`, amount);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    qtyCell(row, 4);
    moneyCell(row, 5);
    moneyCell(row, 6);
  });
  const last = ws.rowCount;
  const totalRow = writeTotalRow(ws, {
    label: "TOTAL — VARIATIONS",
    labelCol: 2,
    amountCol: 6,
    span: BILL_SPAN,
    formula: `SUM(F${first}:F${last})`,
    result: round2(total),
    grand: true,
  });
  return {
    ws,
    addr: `'${ws.name}'!F${totalRow.number}`,
    value: round2(total),
    count: rows.length,
  };
}

function writeBillSummarySheet(workbook, { projectName, billRef, extras }) {
  const ws = workbook.addWorksheet(safeSheetName("Bill Summary", workbook));
  ws.columns = [{ width: 8 }, { width: 62 }, { width: 14 }, { width: 22 }];
  writeTitleBlock(ws, [projectName, "GENERAL SUMMARY", "Collection of every bill section"], 4);
  writeHeaderRow(ws, ["S/N", "Section", "Items", "Amount"]);

  const measuredRows = [];
  billRef.sectionRefs.forEach((ref, i) => {
    const row = ws.addRow([i + 1, ref.name.toUpperCase(), ref.count, null]);
    setFormula(row, 4, ref.addr, ref.value);
    moneyCell(row, 4);
    measuredRows.push(row.number);
  });

  const measuredTotal = writeTotalRow(ws, {
    label: "MEASURED WORK — SUBTOTAL",
    labelCol: 2,
    amountCol: 4,
    span: 4,
    formula: measuredRows.length
      ? `SUM(D${measuredRows[0]}:D${measuredRows[measuredRows.length - 1]})`
      : "0",
    result: billRef.measured,
  });

  const extraRows = [];
  let projectValue = billRef.measured;
  for (const extra of extras) {
    if (!extra) continue;
    const row = ws.addRow([null, extra.label.toUpperCase(), extra.count, null]);
    setFormula(row, 4, extra.addr, extra.value);
    row.font = { bold: true };
    moneyCell(row, 4);
    extraRows.push(row.number);
    projectValue += extra.value;
  }
  projectValue = round2(projectValue);

  const projectTotal = writeTotalRow(ws, {
    label: "PROJECT TOTAL",
    labelCol: 2,
    amountCol: 4,
    span: 4,
    formula: sumRefs("D", [measuredTotal.number, ...extraRows]),
    result: projectValue,
    grand: true,
  });

  return {
    ws,
    measuredAddr: `'${ws.name}'!D${measuredTotal.number}`,
    measured: billRef.measured,
    projectAddr: `'${ws.name}'!D${projectTotal.number}`,
    projectValue,
  };
}

const SCHEDULE_SPAN = 9;
// Bill S/N | Component | Description | Unit | Qty | Rate | Amount | O/H % | Profit %
const SCHEDULE_CAPTIONS = [
  "Bill S/N",
  "Component",
  "Description",
  "Unit",
  "Qty",
  "Rate",
  "Amount",
  "Overhead %",
  "Profit %",
];

// One schedule sheet (Material, Labour or Plant), grouped per bill line with a
// subtotal under each group and a grand total at the foot. Only rows in the
// requested bucket are written — that separation is the whole point of the
// sheet.
function writeScheduleSheet(workbook, {
  sheetName,
  heading,
  projectName,
  bill,
  budget,
  bucket,
  priceCellFor = null,
}) {
  const groups = [];

  for (const section of bill.sections) {
    for (const it of section.rows) {
      const code = txt(it.code).toLowerCase();
      const all = code ? budget.byCode.get(code) || [] : [];
      const rows = all.filter((b) => bucketFor(b?.componentKind) === bucket);
      if (!rows.length) continue;
      groups.push({
        sn: it.__sn,
        section: section.name,
        title: txt(it.description) || txt(it.takeoffLine) || "(no description)",
        qty: num(it.qty),
        unit: txt(it.unit),
        rows,
      });
    }
  }

  const unlinked = budget.unlinked.filter((b) => bucketFor(b?.componentKind) === bucket);
  if (unlinked.length) {
    groups.push({
      sn: null,
      section: "Unlinked",
      title: "Resources not linked to a bill line",
      qty: 0,
      unit: "",
      rows: unlinked,
    });
  }

  if (!groups.length) return null;

  const ws = workbook.addWorksheet(safeSheetName(sheetName, workbook));
  ws.columns = [10, 14, 52, 10, 14, 16, 18, 12, 12].map((width) => ({ width }));
  writeTitleBlock(
    ws,
    [
      projectName,
      heading,
      "Grouped under the bill line it prices — subtotal per line, total at the foot",
    ],
    SCHEDULE_SPAN,
  );
  writeHeaderRow(ws, SCHEDULE_CAPTIONS);

  const subtotalRows = [];
  let sheetTotal = 0;
  let currentSection = null;

  for (const group of groups) {
    if (group.section && group.section !== currentSection) {
      currentSection = group.section;
      const head = ws.addRow([null, null, group.section.toUpperCase()]);
      head.font = { bold: true, size: 11 };
      for (let c = 1; c <= SCHEDULE_SPAN; c += 1) head.getCell(c).fill = SECTION_FILL;
    }

    // Bill-line header: description + the bill quantity the build-up is priced
    // against, with no rate — the shape boqExcelImport treats as a group header.
    const head = ws.addRow([
      group.sn,
      null,
      group.title,
      group.unit,
      group.qty > 0 ? round2(group.qty) : null,
    ]);
    head.font = { bold: true };
    for (let c = 1; c <= SCHEDULE_SPAN; c += 1) head.getCell(c).fill = GROUP_FILL;
    head.getCell(3).alignment = { wrapText: true, vertical: "top" };
    qtyCell(head, 5);

    const { overheadPercent, profitPercent } = groupMarkup(group.rows);
    const first = ws.rowCount + 1;
    let groupTotal = 0;

    for (const line of group.rows) {
      const qty = round4(line?.qty);
      const rate = round2(line?.rate);
      const amount = round2(qty * rate);
      groupTotal += amount;

      const row = ws.addRow([
        group.sn,
        kindLabel(line?.componentKind),
        resourceName(line),
        txt(line?.unit),
        qty,
        rate,
        null,
        overheadPercent || null,
        profitPercent || null,
      ]);
      setFormula(row, 7, `IFERROR(E${row.number}*F${row.number},0)`, amount);
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      qtyCell(row, 5);
      moneyCell(row, 6);
      moneyCell(row, 7);
      row.getCell(8).numFmt = PCT_FMT;
      row.getCell(9).numFmt = PCT_FMT;

      // Materials re-price from the Schedule of Current Prices, so one edit
      // there flows through every line that buys the same material.
      if (priceCellFor) {
        const ref = priceCellFor(line);
        if (ref) setFormula(row, 6, ref, rate);
      }
    }

    groupTotal = round2(groupTotal);
    sheetTotal += groupTotal;
    const last = ws.rowCount;
    const sub = writeTotalRow(ws, {
      label: `Subtotal — ${group.title}`,
      labelCol: 3,
      amountCol: 7,
      span: SCHEDULE_SPAN,
      formula: `SUM(G${first}:G${last})`,
      result: groupTotal,
    });
    subtotalRows.push(sub.number);
    ws.addRow([]);
  }

  sheetTotal = round2(sheetTotal);
  const total = writeTotalRow(ws, {
    label: `TOTAL — ${heading}`,
    labelCol: 3,
    amountCol: 7,
    span: SCHEDULE_SPAN,
    formula: sumRefs("G", subtotalRows),
    result: sheetTotal,
    grand: true,
  });

  return {
    ws,
    addr: `'${ws.name}'!G${total.number}`,
    value: sheetTotal,
    groupCount: groups.length,
  };
}

// One row per distinct material + unit, at the rate the build-up carries. This
// is the sheet a QS re-prices when the market moves: the Material Schedule and
// the Material Summary both read their rates from here.
function writePriceScheduleSheet(workbook, { projectName, prices, generatedLabel }) {
  if (!prices.length) return null;
  const ws = workbook.addWorksheet(safeSheetName("Schedule of Current Prices", workbook));
  ws.columns = [8, 56, 12, 18, 38].map((width) => ({ width }));
  writeTitleBlock(
    ws,
    [
      projectName,
      "SCHEDULE OF CURRENT PRICES — MATERIALS",
      `Edit a rate here and the Material Schedule and Material Summary re-price.    ·    ${generatedLabel}`,
    ],
    5,
  );
  writeHeaderRow(ws, ["S/N", "Material", "Unit", "Current rate", "Note"]);

  prices.forEach((p, i) => {
    const row = ws.addRow([
      i + 1,
      p.name,
      p.unit,
      p.rate,
      p.rates.length > 1
        ? `Priced at ${p.rates.length} rates in the build-up (${p.rates
            .map((r) => r.toLocaleString("en-NG"))
            .join(" / ")}) — the most-used is shown`
        : "",
    ]);
    moneyCell(row, 4);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(5).font = { size: 9, italic: true, color: { argb: "FF92400E" } };
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    p.cell = `'${ws.name}'!D${row.number}`;
  });

  return { ws };
}

// Total quantity of every material the job needs — the procurement list. Rates
// link to the Schedule of Current Prices so the sheet is a live order value.
function writeMaterialSummarySheet(workbook, { projectName, prices, materialSchedule }) {
  if (!prices.length) return null;
  const ws = workbook.addWorksheet(safeSheetName("Material Summary", workbook));
  ws.columns = [8, 56, 12, 16, 18, 20].map((width) => ({ width }));
  writeTitleBlock(
    ws,
    [
      projectName,
      "MATERIAL SUMMARY",
      "Total quantity of each material across the whole bill, priced at the Schedule of Current Prices",
    ],
    6,
  );
  writeHeaderRow(ws, ["S/N", "Material", "Unit", "Total qty", "Rate", "Amount"]);

  const first = ws.rowCount + 1;
  let total = 0;
  prices.forEach((p, i) => {
    const qty = round4(p.qty);
    const amount = round2(qty * p.rate);
    total += amount;
    const row = ws.addRow([i + 1, p.name, p.unit, qty, null, null]);
    if (p.cell) setFormula(row, 5, p.cell, p.rate);
    else row.getCell(5).value = p.rate;
    setFormula(row, 6, `IFERROR(D${row.number}*E${row.number},0)`, amount);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    qtyCell(row, 4);
    moneyCell(row, 5);
    moneyCell(row, 6);
  });
  const last = ws.rowCount;
  total = round2(total);

  const totalRow = writeTotalRow(ws, {
    label: "TOTAL — MATERIAL SUMMARY",
    labelCol: 2,
    amountCol: 6,
    span: 6,
    formula: `SUM(F${first}:F${last})`,
    result: total,
    grand: true,
  });

  // Reconciliation against the build-up. The two agree unless a material was
  // priced at more than one rate in the schedule — in which case the reader
  // should see the difference rather than wonder which sheet is right.
  if (materialSchedule) {
    ws.addRow([]);
    const check = ws.addRow([null, "Material Schedule total (as built up)"]);
    setFormula(check, 6, materialSchedule.addr, materialSchedule.value);
    check.font = { italic: true };
    moneyCell(check, 6);
    const diff = ws.addRow([null, "Difference (effect of re-pricing)"]);
    setFormula(
      diff,
      6,
      `F${totalRow.number}-F${check.number}`,
      round2(total - materialSchedule.value),
    );
    diff.font = { italic: true };
    moneyCell(diff, 6);
  }

  return { ws, addr: `'${ws.name}'!F${totalRow.number}`, value: total };
}

function writeBudgetSummarySheet(workbook, {
  projectName,
  material,
  labour,
  plant,
  measuredAddr,
  measuredValue,
  overheadPercent,
  profitPercent,
}) {
  const ws = workbook.addWorksheet(safeSheetName("Budget Summary", workbook));
  ws.columns = [{ width: 8 }, { width: 56 }, { width: 22 }];
  writeTitleBlock(
    ws,
    [projectName, "BUDGET SUMMARY", "Cost to build, against the value of the bill"],
    3,
  );
  writeHeaderRow(ws, ["S/N", "Description", "Amount"]);

  const costRows = [];
  let net = 0;
  const addCost = (label, ref) => {
    const row = ws.addRow([costRows.length + 1, label, null]);
    if (ref) setFormula(row, 3, ref.addr, ref.value);
    else row.getCell(3).value = 0;
    moneyCell(row, 3);
    costRows.push(row.number);
    net += ref ? ref.value : 0;
  };

  addCost("Materials", material);
  addCost("Labour", labour);
  addCost("Plant, equipment & other", plant);
  net = round2(net);

  const netRow = writeTotalRow(ws, {
    label: "NET BUILD-UP COST",
    labelCol: 2,
    amountCol: 3,
    span: 3,
    formula: sumRefs("C", costRows),
    result: net,
  });

  const opPct = round2(overheadPercent + profitPercent);
  const opValue = round2((net * opPct) / 100);
  const op = ws.addRow([
    null,
    `Overhead & profit (${overheadPercent.toFixed(2)}% + ${profitPercent.toFixed(2)}%)`,
  ]);
  setFormula(op, 3, `C${netRow.number}*${opPct}/100`, opValue);
  op.font = { bold: true };
  moneyCell(op, 3);

  const budgetValue = round2(net + opValue);
  const budgetTotal = writeTotalRow(ws, {
    label: "BUDGET TOTAL (cost to complete)",
    labelCol: 2,
    amountCol: 3,
    span: 3,
    formula: `C${netRow.number}+C${op.number}`,
    result: budgetValue,
    grand: true,
  });

  ws.addRow([]);
  const value = ws.addRow([null, "Measured work — bill value"]);
  setFormula(value, 3, measuredAddr, measuredValue);
  value.font = { bold: true };
  moneyCell(value, 3);

  const marginValue = round2(measuredValue - budgetValue);
  const margin = writeTotalRow(ws, {
    label: "MARGIN (bill value − budget)",
    labelCol: 2,
    amountCol: 3,
    span: 3,
    formula: `C${value.number}-C${budgetTotal.number}`,
    result: marginValue,
    grand: true,
  });

  const pct = ws.addRow([null, "Margin %"]);
  setFormula(
    pct,
    3,
    `IF(C${value.number}=0,0,C${margin.number}/C${value.number}*100)`,
    measuredValue === 0 ? 0 : (marginValue / measuredValue) * 100,
  );
  pct.getCell(3).numFmt = PCT_FMT;
  pct.font = { bold: true };

  return {
    ws,
    totalAddr: `'${ws.name}'!C${budgetTotal.number}`,
    totalValue: budgetValue,
  };
}

function fillCoverSheet(ws, {
  projectName,
  clientName,
  generatedLabel,
  contents,
  billTotal,
  budgetTotal,
}) {
  ws.columns = [{ width: 4 }, { width: 46 }, { width: 26 }];
  writeTitleBlock(
    ws,
    [
      projectName,
      "BILL OF QUANTITIES & BUDGET",
      [clientName ? `Client: ${clientName}` : "", generatedLabel].filter(Boolean).join("    ·    "),
    ],
    3,
  );

  const headline = (label, ref) => {
    const row = ws.addRow([null, label, null]);
    row.getCell(2).font = { bold: true };
    if (ref) setFormula(row, 3, ref.addr, ref.value);
    else row.getCell(3).value = 0;
    row.getCell(3).font = { bold: true, size: 12 };
    moneyCell(row, 3);
  };
  headline("Project total (bill)", billTotal);
  headline("Budget total (cost to complete)", budgetTotal);

  ws.addRow([]);
  const head = ws.addRow([null, "CONTENTS"]);
  head.getCell(2).font = { bold: true, color: { argb: "FF1D4ED8" } };
  for (const line of contents) {
    const row = ws.addRow([null, line.name, line.note || ""]);
    row.getCell(3).font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  }

  ws.addRow([]);
  const note = ws.addRow([
    null,
    "Every total here is a live formula — re-price a rate and the subtotals, sheet totals and this cover recalculate. This workbook is a report: to change quantities, re-measure in the source model and sync, or edit the bill in the project itself, then export again. Uploading it through Excel import is refused, so a download can never become a duplicate project.",
  ]);
  ws.mergeCells(note.number, 2, note.number, 3);
  note.getCell(2).alignment = { wrapText: true, vertical: "top" };
  note.getCell(2).font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  note.height = 70;

  // The visible half of the export stamp — see util/adlmWorkbook.js. Kept on
  // the cover so the file is still recognisable if its document properties are
  // stripped by a conversion.
  const stamp = ws.addRow([null, ADLM_EXPORT_COVER_NOTE]);
  ws.mergeCells(stamp.number, 2, stamp.number, 3);
  stamp.getCell(2).alignment = { wrapText: true, vertical: "top" };
  stamp.getCell(2).font = { size: 8, color: { argb: "FF94A3B8" } };
}

/* ── public API ───────────────────────────────────────────────────────── */

/**
 * Build the Bill + Budget workbook for a project.
 * Returns { buffer, filename }.
 */
export async function exportBillAndBudget({
  projectName = "Project",
  clientName = "",
  items = [],
  budgetItems = [],
  materialItems = [],
  provisionalSums = [],
  variations = [],
  preliminaryItems = [],
  preliminaryPercent = 0,
  groupBy = "category",
  generatedAt = new Date(),
} = {}) {
  const bill = layOutBill(items, { groupBy });

  // The Budget tab falls back to the QUIV materials view when budgetItems is
  // empty; the export follows the same rule so what you see is what you get.
  const budgetSource = (
    Array.isArray(budgetItems) && budgetItems.length
      ? budgetItems
      : Array.isArray(materialItems)
        ? materialItems
        : []
  )
    .filter(Boolean)
    .map((raw) => {
      const m = typeof raw.toObject === "function" ? raw.toObject() : raw;
      return { ...m, billIdentity: txt(m.billIdentity || m.sourceTakeoffCode) };
    });

  const budget = indexBudget(items, budgetSource);

  const workbook = new ExcelJS.Workbook();
  stampAdlmWorkbook(workbook);
  workbook.calcProperties.fullCalcOnLoad = true;

  // Created first so it stays the leftmost tab; filled last, once every total
  // it links to has an address.
  const cover = workbook.addWorksheet("Cover");

  const generatedLabel = `Generated ${new Date(generatedAt).toISOString().slice(0, 10)}`;
  const billRef = writeBillSheet(workbook, { projectName, clientName, generatedLabel, bill });

  const provisionalTotal = (Array.isArray(provisionalSums) ? provisionalSums : []).reduce(
    (a, s) => a + num(s?.amount),
    0,
  );
  const prelimPool = ((billRef.measured + provisionalTotal) * num(preliminaryPercent)) / 100;

  const prelimRef = writePreliminariesSheet(workbook, {
    projectName,
    preliminaryItems,
    pool: prelimPool,
    percent: num(preliminaryPercent),
  });
  const provRef = writeProvisionalSumsSheet(workbook, { projectName, provisionalSums });
  const varRef = writeVariationsSheet(workbook, { projectName, variations });

  const summaryRef = writeBillSummarySheet(workbook, {
    projectName,
    billRef,
    extras: [
      prelimRef ? { label: "Preliminaries", ...prelimRef } : null,
      provRef ? { label: "Provisional Sums", ...provRef } : null,
      varRef ? { label: "Variations", ...varRef } : null,
    ],
  });

  // ── material price index ──────────────────────────────────────────────
  // One entry per material + unit, with the quantity the whole job needs and
  // the rate to buy it at. "Current rate" is the most-used rate in the
  // build-up (ties break high), and every rate seen is reported on the price
  // schedule so a mixed-rate material is visible rather than silently averaged.
  const priceMap = new Map();
  for (const line of budgetSource) {
    if (bucketFor(line?.componentKind) !== BUCKET_MATERIAL) continue;
    const name = resourceName(line);
    const unit = txt(line?.unit);
    const key = `${name.toLowerCase()}|${unit.toLowerCase()}`;
    if (!priceMap.has(key)) {
      priceMap.set(key, { name, unit, qty: 0, rateCounts: new Map(), cell: null });
    }
    const entry = priceMap.get(key);
    entry.qty += num(line?.qty);
    const rate = round2(line?.rate);
    if (rate > 0) entry.rateCounts.set(rate, (entry.rateCounts.get(rate) || 0) + 1);
  }

  const prices = [...priceMap.values()]
    .map((entry) => {
      const seen = [...entry.rateCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
      return { ...entry, rate: seen.length ? seen[0][0] : 0, rates: seen.map(([r]) => r) };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));

  const priceByKey = new Map();
  for (const p of prices) {
    priceByKey.set(`${p.name.toLowerCase()}|${p.unit.toLowerCase()}`, p);
  }

  // Written before the schedules so their rate cells have somewhere to point.
  const priceRef = writePriceScheduleSheet(workbook, { projectName, prices, generatedLabel });

  const materialRef = writeScheduleSheet(workbook, {
    sheetName: "Material Schedule",
    heading: "MATERIAL SCHEDULE",
    projectName,
    bill,
    budget,
    bucket: BUCKET_MATERIAL,
    priceCellFor: priceRef
      ? (line) => {
          const key = `${resourceName(line).toLowerCase()}|${txt(line?.unit).toLowerCase()}`;
          const entry = priceByKey.get(key);
          if (!entry || !entry.cell) return null;
          // Only re-point rows that already agree with the schedule's current
          // rate, so linking can never silently re-price a line the QS priced
          // differently — the sheet total has to stay what the app shows.
          return round2(line?.rate) === entry.rate ? entry.cell : null;
        }
      : null,
  });

  const labourRef = writeScheduleSheet(workbook, {
    sheetName: "Labour Schedule",
    heading: "LABOUR SCHEDULE",
    projectName,
    bill,
    budget,
    bucket: BUCKET_LABOUR,
  });

  const plantRef = writeScheduleSheet(workbook, {
    sheetName: "Plant & Equipment Schedule",
    heading: "PLANT, EQUIPMENT & OTHER",
    projectName,
    bill,
    budget,
    bucket: BUCKET_PLANT,
  });

  const materialSummaryRef = writeMaterialSummarySheet(workbook, {
    projectName,
    prices,
    materialSchedule: materialRef,
  });

  // Blended O&P across the job: each bill line's own O&P weighted by its net
  // build-up, so the summary's markup matches what the rates were derived at.
  let netAll = 0;
  let ohWeighted = 0;
  let prWeighted = 0;
  for (const [, rows] of budget.byCode) {
    const net = rows.reduce((a, l) => a + num(l?.qty) * num(l?.rate), 0);
    if (net <= 0) continue;
    const { overheadPercent, profitPercent } = groupMarkup(rows);
    netAll += net;
    ohWeighted += net * overheadPercent;
    prWeighted += net * profitPercent;
  }
  const overheadPercent = netAll > 0 ? ohWeighted / netAll : 0;
  const profitPercent = netAll > 0 ? prWeighted / netAll : 0;

  const budgetRef = writeBudgetSummarySheet(workbook, {
    projectName,
    material: materialRef,
    labour: labourRef,
    plant: plantRef,
    measuredAddr: summaryRef.measuredAddr,
    measuredValue: summaryRef.measured,
    overheadPercent,
    profitPercent,
  });

  const contents = [
    {
      name: "Bill of Quantities",
      note: `${bill.lineCount} line(s), ${bill.sections.length} section(s)`,
    },
    prelimRef ? { name: "Preliminaries", note: `${prelimRef.count} item(s)` } : null,
    provRef ? { name: "Provisional Sums", note: `${provRef.count} item(s)` } : null,
    varRef ? { name: "Variations", note: `${varRef.count} item(s)` } : null,
    { name: "Bill Summary", note: "collection → project total" },
    priceRef ? { name: "Schedule of Current Prices", note: `${prices.length} material(s)` } : null,
    materialRef
      ? { name: "Material Schedule", note: `materials only, ${materialRef.groupCount} bill line(s)` }
      : null,
    labourRef
      ? { name: "Labour Schedule", note: `labour only, ${labourRef.groupCount} bill line(s)` }
      : null,
    plantRef ? { name: "Plant & Equipment Schedule", note: "plant, equipment & other" } : null,
    materialSummaryRef ? { name: "Material Summary", note: "total quantity to buy" } : null,
    { name: "Budget Summary", note: "cost vs bill value" },
  ].filter(Boolean);

  fillCoverSheet(cover, {
    projectName,
    clientName,
    generatedLabel,
    contents,
    billTotal: { addr: summaryRef.projectAddr, value: summaryRef.projectValue },
    budgetTotal: { addr: budgetRef.totalAddr, value: budgetRef.totalValue },
  });

  const buf = await workbook.xlsx.writeBuffer();
  const safeName =
    txt(projectName)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .slice(0, 120) || "Project";

  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeName} - Bill & Budget.xlsx`,
  };
}

export default exportBillAndBudget;
