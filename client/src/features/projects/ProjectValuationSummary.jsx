import React from "react";
import * as XLSX from "xlsx";

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  const safe = safeNum(value);
  return safe.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFilename(name) {
  return String(name || "Project")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function safeSheetName(name, fallback = "Sheet") {
  const cleaned = String(name || fallback)
    .replace(/[\\/?*[]:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function setWorksheetColumns(ws, widths) {
  ws["!cols"] = widths.map((width) => ({ wch: width }));
  return ws;
}

function alphaIndex(index) {
  let value = Number(index) || 0;
  let label = "";

  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return label;
}

function buildCertificate(selectedValuation, valuations, valuationSettings, progressTotal) {
  if (!selectedValuation) return null;

  const sorted = [...(valuations || [])].sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || "")),
  );
  const selectedDate = String(selectedValuation.date || "");
  const selectedIndex = sorted.findIndex((entry) => String(entry?.date || "") === selectedDate);
  const valuationNumber = selectedIndex >= 0 ? selectedIndex + 1 : 1;
  const toDateEntries = selectedIndex >= 0 ? sorted.slice(0, selectedIndex + 1) : [selectedValuation];
  const previousEntries = selectedIndex > 0 ? sorted.slice(0, selectedIndex) : [];

  const currentValuationAmount = safeNum(selectedValuation.totalAmount);
  const grossToDate = toDateEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.totalAmount),
    0,
  );
  const previousPayments = previousEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.totalAmount),
    0,
  );

  const retentionPct = safeNum(valuationSettings?.retentionPct);
  const vatPct = safeNum(valuationSettings?.vatPct);
  const withholdingPct = safeNum(valuationSettings?.withholdingPct);

  const retentionAmount = grossToDate * retentionPct / 100;
  const netValuationToDate = grossToDate - retentionAmount;
  const amountBeforeTax = netValuationToDate - previousPayments;
  const vatAmount = amountBeforeTax * vatPct / 100;
  const withholdingAmount = amountBeforeTax * withholdingPct / 100;
  const amountDue = amountBeforeTax + vatAmount - withholdingAmount;

  const progressKeys = new Set();
  toDateEntries.forEach((entry) => {
    (entry?.items || []).forEach((item, index) => {
      const key =
        item?.itemKey ||
        `${entry?.date || "valuation"}::${item?.itemSn || item?.sn || index}::${item?.description || ""}`;
      progressKeys.add(String(key));
    });
  });
  const fallbackProgressCount = toDateEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.itemCount),
    0,
  );
  const progressCountToDate = progressTotal > 0
    ? Math.min(progressTotal, progressKeys.size || fallbackProgressCount)
    : progressKeys.size || fallbackProgressCount;
  const progressPercentToDate = progressTotal > 0
    ? (progressCountToDate / progressTotal) * 100
    : 0;

  return {
    valuationNumber,
    currentValuationAmount,
    grossToDate,
    previousPayments,
    previousEntries,
    retentionPct,
    retentionAmount,
    netValuationToDate,
    amountBeforeTax,
    vatPct,
    vatAmount,
    withholdingPct,
    withholdingAmount,
    amountDue,
    progressCountToDate,
    progressPercentToDate,
    progressTotal: safeNum(progressTotal),
  };
}

