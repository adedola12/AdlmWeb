import React from "react";

function money(value) {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
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

function buildPrintHtml({
  dateLabel,
  items,
  projectName,
  statusLabel,
  title,
  totalAmount,
}) {
  const rows = (items || [])
    .map((item) => {
      return [
        "<tr>",
        "<td>" + escapeHtml(item.sn) + "</td>",
        "<td>" + escapeHtml(item.description) + "</td>",
        "<td>" + escapeHtml(Number(item.qty || 0).toFixed(2)) + "</td>",
        "<td>" + escapeHtml(item.unit) + "</td>",
        "<td>" + escapeHtml(money(item.rate)) + "</td>",
        "<td>" + escapeHtml(money(item.amount)) + "</td>",
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    "<title>" + escapeHtml(title) + "</title>",
    "<style>",
    "body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }",
    "h1 { margin: 0 0 6px; font-size: 22px; }",
    ".meta { margin: 0 0 18px; color: #475569; font-size: 13px; }",
    "table { width: 100%; border-collapse: collapse; margin-top: 16px; }",
    "th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 13px; }",
    "th { background: #eff6ff; }",
    "tfoot td { font-weight: 700; }",
    "</style>",
    "</head>",
    "<body>",
    "<h1>" + escapeHtml(title) + "</h1>",
    '<div class="meta">' +
      escapeHtml(projectName) +
      " | " +
      escapeHtml(dateLabel) +
      " | " +
      escapeHtml(statusLabel) +
      " items marked on this day</div>",
    "<table>",
    "<thead><tr><th>S/N</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>",
    "<tbody>" + rows + "</tbody>",
    "<tfoot><tr><td colspan=\"5\">Valuation total</td><td>" +
      escapeHtml(money(totalAmount)) +
      "</td></tr></tfoot>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {money(value)}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function ProjectValuationSummary({
  grossAmount = 0,
  loadingValuations = false,
  onSelectValuationDate,
  projectName,
  remainingAmount = 0,
  selectedValuation = null,
  selectedValuationDate = "",
  statusLabel = "Completed",
  statusPastLabel = "Completed to date",
  valuationErr = "",
  valuations = [],
  valuedAmount = 0,
}) {
  function handlePrint() {
    if (!selectedValuation) return;

    const popup = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=1000,height=800",
    );
    if (!popup) return;

    const dateLabel = formatDate(selectedValuation.date);
    const title = `${projectName || "Project"} - Valuation for ${dateLabel}`;
    popup.document.open();
    popup.document.write(
      buildPrintHtml({
        projectName,
        title,
        dateLabel,
        statusLabel,
        totalAmount: selectedValuation.totalAmount,
        items: selectedValuation.items || [],
      }),
    );
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 150);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
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
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-medium">Daily valuation log</div>
            <div className="mt-1 text-sm text-slate-600">
              Print only the items marked as {statusLabel.toLowerCase()} on a selected day.
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Valuation date</div>
              <select
                className="input min-w-[220px]"
                value={selectedValuationDate}
                onChange={(e) => onSelectValuationDate?.(e.target.value)}
                disabled={!valuations.length || loadingValuations}
              >
                <option value="">
                  {loadingValuations ? "Loading valuations..." : "Select valuation day"}
                </option>
                {valuations.map((log) => (
                  <option key={log.date} value={log.date}>
                    {formatDate(log.date)} ({log.itemCount} item{log.itemCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn btn-sm"
              onClick={handlePrint}
              disabled={!selectedValuation}
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

        {selectedValuation ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">
                {selectedValuation.title}
              </div>
              <div className="mt-1">
                {selectedValuation.itemCount} item{selectedValuation.itemCount === 1 ? "" : "s"} | Total {money(selectedValuation.totalAmount)}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">S/N</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedValuation.items || []).map((item) => (
                    <tr key={item.itemKey || `${item.sn}-${item.description}`} className="border-t">
                      <td className="px-3 py-2">{item.sn}</td>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}