// Assignments (R11/R12/R13; Richard's dash-assignments, 17 Sep 2026).
//
// Every assignment across the learner's courses, in his three tabs: To do,
// Submitted, Marked. Submit here (PDF, Word, Excel or an image, into private
// storage), and the mark and the tutor's feedback come back here. Anything
// with a new alert (due within 48 hours, overdue, a result) carries his red
// dot; opening the page on it clears it.

import React from "react";
import { useLocation } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useFeedback } from "./feedback/feedbackContext.js";
import { uploadSubmission, SUBMISSION_ACCEPT, submissionFileProblem } from "../lib/submissionUpload.js";
import { anchorOf, tabOf, niceDate } from "../lib/assignments.js";

const TABS = [
  ["todo", "To do"],
  ["submitted", "Submitted"],
  ["marked", "Marked"],
];

const PILL = {
  todo: ["", "To do"],
  "due-soon": ["open", "Due soon"],
  overdue: ["overdue", "Overdue"],
  submitted: ["submitted", "Submitted"],
  marked: ["marked", "Marked"],
};

function Card({ a, hl, onSubmitted, token }) {
  const fb = useFeedback();
  const [file, setFile] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pct, setPct] = React.useState(0);
  const sub = a.submission;
  const [cls, label] = PILL[a.state] || PILL.todo;

  const submit = async () => {
    if (!file) {
      fb.toast({ tone: "error", title: "Choose the file to submit first." });
      return;
    }
    setBusy(true);
    try {
      const { fileName, submittedAt } = await uploadSubmission({
        sku: a.courseSku,
        moduleCode: a.moduleCode,
        file,
        token,
        note,
        onProgress: setPct,
      });
      // R13: the confirmation says what was sent, when, and what happens next.
      // TODO(adlm): Richard's own modal design replaces this card when he sends it.
      await fb.card({
        tone: "success",
        title: "Submitted",
        msg: "Your tutor marks it next. The mark and their feedback come back to this page, and the bell tells you when.",
        rows: [
          ["File", fileName],
          ["Submitted", submittedAt.toLocaleString()],
          ["Assignment", `${a.courseTitle} · ${a.moduleTitle}`],
        ],
        primary: "Done",
      });
      setFile(null);
      setNote("");
      onSubmitted();
    } catch (e) {
      fb.toast({ tone: "error", title: e.message || "That could not be submitted." });
    } finally {
      setBusy(false);
      setPct(0);
    }
  };

  return (
    <article className={`as-card ${a.state}${hl ? " hl" : ""}`} id={anchorOf(a)}>
      <div className="as-top">
        <span className="as-k">
          {a.courseTitle}
          {a.week ? ` · Week ${a.week}` : ""}
          {a.alerts?.length ? <i className="adlm-dot" role="status" aria-label="New" /> : null}
        </span>
        <span className={`as-pill ${cls}`}>{label}</span>
      </div>
      <h3>{a.moduleTitle}</h3>
      {a.prompt && <p>{a.prompt}</p>}
      <div className="as-meta">
        <span>
          <em>Due</em>
          {a.dueAt ? niceDate(a.dueAt) : "No deadline"}
        </span>
        {sub && (
          <span>
            <em>Submitted</em>
            {niceDate(sub.submittedAt)}
          </span>
        )}
        {sub?.score != null && (
          <span>
            <em>Mark</em>
            {sub.score}/100
          </span>
        )}
      </div>

      {a.state === "marked" && (sub?.feedback || sub?.score != null) && (
        <div className="as-fb">
          <b>
            {sub.status === "approved" ? "Accepted" : "Returned for another go"}
            {sub.gradedBy ? ` · feedback from ${sub.gradedBy}` : ""}
          </b>
          {sub.feedback || "No written comment."}
        </div>
      )}

      {sub && (
        <div className="as-file">
          {sub.fileUrl ? (
            <a href={sub.fileUrl} target="_blank" rel="noreferrer">
              {sub.fileName || "Your file"}
            </a>
          ) : (
            sub.fileName || "Your file"
          )}
        </div>
      )}

      {(a.state !== "submitted" && !(a.state === "marked" && sub?.status === "approved")) && (
        <div className="as-form">
          <label className={file ? "as-drop has" : "as-drop"}>
            <input
              type="file"
              accept={SUBMISSION_ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                const problem = f ? submissionFileProblem(f) : null;
                if (problem) {
                  fb.toast({ tone: "error", title: problem });
                  e.target.value = "";
                  setFile(null);
                  return;
                }
                setFile(f);
              }}
            />
            <b>{file ? file.name : a.state === "marked" ? "Choose a new file to resubmit" : "Choose your file"}</b>
            <span>PDF, Word (.docx), Excel (.xlsx) or an image</span>
          </label>
          <label className="as-note">
            <span>A note for your tutor (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="as-acts">
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={submit} disabled={busy}>
              {busy ? (pct ? `Uploading ${pct}%` : "Submitting…") : "Submit"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function DsAssignments() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [items, setItems] = React.useState(null);
  const [tab, setTab] = React.useState("todo");
  const hash = location.hash.replace(/^#/, "");

  const load = React.useCallback(() => {
    apiAuthed("/me/courses/assignments", { token: accessToken })
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Open on the tab holding a linked assignment.
  React.useEffect(() => {
    const target = (items || []).find((a) => anchorOf(a) === hash);
    if (target) setTab(tabOf(target));
  }, [items, hash]);

  // Looking at an assignment with a new alert clears it (R11).
  React.useEffect(() => {
    const shown = (items || []).filter((a) => tabOf(a) === tab && a.alerts?.length);
    if (!shown.length) return undefined;
    const t = setTimeout(() => {
      Promise.all(
        shown.map((a) =>
          apiAuthed("/me/courses/assignments/seen", {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseSku: a.courseSku, moduleCode: a.moduleCode }),
          }).catch(() => {}),
        ),
      );
    }, 1500);
    return () => clearTimeout(t);
  }, [items, tab, accessToken]);

  const counts = Object.fromEntries(TABS.map(([k]) => [k, (items || []).filter((a) => tabOf(a) === k).length]));
  const shown = (items || []).filter((a) => tabOf(a) === tab);

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Assignments</h1>
          <p>
            The work each course sets between lessons. Submit it here and the tutor marks it here: the mark and
            their feedback come back to this page.
          </p>
        </div>
      </div>

      <div className="as-tabs" role="tablist">
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {name}
            {k === "todo" && (items || []).some((a) => tabOf(a) === "todo" && a.alerts?.length) && (
              <i className="adlm-dot" role="status" aria-label="New" />
            )}
            <em>{counts[k]}</em>
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="wk-note">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="as-empty">
          <b>{tab === "todo" ? "Nothing to do" : tab === "submitted" ? "Nothing waiting to be marked" : "Nothing marked yet"}</b>
          <p>
            {items.length === 0
              ? "Assignments appear here when you are enrolled on a course that sets them."
              : "Assignments move between these tabs as you submit them and your tutor marks them."}
          </p>
        </div>
      ) : (
        <div className="as-list">
          {shown.map((a) => (
            <Card key={anchorOf(a)} a={a} hl={anchorOf(a) === hash} onSubmitted={load} token={accessToken} />
          ))}
        </div>
      )}
    </div>
  );
}
