// Submissions — grading, as a queue, with the work on screen.
//
// His argument: "The live tool is a list of everything ever handed in. A list
// cannot be emptied, so nobody knows whether they are behind. This is the same
// work with a done state on it: pass, return for another attempt, and the row
// leaves. Passing issues the certificate, which is the reason the queue
// matters. A student who has finished the course and not received the
// certificate is waiting on this screen and nothing else."
//
// THE VIEWER
//
// His screen lists the attached files and leaves opening them to the browser.
// A marker who has to download every attachment to a folder, open it, decide,
// then come back and find their place is a marker who marks in batches of one.
// So the work opens beside the queue instead: pick a row, read it, pass or
// return it, and the next row is already there.
//
// It shows what the browser can render — a PDF or an image inline, anything
// else as a named file to open in its own tab. It does not pretend to preview
// a Revit model.
//
// THE COLLECTION IS EMPTY
//
// CourseSubmission has no rows at all. Everything below is built against the
// schema, and the empty state says the queue is empty rather than broken —
// which for a grading queue is the good outcome, not a missing one.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useAdmToast } from "./adminKit.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const TABS = [
  ["pending", "To mark"],
  ["approved", "Passed"],
  ["rejected", "Returned"],
  ["all", "All"],
];

const EMPTY = {
  pending: [
    "Nothing to mark",
    "Every submission has been marked. For a grading queue that is the good outcome, not a missing one.",
  ],
  approved: ["Nothing passed yet", "A passed submission issues the certificate it is owed."],
  rejected: ["Nothing returned", "Work sent back for another attempt collects here, with the feedback given."],
  all: ["No submissions", "When a student hands work in, it arrives here to be marked."],
};

/** What the browser can actually show, from the file name. */
function kindOf(url) {
  const clean = String(url || "").split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|bmp)$/.test(clean)) return "image";
  if (/\.pdf$/.test(clean)) return "pdf";
  return "file";
}

