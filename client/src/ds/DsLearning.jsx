// His My learning screen, on the real enrolments.
//
// The rail has pointed "My learning" at /learn — the public catalogue — since
// the port began, which is the wrong destination for somebody signed in: it
// answers "what does ADLM teach", not "where am I up to". This is the second
// question.
//
// Everything comes from GET /me/courses. That route already returned more than
// the old Courses tile was using: each enrolment carries its module list as
// `moduleSubmissions` — title, code, duration, and whether it is done — which
// is what makes "pick up where you left off" a real answer rather than a link
// to the top of the course. `access` carries the expiry wording, `summary` the
// counts, `progress` the percentage.
//
// Markup is his: .lx-cont wrapping a .lx-card.big, .lx-courses of .lx-course,
// .lx-certs.sm of .lx-cert / .lx-cert.pending. Nothing here styles what
// ds-learn.css already styles.
//
// One place his design is ahead of what we hold, and it is not mimed:
//
//   Certificate reference — generateCertificatePdf stamps the name and the
//   date, and nothing else. A reference row on the card would name a number
//   the certificate itself does not carry, so the ticket shows the two things
//   that are genuinely on the document.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import CertificateNameModal from "../components/CertificateNameModal.jsx";
import CertTicket from "./LxCertTicket.jsx";
import { COUNT, accountName, ago, certificateName, clock, toRow, trim } from "./lxCourses.js";

