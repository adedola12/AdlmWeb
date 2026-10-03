// Cashflow forecast — Excel export, in the practice's own format.
//
// THE FORMAT IS NOT INVENTED
//
// It follows two of ADLM's real forecasts — "Cashflow Forecast 1.xlsx" and
// "PHASE 6 CASHFLOW FORECAST.xlsx" (Phase 6, £4.2m, 395 days) — which both use
// the same two sheets:
//
//   Project WBS               Task Name | Duration | Start | Finish | Cost
//   Project Cash Gantt Chart  the activity down the left with its total in
//                             brackets, "Time (Months)" across the top over a
//                             month-number row and a month-name row, and each
//                             activity's cost spread into the months it runs
//                             through.
//
// That shape is the point: a category table tells you March is bad, the cash
// Gantt tells you WHICH activity made it bad. Their own sheets show it — e.g.
// "Internal Walls (£61,380.00)" split £30,690 / £30,690 across two months.
//
// WHAT IS ADDED BELOW THEIR ROWS
//
// Their sheets stop at expenditure. Four rows are added under the Gantt, because
// expenditure alone cannot answer the question a forecast is read for:
// money received (certified, less retention, moved on by the payment lag), net
// movement, and the cumulative balance whose low point is the facility the job
// needs. The Basis sheet states every rule.
//
// The workbook is stamped as an ADLM report (adlmWorkbook.js), so the Excel
// importer refuses it — a cashflow is derived, and re-importing one would make a
// project out of a forecast.

import ExcelJS from "exceljs";
import { buildCashflowForecast } from "./cashflowForecast.js";
import { ADLM_EXPORT_COVER_NOTE, stampAdlmWorkbook } from "./adlmWorkbook.js";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
const TIME_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
const ACTUAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
const OUT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };

const MONEY_FMT = '#,##0;[Red]-#,##0;-';
const THIN_TOP = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
const DOUBLE_TOP = { top: { style: "double", color: { argb: "FF334155" } } };

const money0 = (n) => Math.round(Number(n) || 0);
const naira = (n) => `NGN ${money0(n).toLocaleString("en-NG")}`;
const dmy = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : "");

/** Their bracketed caption: "Internal Walls (£61,380.00)". */
const captionFor = (a) => (a.cost ? `${a.name} (${naira(a.cost)})` : a.name);

function monthRow(ws, label, values, opts = {}) {
  const row = ws.addRow([label, ...values.map(money0), money0(values.reduce((a, b) => a + (b || 0), 0))]);
  row.eachCell((cell, i) => {
    if (i > 1) cell.numFmt = MONEY_FMT;
    if (opts.fill) cell.fill = opts.fill;
    if (opts.bold) cell.font = { bold: true };
    if (opts.border) cell.border = opts.border;
  });
  return row;
}

/**
 * @param {object} project  a lean TakeoffProject
 * @param {object} [opts]   retentionPercent, paymentLagDays, leadDays, prelimPercent
 * @returns {Promise<Buffer>}
 */
