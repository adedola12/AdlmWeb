// features/reports/PmReport.jsx — the printable Schedule & Earned-Value
// (PM) report. Consumes the payload from GET /reports/pm/:productKey/:id.
import React from "react";
import dayjs from "dayjs";
import {
  ReportPage,
  CoverPage,
  Section,
  KpiRow,
  Donut,
  Legend,
  LineChart,
  StackedBar,
  Table,
  StatusPill,
  fmtMoney,
  fmtPct,
  fmtDate,
  paginateRows,
  RPT,
  STATUS_COLORS,
} from "./reportKit.jsx";

export default function PmReport({ report }) {
  const meta = report.meta;
  const h = report.headline || {};
  const t = report.totals || {};
  const buckets = report.buckets || {};

  const evRows = [
    { k: "Budget at Completion (BAC)", v: t.BAC, note: t.contractLocked ? "Contract locked" : "Live BoQ value" },
    { k: "Planned Value (PV)", v: t.PV, note: "Baseline cost due by today" },
    { k: "Earned Value (EV)", v: t.EV, note: "Value of work done" },
    { k: "Actual Cost (AC)", v: t.AC, note: "Recorded actuals" },
    { k: "Estimate at Completion (EAC)", v: t.EAC, note: "BAC ÷ CPI" },
    { k: "Variance at Completion (VAC)", v: t.VAC, note: t.VAC >= 0 ? "Projected saving" : "Projected overrun" },
  ];

  const bucketSegments = [
    { label: "Completed", value: buckets.completed || 0, color: STATUS_COLORS.completed },
    { label: "In progress", value: buckets.inProgress || 0, color: STATUS_COLORS.inProgress },
    { label: "Not started", value: buckets.notStarted || 0, color: STATUS_COLORS.notStarted },
    { label: "Blocked", value: buckets.blocked || 0, color: STATUS_COLORS.blocked },
  ];

  const prio = report.tasksByPriority || {};
  const prioParts = [
    { label: "Critical", value: prio.critical || 0, color: RPT.red },
    { label: "High", value: prio.high || 0, color: RPT.orange },
    { label: "Medium", value: prio.medium || 0, color: RPT.blue },
    { label: "Low", value: prio.low || 0, color: RPT.slate },
  ];

  const burndown = report.burndown || [];
  const taskChunks = paginateRows(report.tasks || [], 22, 26);
  const openRisks = (report.risks || []).filter((r) => r.status !== "closed");
  const openIssues = (report.issues || []).filter((i) => i.status !== "closed" && i.status !== "resolved");

  const pages = [];

  // ── Page: EVM summary + burndown ──
  pages.push(
    <>
      <Section title="Performance Summary" k={`Earned-value status as at ${dayjs(report.headlineAsOf || meta.generatedAt).format("DD MMMM YYYY")}`}>
        <KpiRow
          items={[
            { label: "Progress", value: fmtPct(h.progressPercent), tone: "accent" },
            { label: "Budget Used", value: fmtPct(h.budgetUsedPercent) },
            { label: "CPI", value: (h.CPI ?? 0).toFixed(2), tone: h.CPI >= 1 ? "good" : "bad", sub: h.CPI >= 1 ? "Under budget" : "Over budget" },
            { label: "SPI", value: (h.SPI ?? 0).toFixed(2), tone: h.SPI >= 1 ? "good" : "bad", sub: h.SPI >= 1 ? "Ahead of schedule" : "Behind schedule" },
            { label: "Overdue", value: h.overdueCount ?? 0, tone: h.overdueCount > 0 ? "bad" : "good" },
            { label: "Tasks Done", value: fmtPct(h.tasksDonePercent) },
          ]}
        />
      </Section>
      <Section title="Earned Value Analysis" k="BAC · PV · EV · AC · EAC · VAC">
        <Table
          cols={[
            { key: "k", label: "Metric" },
            { key: "note", label: "Meaning" },
            { key: "v", label: "Amount", num: true, render: (r) => fmtMoney(r.v) },
          ]}
          rows={evRows}
        />
      </Section>
      {burndown.length >= 2 ? (
        <Section title="Burndown" k={`Planned vs actual remaining value — ${report.burndownStatus || ""}`}>
          <div className="chart-card">
            <LineChart
              labels={burndown.map((b) => dayjs(b.date).format("DD MMM"))}
              series={[
                { name: "Planned remaining", color: RPT.slate, dash: true, points: burndown.map((b) => b.plannedRemaining ?? 0) },
                { name: "Actual remaining", color: RPT.orange, points: burndown.map((b) => b.actualRemaining ?? 0) },
              ]}
            />
            <Legend
              items={[
                { label: "Planned remaining", color: RPT.slate },
                { label: "Actual remaining", color: RPT.orange },
              ]}
            />
          </div>
        </Section>
      ) : null}
    </>,
  );

  // ── Page: task distribution + coverage + risk/issue counters ──
  pages.push(
    <>
      <Section title="Task Status" k={`${t.totalTasks ?? 0} tasks in the work breakdown structure`}>
        <div className="chart-grid">
          <div className="chart-card">
            <div className="t">By status</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Donut
                segments={bucketSegments}
                centerLabel={`${t.completedTasks ?? 0}/${t.totalTasks ?? 0}`}
                centerSub="tasks complete"
              />
            </div>
            <Legend items={bucketSegments.map((s) => ({ label: `${s.label} (${s.value})`, color: s.color }))} />
          </div>
          <div className="chart-card">
            <div className="t">By priority</div>
            <div style={{ paddingTop: 26 }}>
              <StackedBar parts={prioParts} />
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="t">Critical path</div>
              <p style={{ fontSize: 11 }}>
                {report.criticalPathTotal ?? 0} tasks on the critical path,{" "}
                <b>{report.criticalPathPending ?? 0} still pending</b>.
              </p>
            </div>
          </div>
        </div>
      </Section>
      {report.boqCoverage ? (
        <Section title="BoQ ↔ Schedule Coverage" k="How much of the bill value the WBS executes">
          <KpiRow
            items={[
              { label: "Coverage", value: fmtPct(report.boqCoverage.coveragePercent), tone: report.boqCoverage.coveragePercent >= 95 ? "good" : "accent" },
              { label: "Linked Value", value: fmtMoney(report.boqCoverage.linkedAmount, { compact: true }) },
              { label: "Unlinked Value", value: fmtMoney(report.boqCoverage.unlinkedAmount, { compact: true }), tone: report.boqCoverage.unlinkedAmount > 0 ? "bad" : "good", sub: `${report.boqCoverage.unlinkedCount ?? 0} lines` },
            ]}
          />
        </Section>
      ) : null}
      <Section title="Risks & Issues" k="Open exposure at a glance">
        <KpiRow
          items={[
            { label: "Open Risks", value: t.openRisks ?? 0, tone: (t.openRisks ?? 0) > 0 ? "accent" : "good" },
            { label: "Open Issues", value: t.openIssues ?? 0, tone: (t.openIssues ?? 0) > 0 ? "bad" : "good" },
            { label: "Blocked Tasks", value: t.blockedTasks ?? 0, tone: (t.blockedTasks ?? 0) > 0 ? "bad" : "good" },
          ]}
        />
      </Section>
    </>,
  );

  // ── Page(s): task schedule table ──
  taskChunks.forEach((chunk, ci) => {
    pages.push(
      <Section
        title={ci === 0 ? "Work Breakdown & Schedule" : "Work Breakdown & Schedule (continued)"}
        k={ci === 0 ? `Top ${report.tasks.length} of ${report.taskCountTotal} work tasks — overdue first, then by value` : undefined}
      >
        <Table
          cols={[
            { key: "wbs", label: "WBS", width: "8%" },
            { key: "name", label: "Task", render: (r) => <span>{r.criticalPath ? <b>{r.name}</b> : r.name}{r.isMilestone ? " ◆" : ""}</span> },
            { key: "startDate", label: "Start", render: (r) => fmtDate(r.startDate) },
            { key: "endDate", label: "Finish", render: (r) => fmtDate(r.endDate) },
            { key: "percentComplete", label: "%", num: true, render: (r) => fmtPct(r.percentComplete, 0) },
            { key: "earnedValue", label: "Earned", num: true, render: (r) => fmtMoney(r.earnedValue, { compact: true }) },
            { key: "status", label: "Status", render: (r) => <StatusPill value={r.isOverdue ? "overdue" : r.status} /> },
          ]}
          rows={chunk}
        />
      </Section>,
    );
  });

  // ── Page: risk & issue registers ──
  if (openRisks.length || openIssues.length) {
    pages.push(
      <>
        {openRisks.length ? (
          <Section title="Risk Register" k={`${openRisks.length} open / mitigating risks`}>
            <Table
              cols={[
                { key: "title", label: "Risk" },
                { key: "probability", label: "Probability", render: (r) => <StatusPill value={r.probability} /> },
                { key: "impact", label: "Impact", render: (r) => <StatusPill value={r.impact} /> },
                { key: "owner", label: "Owner" },
                { key: "mitigation", label: "Mitigation" },
                { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              ]}
              rows={openRisks.slice(0, 12)}
            />
          </Section>
        ) : null}
        {openIssues.length ? (
          <Section title="Issue Log" k={`${openIssues.length} open issues`}>
            <Table
              cols={[
                { key: "title", label: "Issue" },
                { key: "severity", label: "Severity", render: (r) => <StatusPill value={r.severity} /> },
                { key: "owner", label: "Owner" },
                { key: "openedAt", label: "Opened", render: (r) => fmtDate(r.openedAt) },
                { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              ]}
              rows={openIssues.slice(0, 12)}
            />
          </Section>
        ) : null}
      </>,
    );
  }

  const pageCount = pages.length + 1;
  return (
    <>
      <CoverPage
        kicker="Project Management Report"
        title={meta.name}
        lede={`Schedule and earned-value performance for this ${meta.productLabel} project as at ${dayjs(meta.generatedAt).format("DD MMMM YYYY")}.`}
        metaPairs={[
          { label: "Project", value: meta.name },
          { label: "Schedule", value: report.projectStart ? `${fmtDate(report.projectStart)} → ${fmtDate(report.projectFinish)}` : "—" },
          { label: "Progress", value: fmtPct(h.progressPercent) },
          { label: "CPI / SPI", value: `${(h.CPI ?? 0).toFixed(2)} / ${(h.SPI ?? 0).toFixed(2)}` },
          { label: "BAC", value: fmtMoney(t.BAC) },
          { label: "Prepared By", value: report.preparedBy?.name || report.preparedBy?.firm },
        ]}
        footLeft={report.preparedBy?.firm || "ADLM Studio"}
        footRight={`Generated ${dayjs(meta.generatedAt).format("DD MMM YYYY, HH:mm")}`}
      />
      {pages.map((content, i) => (
        <ReportPage
          key={i}
          docTitle={meta.name}
          docSub="Project Management Report"
          pageNo={i + 2}
          pageCount={pageCount}
        >
          {content}
        </ReportPage>
      ))}
    </>
  );
}
