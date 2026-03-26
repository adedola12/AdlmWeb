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
      return [
        "<tr>",
        `<td>${escapeHtml(alphaIndex(index))}</td>`,
        `<td>${escapeHtml(item.description)}</td>`,
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
    '<thead><tr><th>Ref</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>',
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
    ["Total project cost", safeNum(grossAmount)],
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
    ["Ref", "Description", "Qty", "Unit", "Rate", "Amount"],
  ];

  (entry?.items || []).forEach((item, index) => {
    aoa.push([
      alphaIndex(index),
      item?.description || "",
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

function PercentageField({ label, value, onChange }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-xs text-slate-500">{label}</div>
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        className="input"
        value={safeNum(value)}
        onChange={(e) => onChange?.(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

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
    <div className="space-y-4">
      {showValuationSettings ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="font-medium">Valuation settings</div>
          <div className="mt-1 text-sm text-slate-600">
            Saved per project and reused for every valuation sheet.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
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
              onChange={(value) =>
                onValuationSettingChange?.("withholdingPct", value)
              }
            />
          </div>
        </div>
      ) : null}

      {!showDailyValuationLog ? null : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="font-medium">Daily valuation log</div>
              <div className="mt-1 text-sm text-slate-600">
                Select a valuation day to preview the certificate, print it, or export all saved valuations to Excel.
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
              <label className="text-sm sm:min-w-[260px]">
                <div className="mb-1 text-xs text-slate-500">Valuation date</div>
                <select
                  className="input w-full"
                  value={selectedValuationDate}
                  onChange={(e) => onSelectValuationDate?.(e.target.value)}
                  disabled={!valuations.length || loadingValuations}
                >
                  <option value="">
                    {loadingValuations ? "Loading valuations..." : "Select valuation day"}
                  </option>
                  {sortedValuations.map((log, index) => (
                    <option key={log.date} value={log.date}>
                      Valuation {index + 1} - {formatDate(log.date)} ({log.itemCount} item{log.itemCount === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handleExportExcel}
                disabled={!valuationWorkbookRows.length}
                title={!valuationWorkbookRows.length ? "No valuation log to export yet" : "Export editable Excel workbook"}
              >
                Export Excel
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handlePrint}
                disabled={!selectedValuation || !certificate}
                title={!selectedValuation ? "Choose a valuation date first" : "Print valuation"}
              >
                Print valuation
              </button>
            </div>
          </div>

          {valuationErr ? (
            <div className="mt-3 text-sm text-red-600">{valuationErr}</div>
          ) : null}

          {!loadingValuations && !valuations.length ? (
            <div className="mt-3 text-sm text-slate-600">
              No valuation entries yet. Once you save marked items, they will appear here by date.
            </div>
          ) : null}

          {selectedValuation && certificate ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">
                  Valuation {certificate.valuationNumber} for {formatDate(selectedValuation.date)}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    {selectedValuation.itemCount} item{selectedValuation.itemCount === 1 ? "" : "s"} in this certificate
                  </span>
                  <span>Amount due {money(certificate.amountDue)}</span>
                  <span>Progress {certificate.progressPercentToDate.toFixed(1)}%</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Ref</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedValuation.items || []).map((item, index) => (
                      <tr key={item.itemKey || `${item.sn}-${item.description}`} className="border-t">
                        <td className="px-3 py-2">{alphaIndex(index)}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2">{Number(item.qty || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2">{money(item.rate)}</td>
                        <td className="px-3 py-2 font-medium">{money(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <tbody>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">{statusLabel} items in this valuation</td>
                      <td className="px-3 py-2 text-right">{money(certificate.currentValuationAmount)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Gross value of works to date</td>
                      <td className="px-3 py-2 text-right">{money(certificate.grossToDate)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Less retention ({safeNum(certificate.retentionPct)}%)</td>
                      <td className="px-3 py-2 text-right">{money(certificate.retentionAmount)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Net valuation to date</td>
                      <td className="px-3 py-2 text-right">{money(certificate.netValuationToDate)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Less previous payments</td>
                      <td className="px-3 py-2 text-right">
                        {certificate.previousPayments > 0
                          ? money(certificate.previousPayments)
                          : "Not applicable for first valuation"}
                      </td>
                    </tr>
                    {certificate.previousEntries.map((entry, index) => (
                      <tr key={`${entry.date}-${index}`} className="border-t text-slate-600">
                        <td className="px-3 py-2">
                          Valuation No. {index + 1} ({formatDate(entry.date)})
                        </td>
                        <td className="px-3 py-2 text-right">
                          {money(entry.totalAmount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Subtotal before taxes</td>
                      <td className="px-3 py-2 text-right">{money(certificate.amountBeforeTax)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Add VAT ({safeNum(certificate.vatPct)}%)</td>
                      <td className="px-3 py-2 text-right">{money(certificate.vatAmount)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">Less withholding tax ({safeNum(certificate.withholdingPct)}%)</td>
                      <td className="px-3 py-2 text-right">{money(certificate.withholdingAmount)}</td>
                    </tr>
                    <tr className="border-t bg-adlm-blue-700 text-white">
                      <td className="px-3 py-2 font-semibold">TOTAL AMOUNT DUE FOR PAYMENT</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(certificate.amountDue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

