import React from "react";

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

function alphaIndex(index) {
  let value = Number(index) || 0;
  let label = "";

  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return label;
}

function buildCertificate(selectedValuation, valuations, valuationSettings) {
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
  };
}

function buildPrintHtml({
  certificate,
  dateLabel,
  items,
  progressCount,
  progressPercent,
  progressTotal,
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
    ".total td { background: #1d4ed8; color: white; font-weight: 700; }",
    "</style>",
    "</head>",
    "<body>",
    "<h1>INTERIM PAYMENT APPLICATION</h1>",
    "<table class=\"meta\">",
    `<tr><td>Project No and Description</td><td>${escapeHtml(projectName)}</td></tr>`,
    `<tr><td>Application No.</td><td>${escapeHtml(String(certificate.valuationNumber).padStart(2, "0"))}</td></tr>`,
    `<tr><td>Valuation Date</td><td>${escapeHtml(dateLabel)}</td></tr>`,
    `<tr><td>Progress</td><td>${escapeHtml(`${progressPercent.toFixed(1)}% (${progressCount} of ${progressTotal} lines marked ${statusLabel.toLowerCase()})`)}</td></tr>`,
    "</table>",
    "<table>",
    "<thead><tr><th>Ref</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>",
    `<tbody>${itemRows}</tbody>`,
    "</table>",
    "<table class=\"summary\">",
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

function StatCard({ label, value, helper, format = "money" }) {
  const displayValue =
    format === "percent"
      ? `${safeNum(value).toFixed(1)}%`
      : money(value);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {displayValue}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
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
  statusLabel = "Completed",
  statusPastLabel = "Completed to date",
  valuationErr = "",
  valuationSettings,
  valuations = [],
  valuedAmount = 0,
}) {
  const certificate = React.useMemo(
    () => buildCertificate(selectedValuation, valuations, valuationSettings),
    [selectedValuation, valuationSettings, valuations],
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
      progressCount,
      progressPercent,
      progressTotal,
      projectName,
      statusLabel,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gross project total"
          value={grossAmount}
          helper="All items before deductions"
        />
        <StatCard
          label={statusPastLabel}
          value={valuedAmount}
          helper={`${statusLabel} items already deducted`}
        />
        <StatCard
          label="Outstanding balance"
          value={remainingAmount}
          helper="Current project amount remaining"
        />
        <StatCard
          label="Progress"
          value={progressPercent}
          format="percent"
          helper={`${progressCount} of ${progressTotal} lines marked ${statusLabel.toLowerCase()}`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Overall progress</div>
            <div className="mt-1 text-sm text-slate-600">
              {progressCount} of {progressTotal} line items marked {statusLabel.toLowerCase()}.
            </div>
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {safeNum(progressPercent).toFixed(1)}%
          </div>
        </div>

        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, safeNum(progressPercent)))}%` }}
          />
        </div>
      </div>

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

      {!showDailyValuationLog ? null : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-medium">Daily valuation log</div>
              <div className="mt-1 text-sm text-slate-600">
                Select a valuation day to preview the certificate and print the valuation sheet.
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <div className="mb-1 text-xs text-slate-500">Valuation date</div>
                <select
                  className="input min-w-[240px]"
                  value={selectedValuationDate}
                  onChange={(e) => onSelectValuationDate?.(e.target.value)}
                  disabled={!valuations.length || loadingValuations}
                >
                  <option value="">
                    {loadingValuations ? "Loading valuations..." : "Select valuation day"}
                  </option>
                  {valuations
                    .slice()
                    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
                    .map((log, index) => (
                      <option key={log.date} value={log.date}>
                        Valuation {index + 1} - {formatDate(log.date)} ({log.itemCount} item{log.itemCount === 1 ? "" : "s"})
                      </option>
                    ))}
                </select>
              </label>

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
                <div className="mt-1">
                  {selectedValuation.itemCount} item{selectedValuation.itemCount === 1 ? "" : "s"} in this certificate | Amount due {money(certificate.amountDue)}
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
                    <tr className="border-t bg-blue-600 text-white">
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