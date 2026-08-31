// Learning and Content — the remaining registers.
//
// His admin-catalogue.js covers Catalogue, Learning, Content and System in one
// file, for the reason he gives there: they are one table with different
// columns. Same here. Nine registers, one component, a column set each.
//
// WHAT EACH REGISTER IS FOR
//
// A register earns its place by answering something the raw list cannot:
//
//   Courses      — "27 enrolled, 3 finished, 41% through" is the fact that
//                  says whether a course is working. The course document
//                  itself knows none of it.
//   Quizzes      — 34 exist and all but one were drafted by a script from the
//                  lecture transcripts. Draft against published is the only
//                  state that matters, because it is what stands between a
//                  machine-written question and a student being marked on it.
//   Events       — past or upcoming, and how many came. Nothing records a
//                  capacity, so there is no "full" and none is implied.
//
// Editing stays where it already works. Every one of these has a working
// editor screen behind it; a register that grew its own would be a second
// place for the same thing to be got wrong.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { toneFor } from "./adminKit.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** Every register uses the same three-state filter row. */
const stateFilters = (c, labels = {}) =>
  [
    ["all", "Everything", c.all],
    ["active", labels.active || "Published", c.active],
    ["draft", labels.draft || "Draft", c.draft],
    ["closed", labels.closed || "Closed", c.closed],
  ].filter(([k]) => k === "all" || c[k]);

