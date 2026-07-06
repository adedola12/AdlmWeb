// server/util/archicadBoqExporter.js
//
// QUIV-for-ArchiCAD BoQ exports. Excel mirrors util/certificateExporter.js
// (its helpers are module-private, so the branding pattern is mirrored here
// with the ArchiCAD navy #FF0D2240); PDF follows the pdfkit letterhead style
// of routes/admin.invoices.js.

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";

const NAVY = "0D2240";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY}` } };
const ACCENT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5ECF5" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7EF" } };

// Lexend with automatic Calibri fallback (Excel substitutes when the font is
// not installed).
const FONT = "Lexend";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applyMoneyFormat(cell) {
  cell.numFmt = '#,##0.00;[Red]-#,##0.00;-';
}

export function safeFilename(name) {
  return String(name || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const COLUMNS = [
  { header: "Item ref", width: 10 },
  { header: "Description", width: 55 },
  { header: "Unit", width: 8 },
  { header: "Quantity", width: 12 },
  { header: "Unit rate", width: 14 },
  { header: "Material amount", width: 16 },
  { header: "Labour amount", width: 16 },
  { header: "Total amount", width: 16 },
  { header: "Margin", width: 14 },
  { header: "Grand total", width: 16 },
];

function addBrandingHeader(ws, { title, projectName, preparedBy, date, currency }) {
  const t = ws.addRow([title]);
  t.height = 26;
  t.getCell(1).font = { name: FONT, bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  for (let c = 1; c <= COLUMNS.length; c++) t.getCell(c).fill = HEADER_FILL;
  ws.mergeCells(t.number, 1, t.number, COLUMNS.length);

  const brand = ws.addRow(["ADLM Studio — QUIV for ArchiCAD"]);
  brand.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: `FF${NAVY}` } };
  ws.mergeCells(brand.number, 1, brand.number, COLUMNS.length);

  const meta = [
    ["Project", projectName || "—"],
    ["Date", dayjs(date || new Date()).format("YYYY-MM-DD")],
    ["Prepared by", preparedBy || "—"],
    ["Currency", currency || "NGN"],
  ];
  for (const [k, v] of meta) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { name: FONT, bold: true, size: 10 };
    r.getCell(2).font = { name: FONT, size: 10 };
  }
  ws.addRow([]);
}

function addColumnHeaderRow(ws) {
  const h = ws.addRow(COLUMNS.map((c) => c.header));
  h.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
}

/**
 * One sheet per category + a Summary sheet. Column order per the contract:
 * Item ref, Description, Unit, Quantity, Unit rate, Material amount, Labour
 * amount, Total amount, Margin, Grand total (grand-total column populated on
 * the category totals row).
 */
export async function exportArchicadBoqXlsx({ projectName, preparedBy, boq }) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  const categories = Array.isArray(boq?.categories) ? boq.categories : [];
  const lines = Array.isArray(boq?.lines) ? boq.lines : [];
  const totals = boq?.totals || {};
  const currency = boq?.currency || "NGN";

  // ── Summary sheet first ──
  const summary = workbook.addWorksheet("Summary");
  addBrandingHeader(summary, {
    title: "Bill of Quantities — Summary",
    projectName,
    preparedBy,
    date: boq?.extractedAt,
    currency,
  });
  addColumnHeaderRow(summary);
  for (const cat of categories) {
    const r = summary.addRow([
      "",
      cat.title,
      "",
      "",
      "",
      safeNum(cat.materialAmount),
      safeNum(cat.labourAmount),
      safeNum(cat.totalAmount),
      safeNum(cat.marginAmount),
      "",
    ]);
    r.eachCell((cell) => { cell.font = { name: FONT, size: 10 }; });
    for (const c of [6, 7, 8, 9]) applyMoneyFormat(r.getCell(c));
  }
  const g = summary.addRow([
    "",
    "GRAND TOTAL",
    "",
    "",
    "",
    safeNum(totals.materialAmount),
    safeNum(totals.labourAmount),
    safeNum(totals.grandTotal),
    safeNum(totals.marginAmount),
    safeNum(totals.grandTotal),
  ]);
  g.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 11 };
    cell.fill = TOTAL_FILL;
  });
  for (const c of [6, 7, 8, 9, 10]) applyMoneyFormat(g.getCell(c));

  summary.addRow([]);
  const fa = summary.addRow(["", `Floor area: ${safeNum(totals.floorArea)} m²`]);
  fa.getCell(2).font = { name: FONT, italic: true, size: 10 };
  const cpm = summary.addRow(["", `Cost / m²: ${currency} ${safeNum(totals.costPerM2).toLocaleString()}`]);
  cpm.getCell(2).font = { name: FONT, italic: true, size: 10 };

  // ── One sheet per category ──
  for (const cat of categories) {
    const catLines = lines.filter((l) => l.category === cat.key);
    if (!catLines.length) continue;
    const ws = workbook.addWorksheet(String(cat.title || cat.key).slice(0, 31));
    addBrandingHeader(ws, {
      title: cat.title,
      projectName,
      preparedBy,
      date: boq?.extractedAt,
      currency,
    });
    addColumnHeaderRow(ws);

    for (const l of catLines) {
      const r = ws.addRow([
        l.itemRef,
        l.description,
        l.unit,
        safeNum(l.quantity),
        safeNum(l.unitRate),
        safeNum(l.materialAmount),
        safeNum(l.labourAmount),
        safeNum(l.totalAmount),
        safeNum(l.marginAmount),
        "",
      ]);
      r.eachCell((cell) => { cell.font = { name: FONT, size: 10 }; });
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
      r.getCell(4).numFmt = "#,##0.000";
      for (const c of [5, 6, 7, 8, 9]) applyMoneyFormat(r.getCell(c));
    }

    const tr = ws.addRow([
      "",
      `${cat.title} — total`,
      "",
      "",
      "",
      safeNum(cat.materialAmount),
      safeNum(cat.labourAmount),
      safeNum(cat.totalAmount),
      safeNum(cat.marginAmount),
      safeNum(cat.totalAmount),
    ]);
    tr.eachCell((cell) => {
      cell.font = { name: FONT, bold: true, size: 10 };
      cell.fill = ACCENT_FILL;
    });
    for (const c of [6, 7, 8, 9, 10]) applyMoneyFormat(tr.getCell(c));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${safeFilename(projectName)} - ArchiCAD BoQ v${boq?.versionNumber ?? 1}.xlsx`,
  };
}