export default function DsLearning() {
  const { accessToken, user } = useAuth();
  const [courses, setCourses] = React.useState(null);
  const [failed, setFailed] = React.useState("");
  const [certModal, setCertModal] = React.useState(null);
  const [freeWatched, setFreeWatched] = React.useState([]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/courses", { token: accessToken })
      .then((d) => alive && setCourses(Array.isArray(d) ? d : []))
      .catch((e) => alive && setFailed(e?.message || "Could not load your learning."));

    // His "Free lessons watched". Its own request, and its own failure: an
    // empty history is a normal state for this panel, so nothing here may take
    // the enrolments down with it.
    apiAuthed("/me/free-lessons?limit=5", { token: accessToken })
      .then((d) => alive && setFreeWatched(Array.isArray(d) ? d : []))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const view = React.useMemo(() => {
    if (!courses) return null;

    const rows = courses.map(toRow);

    // The hero is whatever is furthest along but unfinished — the thing
    // somebody came back for. A course not started is a worse answer than one
    // half done, so those only win when nothing is in flight.
    //
    // A signed-off enrolment is excluded even when modules are unticked. In the
    // live data that combination is common: the tutor marks the enrolment
    // complete for the certificate, and the per-module ticks were never all
    // set. Pushing somebody back into a course the tutor has already passed
    // them on is the wrong instruction.
    const open = rows.filter((r) => r.next && !r.expired && !r.completed);
    const hero = open.filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct)[0] || open[0] || null;

    return { rows, hero };
  }, [courses]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">{failed}</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">Loading your learning…</p>
      </div>
    );
  }

  const { rows, hero } = view;
  const certName = certificateName(user);
  const holder = accountName(user);

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>My learning</h1>
          <p>
            {rows.length
              ? `${COUNT[rows.length] || rows.length} enrolment${rows.length === 1 ? "" : "s"} on this account. Every lesson is watchable here, with its transcript and its resources, and the certificate is issued to the account when the capstone is marked.`
              : "Nothing enrolled on this account yet. The free lessons need no sign-in; the courses carry a certificate issued to the account."}
          </p>
        </div>
        <div className="wk-acts">
          <Link className="ds-btn btn-o ds-btn-sm" to="/learn">
            Free lessons
          </Link>
          {/* His button goes to dash-team, and so does ours: a course seat is
              assigned from the team screen like any other seat. */}
          <Link className="ds-btn btn-p ds-btn-sm" to="/manage/team">
            Enrol someone else
          </Link>
        </div>
      </div>

      {/* Pick up where you left off. */}
      {hero && (
        <section className="lx-cont">
          <div className="lx-cont-in">
            <span className="k">Pick up where you left off</span>
            <Link
              className="lx-card big"
              to={`/dash-course/${hero.sku}?m=${encodeURIComponent(hero.next.moduleCode || "")}`}
            >
              <span className="th">
                {hero.thumb ? <img src={hero.thumb} alt="" loading="lazy" /> : null}
                <i className="pl">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </i>
                {hero.next.durationSec ? (
                  <em className="dur">{clock(hero.next.durationSec)}</em>
                ) : null}
              </span>
              <span className="b">
                {/* His line is "COURSE · WEEK 4". It says that here too once a
                    course has been organised into weeks; on one that has not
                    been, the lesson number is the only true thing to say. */}
                <span className="wk">
                  {hero.title}
                  {hero.weeks && hero.next.week
                    ? ` · Week ${hero.next.week}`
                    : hero.total
                      ? ` · Lesson ${hero.nextNumber} of ${hero.total}`
                      : ""}
                </span>
                <b>{hero.next.moduleTitle || hero.next.moduleCode || "Next lesson"}</b>
                <span className="d">
                  {trim(hero.next.instructions || hero.blurb, 190) ||
                    "Open the course to watch this one."}
                </span>
              </span>
            </Link>
          </div>
        </section>
      )}

      <section className="wk-panel">
        <div className="wk-ph">
          <h2>Your courses</h2>
          <span className="wk-locnote">Enrolled on this account</span>
        </div>

        {rows.length ? (
          <div className="lx-courses">
            {rows.map((r) => (
              <article className="lx-course" key={r.sku}>
                <Link className="th" to={`/dash-course/${r.sku}`}>
                  {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : null}
                </Link>
                <div className="b">
                  <h3>
                    <Link to={`/dash-course/${r.sku}`}>{r.title}</Link>
                  </h3>
                  {r.blurb ? <p className="s">{trim(r.blurb, 90)}</p> : null}

                  <div className="lx-bar">
                    <i style={{ width: `${r.completed ? 100 : r.pct}%` }} />
                  </div>

                  {/* His line, exactly: the percentage, the lesson count, and
                      who holds the enrolment. A course belongs to one account
                      here rather than to a pool of named seats, so that last
                      column is the person whose account this is. */}
                  <p className="m">
                    <b>{r.completed ? "Complete" : `${r.pct}%`}</b>
                    {r.total ? ` · ${r.done} of ${r.total} lessons` : ""}
                    {holder ? ` · ${holder}` : ""}
                  </p>

                  <p className="n">
                    {r.completed
                      ? "Signed off by the tutor. Every lesson stays open."
                      : r.next
                        ? `Next: ${r.next.moduleTitle || r.next.moduleCode}`
                        : r.pending
                          ? `Every lesson watched. ${r.pending} submission${r.pending === 1 ? "" : "s"} with the tutor.`
                          : "Every lesson watched."}
                  </p>

                  <div className="lx-acts">
                    <Link
                      className="ds-btn btn-p ds-btn-sm"
                      to={`/dash-course/${r.sku}${
                        r.next && !r.completed
                          ? `?m=${encodeURIComponent(r.next.moduleCode || "")}`
                          : ""
                      }`}
                    >
                      {r.completed
                        ? "Revisit"
                        : r.pct
                          ? "Continue"
                          : r.weeks
                            ? `Start week ${r.next?.week || 1}`
                            : "Start"}
                    </Link>
                    <Link className="ds-btn btn-o ds-btn-sm" to={`/dash-course/${r.sku}`}>
                      Lessons
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="wk-empty">
            <p>
              Nothing enrolled yet. The courses are taught against real projects and carry a
              certificate; the free lessons need no sign-in at all.
            </p>
            <Link className="ds-btn btn-p ds-btn-sm" to="/learn">
              See what is taught
            </Link>
          </div>
        )}
      </section>

      {/* Certificates. Issued to the account, so each card is a fact rather
          than a prediction: the enrolment is either marked complete with a
          template behind it, or it is not. */}
      {rows.length > 0 && (
        <section className="wk-panel" id="certificates">
          <div className="wk-ph">
            <h2>Certificates</h2>
            <Link className="more" to="/dash-certificates">
              All certificates
            </Link>
          </div>
          <div className="lx-certs sm">
            {rows.map((r) => (
              <CertTicket
                key={r.sku}
                row={r}
                certName={certName}
                onDownload={(row, opts) =>
                  setCertModal({
                    sku: row.sku,
                    title: row.title,
                    description: row.blurb,
                    completionDate: row.issuedAt,
                    reference: row.certificateRef,
                    preview: !!opts?.preview,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Free lessons watched — last, where his has it.
          The free library needs no sign-in, so this only ever shows lessons
          opened while signed in; the note says so rather than letting an
          empty panel read as "you have watched nothing". It renders even
          when empty, because his page always has the panel and a fresh
          account should not be missing one. */}
      <section className="wk-panel">
          <div className="wk-ph">
            <h2>Free lessons watched</h2>
            <Link className="more" to="/learn">
              The public library
            </Link>
          </div>
          <ul className="dsh-feed" style={{ padding: "0 20px" }}>
            {freeWatched.length === 0 ? (
              <li>
                <span className="tick" />
                <div>Nothing opened yet while signed in.</div>
              </li>
            ) : null}
            {freeWatched.map((f) => (
              <li key={f.id}>
                <span className="tick" />
                <div>
                  {f.available ? (
                    <Link to={`/learn/free/${f.id}`}>
                      <b>{f.title}</b>
                    </Link>
                  ) : (
                    <b>{f.title}</b>
                  )}
                  {/* His row reads "<b>Title</b> — Revit · 12:41". */}
                  {f.productLabel || f.durationSec
                    ? ` — ${[f.productLabel, f.durationSec ? clock(f.durationSec) : ""]
                        .filter(Boolean)
                        .join(" · ")}`
                    : ""}
                  {f.available ? "" : " · no longer published"}
                </div>
                <span className="ago">{ago(f.lastWatchedAt)}</span>
              </li>
            ))}
          </ul>
          <p className="wk-note">
            Every walkthrough in the library is free, with no sign-in and no payment. Only the
            ones opened while signed in appear here.
          </p>
      </section>

      <CertificateNameModal
        open={!!certModal}
        onClose={() => setCertModal(null)}
        courseSku={certModal?.sku}
        courseTitle={certModal?.title}
        courseDescription={certModal?.description}
        completionDate={certModal?.completionDate}
        reference={certModal?.reference}
        preview={certModal?.preview}
      />
    </div>
  );
}