const SCREENS = {
  courses: {
    title: "Courses",
    lede:
      "The paid courses, and whether anybody is getting through them. Enrolments and completions " +
      "are counted from the enrolment records, so the numbers move on their own.",
    path: "/admin/lc/courses",
    editHref: "/admin/courses",
    editLabel: "Open the course editor",
    empty: ["No courses", "Nothing has been published to sell."],
    cols: () => [
      { h: "Course", w: "28%", cell: (c) => <AdmTwo top={c.name} under={c.sku} /> },
      {
        h: "Lectures",
        num: true,
        cell: (c) => (
          <AdmTwo
            top={c.modules}
            under={c.transcribed === c.modules ? "all transcribed" : `${c.transcribed} transcribed`}
          />
        ),
      },
      { h: "Enrolled", num: true, cell: (c) => (c.enrolled ? c.enrolled : <AdmDim>nobody</AdmDim>) },
      {
        h: "Finished",
        num: true,
        cell: (c) =>
          c.finished ? (
            <AdmTwo top={c.finished} under={`${Math.round((c.finished / c.enrolled) * 100)}%`} />
          ) : (
            <AdmDim>none</AdmDim>
          ),
      },
      {
        h: "How far they get",
        cell: (c) =>
          c.enrolled ? (
            <AdmChip tone={c.progress >= 60 ? "ok" : c.progress >= 25 ? "" : "due"}>
              {c.progress}% through
            </AdmChip>
          ) : (
            <AdmDim>—</AdmDim>
          ),
      },
      { h: "State", cell: (c) => <AdmChip tone={toneFor(c.state)}>{c.state}</AdmChip> },
    ],
  },

  quizzes: {
    title: "Quizzes",
    lede:
      "The checks at the end of each lecture. All but one were drafted by a script from the " +
      "lecture transcript and are unpublished on purpose — a machine-written question should be " +
      "read by somebody who knows the material before anybody is marked on it.",
    path: "/admin/lc/quizzes",
    editHref: "/admin/quizzes",
    editLabel: "Open the quiz editor",
    filters: (c) => stateFilters(c, { active: "Published", draft: "Draft — unreviewed" }),
    local: true,
    empty: ["No quizzes", "No lecture carries a check."],
    cols: () => [
      { h: "Check", w: "26%", cell: (q) => <AdmTwo top={q.name} under={q.module} /> },
      { h: "Course", cell: (q) => q.course || <AdmDim>—</AdmDim> },
      { h: "Questions", num: true, cell: (q) => q.questions },
      { h: "Pass mark", num: true, cell: (q) => `${q.passMark}%` },
      {
        h: "Attempts",
        num: true,
        cell: (q) => (q.maxAttempts ? q.maxAttempts : <AdmDim>unlimited</AdmDim>),
      },
      { h: "State", cell: (q) => <AdmChip tone={toneFor(q.state)}>{q.state}</AdmChip> },
    ],
  },

  lessons: {
    title: "Free lessons",
    lede:
      "The public video library. Nothing records who watched what, so this says what is published " +
      "and in what order, and does not invent an audience figure.",
    path: "/admin/lc/lessons",
    editHref: "/admin/learn",
    editLabel: "Open the lesson editor",
    filters: (c) => stateFilters(c),
    local: true,
    empty: ["No lessons", "The free library is empty."],
    cols: () => [
      { h: "Lesson", w: "40%", cell: (l) => <AdmTwo top={l.name} under={l.youtubeId} /> },
      { h: "Order", num: true, cell: (l) => l.sort },
      { h: "Added", cell: (l) => when(l.createdAt) },
      { h: "State", cell: (l) => <AdmChip tone={toneFor(l.state)}>{l.state}</AdmChip> },
    ],
  },

  events: {
    title: "Events",
    lede:
      "Physical and online training. Nothing records how many places a training has, so there is " +
      "no seats-left figure here and none is implied — only how many attended.",
    path: "/admin/lc/events",
    editHref: "/admin/physical-training",
    editLabel: "Open the events editor",
    filters: (c) => stateFilters(c, { active: "Upcoming", closed: "Past" }),
    local: true,
    empty: ["No events", "No training has been scheduled."],
    cols: () => [
      { h: "Training", w: "30%", cell: (e) => <AdmTwo top={e.name} under={e.mode} /> },
      { h: "Where", cell: (e) => e.where || <AdmDim>not stated</AdmDim> },
      { h: "When", cell: (e) => when(e.date) || <AdmDim>no date</AdmDim> },
      {
        h: "Attended",
        num: true,
        cell: (e) => (e.attendees ? e.attendees : <AdmDim>not recorded</AdmDim>),
      },
      {
        h: "State",
        cell: (e) => (
          <AdmChip tone={e.state === "active" ? "ok" : "calm"}>
            {e.state === "active" ? "upcoming" : "past"}
          </AdmChip>
        ),
      },
    ],
  },

  classrooms: {
    title: "Classrooms",
    lede: "Private classrooms opened for a firm, and whether each is still running.",
    path: "/admin/lc/classrooms",
    editHref: "/admin/classrooms",
    editLabel: "Open the classroom editor",
    filters: (c) => stateFilters(c, { active: "Running", closed: "Closed" }),
    local: true,
    empty: ["No classrooms", "None has been opened."],
    cols: () => [
      { h: "Classroom", w: "28%", cell: (c) => <AdmTwo top={c.name} under={c.code} /> },
      { h: "Opened for", cell: (c) => <AdmTwo top={c.who} under={c.company || c.email} /> },
      { h: "Opened", cell: (c) => when(c.createdAt) },
      {
        h: "State",
        cell: (c) => (
          <AdmChip tone={c.state === "active" ? "ok" : "calm"}>
            {c.state === "active" ? "running" : "closed"}
          </AdmChip>
        ),
      },
    ],
  },

  changelogs: {
    title: "What's New",
    lede:
      "One row per product, with the releases published against it. This is what the What's New " +
      "page reads, so a release missing here is a release nobody was told about.",
    path: "/admin/lc/changelogs",
    editHref: "/admin/changelogs",
    editLabel: "Open the changelog editor",
    empty: ["No changelogs", "No product has a release history."],
    cols: () => [
      { h: "Product", w: "26%", cell: (c) => <AdmTwo top={c.name} under={c.tagline} /> },
      { h: "Category", cell: (c) => c.category || <AdmDim>—</AdmDim> },
      { h: "Releases", num: true, cell: (c) => c.releases },
      {
        h: "Latest",
        cell: (c) =>
          c.latest ? <AdmTwo top={c.latest} under={when(c.latestAt)} /> : <AdmDim>none</AdmDim>,
      },
      { h: "State", cell: (c) => <AdmChip tone={toneFor(c.state)}>{c.state}</AdmChip> },
    ],
  },

  showcase: {
    title: "Marketing",
    lede: "The firms shown on the site as customers. Featured ones lead the row on the home page.",
    path: "/admin/lc/showcase",
    editHref: "/admin/showcase",
    editLabel: "Open the showcase editor",
    empty: ["Nobody shown", "No firm is on the customer wall."],
    cols: () => [
      { h: "Firm", w: "34%", cell: (s) => <AdmTwo top={s.name} under={s.code} /> },
      { h: "Website", cell: (s) => s.website || <AdmDim>none</AdmDim> },
      { h: "Added", cell: (s) => when(s.createdAt) },
      {
        h: "State",
        cell: (s) => (
          <AdmChip tone={s.featured ? "ok" : "calm"}>{s.featured ? "featured" : "listed"}</AdmChip>
        ),
      },
    ],
  },

  flyers: {
    title: "Flyers",
    lede: "Marketing flyers built in the composer, and whether each is live.",
    path: "/admin/lc/flyers",
    editHref: "/admin/flyers",
    editLabel: "Open the flyer composer",
    filters: (c) => stateFilters(c),
    local: true,
    empty: ["No flyers", "None has been made."],
    cols: () => [
      { h: "Flyer", w: "34%", cell: (f) => <AdmTwo top={f.name} under={f.template} /> },
      { h: "Made by", cell: (f) => f.by || <AdmDim>—</AdmDim> },
      { h: "Made", cell: (f) => when(f.createdAt) },
      { h: "State", cell: (f) => <AdmChip tone={toneFor(f.state)}>{f.state}</AdmChip> },
    ],
  },

  freebies: {
    title: "Freebies",
    lede: "What is given away, and whether it is live on the site.",
    path: "/admin/lc/freebies",
    editHref: "/admin/freebies",
    editLabel: "Open the freebies editor",
    filters: (c) => stateFilters(c),
    local: true,
    empty: ["No freebies", "Nothing is being given away."],
    cols: () => [
      { h: "Freebie", w: "32%", cell: (f) => <AdmTwo top={f.name} under={f.blurb} /> },
      { h: "Videos", num: true, cell: (f) => (f.videos ? f.videos : <AdmDim>none</AdmDim>) },
      { h: "Added", cell: (f) => when(f.createdAt) },
      { h: "State", cell: (f) => <AdmChip tone={toneFor(f.state)}>{f.state}</AdmChip> },
    ],
  },
};

