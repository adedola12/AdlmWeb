// His Work overview, on real projects.
//
// Rebuilt 17 Sep 2026 (S18/WH-01 to WH-13) from work-home.js. The Cards /
// Register pair is gone: this is ONE dashboard, read top to bottom in the
// order a working day runs.
//
//   1  Headline figures     measured work, certified, work to price, decisions
//   2  Needs a decision     one table; every row opens where it is resolved
//   3  Continue             back to the exact tab each project was left on
//   4  Projects             source, stage, priced, complete, measured, certified
//   5  Valuations and variations
//   6  Programme            overdue, due within a fortnight, or under way
//   7  RateGen              rates changed recently, and where they are used
//   8  Learning             assignments due
//
// The line in his brief that decides this screen: Work is organised BY
// PROJECT, NOT BY PRODUCT. Once data is extracted it stops belonging to one
// tool — a Revit extraction gives quantities, RateGen prices them, that becomes
// a valuation, Time Pro schedules against it. So this answers "what am I in the
// middle of", where Manage answers "what am I paying for". That is also why
// the "Your work, by product" cards are gone: products live in the My tools
// rail and the tool pages.
//
// Where his figures and ours differ, ours win and the label says what ours
// really is:
//
//   Estimated    his sums a full estimate, including preliminaries and linked
//                services. Ours is the rollup's qty x rate — measured work
//                only — so the tile reads "Measured work", not "Estimated".
//   Certified    the cumulative value of the highest APPROVED or PAID
//                certificate. Certificates carry value-to-date, so they are
//                never added together.
//   Awaiting     we store draft / approved / paid and no "awaiting approval",
//                so the decision row says a certificate is a draft.
//   Model drift  we keep no model versions, so his "Model vN changed N
//                quantities" row has no honest counterpart and is left out.
//
// Two decision kinds are ours rather than his, and both are real: a bill
// nobody has opened in three months, and a product on the plan that is not
// installed on this machine.
//
// His location switch stays in the header as a profile control. It does NOT
// re-price the portfolio: our rates are stored already priced to a zone, and
// a re-price is a server job, so nothing here claims the figures move when it
// changes.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import WkPrefs from "./WkPrefs.jsx";
// His work-proj.css carries every .oh-* rule this screen uses. Only the
// project gallery imported it, so a cold load of /work had no dashboard styles.
import "../styles/ds-work-proj.css";
import { FaChevronRight } from "../components/icons.jsx";
import { foldMaterials, normaliseRollup, projectWorkspaceHref } from "../lib/projectLinks.js";
import { placeHref, readPlaces } from "../lib/lastPlace.js";
import {
  SOURCES,
  STAGES,
  compact,
  isMoneyHidden,
  short,
  sourceOf,
  stageOf,
} from "../lib/projectGallery.js";
import { anchorOf, niceDate } from "../lib/assignments.js";
import {
  buildDecisions,
  decisionsNote,
  headline,
  pickNextLesson,
  projectTabHref,
  taskState,
} from "../lib/workOverview.js";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

/** An empty value is an en dash. Never a zero somebody could mistake for one. */
const DASH = "–";

/** The products that actually install, for the "not installed here" row. */
const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
};

const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

const Bar = ({ value, tone }) => (
  <span className={tone ? `oh-bar ${tone}` : "oh-bar"}>
    <i style={{ width: `${pct(value)}%` }} />
  </span>
);

const SourceMark = ({ p }) => {
  const s = SOURCES[sourceOf(p)];
  return (
    <span className="oh-src">
      {s?.icon ? <img src={s.icon} alt="" /> : null}
      {s?.name || sourceOf(p) || DASH}
    </span>
  );
};