const fileName = (url) => {
  try {
    return decodeURIComponent(String(url).split(/[?#]/)[0].split("/").pop() || "attachment");
  } catch {
    return "attachment";
  }
};

/** The work, beside the queue. */
function Viewer({ item, onClose, onDecide, busy }) {
  const [feedback, setFeedback] = React.useState(item?.feedback || "");

  React.useEffect(() => setFeedback(item?.feedback || ""), [item]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!item) return null;
  const kind = kindOf(item.file);

  return (
    <div className="adm-view" role="dialog" aria-modal="true" aria-label={`Submission from ${item.who}`}>
      <div className="adm-view-head">
        <div>
          <b>{item.who}</b>
          <span>
            {item.course}
            {item.module ? ` · ${item.module}` : ""} · handed in {when(item.sentAt)}
          </span>
        </div>
        <button type="button" className="adm-ico" onClick={onClose} aria-label="Close the submission">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-close" />
          </svg>
        </button>
      </div>

      <div className="adm-view-body">
        {!item.file ? (
          <div className="adm-none">
            <b>Nothing was attached</b>
            <span>
              There is no file on this submission, so there is nothing to mark. Return it and ask
              for the work.
            </span>
          </div>
        ) : kind === "image" ? (
          <img src={item.file} alt={`Submitted by ${item.who}`} />
        ) : kind === "pdf" ? (
          <iframe src={item.file} title={`Submission from ${item.who}`} />
        ) : (
          <div className="adm-none">
            <b>{fileName(item.file)}</b>
            <span>
              This is not something a browser can show inline — a model or an archive. Open it in
              its own tab to mark it.
            </span>
            <a
              className="ds-btn btn-o ds-btn-sm"
              href={item.file}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the file
            </a>
          </div>
        )}

        {item.note ? (
          <p className="adm-view-note">
            <b>What they said</b>
            {item.note}
          </p>
        ) : null}
      </div>

      <div className="adm-view-foot">
        <label>
          Feedback
          <textarea
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Why it passed, or what to fix before the next attempt."
          />
        </label>
        <div className="adm-view-acts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy}
            onClick={() => onDecide(item.id, "rejected", feedback)}
          >
            Return for another attempt
          </button>
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy || !item.file}
            title={item.file ? undefined : "There is nothing attached to mark"}
            onClick={() => onDecide(item.id, "approved", feedback)}
          >
            Pass — issue the certificate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DsAdminSubmissions() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [say, toast] = useAdmToast();

  const load = React.useCallback(
    (v) => {
      if (!accessToken) return Promise.resolve();
      return apiAuthed("/admin/queues/submissions", { token: accessToken, params: { view: v } })
        .then(setD)
        .catch(() => setFailed(true));
    },
    [accessToken],
  );

  React.useEffect(() => {
    setD(null);
    setOpen(null);
    load(view);
  }, [view, load]);

  async function decide(id, to, feedback) {
    if (busy) return;
    setBusy(true);
    try {
      // The real contract: POST .../submissions/:id/grade with { status,
      // feedback }. Approving also ticks the module complete on the
      // enrolment, which is what issues the certificate.
      await apiAuthed(`/admin/course-grading/submissions/${id}/grade`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, feedback }),
      });
      setOpen(null);
      await load(view);
      say(
        to === "approved"
          ? "Passed. The certificate is issued."
          : "Returned for another attempt, with your feedback attached.",
      );
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Submissions could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Submissions</h1>
          <p className="adm-lede">
            Course work handed in and not yet marked. Passing one issues the certificate it is
            owed, so a student who has finished the course and not received theirs is waiting on
            this screen and nothing else. The work opens beside the queue rather than downloading.
          </p>
        </div>
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`adm-tab${view === key ? " on" : ""}`}
            onClick={() => setView(key)}
          >
            <span>{label}</span>
            <em className="adm-tab-n">{counts[key] ?? "—"}</em>
          </button>
        ))}
      </div>

      <div className={open ? "adm-split on" : "adm-split"}>
        <div>
          {!d ? (
            <p className="adm-note">Reading the queue…</p>
          ) : !items.length ? (
            <div className="adm-none">
              <b>{EMPTY[view][0]}</b>
              <span>{EMPTY[view][1]}</span>
            </div>
          ) : (
            items.map((s) => (
              <article
                key={s.id}
                className={`adm-card sub${s.status !== "pending" ? " done" : ""}${
                  open?.id === s.id ? " picked" : ""
                }${s.blocked ? " orphan" : ""}`}
              >
                <div className="adm-cust">
                  <b>{s.who}</b>
                  <span className="adm-org">{s.org || "Personal licence"}</span>
                  <span className="adm-mail">{s.email}</span>
                </div>

                <div className="adm-buy">
                  <b>{s.module || "Submission"}</b>
                  <span className="adm-meta">
                    <span>{s.course}</span>
                    <span>sent {when(s.sentAt)}</span>
                  </span>
                  {s.feedback ? <span className="adm-hintline">{s.feedback}</span> : null}
                </div>

                <div className="adm-side-col">
                  {s.file ? (
                    <span className="adm-proof">{fileName(s.file)}</span>
                  ) : (
                    <span className="adm-proof none">{s.blocked}</span>
                  )}
                  <span className={`adm-age${s.age >= 3 ? " old" : ""}`}>
                    {s.age === 0 ? "today" : `${s.age} day${s.age === 1 ? "" : "s"} old`}
                  </span>
                </div>

                <div className="adm-act">
                  {s.status !== "pending" ? (
                    <span className={`adm-stamp ${s.status === "approved" ? "approved" : "rejected"}`}>
                      {s.status === "approved" ? "Passed" : "Returned"}
                      {s.gradedBy ? ` · ${s.gradedBy}` : ""}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      onClick={() => setOpen(s)}
                    >
                      Open and mark
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {open ? (
          <Viewer item={open} onClose={() => setOpen(null)} onDecide={decide} busy={busy} />
        ) : null}
      </div>

      <p className="adm-foot-note">
        A submission with nothing attached cannot be passed — there is no work to mark. Return it
        and ask for the file. Every decision is written against your name, with the feedback the
        student sees.
      </p>

      {toast}
    </>
  );
}
