// server/util/certificateExporter.js
//
// Generates a formal Nigerian-format Interim Payment Certificate workbook
// and a Final Account workbook. Both follow the standard Valuer / QS format
// with signature blocks for Architect, QS, Contractor and Client.

import ExcelJS from "exceljs";
import dayjs from "dayjs";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF091E39" } };
const SUB_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7EF" } };
const ACCENT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5ECF5" } };

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applyMoneyFormat(cell) {
  cell.numFmt = '#,##0.00;[Red]-#,##0.00;-';
}

function safeFilename(name) {
  return String(name || "Project")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function addTitleBlock(ws, { title, projectName, clientName = "", date }) {
  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 25;
  ws.getColumn(4).width = 25;

  const t = ws.addRow([title]);
  t.font = { bold: true, size: 18, color: { argb: "FF091E39" } };
  ws.mergeCells(t.number, 1, t.number, 4);

  ws.addRow([]);
  const p = ws.addRow(["Project", projectName || "—"]);
  p.font = { bold: true };
  ws.mergeCells(p.number, 2, p.number, 4);

  if (clientName) {
    const c = ws.addRow(["Client", clientName]);
    ws.mergeCells(c.number, 2, c.number, 4);
  }

  const d = ws.addRow(["Date", dayjs(date || new Date()).format("YYYY-MM-DD")]);
  ws.mergeCells(d.number, 2, d.number, 4);
  ws.addRow([]);
}

function addSignatureBlock(ws) {
  ws.addRow([]);
  ws.addRow([]);
  const hdr = ws.addRow(["Signatures"]);
  hdr.font = { bold: true, size: 12 };
  ws.mergeCells(hdr.number, 1, hdr.number, 4);

  const signers = [
    ["Prepared by (QS)", "", "Signature", "Date"],
    ["Approved by (Architect)", "", "Signature", "Date"],
    ["Contractor", "", "Signature", "Date"],
    ["Client", "", "Signature", "Date"],
  ];
  for (const s of signers) {
    ws.addRow([]);
    const r = ws.addRow(s);
    r.eachCell((c) => {
      c.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
    });
    r.font = { color: { argb: "FF64748B" }, italic: true };
  }
}

/**
 * Interim Payment Certificate workbook — one sheet with project heading,
 * valuation breakdown, deduction table, net payable summary, and signature
 * block. Uses live formulas so the final netPayable line recomputes in Excel.
 */
export async function exportCertificate({
  projectName = "Project",
  clientName = "",
  certificate,
  previousCerts = [],
  breakdown = null, // optional: { measured, variations, provisional, preliminaryDone }
}) {
  if (!certificate) throw new Error("certificate is required");
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  const ws = workbook.addWorksheet(
    `Cert ${String(certificate.number).padStart(2, "0")}`.slice(0, 31),
  );

  addTitleBlock(ws, {
    title: `Interim Payment Certificate No. ${String(certificate.number).padStart(2, "0")}`,
    projectName,
    clientName,
    date: certificate.date,
  });

  // Certificate meta
  const metaHead = ws.addRow(["Certificate details"]);
  metaHead.font = { bold: true };
  metaHead.fill = ACCENT_FILL;
  ws.mergeCells(metaHead.number, 1, metaHead.number, 4);

  const meta = [
    ["Certificate number", String(certificate.number).padStart(2, "0")],
    ["Status", certificate.status || "draft"],
    [
      "Period",
      [
        certificate.periodStart
          ? dayjs(certificate.periodStart).format("YYYY-MM-DD")
          : "—",
        "to",
        certificate.periodEnd
          ? dayjs(certificate.periodEnd).format("YYYY-MM-DD")
          : dayjs(certificate.date || new Date()).format("YYYY-MM-DD"),
      ].join(" "),
    ],
    ["Items completed (snapshot)", `${certificate.snapshotCompletedCount || 0} of ${certificate.snapshotTotalCount || 0}`],
  ];
  for (const [a, b] of meta) {
    const r = ws.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    ws.mergeCells(r.number, 2, r.number, 4);
  }

  ws.addRow([]);

  // Optional value-to-date breakdown — expose how cumulative value was derived.
  if (breakdown) {
    const bhdr = ws.addRow(["Cumulative value breakdown"]);
    bhdr.font = { bold: true };
    bhdr.fill = ACCENT_FILL;
    ws.mergeCells(bhdr.number, 1, bhdr.number, 4);

    const bRows = [
      ["Measured work (completed)", safeNum(breakdown.measured)],
      ["Approved variations", safeNum(breakdown.variations)],
      ["Provisional sums released", safeNum(breakdown.provisional)],
      ["Preliminaries done", safeNum(breakdown.preliminaryDone)],
    ];
    for (const [label, amt] of bRows) {
      const r = ws.addRow([null, label, amt, null]);
      applyMoneyFormat(r.getCell(3));
      ws.mergeCells(r.number, 3, r.number, 4);
    }
    ws.addRow([]);
  }

  // Main certificate calculation table
  const tableHead = ws.addRow(["Item", "Description", "Amount (NGN)", ""]);
  tableHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  tableHead.fill = HEADER_FILL;
  tableHead.alignment = { horizontal: "center" };
  ws.mergeCells(tableHead.number, 3, tableHead.number, 4);

  const lines = [
    ["A", "Gross value of work done to date (cumulative)", safeNum(certificate.cumulativeValue)],
    ["B", "Less: previously certified amount", -safeNum(certificate.lessPrevious)],
  ];
  const lineRows = [];
  for (const [code, desc, amt] of lines) {
    const r = ws.addRow([code, desc, amt, null]);
    applyMoneyFormat(r.getCell(3));
    ws.mergeCells(r.number, 3, r.number, 4);
    lineRows.push(r.number);
  }

  // Subtotal: this certificate gross
  const thisCert = ws.addRow([
    null,
    "This certificate (A − B)",
    safeNum(certificate.thisCertificate),
    null,
  ]);
  thisCert.font = { bold: true };
  thisCert.fill = SUB_FILL;
  thisCert.getCell(3).value = {
    formula: `SUM(C${lineRows[0]}:C${lineRows[lineRows.length - 1]})`,
  };
  applyMoneyFormat(thisCert.getCell(3));
  ws.mergeCells(thisCert.number, 3, thisCert.number, 4);

  // Deductions
  const retentionRow = ws.addRow([
    "C",
    `Less: retention @ ${safeNum(certificate.retentionPct).toFixed(1)}%`,
    -safeNum(certificate.retentionAmount),
    null,
  ]);
  retentionRow.getCell(3).value = {
    formula: `-C${thisCert.number}*${safeNum(certificate.retentionPct) / 100}`,
  };
  applyMoneyFormat(retentionRow.getCell(3));
  ws.mergeCells(retentionRow.number, 3, retentionRow.number, 4);

  let releasedRow = null;
  if (safeNum(certificate.retentionReleased) > 0) {
    releasedRow = ws.addRow([
      "D",
      "Add: retention released",
      safeNum(certificate.retentionReleased),
      null,
    ]);
    applyMoneyFormat(releasedRow.getCell(3));
    ws.mergeCells(releasedRow.number, 3, releasedRow.number, 4);
  }

  // Net before tax
  const netBefore = ws.addRow([
    null,
    "Net before tax",
    null,
    null,
  ]);
  netBefore.font = { bold: true };
  netBefore.fill = SUB_FILL;
  netBefore.getCell(3).value = releasedRow
    ? { formula: `C${thisCert.number}+C${retentionRow.number}+C${releasedRow.number}` }
    : { formula: `C${thisCert.number}+C${retentionRow.number}` };
  applyMoneyFormat(netBefore.getCell(3));
  ws.mergeCells(netBefore.number, 3, netBefore.number, 4);

  // Taxes
  const vatRow = ws.addRow([
    "E",
    `Add: VAT @ ${safeNum(certificate.vatPct).toFixed(1)}%`,
    safeNum(certificate.vatAmount),
    null,
  ]);
  vatRow.getCell(3).value = {
    formula: `C${netBefore.number}*${safeNum(certificate.vatPct) / 100}`,
  };
  applyMoneyFormat(vatRow.getCell(3));
  ws.mergeCells(vatRow.number, 3, vatRow.number, 4);

  const whtRow = ws.addRow([
    "F",
    `Less: WHT @ ${safeNum(certificate.whtPct).toFixed(1)}%`,
    -safeNum(certificate.whtAmount),
    null,
  ]);
  whtRow.getCell(3).value = {
    formula: `-C${netBefore.number}*${safeNum(certificate.whtPct) / 100}`,
  };
  applyMoneyFormat(whtRow.getCell(3));
  ws.mergeCells(whtRow.number, 3, whtRow.number, 4);

  // Net payable
  ws.addRow([]);
  const netPay = ws.addRow([
    null,
    "NET PAYABLE THIS CERTIFICATE",
    safeNum(certificate.netPayable),
    null,
  ]);
  netPay.font = { bold: true, size: 12, color: { argb: "FF091E39" } };
  netPay.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF08A" } };
  netPay.getCell(3).value = {
    formula: `C${netBefore.number}+C${vatRow.number}+C${whtRow.number}`,
  };
  applyMoneyFormat(netPay.getCell(3));
  ws.mergeCells(netPay.number, 3, netPay.number, 4);

  // Previous-certificates history
  if (previousCerts.length) {
    ws.addRow([]);
    const hdr = ws.addRow(["History of certificates issued"]);
    hdr.font = { bold: true };
    hdr.fill = ACCENT_FILL;
    ws.mergeCells(hdr.number, 1, hdr.number, 4);

    const histHeader = ws.addRow([
      "Cert No.",
      "Date",
      "This cert (NGN)",
      "Cumulative (NGN)",
    ]);
    histHeader.font = { bold: true };
    histHeader.fill = SUB_FILL;

    for (const c of previousCerts) {
      const r = ws.addRow([
        String(c.number).padStart(2, "0"),
        c.date ? dayjs(c.date).format("YYYY-MM-DD") : "—",
        safeNum(c.thisCertificate),
        safeNum(c.cumulativeValue),
      ]);
      applyMoneyFormat(r.getCell(3));
      applyMoneyFormat(r.getCell(4));
    }
  }

  if (certificate.notes) {
    ws.addRow([]);
    const nh = ws.addRow(["Notes"]);
    nh.font = { bold: true };
    ws.mergeCells(nh.number, 1, nh.number, 4);
    const n = ws.addRow([certificate.notes]);
    n.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(n.number, 1, n.number, 4);
  }

  addSignatureBlock(ws);

  const buf = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeFilename(projectName)} - IPC ${String(certificate.number).padStart(2, "0")}.xlsx`,
  };
}

/**
 * Final Account workbook — reconciliation document showing contract sum,
 * adjusted final contract value, variations, certified-to-date, savings.
 */
export async function exportFinalAccount({ projectName = "Project", clientName = "", finalAccount, certificates = [] }) {
  if (!finalAccount) throw new Error("finalAccount is required");
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;

  const ws = workbook.addWorksheet("Final Account");

  addTitleBlock(ws, {
    title: "Final Account",
    projectName,
    clientName,
    date: finalAccount.finalizedAt || new Date(),
  });

  const tableHead = ws.addRow(["Item", "Description", "Amount (NGN)", ""]);
  tableHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  tableHead.fill = HEADER_FILL;
  tableHead.alignment = { horizontal: "center" };
  ws.mergeCells(tableHead.number, 3, tableHead.number, 4);

  const rows = [
    ["A", "Measured work (final)", safeNum(finalAccount.measuredWorkFinal)],
    ["B", "Provisional sums (final)", safeNum(finalAccount.provisionalFinal)],
    ["C", "Preliminaries", safeNum(finalAccount.preliminaryFinal)],
    ["D", "Variations (instructions + re-measurement)", safeNum(finalAccount.variationsFinal)],
  ];
  const rowNums = [];
  for (const [code, desc, amt] of rows) {
    const r = ws.addRow([code, desc, amt, null]);
    applyMoneyFormat(r.getCell(3));
    ws.mergeCells(r.number, 3, r.number, 4);
    rowNums.push(r.number);
  }

  ws.addRow([]);
  const fcv = ws.addRow([
    null,
    "Final contract value",
    safeNum(finalAccount.finalContractValue),
    null,
  ]);
  fcv.font = { bold: true, size: 12 };
  fcv.fill = SUB_FILL;
  fcv.getCell(3).value = {
    formula: rowNums.map((n) => `C${n}`).join("+"),
  };
  applyMoneyFormat(fcv.getCell(3));
  ws.mergeCells(fcv.number, 3, fcv.number, 4);

  ws.addRow([]);
  const agreedRow = ws.addRow([
    "E",
    "Less: agreed contract sum (at lock)",
    -safeNum(finalAccount.agreedContractSum),
    null,
  ]);
  applyMoneyFormat(agreedRow.getCell(3));
  ws.mergeCells(agreedRow.number, 3, agreedRow.number, 4);

  const saving = finalAccount.savings;
  const saveRow = ws.addRow([
    null,
    saving >= 0 ? "Under-run (savings vs contract sum)" : "Over-run (excess vs contract sum)",
    safeNum(saving),
    null,
  ]);
  saveRow.font = { bold: true, size: 12 };
  saveRow.fill = saving >= 0
    ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }
    : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  saveRow.getCell(3).value = {
    formula: `C${fcv.number}+C${agreedRow.number}`,
  };
  applyMoneyFormat(saveRow.getCell(3));
  ws.mergeCells(saveRow.number, 3, saveRow.number, 4);

  ws.addRow([]);

  // Certification history
  if (certificates.length) {
    const hdr = ws.addRow(["Certificates issued"]);
    hdr.font = { bold: true };
    hdr.fill = ACCENT_FILL;
    ws.mergeCells(hdr.number, 1, hdr.number, 4);

    const histHeader = ws.addRow(["Cert", "Date", "This cert (NGN)", "Status"]);
    histHeader.font = { bold: true };
    histHeader.fill = SUB_FILL;

    let total = 0;
    for (const c of certificates) {
      const r = ws.addRow([
        String(c.number).padStart(2, "0"),
        c.date ? dayjs(c.date).format("YYYY-MM-DD") : "—",
        safeNum(c.thisCertificate),
        c.status || "draft",
      ]);
      applyMoneyFormat(r.getCell(3));
      total += safeNum(c.thisCertificate);
    }
    const tot = ws.addRow([null, "Total certified", total, null]);
    tot.font = { bold: true };
    tot.fill = SUB_FILL;
    applyMoneyFormat(tot.getCell(3));
    ws.mergeCells(tot.number, 3, tot.number, 4);

    const released = ws.addRow([
      null,
      "Retention released to date",
      safeNum(finalAccount.retentionReleased),
      null,
    ]);
    applyMoneyFormat(released.getCell(3));
    ws.mergeCells(released.number, 3, released.number, 4);
  }

  if (finalAccount.notes) {
    ws.addRow([]);
    const nh = ws.addRow(["Notes"]);
    nh.font = { bold: true };
    ws.mergeCells(nh.number, 1, nh.number, 4);
    const n = ws.addRow([finalAccount.notes]);
    n.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(n.number, 1, n.number, 4);
  }

  addSignatureBlock(ws);

  const buf = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: `${safeFilename(projectName)} - Final Account.xlsx`,
  };
}