/** His panel: section.oh-panel > header > div > h2 + span, with an optional link. */
function Panel({ id, title, sub, more, className, children }) {
  return (
    <section className={className ? `oh-panel ${className}` : "oh-panel"} id={id}>
      <header>
        <div>
          <h2>{title}</h2>
          {sub ? <span>{sub}</span> : null}
        </div>
        {more ? (
          <Link className="more" to={more[1]}>
            {more[0]}
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/**
 * His table, including the leading ">" that right-aligns a column.
 * `state` carries a panel's own loading or failure line, so one failed call
 * never blanks the dashboard.
 */
function OhTable({ head, rows, empty, state }) {
  if (state) return <p className="oh-empty">{state}</p>;
  if (!rows.length) return <p className="oh-empty">{empty}</p>;
  return (
    <div className="oh-scroll">
      <table className="oh-t">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={h.startsWith(">") ? "n" : undefined}>
                {h.replace(/^>/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/** The project cell every table shares: icon, name, link back to the work. */
const ProjectCell = ({ p, tab, bold }) => (
  <Link className={bold ? "oh-p b" : "oh-p"} to={projectTabHref(p, tab)}>
    {SOURCES[sourceOf(p)]?.icon ? <img src={SOURCES[sourceOf(p)].icon} alt="" /> : null}
    {p.name || "Untitled project"}
  </Link>
);

/** The certificate and variation pills, on his .pj-stage v-* classes. */
const CERT_PILL = {
  draft: ["v-awaiting", "Draft"],
  approved: ["v-approved", "Approved"],
  paid: ["v-approved", "Paid"],
};
const VAR_PILL = {
  approved: ["v-approved", "Approved"],
  pending: ["v-awaiting", "Pending"],
  rejected: ["v-rejected", "Rejected"],
};

const stageName = (p) => STAGES.find((s) => s.id === stageOf(p))?.name || "";

/** How many lines a project actually has to price: the ones with a quantity. */
const measurable = (p) => (Number(p.pricedCount) || 0) + (Number(p.unpricedCount) || 0);

export default function DsWorkHome() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = React.useState(null);
  const [summary, setSummary] = React.useState(null);
  const [overview, setOverview] = React.useState(null);
  const [overviewFailed, setOverviewFailed] = React.useState(false);
  const [rates, setRates] = React.useState(null);
  const [ratesFailed, setRatesFailed] = React.useState(false);
  const [summaryFailed, setSummaryFailed] = React.useState(false);
  const [assignments, setAssignments] = React.useState(null);
  const [assignmentsFailed, setAssignmentsFailed] = React.useState(false);
  const [courses, setCourses] = React.useState(null);
  const [coursesFailed, setCoursesFailed] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Merged contracts' own certificates, which no project row carries.
  const [mergedContracts, setMergedContracts] = React.useState([]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    // Five independent reads, in parallel. Only the rollup can take the page
    // down; every other panel carries its own failure.
    apiAuthed("/me/projects-rollup", { token: accessToken })
      .then((d) => {
        if (!alive) return;
        setMergedContracts(Array.isArray(d.mergedContracts) ? d.mergedContracts : []);
        setProjects(foldMaterials(normaliseRollup(d.projects)));
      })
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/work-overview", { token: accessToken })
      .then((d) => alive && setOverview(d))
      .catch(() => alive && setOverviewFailed(true));

    // What is installed on this machine, which is one of the six kinds of
    // decision. A failure here used to be swallowed, and the decision total
    // simply came out a row short.
    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setSummaryFailed(true));

    apiAuthed("/rategen-v2/library/custom-rates", { token: accessToken })
      .then((d) => alive && setRates(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setRatesFailed(true));

    apiAuthed("/me/courses/assignments", { token: accessToken })
      .then((d) => alive && setAssignments(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setAssignmentsFailed(true));

    // The next lesson. An empty list used to stand in for a failed call, so a
    // dead courses read looked exactly like somebody enrolled on nothing.
    apiAuthed("/me/courses", { token: accessToken })
      .then((d) => alive && setCourses(Array.isArray(d) ? d : []))
      .catch(() => alive && setCoursesFailed(true));

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const kpi = React.useMemo(
    () => (projects ? headline(projects, mergedContracts) : null),
    [projects, mergedContracts],
  );

  const decisions = React.useMemo(
    () =>
      buildDecisions({
        projects: projects || [],
        overview,
        overviewFailed,
        summary,
        summaryFailed,
        // Asked for, and no answer yet: the install row is unknown rather
        // than absent, exactly as the overview's three kinds are.
        summaryPending: !summary && !summaryFailed,
        products: PRODUCT,
        cap: 8,
      }),
    [projects, overview, overviewFailed, summary, summaryFailed],
  );

  // Where this browser remembers being, filtered to projects still on the
  // account, topped up with the most recently touched ones. The top-up rows
  // say "Recently updated" rather than naming a tab nobody was on.
  const continues = React.useMemo(() => {
    if (!projects) return [];
    const byKey = new Map();
    for (const p of projects) {
      byKey.set(String(p.id), p);
      if (p.slug) byKey.set(String(p.slug), p);
    }
    const rows = [];
    const used = new Set();
    for (const pl of readPlaces()) {
      const hit = byKey.get(String(pl.key));
      if (!hit || used.has(String(hit.id))) continue;
      used.add(String(hit.id));
      rows.push({ project: hit, href: placeHref(pl), eyebrow: pl.tabLabel || "Project", tab: pl.tab });
      if (rows.length >= 3) break;
    }
    for (const p of projects) {
      if (rows.length >= 3) break;
      if (used.has(String(p.id))) continue;
      used.add(String(p.id));
      rows.push({
        project: p,
        href: projectWorkspaceHref(p),
        eyebrow: "Recently updated",
        tab: "",
      });
    }
    return rows;
  }, [projects]);

  const lesson = React.useMemo(() => (courses ? pickNextLesson(courses) : null), [courses]);

  // His merged "money in motion" list: certificates and variations together,
  // newest first. Both are read exactly as stored.
  const inMotion = React.useMemo(() => {
    const rows = [];
    for (const c of overview?.certificates || []) {
      rows.push({ at: c.date, kind: "cert", row: c });
    }
    for (const v of overview?.variations || []) {
      rows.push({ at: v.issuedAt, kind: "var", row: v });
    }
    return rows
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
      .slice(0, 6);
  }, [overview]);

  const rateUsage = React.useMemo(() => {
    const m = new Map();
    for (const u of overview?.rateUsage || []) m.set(u.key, u.lines);
    return m;
  }, [overview]);

  const recentRates = React.useMemo(
    () =>
      [...(rates || [])]
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        .slice(0, 5),
    [rates],
  );

  const dueAssignments = React.useMemo(
    () =>
      (assignments || [])
        .filter((a) => ["overdue", "due-soon", "todo"].includes(a.state))
        .sort((a, b) => {
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt) - new Date(b.dueAt);
        })
        .slice(0, 6),
    [assignments],
  );

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Your work could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!projects || !kpi) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading your work…</p>
      </div>
    );
  }

  const loading = overview === null && !overviewFailed ? "Loading…" : null;
  const moneyState = overviewFailed ? "That could not be loaded just now." : loading;

  // Projects whose money this reader may not see are left out of every total
  // above, and the tiles say so rather than quietly under-reporting.
  const withheldNote = kpi.hidden
    ? ` · ${num(kpi.hidden)} shared project${kpi.hidden === 1 ? "" : "s"}, money hidden, not counted`
    : "";

  // Which of the two calls behind "Needs a decision" could not be counted.
  const decisionsFailed = decisions.missing.failed.length > 0;
  const decisionsSub = decisionsNote(decisions.missing);

  const ratesPanel = (
    <Panel
      title="RateGen"
      // Where a rate is used comes from the overview, not from the rate
      // library. If that call did not come back, the Used column is unknown —
      // and an unknown must not read as "on no bill lines".
      sub={
        overviewFailed
          ? "Recently changed rates · where they are used could not be loaded"
          : overview === null
            ? "Recently changed rates · checking where they are used"
            : "Recently changed rates"
      }
      more={["Open RateGen", "/work/library"]}
    >
      <OhTable
        head={["Rate", ">Rate", ">Used", ">Changed"]}
        empty="No rates of your own yet."
        state={ratesFailed ? "Your rates could not be loaded just now." : rates === null ? "Loading…" : null}
        rows={recentRates.map((r) => {
          const used = rateUsage.get(r.description) ?? rateUsage.get(r.title);
          return (
            <tr key={r.id}>
              <td className="tw">
                <Link className="oh-p b" to={`/work/rate/${encodeURIComponent(r.id)}`}>
                  {r.title || r.description || "Untitled rate"}
                </Link>
                {r.sectionLabel ? <em>{r.sectionLabel}</em> : null}
              </td>
              <td className="n">
                {money(r.totalCost)}
                {r.unit ? <em>per {r.unit}</em> : null}
              </td>
              <td className="n">{used ? `${num(used)} line${used === 1 ? "" : "s"}` : DASH}</td>
              <td className="n mute">{short(r.updatedAt)}</td>
            </tr>
          );
        })}
      />
    </Panel>
  );

  const learningPanel = (
    <Panel title="Learning" sub="Assignments due" more={["My learning", "/dash-learning"]}>
      <OhTable
        head={["Assignment", "Due", ">"]}
        empty="No assignments due."
        state={
          assignmentsFailed
            ? "Your assignments could not be loaded just now."
            : assignments === null
              ? "Loading…"
              : null
        }
        rows={dueAssignments.map((a) => (
          <tr key={anchorOf(a)} className={a.state === "overdue" ? "urgent" : undefined}>
            <td className="tw">
              {a.moduleTitle}
              <em>{a.courseTitle}</em>
            </td>
            <td className={a.state === "overdue" ? "oh-late" : undefined}>
              {a.dueAt ? niceDate(a.dueAt) : "No deadline"}
            </td>
            <td className="n">
              <Link className="oh-go" to={`/dash-assignments#${anchorOf(a)}`}>
                Open
                <FaChevronRight />
              </Link>
            </td>
          </tr>
        ))}
      />
    </Panel>
  );

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Your work</h1>
          <p>
            What needs you today, then everything in hand: projects, money, programme and rates.
          </p>
        </div>
        <div className="wk-acts">
          {/* His zone and currency dropdowns. Both are profile settings, so
              they read and write the account rather than this screen. */}
          <WkPrefs />
        </div>
      </div>

      {kpi.count === 0 ? (
        <>
          <section className="oh-panel wide">
            <p className="oh-empty">
              Nothing here yet. A project appears the moment one of the plugins sends its first
              extraction up: measure in QUIV or HERON, price it in RateGen, and it shows here with
              what it is worth.
            </p>
            <div style={{ display: "flex", gap: 10, padding: "0 18px 18px", flexWrap: "wrap" }}>
              <Link className="ds-btn btn-p ds-btn-sm" to="/manage/downloads">
                Install the plugins
              </Link>
              <Link className="ds-btn btn-o ds-btn-sm" to="/rategen">
                Open the rate library
              </Link>
            </div>
          </section>
          <div className="oh-two">
            {ratesPanel}
            {learningPanel}
          </div>
        </>
      ) : (
        <>
          {/* 1 — headline figures */}
          <div className="oh-kpis">
            <Link to="/work/projects">
              <span>Measured work, all projects</span>
              {/* Money the reader may not see is not in this sum, and with
                  every project withheld there is no sum to show at all. */}
              <b>{kpi.counted ? compact(kpi.measured) : DASH}</b>
              <em>
                {kpi.counted
                  ? `${num(kpi.counted)} project${kpi.counted === 1 ? "" : "s"} at the rates they were priced with`
                  : "Nothing here can be totalled"}
                {withheldNote}
              </em>
            </Link>
            <Link to="/work/projects">
              <span>Certified to date</span>
              <b>{kpi.certified > 0 ? compact(kpi.certified) : DASH}</b>
              <Bar value={kpi.certifiedPct} tone="ok" />
              {/* Against the work's value, not against measured work alone: a
                  certificate certifies prelims, provisional sums and approved
                  variations as well, so the old share divided two different
                  things and read high on any job carrying prelims. */}
              <em>
                {kpi.value > 0
                  ? `${Math.round(kpi.certifiedPct)}% of the work's value`
                  : "Nothing measured yet"}
                {withheldNote}
              </em>
            </Link>
            <Link to="/work/library">
              <span>Items waiting for a rate</span>
              <b>{num(kpi.unpriced)}</b>
              <em>
                {kpi.unpricedProjects
                  ? `Across ${num(kpi.unpricedProjects)} project${kpi.unpricedProjects === 1 ? "" : "s"}`
                  : "Everything measured has a rate"}
              </em>
            </Link>
            {/* Three of the six kinds of decision come from the overview and
                one from the summary. Until both arrive this tile does not know
                the answer, and a count of what we happen to hold would read as
                "nothing to decide". */}
            <a href="#oh-att" className={decisions.urgent ? "warn" : undefined}>
              <span>Needs a decision</span>
              <b>{decisions.partial ? DASH : num(decisions.total)}</b>
              <em>
                {decisionsFailed
                  ? "Part of this could not be loaded"
                  : decisions.partial
                    ? "Still checking"
                    : decisions.urgent
                      ? `${num(decisions.urgent)} urgent`
                      : "Nothing urgent"}
              </em>
            </a>
          </div>

          <div className="oh-grid">
            {/* 2 — needs a decision */}
            <Panel
              id="oh-att"
              title="Needs a decision"
              // What the sub line may claim depends on what is known. With
              // either call missing, the kinds it answers are simply not in
              // this list, and the line names them rather than quoting a total
              // that is only part of one.
              sub={
                decisions.partial
                  ? decisionsSub
                  : decisions.total > decisions.rows.length
                    ? `${num(decisions.total)} open · showing the ${decisions.rows.length} most pressing`
                    : `${num(decisions.total)} open · each opens where it is resolved`
              }
              more={
                !decisions.partial && decisions.total > decisions.rows.length
                  ? ["All projects", "/work/projects"]
                  : null
              }
            >
              <OhTable
                head={["Type", "What", "Project", ">"]}
                empty="Nothing is waiting on you."
                // An empty table would say nothing is waiting. That is only
                // true when everything that feeds it actually answered.
                state={
                  decisions.rows.length === 0 && decisions.partial
                    ? decisionsFailed
                      ? "That could not be loaded just now."
                      : "Loading…"
                    : null
                }
                rows={decisions.rows.map((a) => (
                  <tr key={a.id} className={a.urgent ? "urgent" : undefined}>
                    <td>
                      <span className={`oh-kind k-${a.kind.toLowerCase()}`}>{a.kind}</span>
                    </td>
                    <td className="tw">{a.text}</td>
                    <td>{a.project ? <ProjectCell p={a.project} /> : <span className="mute">{DASH}</span>}</td>
                    <td className="n">
                      <Link className="oh-go" to={a.href}>
                        {a.cta}
                        <FaChevronRight />
                      </Link>
                    </td>
                  </tr>
                ))}
              />
            </Panel>

            {/* 3 — continue where you left off */}
            <Panel
              title="Continue where you left off"
              // The next lesson comes from /me/courses. If that call failed,
              // the row is missing rather than absent, and the line says so
              // instead of leaving it looking like nothing is enrolled.
              sub={
                coursesFailed
                  ? "Where this browser last had you · the next lesson could not be loaded"
                  : "Where this browser last had you"
              }
            >
              {continues.length === 0 && !lesson ? (
                <p className="oh-empty">Nothing opened yet.</p>
              ) : (
                <div className="oh-cont">
                  {continues.map((c) => {
                    const p = c.project;
                    const m = measurable(p);
                    const line =
                      c.tab === "pm"
                        ? `${pct(p.progressPercent)}% complete`
                        : c.tab === "valuation"
                          ? `${num(p.certificateCount || 0)} certificate${
                              (p.certificateCount || 0) === 1 ? "" : "s"
                            }`
                          : m
                            ? `${num(p.pricedCount || 0)} of ${num(m)} priced`
                            : `${num(p.itemCount || 0)} item${(p.itemCount || 0) === 1 ? "" : "s"}`;
                    const src = SOURCES[sourceOf(p)];
                    return (
                      <Link key={p.id} to={c.href}>
                        {src?.icon ? (
                          <img src={src.icon} alt="" />
                        ) : (
                          <span style={{ width: 24, flex: "none" }} />
                        )}
                        <span>
                          <em>{c.eyebrow}</em>
                          <b>{p.name}</b>
                          <i>{line}</i>
                        </span>
                        <FaChevronRight />
                      </Link>
                    );
                  })}
                  {lesson ? (
                    <Link to={lesson.href}>
                      {/* His lesson row keeps the icon slot but leaves it
                          empty, so the three project rows above stay aligned. */}
                      <span style={{ width: 24, flex: "none" }} />
                      <span>
                        <em>Next lesson</em>
                        <b>{lesson.moduleTitle}</b>
                        <i>{lesson.courseTitle}</i>
                      </span>
                      <FaChevronRight />
                    </Link>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>

          {/* 4 — every project */}
          <Panel
            className="wide"
            title="Projects"
            sub="Every project, whichever tool it started in"
            more={["All projects", "/work/projects"]}
          >
            <OhTable
              head={[
                "Project",
                "Source",
                "Stage",
                "Priced",
                "Complete",
                ">Measured",
                ">Certified",
                ">Updated",
              ]}
              empty="No projects yet. Save one from QUIV or HERON."
              rows={[...projects]
                .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
                .slice(0, 10)
                .map((p) => {
                  const m = measurable(p);
                  const priced = m ? ((Number(p.pricedCount) || 0) / m) * 100 : 0;
                  const meta = [
                    p.clientName || null,
                    p.mergedInto ? "linked services" : null,
                    p.accessLevel === "view" ? "view only" : null,
                    // Says why the certified column reads as an en dash on
                    // somebody else's project: the figure is withheld, not zero.
                    p.moneyHidden ? "money hidden" : null,
                    p.isMaterials ? "material schedule" : null,
                  ].filter(Boolean);
                  return (
                    <tr key={p.id}>
                      <td className="tw">
                        <ProjectCell p={p} bold />
                        {meta.length ? <em>{meta.join(" · ")}</em> : null}
                      </td>
                      <td>
                        <SourceMark p={p} />
                      </td>
                      <td>
                        <span className={`pj-stage s-${stageOf(p)}`}>{stageName(p)}</span>
                      </td>
                      <td className="g">
                        <Bar value={priced} />
                        <em>{m ? `${pct(priced)}%` : DASH}</em>
                      </td>
                      <td className="g">
                        <Bar value={p.progressPercent} tone="ok" />
                        <em>{pct(p.progressPercent)}%</em>
                      </td>
                      {/* The row's own meta line says this project's money is
                          hidden, so the row must not then print it. The API
                          still sends measured work on a shared project — only
                          the figures this branch added are masked — and
                          printing it here would contradict the same row. */}
                      <td className="n">{isMoneyHidden(p) ? DASH : compact(p.totalCost)}</td>
                      <td className="n">
                        {!isMoneyHidden(p) && Number(p.certifiedToDate) > 0
                          ? compact(p.certifiedToDate)
                          : DASH}
                      </td>
                      <td className="n mute">{short(p.updatedAt)}</td>
                    </tr>
                  );
                })}
            />
          </Panel>

          <div className="oh-two">
            {/* 5 — money in motion */}
            <Panel title="Valuations and variations" sub="Most recent first">
              <OhTable
                head={["Ref", "Item", "Date", ">Amount", "Status"]}
                empty="No certificates or variations yet."
                state={moneyState}
                rows={inMotion.map(({ kind, row }) => {
                  if (kind === "cert") {
                    const [cls, label] = CERT_PILL[row.status] || CERT_PILL.draft;
                    return (
                      <tr key={`c-${row.projectId}-${row.number}`}>
                        <td>IPC {row.number}</td>
                        <td className="tw">
                          <ProjectCell p={row} tab="valuation" />
                        </td>
                        <td className="mute">{short(row.date)}</td>
                        {/* Money on somebody else's project, hidden by the
                            server on the same rule the project page uses. An
                            en dash, never a zero that reads as "nothing". */}
                        <td className="n">{row.moneyHidden ? DASH : money(row.netPayable)}</td>
                        <td>
                          <span className={`pj-stage ${cls}`}>{label}</span>
                        </td>
                      </tr>
                    );
                  }
                  const [cls, label] = VAR_PILL[row.status] || VAR_PILL.approved;
                  return (
                    <tr key={`v-${row.projectId}-${row.reference}-${row.issuedAt}`}>
                      <td>{row.reference || "Variation"}</td>
                      <td className="tw">
                        <Link className="oh-p" to={projectTabHref(row, "valuation")}>
                          {row.description || "Variation"}
                        </Link>
                        <em>{row.name}</em>
                      </td>
                      <td className="mute">{short(row.issuedAt)}</td>
                      <td className="n">
                        {row.moneyHidden ? (
                          DASH
                        ) : (
                          <>
                            {row.amount < 0 ? "−" : "+"}
                            {money(Math.abs(row.amount))}
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`pj-stage ${cls}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              />
            </Panel>

            {/* 6 — programme */}
            <Panel title="Programme" sub="Overdue, due in the next two weeks, or under way">
              <OhTable
                head={["Task", "Project", "Ends", "Progress", "Status"]}
                empty="No tasks are due."
                state={moneyState}
                rows={(overview?.tasks || []).slice(0, 6).map((t, i) => {
                  const st = taskState(t);
                  return (
                    <tr key={`${t.projectId}-${t.task}-${i}`} className={st.late ? "urgent" : undefined}>
                      <td className="tw">
                        {t.isMilestone ? "◆ " : ""}
                        {t.task || "Untitled task"}
                        <em>{t.assignedTo || "No owner"}</em>
                      </td>
                      <td>
                        <ProjectCell p={t} tab="pm" />
                      </td>
                      <td className="mute">{short(t.endDate)}</td>
                      <td className="g">
                        <Bar value={t.percentComplete} tone={st.late ? "bad" : "ok"} />
                        <em>{pct(t.percentComplete)}%</em>
                      </td>
                      <td>
                        {st.late ? <span className="oh-late">Overdue</span> : st.label}
                      </td>
                    </tr>
                  );
                })}
              />
            </Panel>
          </div>

          <div className="oh-two">
            {/* 7 and 8 */}
            {ratesPanel}
            {learningPanel}
          </div>
        </>
      )}
    </div>
  );
}
