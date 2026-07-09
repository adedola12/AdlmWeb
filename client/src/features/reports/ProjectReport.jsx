// features/reports/ProjectReport.jsx — the printable Project Progress
// Report. Consumes the payload from GET /reports/project/:productKey/:id.
import React from "react";
import dayjs from "dayjs";
import {
  ReportPage,
  CoverPage,
  Section,
  KpiRow,
  Donut,
  HBars,
  Legend,
  Table,
  StatusPill,
  fmtMoney,
  fmtPct,
  fmtDate,
  paginateRows,
  RPT,
} from "./reportKit.jsx";

export default function ProjectReport({ report }) {
  const f = report.financials;
  const meta = report.meta;

  const costParts = [
    { label: "Measured works", value: f.measured.planned, color: RPT.blue },
    { label: "Preliminaries", value: f.preliminary.pool, color: RPT.sky },
    { label: "Provisional sums", value: f.provisional.total, color: RPT.orange },
    { label: "Contingency", value: f.contingencyAmount, color: "#7C8DB0" },
    { label: "Tax (VAT)", value: f.taxAmount, color: "#B9C4D6" },
    { label: "Variations", value: f.variations.total, color: RPT.red },
  ].filter((p) => p.value > 0);

  const breakdownRows = [
    { k: "Measured works (bill items)", amount: f.measured.planned, note: `${f.measured.count} items` },
    { k: `Preliminaries (${fmtPct(f.preliminary.percent, 1)})`, amount: f.preliminary.pool, note: `${f.preliminary.completedCount}/${f.preliminary.itemCount} done` },
    { k: "Provisional sums", amount: f.provisional.total, note: `${f.provisional.completedCount}/${f.provisional.count} executed` },
    { k: "Sub-total", amount: f.subtotal, strong: true },
    { k: `Contingency (${fmtPct(f.contingencyPercent, 1)})`, amount: f.contingencyAmount },
    { k: `Tax / VAT (${fmtPct(f.taxPercent, 1)})`, amount: f.taxAmount },
    { k: "Variations", amount: f.variations.total, note: `${f.variations.completedCount}/${f.variations.count} executed` },
  ];

  const certChunks = paginateRows(report.certificates?.list || [], 14, 24);
  const budget = report.budget;

  const pages = [];

  // ── Page: executive summary + contract value breakdown ──
  pages.push(
    <>
      <Section title="Executive Summary" k="Where the project stands today">
        <KpiRow
          items={[
            { label: "Project Value", value: fmtMoney(f.projectTotal, { compact: true }), sub: f.contract.locked ? `Contract sum ${fmtMoney(f.contract.contractSum, { compact: true })}` : "Contract not locked" },
            { label: "Work Done (Earned)", value: fmtMoney(f.totalEarned, { compact: true }), sub: `${fmtPct(f.progressPercent)} of project value` },
            { label: "Actual Cost", value: fmtMoney(f.totalActual, { compact: true }) },
            {
              label: "Progress",
              value: fmtPct(f.progressPercent),
              tone: f.progressPercent >= 100 ? "good" : "accent",
            },
          ]}
        />
      </Section>
      <Section title="Contract Value Breakdown" k="Composition of the project total">
        <div className="chart-grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
          <div>
            <Table
              cols={[
                { key: "k", label: "Component", render: (r) => (r.strong ? <b>{r.k}</b> : r.k) },
                { key: "note", label: "Status" },
                { key: "amount", label: "Amount", num: true, render: (r) => (r.strong ? <b>{fmtMoney(r.amount)}</b> : fmtMoney(r.amount)) },
              ]}
              rows={breakdownRows}
              totalsRow={{ k: "Total Project Value", amount: fmtMoney(f.projectTotal) }}
            />
          </div>
          <div className="chart-card">
            <div className="t">Cost composition</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Donut
                segments={costParts}
                centerLabel={fmtMoney(f.projectTotal, { compact: true })}
                centerSub="project value"
              />
            </div>
            <Legend items={costParts} />
          </div>
        </div>
      </Section>
    </>,
  );

  // ── Page: progress by trade ──
  if (report.progressByTrade?.length) {
    pages.push(
      <Section title="Progress by Trade" k="Planned value vs work done per trade">
        <div className="chart-card" style={{ marginBottom: 12 }}>
          <div className="t">Earned vs planned value</div>
          <HBars
            rows={report.progressByTrade.map((t) => ({
              label: t.label,
              value: t.planned,
              value2: t.earned,
              right: `${fmtMoney(t.earned, { compact: true })} / ${fmtMoney(t.planned, { compact: true })} · ${fmtPct(t.percent)}`,
            }))}
          />
          <Legend
            items={[
              { label: "Planned value", color: `${RPT.blue}33` },
              { label: "Earned (work done)", color: RPT.green },
            ]}
          />
        </div>
        <Table
          cols={[
            { key: "label", label: "Trade / Category" },
            { key: "itemCount", label: "Items", num: true },
            { key: "completedCount", label: "Completed", num: true },
            { key: "planned", label: "Planned", num: true, render: (r) => fmtMoney(r.planned) },
            { key: "earned", label: "Earned", num: true, render: (r) => fmtMoney(r.earned) },
            { key: "percent", label: "Progress", num: true, render: (r) => fmtPct(r.percent) },
          ]}
          rows={report.progressByTrade}
        />
      </Section>,
    );
  }

  // ── Page(s): valuation & certificates ──
  if (certChunks.length) {
    certChunks.forEach((chunk, ci) => {
      pages.push(
        <Section
          title={ci === 0 ? "Valuation & Payment Certificates" : "Payment Certificates (continued)"}
          k={ci === 0 ? `${report.certificates.list.length} certificates · ${fmtMoney(report.certificates.totalCertified)} certified to date` : undefined}
        >
          {ci === 0 && (
            <div style={{ marginBottom: 12 }}>
              <KpiRow
                items={[
                  { label: "Certified To Date", value: fmtMoney(report.certificates.totalCertified, { compact: true }) },
                  { label: "Paid To Date", value: fmtMoney(report.certificates.totalPaid, { compact: true }), tone: "good" },
                  { label: "Certificates", value: report.certificates.list.length },
                ]}
              />
            </div>
          )}
          <Table
            cols={[
              { key: "number", label: "No.", width: "8%" },
              { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
              { key: "cumulativeValue", label: "Cumulative", num: true, render: (r) => fmtMoney(r.cumulativeValue) },
              { key: "thisCertificate", label: "This Cert.", num: true, render: (r) => fmtMoney(r.thisCertificate) },
              { key: "retentionAmount", label: "Retention", num: true, render: (r) => fmtMoney(r.retentionAmount) },
              { key: "netPayable", label: "Net Payable", num: true, render: (r) => fmtMoney(r.netPayable) },
              { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            ]}
            rows={chunk}
          />
          {ci === certChunks.length - 1 && report.finalAccount ? (
            <div style={{ marginTop: 14 }}>
              <KpiRow
                items={[
                  { label: "Final Contract Value", value: fmtMoney(report.finalAccount.finalContractValue, { compact: true }) },
                  { label: "Agreed Contract Sum", value: fmtMoney(report.finalAccount.agreedContractSum, { compact: true }) },
                  {
                    label: "Savings",
                    value: fmtMoney(report.finalAccount.savings, { compact: true }),
                    tone: report.finalAccount.savings >= 0 ? "good" : "bad",
                    sub: `Final account ${fmtDate(report.finalAccount.finalizedAt)}`,
                  },
                ]}
              />
            </div>
          ) : null}
        </Section>,
      );
    });
  }

  // ── Page: budget & procurement ──
  if (budget) {
    pages.push(
      <Section title="Budget & Procurement" k="Internal cost plan and buying progress">
        <div style={{ marginBottom: 12 }}>
          <KpiRow
            items={[
              { label: "Budget Total", value: fmtMoney(budget.budgetTotal, { compact: true }), sub: `${budget.itemCount} lines` },
              { label: "Procured Value", value: fmtMoney(budget.procuredValue, { compact: true }), tone: "good" },
              { label: "Procured", value: fmtPct(budget.procuredPercent), sub: `${budget.procuredCount} of ${budget.itemCount} lines` },
              { label: "Pending Lines", value: budget.pendingCount, tone: budget.pendingCount > 0 ? "accent" : "good" },
            ]}
          />
        </div>
        <div className="chart-card" style={{ marginBottom: 12 }}>
          <div className="t">Procurement by trade</div>
          <HBars
            rows={budget.byGroup.map((g) => ({
              label: g.label,
              value: g.budget,
              value2: g.procured,
              right: `${fmtPct(g.percent)} procured`,
            }))}
            color2={RPT.orange}
          />
          <Legend
            items={[
              { label: "Budget", color: `${RPT.blue}33` },
              { label: "Procured", color: RPT.orange },
            ]}
          />
        </div>
        {budget.upcoming?.length ? (
          <>
            <p style={{ fontWeight: 600, color: RPT.navy, marginBottom: 4 }}>Upcoming purchases</p>
            <Table
              cols={[
                { key: "description", label: "Item" },
                { key: "trade", label: "Trade" },
                { key: "supplier", label: "Supplier" },
                { key: "targetDate", label: "Target", render: (r) => fmtDate(r.targetDate) },
                { key: "amount", label: "Amount", num: true, render: (r) => fmtMoney(r.amount) },
              ]}
              rows={budget.upcoming}
            />
          </>
        ) : null}
      </Section>,
    );
  }

  const pageCount = pages.length + 1;
  return (
    <>
      <CoverPage
        kicker="Project Progress Report"
        title={meta.name}
        accent=""
        lede={`${meta.productLabel} project — progress, contract value, valuation and procurement status as at ${dayjs(meta.generatedAt).format("DD MMMM YYYY")}.`}
        metaPairs={[
          { label: "Project", value: meta.name },
          { label: "Product", value: meta.productLabel },
          { label: "Progress", value: fmtPct(f.progressPercent) },
          { label: "Project Value", value: fmtMoney(f.projectTotal) },
          { label: "Contract", value: f.contract.locked ? `Locked · ${fmtDate(f.contract.lockedAt)}` : "Not locked" },
          { label: "Prepared By", value: report.preparedBy?.name || report.preparedBy?.firm },
        ]}
        footLeft={report.preparedBy?.firm || "ADLM Studio"}
        footRight={`Generated ${dayjs(meta.generatedAt).format("DD MMM YYYY, HH:mm")}`}
      />
      {pages.map((content, i) => (
        <ReportPage
          key={i}
          docTitle={meta.name}
          docSub="Project Progress Report"
          pageNo={i + 2}
          pageCount={pageCount}
        >
          {content}
        </ReportPage>
      ))}
    </>
  );
}
