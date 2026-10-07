// The app bar's bell (R11), in Richard's markup (dash.js: .dsh-notif,
// .dsh-bell, .dsh-drop.dsh-notes) on real alerts: assignments due within 48
// hours, overdue, and results that have come back. Each opens its
// assignment; opening it (or "Mark all read") clears it.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useDismiss } from "./dismiss.js";
import { anchorOf } from "../lib/assignments.js";

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#hi-${name}`} />
  </svg>
);

function when(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.round(Math.abs(ms) / 3600e3);
  if (ms > 0) return h < 24 ? `in ${h} hour${h === 1 ? "" : "s"}` : `in ${Math.round(h / 24)} days`;
  return h < 24 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} days ago`;
}

function noteFor(a, kind) {
  const name = a.moduleTitle;
  if (kind === "due-soon") return { tone: "warn", ic: "learning", title: `${name} is due ${when(a.dueAt)}`, body: a.courseTitle, cta: "Submit it" };
  if (kind === "overdue") return { tone: "warn", ic: "learning", title: `${name} is overdue`, body: `It was due ${when(a.dueAt)}. ${a.courseTitle}.`, cta: "Submit it" };
  return {
    tone: "",
    ic: "cert",
    title: `Your ${name} has been marked`,
    body: a.submission?.score != null ? `Mark ${a.submission.score}/100 · ${a.courseTitle}` : a.courseTitle,
    cta: "See the feedback",
  };
}

export default function DsNotifBell({ accessToken, onCount }) {
  const [items, setItems] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  useDismiss(open, () => setOpen(false), [ref]);

  const load = React.useCallback(() => {
    if (!accessToken) return;
    apiAuthed("/me/courses/assignments", { token: accessToken })
      .then((d) => {
        const list = (d.items || []).filter((a) => a.alerts?.length);
        setItems(list);
        onCount?.(list.length);
      })
      .catch(() => {});
  }, [accessToken, onCount]);

  React.useEffect(() => {
    load();
  }, [load]);

  const seen = async (list) => {
    await Promise.all(
      list.map((a) =>
        apiAuthed("/me/courses/assignments/seen", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseSku: a.courseSku, moduleCode: a.moduleCode }),
        }).catch(() => {}),
      ),
    );
    load();
  };

  const notes = items.flatMap((a) => a.alerts.map((k) => ({ a, k, ...noteFor(a, k) })));

  return (
    <span className="dsh-notif" ref={ref}>
      <button
        type="button"
        className="dsh-bell"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={notes.length ? `Notifications, ${notes.length} new` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        {icon("bell")}
        {notes.length > 0 && <span className="n">{notes.length}</span>}
      </button>
      <div className={open ? "dsh-drop dsh-notes on" : "dsh-drop dsh-notes"}>
        <div className="hd">
          <b>Notifications</b>
          {notes.length > 0 && (
            <button type="button" className="lnk" onClick={() => seen(items)}>
              Mark all read
            </button>
          )}
        </div>
        <div className="ls">
          {notes.length === 0 ? (
            <p style={{ margin: 0, padding: "18px", fontSize: 13, color: "var(--ink-3)" }}>
              Nothing new. Assignment deadlines and marks appear here.
            </p>
          ) : (
            notes.map((n) => (
              <Link
                key={`${anchorOf(n.a)}-${n.k}`}
                className={`nt unread${n.tone ? ` ${n.tone}` : ""}`}
                to={`/dash-assignments#${anchorOf(n.a)}`}
                onClick={() => {
                  setOpen(false);
                  seen([n.a]);
                }}
              >
                <span className="ic">{icon(n.ic)}</span>
                <span className="tx">
                  <b>{n.title}</b>
                  <span>{n.body}</span>
                  <span className="mt">{n.cta}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </span>
  );
}