export async function exportCashflowForecast(project, opts = {}) {
  const f = buildCashflowForecast(project, opts);
  const wb = new ExcelJS.Workbook();
  stampAdlmWorkbook(wb);
  wb.created = new Date();

  const name = String(project?.name || "Project").trim();
  const labels = f.months.map((m) => m.label);
  const nCols = labels.length;

  /* ── Project WBS — their first sheet ───────────────────────────────── */
  const wbs = wb.addWorksheet("Project WBS");
  wbs.columns = [
    { width: 58 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 18 },
  ];
  wbs.addRow([`${name} — programme and cost`]).font = { bold: true, size: 12 };
  const wbsHead = wbs.addRow(["Task Name", "Duration", "Start", "Finish", "Cost"]);
  wbsHead.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEADER_FILL;
  });
  for (const a of f.activities) {
    const r = wbs.addRow([
      a.name,
      a.durationDays ? `${a.durationDays} days` : "",
      dmy(a.start),
      dmy(a.finish),
      money0(a.cost),
    ]);
    r.getCell(5).numFmt = MONEY_FMT;
  }
  const wbsTotal = wbs.addRow([
    "TOTAL",
    "",
    "",
    "",
    money0(f.activities.reduce((x, a) => x + a.cost, 0)),
  ]);
  wbsTotal.eachCell((c) => {
    c.font = { bold: true };
    c.fill = TOTAL_FILL;
    c.border = DOUBLE_TOP;
  });
  wbsTotal.getCell(5).numFmt = MONEY_FMT;

  if (!f.hasProgramme) {
    // Say why, rather than shipping an empty grid.
    const none = wb.addWorksheet("Project Cash Gantt Chart");
    none.columns = [{ width: 100 }];
    none.addRow(["This project has no programme"]).font = { bold: true, size: 12 };
    none.addRow([
      "A cashflow is a forecast over time, and the only dated thing in a project is its " +
        "programme of works — a bill line does not know when it is built. Plan the work from " +
        "the bill, then export this again.",
    ]).getCell(1).alignment = { wrapText: true };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /* ── Project Cash Gantt Chart — their second sheet ─────────────────── */
  const ws = wb.addWorksheet("Project Cash Gantt Chart", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
  });
  ws.columns = [{ width: 62 }, ...labels.map(() => ({ width: 15 })), { width: 18 }];

  // Their three header rows: the band, the month number, the month name.
  const band = ws.addRow(["Activity (expenditure)", ...labels.map(() => "Time (Months)"), ""]);
  band.eachCell((c) => {
    c.font = { bold: true };
    c.fill = TIME_FILL;
    c.alignment = { horizontal: "center" };
  });
  if (nCols > 1) ws.mergeCells(1, 2, 1, nCols + 1);

  const nums = ws.addRow(["Activity (expenditure)", ...labels.map((_, i) => i + 1), "Total"]);
  nums.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEADER_FILL;
    if (i > 1) c.alignment = { horizontal: "center" };
  });

  const names = ws.addRow(["Activity (expenditure)", ...labels, ""]);
  names.eachCell((c, i) => {
    c.font = { bold: true };
    c.fill = TIME_FILL;
    if (i > 1) c.alignment = { horizontal: "center" };
    // A month whose income is a certificate already issued is fact, not
    // forecast, and the sheet should not pretend otherwise.
    if (i > 1 && f.months[i - 2]?.actual) {
      c.fill = ACTUAL_FILL;
      c.font = { bold: true, color: { argb: "FF166534" } };
    }
  });

  // One row per activity, its cost spread into the months it runs through.
  // A month it does not touch is left BLANK, not zero — that is what makes the
  // sheet read as a Gantt rather than as a matrix.
  for (const a of f.activities) {
    const row = ws.addRow([
      captionFor(a),
      ...a.spread.map((v) => (v > 0.5 ? money0(v) : null)),
      money0(a.cost),
    ]);
    row.eachCell((c, i) => {
      if (i > 1) c.numFmt = MONEY_FMT;
    });
    row.getCell(nCols + 2).font = { bold: true };
  }

  ws.addRow([]);
  monthRow(ws, "Monthly expenditure", f.rows.outgoings, {
    bold: true,
    fill: OUT_FILL,
    border: THIN_TOP,
  });
  monthRow(ws, "Cumulative expenditure", f.rows.cumOut, { fill: OUT_FILL });

  ws.addRow([]);
  // Their sheets stop at expenditure. These four are what make it a cashflow.
  monthRow(ws, "Value certified", f.rows.valueCertified);
  monthRow(ws, `Less retention (${f.assumptions.retentionPercent}%)`, f.rows.retention.map((v) => -v));
  monthRow(ws, `Cash received (${f.assumptions.paymentLagDays}-day lag)`, f.rows.received, {
    bold: true,
    border: THIN_TOP,
  });
  monthRow(ws, "Net movement", f.rows.net, { bold: true });
  const cum = monthRow(ws, "CUMULATIVE BALANCE", f.rows.cumulative, {
    bold: true,
    fill: TOTAL_FILL,
    border: DOUBLE_TOP,
  });
  // A running balance has no meaningful sum: the last month IS the total, and
  // printing a sum of a running total would be a lie.
  cum.getCell(nCols + 2).value = money0(f.rows.cumulative[f.rows.cumulative.length - 1] || 0);

  ws.addRow([]);
  const verdict = ws.addRow([
    f.lowPoint.amount < 0
      ? `Worst position ${naira(f.lowPoint.amount)} in ${f.lowPoint.month} — this is the funding the job needs in place before it earns it back.`
      : "The balance never goes negative; the job funds itself on these assumptions.",
  ]);
  verdict.font = {
    bold: true,
    color: { argb: f.lowPoint.amount < 0 ? "FFB91C1C" : "FF166534" },
  };
  if (f.totals.afterCompletion > 0) {
    ws.addRow([
      `${naira(f.totals.afterCompletion)} is certified in the closing months and lands after the last column, plus ${naira(f.totals.retention)} of retention held.`,
    ]).font = { italic: true };
  }

  /* ── Basis ─────────────────────────────────────────────────────────── */
  const basis = wb.addWorksheet("Basis");
  basis.columns = [{ width: 26 }, { width: 88 }];
  basis.addRow([`${name} — how each row is worked out`]).font = { bold: true, size: 12 };
  basis.addRow([]);
  [
    ["Format", 'Follows ADLM\'s own forecasts: a "Project WBS" sheet and a "Project Cash Gantt Chart" with the activity down the left and the months across.'],
    ["Activity cost", "The value of the bill lines that activity builds, from the programme's own links."],
    ["Spread", "An activity's cost is spread across the months it runs through, in proportion to how much of its span falls in each. A month it does not touch is left blank."],
    ["Value certified", "The same rule as the PM dashboard's earned value, so the two cannot disagree."],
    ["Actual months", "A month with a certificate already issued shows that certificate instead of the forecast, and its heading is shaded green. Everything after it is forecast."],
    ["Retention", `Withheld from every certificate at ${f.assumptions.retentionPercent}%. Not released here — release is an event, not a forecast.`],
    ["Cash received", `Net certified, moved on by ${f.assumptions.paymentLagDays} days. This is the row that makes a profitable job fail: the work is paid for months before the client pays for it.`],
    ["Materials", `Paid in full in the month they must be ORDERED — the earliest linked task's start, less ${f.assumptions.leadDays} days lead.`],
    ["Labour and plant", "Spread across the task's own dates, because that is when the gang is on site."],
    ["Preliminaries", `${f.assumptions.prelimPercent}% of measured work, spread evenly across every month.`],
    ["Cumulative balance", "The running total of net movement. Its lowest point is the facility the job needs — the number this sheet exists to produce."],
    ["What this is not", "A ledger. It is what the programme and the bill say should happen, not what has been paid."],
    ["", ADLM_EXPORT_COVER_NOTE],
  ].forEach(([k, v]) => {
    const r = basis.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export default exportCashflowForecast;