export default function DsAdminLearnContent({ screen }) {
  const S = SCREENS[screen];
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("all");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken || !S) return undefined;
    let alive = true;
    setD(null);
    apiAuthed(S.path, { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, S]);

  if (!S) return <p className="adm-note">No such register.</p>;
  if (failed) {
    return <p className="adm-note">{S.title} could not be loaded just now. Please refresh.</p>;
  }

  const all = d?.items || [];
  const items = S.local && view !== "all" ? all.filter((r) => r.state === view) : all;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">{S.title}</h1>
          <p className="adm-lede">{S.lede}</p>
        </div>
        {S.editHref ? (
          <div className="adm-acts">
            <Link className="ds-btn btn-p ds-btn-sm" to={S.editHref}>
              {S.editLabel}
            </Link>
          </div>
        ) : null}
      </div>

      {S.filters ? (
        <AdmFilters current={view} onPick={setView} options={S.filters(d?.counts || {})} />
      ) : null}

      {!d ? (
        <p className="adm-note">Reading the register…</p>
      ) : (
        <AdmTable cols={S.cols()} rows={items} rowKey={(r) => r.id} empty={S.empty} />
      )}

      <p className="adm-foot-note">
        This register reads. Adding and editing stays in the editor above — one place for a thing
        to be changed is one place for it to be got wrong.
      </p>
    </>
  );
}