function buildPrintHtml({
  certificate,
  dateLabel,
  items,
  projectName,
  statusLabel,
}) {
  const itemRows = (items || [])
    .map((item, index) => {
      const isPartial = item?.eventType === "partial";
      const progressCell = isPartial
        ? `${Number(item?.previousPercent) || 0}% &rarr; ${Number(item?.nextPercent) || 0}%`
        : escapeHtml(statusLabel || "Ratified");
      return [
        "<tr>",
        `<td>${escapeHtml(alphaIndex(index))}</td>`,
        `<td>${escapeHtml(item.description)}</td>`,
        `<td>${progressCell}</td>`,
        `<td>${escapeHtml(Number(item.qty || 0).toFixed(2))}</td>`,
        `<td>${escapeHtml(item.unit)}</td>`,
        `<td>${escapeHtml(money(item.rate))}</td>`,
        `<td>${escapeHtml(money(item.amount))}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  const previousPaymentsDetailRows = certificate.previousEntries.length
    ? certificate.previousEntries
        .map((entry, index) => {
          return `<tr class="subrow"><td>Valuation No. ${index + 1} (${escapeHtml(formatDate(entry?.date))})</td><td>${escapeHtml(money(entry?.totalAmount))}</td></tr>`;
        })
        .join("")
    : "";

  const previousPaymentsRow = certificate.previousPayments > 0
    ? `<tr><td>Less previous payments</td><td>${escapeHtml(money(certificate.previousPayments))}</td></tr>`
    : "<tr><td>Less previous payments</td><td>Not applicable for first valuation</td></tr>";

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    "<title>Interim Payment Application</title>",
    "<style>",
    "body { font-family: Arial, sans-serif; margin: 28px; color: #0f172a; }",
    "h1 { margin: 0 0 18px; text-align: center; font-size: 24px; }",
    "table { width: 100%; border-collapse: collapse; margin-top: 16px; }",
    "th, td { border: 1px solid #94a3b8; padding: 10px 12px; text-align: left; font-size: 13px; vertical-align: top; }",
    "th { background: #e2e8f0; }",
    ".meta td:first-child, .summary td:first-child { width: 68%; font-weight: 600; }",
    ".summary .subrow td { color: #475569; font-size: 12px; }",
    ".total td { background: #005be3; color: white; font-weight: 700; }",
    "</style>",
    "</head>",
    "<body>",
    "<h1>INTERIM PAYMENT APPLICATION</h1>",
    '<table class="meta">',
    `<tr><td>Project No and Description</td><td>${escapeHtml(projectName)}</td></tr>`,
    `<tr><td>Application No.</td><td>${escapeHtml(String(certificate.valuationNumber).padStart(2, "0"))}</td></tr>`,
    `<tr><td>Valuation Date</td><td>${escapeHtml(dateLabel)}</td></tr>`,
    `<tr><td>Progress</td><td>${escapeHtml(`${certificate.progressPercentToDate.toFixed(1)}% (${certificate.progressCountToDate} of ${certificate.progressTotal} lines marked ${String(statusLabel || "Completed").toLowerCase()})`)}</td></tr>`,
    "</table>",
    "<table>",
    '<thead><tr><th>Ref</th><th>Description</th><th>Progress</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>',
    `<tbody>${itemRows}</tbody>`,
    "</table>",
    '<table class="summary">',
    `<tr><td>${escapeHtml(statusLabel)} items in this valuation</td><td>${escapeHtml(money(certificate.currentValuationAmount))}</td></tr>`,
    `<tr><td>Gross value of works to date</td><td>${escapeHtml(money(certificate.grossToDate))}</td></tr>`,
    `<tr><td>Less retention (${escapeHtml(certificate.retentionPct)}%)</td><td>${escapeHtml(money(certificate.retentionAmount))}</td></tr>`,
    `<tr><td>Net valuation to date</td><td>${escapeHtml(money(certificate.netValuationToDate))}</td></tr>`,
    previousPaymentsRow,
    previousPaymentsDetailRows,
    `<tr><td>Subtotal before taxes</td><td>${escapeHtml(money(certificate.amountBeforeTax))}</td></tr>`,
    `<tr><td>Add VAT (${escapeHtml(certificate.vatPct)}%)</td><td>${escapeHtml(money(certificate.vatAmount))}</td></tr>`,
    `<tr><td>Less withholding tax (${escapeHtml(certificate.withholdingPct)}%)</td><td>${escapeHtml(money(certificate.withholdingAmount))}</td></tr>`,
    `<tr class="total"><td>TOTAL AMOUNT DUE FOR PAYMENT</td><td>${escapeHtml(money(certificate.amountDue))}</td></tr>`,
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function buildWorkbookDashboardSheet({
  grossAmount,
  progressCount,
  progressPercent,
  progressTotal,
  projectName,
  remainingAmount,
  statusLabel,
  valuationRows,
  valuationSettings,
  valuedAmount,
}) {
  const aoa = [
    ["PROJECT VALUATION DASHBOARD"],
    [],
    ["Project name", projectName],
    ["Overall progress", `${safeNum(progressPercent).toFixed(1)}%`],
    ["Marked lines", `${safeNum(progressCount)} of ${safeNum(progressTotal)}`],
    // S18 review: this figure is the project SCOPE — measured work, PC and
    // provisional sums, preliminaries and approved variations. It is not the
    // Bill's estimated total, which cascades contingency and VAT on top, so it
    // says what it sums rather than claiming a name it does not carry. The
    // figure itself is unchanged: the three rows here still reconcile with one
    // another, and with the certificates this workbook is built from.
    ["Project scope (measured, sums, prelims and approved variations)", safeNum(grossAmount)],
    [`${statusLabel} value`, safeNum(valuedAmount)],
    ["Amount left", safeNum(remainingAmount)],
    [],
    ["Saved project percentages"],
    ["Retention %", safeNum(valuationSettings?.retentionPct)],
    ["VAT %", safeNum(valuationSettings?.vatPct)],
    ["Withholding tax %", safeNum(valuationSettings?.withholdingPct)],
    [],
    ["Saved valuations"],
    [
      "Valuation No.",
      "Date",
      "Items",
      "Gross to date",
      "Previous payments",
      "Amount due",
    ],
  ];

  valuationRows.forEach(({ entry, certificate }) => {
    aoa.push([
      `Valuation ${certificate.valuationNumber}`,
      formatDate(entry?.date),
      safeNum(entry?.itemCount),
      safeNum(certificate.grossToDate),
      safeNum(certificate.previousPayments),
      safeNum(certificate.amountDue),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  return setWorksheetColumns(ws, [24, 26, 14, 16, 18, 16]);
}

function buildWorkbookValuationSheet({
  certificate,
  dateLabel,
  entry,
  projectName,
  statusLabel,
}) {
  const aoa = [
    ["INTERIM PAYMENT APPLICATION"],
    [],
    ["Project No and Description", projectName],
    ["Application No.", String(certificate.valuationNumber).padStart(2, "0")],
    ["Contract No and Description", ""],
    ["Client", ""],
    ["Project Management Consultant", ""],
    ["Cost Consultant", ""],
    ["Valuation Date", dateLabel],
    ["Progress", `${certificate.progressPercentToDate.toFixed(1)}% (${certificate.progressCountToDate} of ${certificate.progressTotal} lines)`],
    [],
    ["Ref", "Description", "Progress", "Qty", "Unit", "Rate", "Amount"],
  ];

  (entry?.items || []).forEach((item, index) => {
    const isPartial = item?.eventType === "partial";
    const progressCell = isPartial
      ? `${safeNum(item?.previousPercent)}% → ${safeNum(item?.nextPercent)}%`
      : statusLabel || "Ratified";
    aoa.push([
      alphaIndex(index),
      item?.description || "",
      progressCell,
      safeNum(item?.qty),
      item?.unit || "",
      safeNum(item?.rate),
      safeNum(item?.amount),
    ]);
  });

  aoa.push(
    [],
    ["Summary"],
    [`${statusLabel} items in this valuation`, safeNum(certificate.currentValuationAmount)],
    ["Gross value of works to date", safeNum(certificate.grossToDate)],
    [`Less retention (${safeNum(certificate.retentionPct)}%)`, safeNum(certificate.retentionAmount)],
    ["Net valuation to date", safeNum(certificate.netValuationToDate)],
    [
      "Less previous payments",
      certificate.previousPayments > 0
        ? safeNum(certificate.previousPayments)
        : "Not applicable for first valuation",
    ],
  );

  certificate.previousEntries.forEach((previousEntry, index) => {
    aoa.push([
      `Valuation No. ${index + 1} (${formatDate(previousEntry?.date)})`,
      safeNum(previousEntry?.totalAmount),
    ]);
  });

  aoa.push(
    ["Subtotal before taxes", safeNum(certificate.amountBeforeTax)],
    [`Add VAT (${safeNum(certificate.vatPct)}%)`, safeNum(certificate.vatAmount)],
    [
      `Less withholding tax (${safeNum(certificate.withholdingPct)}%)`,
      safeNum(certificate.withholdingAmount),
    ],
    ["TOTAL AMOUNT DUE FOR PAYMENT", safeNum(certificate.amountDue)],
  );

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  return setWorksheetColumns(ws, [12, 60, 12, 10, 14, 16]);
}

// His .wk-f field. .wk-f spans every column of a grid by default (it was made
// for his modal form), so these three set gridColumn back to auto to sit
// side by side.
function PercentageField({ label, value, onChange }) {
  return (
    <label className="wk-f" style={{ gridColumn: "auto" }}>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={safeNum(value)}
        onChange={(e) => onChange?.(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

// His palette tokens for the two progress chips and for a warning note.
const CHIP_PARTIAL = {
  background: "var(--pal-orange-wash)",
  color: "var(--pal-orange-key)",
  borderColor: "var(--pal-orange-line)",
};
const CHIP_RATIFIED = {
  background: "var(--pal-light-wash)",
  color: "var(--pal-light-key)",
  borderColor: "var(--pal-light-line)",
};
const NOTE_WARN = { background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)" };
const DESC = { display: "block", fontSize: 13.5, fontWeight: 400, color: "var(--ink)" };

export default function ProjectValuationSummary({
  grossAmount = 0,
  loadingValuations = false,
  onSelectValuationDate,
  onValuationSettingChange,
  progressCount = 0,
  progressPercent = 0,
  progressTotal = 0,
  projectName,
  remainingAmount = 0,
  selectedValuation = null,
  selectedValuationDate = "",
  showDailyValuationLog = true,
  showValuationSettings = true,
  clientName = "",
  onClientNameChange,
  statusLabel = "Completed",
  valuationErr = "",
  valuationSettings,
  valuations = [],
  valuedAmount = 0,
}) {
  const sortedValuations = React.useMemo(
    () =>
      [...(valuations || [])].sort((a, b) =>
        String(a?.date || "").localeCompare(String(b?.date || "")),
      ),
    [valuations],
  );
  const certificate = React.useMemo(
    () => buildCertificate(selectedValuation, sortedValuations, valuationSettings, progressTotal),
    [selectedValuation, sortedValuations, valuationSettings, progressTotal],
  );
  const valuationWorkbookRows = React.useMemo(
    () =>
      sortedValuations
        .map((entry) => ({
          entry,
          certificate: buildCertificate(entry, sortedValuations, valuationSettings, progressTotal),
        }))
        .filter((row) => row.certificate),
    [sortedValuations, valuationSettings, progressTotal],
  );
  const printFrameRef = React.useRef(null);

  function handlePrint() {
    if (!selectedValuation || !certificate) return;

    const staleFrame = printFrameRef.current;
    if (staleFrame?.parentNode) staleFrame.parentNode.removeChild(staleFrame);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    printFrameRef.current = iframe;

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;

      win.focus();
      win.print();

      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (printFrameRef.current === iframe) {
          printFrameRef.current = null;
        }
      }, 1000);
    };

    iframe.srcdoc = buildPrintHtml({
      certificate,
      dateLabel: formatDate(selectedValuation.date),
      items: selectedValuation.items || [],
      projectName,
      statusLabel,
    });
  }

  function handleExportExcel() {
    if (!valuationWorkbookRows.length) return;

    const workbook = XLSX.utils.book_new();
    const dashboardSheet = buildWorkbookDashboardSheet({
      grossAmount,
      progressCount,
      progressPercent,
      progressTotal,
      projectName,
      remainingAmount,
      statusLabel,
      valuationRows: valuationWorkbookRows,
      valuationSettings,
      valuedAmount,
    });

    XLSX.utils.book_append_sheet(
      workbook,
      dashboardSheet,
      safeSheetName(`${projectName} Dashboard`, "Dashboard"),
    );

    valuationWorkbookRows.forEach(({ entry, certificate: rowCertificate }) => {
      const sheet = buildWorkbookValuationSheet({
        certificate: rowCertificate,
        dateLabel: formatDate(entry?.date),
        entry,
        projectName,
        statusLabel,
      });
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        safeSheetName(`Val ${rowCertificate.valuationNumber} ${formatDate(entry?.date)}`, `Val ${rowCertificate.valuationNumber}`),
      );
    });

    XLSX.writeFile(
      workbook,
      `${sanitizeFilename(projectName)} - Valuations.xlsx`,
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {showValuationSettings ? (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>Valuation settings</h2>
            <span className="wk-locnote">
              Saved per project and reused for every valuation sheet.
            </span>
          </div>
          <div style={{ padding: "18px 20px 20px", display: "grid", gap: 16 }}>
            <label className="wk-f">
              <span>Client / Employer</span>
              <input
                type="text"
                value={clientName}
                onChange={(e) => onClientNameChange?.(e.target.value)}
                placeholder="e.g. First World Communities Ltd"
                maxLength={200}
              />
              {/* <small>, not <span>: .wk-f span would restyle it as a label. */}
              <small className="wk-fx" style={{ display: "block", marginTop: 6 }}>
                Titles the exported bill: &ldquo;Proposed Development for
                {clientName ? ` ${clientName}` : " …"}&rdquo;. Saved with the project.
              </small>
            </label>

            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <PercentageField
                label="Retention %"
                value={valuationSettings?.retentionPct}
                onChange={(value) => onValuationSettingChange?.("retentionPct", value)}
              />
              <PercentageField
                label="VAT %"
                value={valuationSettings?.vatPct}
                onChange={(value) => onValuationSettingChange?.("vatPct", value)}
              />
              <PercentageField
                label="Withholding tax %"
                value={valuationSettings?.withholdingPct}
                onChange={(value) => onValuationSettingChange?.("withholdingPct", value)}
              />
            </div>
          </div>
        </section>
      ) : null}

      {!showDailyValuationLog ? null : (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>Daily valuation log</h2>
            <span className="wk-locnote">
              Select a valuation day to preview the certificate, print it, or export all
              saved valuations to Excel.
            </span>
          </div>

          <div className="wk-bar" style={{ padding: "16px 20px 0", alignItems: "flex-end" }}>
            <label className="wk-f" style={{ flex: "1 1 260px", minWidth: 0 }}>
              <span>Valuation date</span>
              <select
                value={selectedValuationDate}
                onChange={(e) => onSelectValuationDate?.(e.target.value)}
                disabled={!valuations.length || loadingValuations}
              >
                <option value="">
                  {loadingValuations ? "Loading valuations..." : "Select valuation day"}
                </option>
                {sortedValuations.map((log, index) => {
                  const partial = Number(log?.partialCount) || 0;
                  const binary = Number(log?.binaryCount) || 0;
                  const suffix =
                    partial > 0 && binary > 0
                      ? ` — ${binary} ratified, ${partial} partial`
                      : partial > 0
                        ? ` — ${partial} partial`
                        : binary > 0
                          ? ` — ${binary} ratified`
                          : "";
                  return (
                    <option key={log.date} value={log.date}>
                      Valuation {index + 1} - {formatDate(log.date)} ({log.itemCount} item{log.itemCount === 1 ? "" : "s"}){suffix}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="wk-acts">
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={handleExportExcel}
                disabled={!valuationWorkbookRows.length}
                title={!valuationWorkbookRows.length ? "No valuation log to export yet" : "Export editable Excel workbook"}
              >
                Export Excel
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                onClick={handlePrint}
                disabled={!selectedValuation || !certificate}
                title={!selectedValuation ? "Choose a valuation date first" : "Print valuation"}
              >
                Print valuation
              </button>
            </div>
          </div>

          {valuationErr ? (
            <p className="mk-note" role="alert" style={{ margin: "14px 20px 0", ...NOTE_WARN }}>
              {valuationErr}
            </p>
          ) : null}

          {/* Three states, not one. A read that failed already says so in the
              note above, and saying "no valuation entries yet" underneath it
              would turn a fault into a fact about the project. While it is
              still loading the screen knows nothing either way, so it says
              nothing. Only when the log really came back empty does the panel
              explain what a valuation is and the one thing that makes one. */}
          {loadingValuations || valuationErr || valuations.length ? null : (
            <div style={{ padding: 20 }}>
              <div className="wk-empty">
                <b>No valuation yet</b>
                <p>
                  A valuation is one day&rsquo;s progress priced: the lines you marked complete,
                  or moved on by a percentage, valued at their own rates. Saving them numbers
                  the day as a certificate you can print or export, with retention, VAT and
                  previous payments worked out from the settings above.
                </p>
                <p>
                  Mark lines on the Bill, complete or a percentage of the way there, then save
                  the project. The day appears here as Valuation 1.
                </p>
              </div>
            </div>
          )}

          {selectedValuation && certificate ? (
            <>
              {/* The certificate's lines, in his bill rows. */}
              <div className="wk-qt" style={{ marginTop: 14 }}>
                <div className="wk-qgh">
                  <span>
                    Valuation {certificate.valuationNumber} · {formatDate(selectedValuation.date)}
                  </span>
                  <span>Amount due {money(certificate.amountDue)}</span>
                </div>
                <p className="wk-locnote" style={{ margin: "0 0 10px" }}>
                  {selectedValuation.itemCount} item{selectedValuation.itemCount === 1 ? "" : "s"} in
                  this certificate · progress {certificate.progressPercentToDate.toFixed(1)}%
                  {Number(selectedValuation.partialCount) > 0
                    ? ` · ${selectedValuation.partialCount} partial`
                    : ""}
                  {Number(selectedValuation.binaryCount) > 0
                    ? ` · ${selectedValuation.binaryCount} ratified`
                    : ""}
                </p>
                <div className="wk-qhd">
                  <span>Description</span>
                  <span>Progress</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>Amount</span>
                </div>
                {(selectedValuation.items || []).map((item, index) => {
                  const isPartial = item?.eventType === "partial";
                  const prevPct = Number(item?.previousPercent) || 0;
                  const nextPct = Number(item?.nextPercent) || 0;
                  return (
                    <div className="wk-qr" key={item.itemKey || `${item.sn}-${item.description}`}>
                      <span className="d">
                        <b style={DESC}>{item.description}</b>
                        <em>Ref {alphaIndex(index)}</em>
                      </span>
                      <span className="s">
                        {isPartial ? (
                          <span
                            className="wk-src sm"
                            style={CHIP_PARTIAL}
                            title={`Partial progress from ${prevPct}% to ${nextPct}%`}
                          >
                            {prevPct}% → {nextPct}%
                          </span>
                        ) : (
                          <span className="wk-src sm" style={CHIP_RATIFIED} title="Line ratified at 100%">
                            {statusLabel}
                          </span>
                        )}
                      </span>
                      <span className="q">
                        {Number(item.qty || 0).toFixed(2)}
                        <i>{item.unit}</i>
                      </span>
                      <span className="r">{money(item.rate)}</span>
                      <span className="ds-a">{money(item.amount)}</span>
                    </div>
                  );
                })}
              </div>

              {/* The payment summary, in his "what the client receives" rows. */}
              <div className="wk-expr" style={{ borderTop: "1px solid var(--line)" }}>
                <div>
                  <span>{statusLabel} items in this valuation</span>
                  <b>{money(certificate.currentValuationAmount)}</b>
                </div>
                <div>
                  <span>Gross value of works to date</span>
                  <b>{money(certificate.grossToDate)}</b>
                </div>
                <div>
                  <span>Less retention ({safeNum(certificate.retentionPct)}%)</span>
                  <b>{money(certificate.retentionAmount)}</b>
                </div>
                <div>
                  <span>Net valuation to date</span>
                  <b>{money(certificate.netValuationToDate)}</b>
                </div>
                <div>
                  <span>Less previous payments</span>
                  <b>
                    {certificate.previousPayments > 0
                      ? money(certificate.previousPayments)
                      : "Not applicable for first valuation"}
                  </b>
                </div>
                {certificate.previousEntries.map((entry, index) => (
                  <div key={`${entry.date}-${index}`}>
                    <span style={{ paddingLeft: 14 }}>
                      Valuation No. {index + 1} ({formatDate(entry.date)})
                    </span>
                    <b style={{ color: "var(--ink-3)" }}>{money(entry.totalAmount)}</b>
                  </div>
                ))}
                <div>
                  <span>Subtotal before taxes</span>
                  <b>{money(certificate.amountBeforeTax)}</b>
                </div>
                <div>
                  <span>Add VAT ({safeNum(certificate.vatPct)}%)</span>
                  <b>{money(certificate.vatAmount)}</b>
                </div>
                <div>
                  <span>Less withholding tax ({safeNum(certificate.withholdingPct)}%)</span>
                  <b>{money(certificate.withholdingAmount)}</b>
                </div>
                <div className="t">
                  <span>Total amount due for payment</span>
                  <b>{money(certificate.amountDue)}</b>
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
