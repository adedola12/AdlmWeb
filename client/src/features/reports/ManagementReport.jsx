// features/reports/ManagementReport.jsx — the printable organization-wide
// portfolio report. Consumes the payload from GET /reports/management.
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
  StackedBar,
  Table,
  StatusPill,
  fmtMoney,
  fmtPct,
  fmtDate,
  paginateRows,
  RPT,
} from "./reportKit.jsx";

const PRODUCT_COLORS = [RPT.blue, RPT.orange, RPT.green, RPT.sky, "#7C8DB0", RPT.red, "#B9C4D6"];

export default function ManagementReport({ report }) {
  const t = report.totals || {};
  const dist = report.statusDistribution || {};
  const byProduct = (report.byProduct || []).map((p, i) => ({
    ...p,
    color: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
  }));

  const distParts = [
    { label: "Completed", value: dist.completed || 0, color: RPT.green },
    { label: "On track", value: dist.onTrack || 0, color: RPT.blue },
    { label: "At risk", value: dist.atRisk || 0, color: RPT.amber },
    { label: "Behind", value: dist.behind || 0, color: RPT.red },
    { label: "Not started", value: dist.notStarted || 0, color: RPT.slate },
  ];

  const projectChunks = paginateRows(report.projects || [], 18, 24);
  const pages = [];

  // ── Page: portfolio summary ──
  pages.push(
    <>
      <Section title="Portfolio Summary" k={`${t.projectCount ?? 0} projects across ${byProduct.length} products`}>
        <KpiRow
          items={[
            { label: "Portfolio Value", value: fmtMoney(t.portfolioValue, { compact: true }), sub: t.moneyPartial ? "Excludes masked shared projects" : undefined },
            { label: "Work Done", value: fmtMoney(t.earnedValue, { compact: true }), sub: `${fmtPct(t.portfolioProgressPercent)} of portfolio`, tone: "good" },
            { label: "Actual Cost", value: fmtMoney(t.actualCost, { compact: true }) },
            { label: "Projects", value: t.projectCount ?? 0, sub: `${t.ownedCount ?? 0} owned · ${t.sharedCount ?? 0} shared` },
          ]}
        />
        <div style={{ height: 10 }} />
        <KpiRow
          items={[
            { label: "Tasks", value: `${t.completedTasks ?? 0}/${t.totalTasks ?? 0}`, sub: "completed / total" },
            { label: "Overdue Tasks", value: t.overdueTasks ?? 0, tone: (t.overdueTasks ?? 0) > 0 ? "bad" : "good" },
            { label: "Open Risks", value: t.openRisks ?? 0, tone: (t.openRisks ?? 0) > 0 ? "accent" : "good" },
            { label: "Open Issues", value: t.openIssues ?? 0, tone: (t.openIssues ?? 0) > 0 ? "bad" : "good" },
          ]}
        />
      </Section>
      <Section title="Project Health" k="Schedule-performance distribution across the portfolio">
        <div className="chart-card">
          <StackedBar parts={distParts} />
        </div>
      </Section>
      {byProduct.length ? (
        <Section title="By Product" k="Where the portfolio value sits">
          <div className="chart-grid" style={{ gridTemplateColumns: "1fr 1.3fr" }}>
            <div className="chart-card">
              <div className="t">Value share</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Donut
                  segments={byProduct.map((p) => ({ label: p.label, value: p.value, color: p.color }))}
                  centerLabel={fmtMoney(t.portfolioValue, { compact: true })}
                  centerSub="portfolio"
                  size={140}
                />
              </div>
              <Legend items={byProduct.map((p) => ({ label: `${p.label} (${p.count})`, color: p.color }))} />
            </div>
            <div className="chart-card">
              <div className="t">Progress per product</div>
              <HBars
                rows={byProduct.map((p) => ({
                  label: p.label,
                  value: p.value,
                  value2: p.earned,
                  right: `${fmtMoney(p.earned, { compact: true })} / ${fmtMoney(p.value, { compact: true })} · ${fmtPct(p.percent)}`,
                }))}
              />
              <Legend
                items={[
                  { label: "Portfolio value", color: `${RPT.blue}33` },
                  { label: "Work done", color: RPT.green },
                ]}
              />
            </div>
          </div>
        </Section>
      ) : null}
    </>,
  );

  // ── Page(s): project register ──
  projectChunks.forEach((chunk, ci) => {
    pages.push(
      <Section
        title={ci === 0 ? "Project Register" : "Project Register (continued)"}
        k={ci === 0 ? "Every project, highest value first" : undefined}
      >
        <Table
          cols={[
            { key: "name", label: "Project", render: (r) => <b>{r.name}</b> },
            { key: "productLabel", label: "Product" },
            { key: "value", label: "Value", num: true, render: (r) => (r.moneyMasked ? "Masked" : fmtMoney(r.value, { compact: true })) },
            { key: "progressPercent", label: "Progress", num: true, render: (r) => fmtPct(r.progressPercent) },
            { key: "spi", label: "SPI", num: true, render: (r) => (r.spi == null ? "—" : r.spi.toFixed(2)) },
            { key: "overdueCount", label: "Overdue", num: true },
            { key: "openRisks", label: "Risks", num: true },
            { key: "openIssues", label: "Issues", num: true },
            { key: "updatedAt", label: "Updated", render: (r) => fmtDate(r.updatedAt) },
            { key: "role", label: "Access", render: (r) => <StatusPill value={r.role === "owner" ? "owner" : "shared"} /> },
          ]}
          rows={chunk}
        />
      </Section>,
    );
  });

  const pageCount = pages.length + 1;
  const orgName = report.organization?.name || report.organization?.preparedBy || "Organization";
  return (
    <>
      <CoverPage
        kicker="Management Report"
        title={orgName}
        accent="Portfolio"
        lede={`Organization-wide progress across ${t.projectCount ?? 0} projects — value, schedule health, risks and issues as at ${dayjs(report.generatedAt).format("DD MMMM YYYY")}.`}
        metaPairs={[
          { label: "Organization", value: orgName },
          { label: "Projects", value: `${t.projectCount ?? 0}` },
          { label: "Portfolio Value", value: fmtMoney(t.portfolioValue) },
          { label: "Portfolio Progress", value: fmtPct(t.portfolioProgressPercent) },
          { label: "Open Risks / Issues", value: `${t.openRisks ?? 0} / ${t.openIssues ?? 0}` },
          { label: "Prepared By", value: report.organization?.preparedBy },
        ]}
        footLeft={report.organization?.email || "ADLM Studio"}
        footRight={`Generated ${dayjs(report.generatedAt).format("DD MMM YYYY, HH:mm")}`}
      />
      {pages.map((content, i) => (
        <ReportPage
          key={i}
          docTitle={orgName}
          docSub="Management Report"
          pageNo={i + 2}
          pageCount={pageCount}
        >
          {content}
        </ReportPage>
      ))}
    </>
  );
}
