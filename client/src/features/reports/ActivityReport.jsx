// features/reports/ActivityReport.jsx — printable project activity log.
// Consumes the payload from GET /me/activity/report.
import React from "react";
import dayjs from "dayjs";
import {
  ReportPage,
  CoverPage,
  Section,
  KpiRow,
  Table,
  StatusPill,
  fmtDate,
  paginateRows,
  RPT,
} from "./reportKit.jsx";

const CATEGORY_LABELS = {
  project: "Projects",
  contract: "Contract",
  commercial: "Rates & Variations",
  valuation: "Valuation",
  collaboration: "Collaboration",
  model: "3D Models",
  pm: "Schedule (PM)",
  other: "Other",
};

function catLabel(c) {
  return CATEGORY_LABELS[c] || (c ? c[0].toUpperCase() + c.slice(1) : "Other");
}

function actorLabel(it) {
  const who = it.actorName || it.actorEmail || "You";
  return it.byCollaborator ? `${who} (collaborator)` : who;
}

export default function ActivityReport({ report }) {
  const items = report.items || [];
  const byCategory = report.byCategory || [];

  // First page carries the summary, so it holds fewer rows.
  const chunks = paginateRows(items, 20, 30);
  const pageCount = chunks.length + 1;

  const orgName = report.user?.firm || report.user?.name || "Activity Log";

  return (
    <>
      <CoverPage
        kicker="Project Activity Report"
        title={report.user?.name || "Activity Log"}
        accent="Log"
        lede={`A record of every logged action across your projects — creations, contract locks, variations, rate changes, collaborator activity, models and schedule — as at ${dayjs(report.generatedAt).format("DD MMMM YYYY")}.`}
        metaPairs={[
          { label: "Account", value: report.user?.name || report.user?.email },
          { label: "Organization", value: report.user?.firm || "—" },
          { label: "Total Events", value: String(report.total ?? items.length) },
          { label: "Shown", value: String(items.length) },
          { label: "Categories", value: String(byCategory.length) },
          { label: "Generated", value: dayjs(report.generatedAt).format("DD MMM YYYY") },
        ]}
        footLeft={report.user?.email || "ADLM Studio"}
        footRight={`Generated ${dayjs(report.generatedAt).format("DD MMM YYYY, HH:mm")}`}
      />

      {chunks.map((chunk, ci) => (
        <ReportPage
          key={ci}
          docTitle={orgName}
          docSub="Project Activity Report"
          pageNo={ci + 2}
          pageCount={pageCount}
        >
          {ci === 0 && (
            <Section title="Summary" k="Logged activity by category">
              <KpiRow
                items={[
                  { label: "Total Events", value: report.total ?? items.length, tone: "accent" },
                  ...byCategory.slice(0, 4).map((c) => ({
                    label: catLabel(c.category),
                    value: c.count,
                  })),
                ]}
              />
            </Section>
          )}
          <Section
            title={ci === 0 ? "Activity Timeline" : "Activity Timeline (continued)"}
            k={ci === 0 ? `Most recent first · showing ${items.length} of ${report.total ?? items.length}` : undefined}
          >
            <Table
              cols={[
                {
                  key: "createdAt",
                  label: "When",
                  render: (r) => dayjs(r.createdAt).format("DD MMM YYYY HH:mm"),
                },
                { key: "category", label: "Type", render: (r) => <StatusPill value={r.category} /> },
                { key: "summary", label: "Activity", render: (r) => r.summary },
                { key: "projectName", label: "Project", render: (r) => r.projectName || "—" },
                { key: "actor", label: "By", render: (r) => actorLabel(r) },
              ]}
              rows={chunk}
            />
          </Section>
          {report.total > items.length && ci === chunks.length - 1 ? (
            <p style={{ fontSize: 10, color: RPT.muted, marginTop: 8 }}>
              This report shows the {items.length} most recent events. Your full history of{" "}
              {report.total} events is available in Profile → Project Activity.
            </p>
          ) : null}
        </ReportPage>
      ))}
    </>
  );
}
