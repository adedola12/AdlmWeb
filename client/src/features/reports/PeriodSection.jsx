// features/reports/PeriodSection.jsx — "This period", the page a report gains
// when it was asked for a date range (?from=&to=, see routes/reports.js and
// server/services/reportPeriod.js). The rest of the report is still "as at
// today"; this page is only what moved inside the window.
import React from "react";
import { Section, KpiRow, Table, fmtMoney, fmtDate } from "./reportKit.jsx";

const EN_DASH = "–";

/** "1 Sep 2026 – 30 Sep 2026", from the Lagos days the server echoes back. */
function periodTitle(period) {
  const a = period?.fromDay ? fmtDate(`${period.fromDay}T12:00:00Z`) : "";
  const b = period?.toDay ? fmtDate(`${period.toDay}T12:00:00Z`) : "";
  if (!a && !b) return EN_DASH;
  return `${a || "Start"} to ${b || "today"}`;
}

export default function PeriodSection({ period }) {
  if (!period) return null;
  const masked = Boolean(period.moneyMasked);
  const money = (v) => (masked ? EN_DASH : fmtMoney(v, { compact: true }));
  const p = period.progress || {};
  const a = period.actuals || {};
  const c = period.certificates || {};
  const v = period.variations || {};
  const pr = period.procurement || {};
  const g = period.programme || {};
  const act = period.activity || {};

  if (period.quiet) {
    return (
      <Section title="This Period" k={periodTitle(period)}>
        <p>Nothing was recorded on this project in this period.</p>
      </Section>
    );
  }

  return (
    <Section title="This Period" k={periodTitle(period)}>
      <div style={{ marginBottom: 12 }}>
        <KpiRow
          items={[
            { label: "Work Valued", value: money(p.net), sub: `${p.events || 0} updates on ${p.linesMoved || 0} lines` },
            { label: "Certified", value: money(c.certified), sub: `${(c.list || []).length} certificates` },
            { label: "Procured", value: money(pr.value), sub: `${pr.lines || 0} budget lines` },
            {
              label: "Actual vs Planned",
              value: a.lines ? money(a.variance) : EN_DASH,
              tone: a.variance > 0 ? "bad" : "good",
              sub: a.lines ? `${a.lines} lines recorded` : "No actuals recorded",
            },
          ]}
        />
      </div>
      <Table
        cols={[
          { key: "k", label: "Heading" },
          { key: "v", label: "In this period" },
        ]}
        rows={[
          { k: "Lines completed", v: `${p.completedLines || 0} (${money(p.completedValue)})` },
          { k: "Value wound back", v: money(p.reversed) },
          { k: "Variations raised", v: `${v.raised || 0} (${money(v.raisedValue)})` },
          { k: "Variations approved / rejected", v: `${v.approved || 0} / ${v.rejected || 0}` },
          { k: "Tasks finished", v: String(g.finished || 0) },
          {
            k: "Tasks due but not finished",
            v: `${g.dueNotDone || 0}${g.dueNotDoneNames?.length ? `: ${g.dueNotDoneNames.join(", ")}` : ""}`,
          },
          { k: "Risks raised", v: String(g.risksRaised || 0) },
          { k: "Issues opened / resolved", v: `${g.issuesOpened || 0} / ${g.issuesResolved || 0}` },
          { k: "Activity log entries", v: String(act.total || 0) },
        ]}
      />
      {act.recent?.length ? (
        <div style={{ marginTop: 12 }}>
          <Table
            cols={[
              { key: "at", label: "Date", render: (r) => fmtDate(r.at) },
              { key: "summary", label: "Activity" },
              { key: "by", label: "By", render: (r) => r.by || EN_DASH },
            ]}
            rows={act.recent.slice(0, 12)}
          />
        </div>
      ) : null}
    </Section>
  );
}