/**
 * Summary-only PDF (category totals + grand total) with the ADLM letterhead,
 * streamed straight to the response (pdfkit, no puppeteer).
 */
export function streamArchicadBoqPdf(res, { projectName, clientName = "", preparedBy, boq }) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const filename = `${safeFilename(projectName)} - ArchiCAD BoQ Summary v${boq?.versionNumber ?? 1}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const L = 40;
  const PW = 595.28 - 80;
  const R = L + PW;
  const navy = `#${NAVY}`;
  const currency = boq?.currency || "NGN";
  const money = (v) => `${currency} ${safeNum(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Decorative letterhead circles (invoice style).
  doc.save().circle(490, -30, 85).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.3).stroke().restore();
  doc.save().circle(520, 830, 55).lineWidth(1.5).strokeColor("#ddd").strokeOpacity(0.25).stroke().restore();

  doc.fontSize(16).font("Helvetica-Bold").fillColor(navy).text("ADLM Studio", L, 42);
  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e")
    .text("QUIV for ArchiCAD — Bill of Quantities Summary", L, 62);

  doc.fontSize(24).font("Helvetica-Bold").fillColor(navy)
    .text("BoQ SUMMARY", 0, 40, { width: R, align: "right" });
  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e")
    .text(`Version ${boq?.versionNumber ?? 1}`, 0, 70, { width: R, align: "right" });

  let y = 100;
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#3e3e3e").text("PROJECT:", L, y);
  doc.font("Helvetica").text(projectName || "—", L + 90, y);
  y += 16;
  if (clientName) {
    doc.font("Helvetica-Bold").text("CLIENT:", L, y);
    doc.font("Helvetica").text(clientName, L + 90, y);
    y += 16;
  }
  doc.font("Helvetica-Bold").text("DATE:", L, y);
  doc.font("Helvetica").text(dayjs(boq?.extractedAt || new Date()).format("MMMM D, YYYY"), L + 90, y);
  y += 16;
  doc.font("Helvetica-Bold").text("PREPARED BY:", L, y);
  doc.font("Helvetica").text(preparedBy || "—", L + 90, y);
  y += 30;

  // Table header band.
  const colTitle = L + 8;
  const colMat = L + 210;
  const colLab = L + 300;
  const colMargin = L + 390;
  const colTotal = L + 470;
  doc.save().roundedRect(L, y, PW, 26, 4).fill(navy).restore();
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
  doc.text("CATEGORY", colTitle, y + 8, { width: colMat - colTitle });
  doc.text("MATERIAL", colMat, y + 8, { width: 84, align: "right" });
  doc.text("LABOUR", colLab, y + 8, { width: 84, align: "right" });
  doc.text("MARGIN", colMargin, y + 8, { width: 74, align: "right" });
  doc.text("TOTAL", colTotal, y + 8, { width: R - colTotal - 8, align: "right" });
  y += 32;

  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e");
  for (const cat of boq?.categories || []) {
    doc.font("Helvetica").fillColor("#3e3e3e").text(cat.title, colTitle, y, { width: colMat - colTitle });
    doc.text(money(cat.materialAmount), colMat, y, { width: 84, align: "right" });
    doc.text(money(cat.labourAmount), colLab, y, { width: 84, align: "right" });
    doc.text(money(cat.marginAmount), colMargin, y, { width: 74, align: "right" });
    doc.font("Helvetica-Bold").text(money(cat.totalAmount), colTotal, y, { width: R - colTotal - 8, align: "right" });
    y += 18;
  }

  y += 6;
  doc.save().moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(navy).stroke().restore();
  y += 10;
  const totals = boq?.totals || {};
  doc.fontSize(11).font("Helvetica-Bold").fillColor(navy);
  doc.text("GRAND TOTAL", colTitle, y, { width: colMat - colTitle });
  doc.text(money(totals.grandTotal), colTotal - 60, y, { width: R - colTotal + 52, align: "right" });
  y += 22;

  doc.fontSize(9).font("Helvetica").fillColor("#3e3e3e");
  doc.text(`Floor area: ${safeNum(totals.floorArea)} m²`, colTitle, y);
  y += 14;
  doc.text(`Cost / m²: ${money(totals.costPerM2)}`, colTitle, y);

  // Footer — ADLM Studio contact details.
  doc.fontSize(8).font("Helvetica").fillColor("#94a3b8").text(
    "ADLM Studio  ·  hello@adlmstudio.net  ·  www.adlmstudio.net  ·  Lagos, Nigeria",
    L,
    790,
    { width: PW, align: "center" },
  );

  doc.end();
}
