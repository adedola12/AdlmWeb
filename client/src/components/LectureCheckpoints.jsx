import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/**
 * A question asked at the moment the lecture makes the point.
 *
 * WHY THE QUIZ MOVED INTO THE VIDEO
 *
 * These are ninety-minute sessions, and a quiz at the end of one asks about
 * something the student heard an hour and a half ago. Most of what that
 * measures is memory, not understanding: "I do not remember" and "I did not
 * follow it" arrive as the same wrong answer, and neither the student nor the
 * tutor can tell them apart afterwards.
 *
 * Asked at the moment, it is a different question. The explanation is still on
 * the screen behind it, the student finds out they were wrong while it is
 * still cheap to fix, and a tutor reading the results learns which minute of
 * which lecture loses people.
 *
 * IT PAUSES, AND IT DOES NOT SCORE
 *
 * Pausing is the whole mechanism — a question beside a playing video is a
 * question nobody answers. But it records nothing and moves no mark: the point
 * is to find out you were wrong while it is still cheap, and a mark attached
 * to that turns a moment of learning into a moment of being caught, which is
 * the quickest way to teach somebody to skip. The graded quiz at the end of
 * the module is untouched, and the certificate mark still comes only from it.
 *
 * ASKED ONCE, THEN OUT OF THE WAY
 *
 * Rewinding over a checkpoint does not ask it again. Somebody rewinding is
 * usually re-watching the part they got wrong, and stopping them at the same
 * question is the player arguing with them. Answered checkpoints stay
 * available on the strip below, so it can be looked at again on purpose.
 */
export default function LectureCheckpoints({ sku, moduleCode, videoRef, at }) {
  const { accessToken } = useAuth();

  const [questions, setQuestions] = React.useState([]);
  const [asking, setAsking] = React.useState(null); // the question on screen
  const [picked, setPicked] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // Which have been asked already, so a rewind does not ask them again. Kept
  // in a ref rather than state: it is read inside the position effect on every
  // timeupdate, and putting it in state would re-run that effect constantly.
  const done = React.useRef(new Set());

  React.useEffect(() => {
    done.current = new Set();
    setAsking(null);
    setPicked(null);
    setResult(null);
    setQuestions([]);

    if (!sku || !moduleCode || !accessToken) return undefined;
    let alive = true;
    apiAuthed(`/me/courses/${encodeURIComponent(sku)}/quiz/${encodeURIComponent(moduleCode)}`, {
      token: accessToken,
    })
      .then((r) => {
        if (!alive) return;
        // Only the anchored ones. A question with no atSec belongs to the quiz
        // at the end, which is where it still gets asked.
        const anchored = (r?.quiz?.questions || [])
          .filter((q) => Number.isFinite(q.atSec) && q.atSec > 0)
          .sort((a, b) => a.atSec - b.atSec);
        setQuestions(anchored);
      })
      // A module with no published quiz 404s, which is not an error here —
      // it means there is nothing to ask, and the lecture plays as before.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sku, moduleCode, accessToken]);

  // The trigger. Runs on every timeupdate, so it does as little as possible:
  // one comparison against the next unanswered checkpoint.
  React.useEffect(() => {
    if (asking || !questions.length) return;

    const due = questions.find(
      (q) => !done.current.has(String(q._id)) && at >= q.atSec && at < q.atSec + 12,
    );
    if (!due) return;

    // A seek that lands past a checkpoint skips it rather than firing it late:
    // the 12-second window above is what separates "playback reached it" from
    // "somebody dragged the scrubber across it".
    done.current.add(String(due._id));
    const v = videoRef?.current;
    if (v && !v.paused) v.pause();
    setPicked(null);
    setResult(null);
    setAsking(due);
  }, [at, questions, asking, videoRef]);

  async function answer() {
    if (picked == null) return;
    setBusy(true);
    try {
      const r = await apiAuthed(
        `/me/courses/${encodeURIComponent(sku)}/quiz/${encodeURIComponent(moduleCode)}/check`,
        {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: asking._id, choice: picked }),
        },
      );
      setResult(r);
    } catch {
      // The answer cannot be checked, so the lecture is not held hostage to
      // it: the checkpoint closes and playback carries on.
      resume();
    } finally {
      setBusy(false);
    }
  }

  function resume() {
    setAsking(null);
    setPicked(null);
    setResult(null);
    const v = videoRef?.current;
    if (v && v.paused) v.play?.().catch(() => {});
  }

  /** Go back to where the point was actually made. */
  function rewatch() {
    const v = videoRef?.current;
    const q = asking;
    setAsking(null);
    setPicked(null);
    setResult(null);
    if (!v || !q) return;
    // Twenty seconds before the question, which is about where the answer was
    // being explained. Clamped so an early checkpoint does not seek negative.
    v.currentTime = Math.max(0, q.atSec - 20);
    v.play?.().catch(() => {});
  }

  if (!questions.length) return null;

  return (
    <>
      {asking ? (
        <div className="lx-cp" role="dialog" aria-modal="true" aria-label="Checkpoint">
          <div className="lx-cp-card">
            <span className="lx-cp-k">Checkpoint · {clock(asking.atSec)}</span>
            <h4>{asking.prompt}</h4>

            <div className="lx-cp-opts">
              {(asking.options || []).map((opt, i) => {
                const state = !result
                  ? picked === i
                    ? " on"
                    : ""
                  : i === result.correctIndex
                    ? " right"
                    : picked === i
                      ? " wrong"
                      : "";
                return (
                  <button
                    key={i}
                    type="button"
                    className={`lx-cp-opt${state}`}
                    disabled={!!result || busy}
                    onClick={() => setPicked(i)}
                  >
                    <i>{String.fromCharCode(65 + i)}</i>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>

            {result ? (
              <div className={result.correct ? "lx-cp-said ok" : "lx-cp-said no"}>
                <b>{result.correct ? "That is right." : "Not quite."}</b>
                {result.explanation ? <p>{result.explanation}</p> : null}
              </div>
            ) : null}

            <div className="lx-cp-acts">
              {/* Skipping is allowed and deliberately not punished. Somebody
                  who cannot answer and cannot move on stops watching. */}
              <button type="button" className="lx-cp-skip" onClick={resume}>
                {result ? "" : "Skip this one"}
              </button>
              {result ? (
                <>
                  {!result.correct ? (
                    <button type="button" className="lx-cp-again" onClick={rewatch}>
                      Watch that part again
                    </button>
                  ) : null}
                  <button type="button" className="lx-cp-go" onClick={resume}>
                    Carry on
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="lx-cp-go"
                  disabled={picked == null || busy}
                  onClick={answer}
                >
                  {busy ? "Checking…" : "Answer"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Where the questions sit in the lecture, and which have been met.
          Visible before any of them fire, so nobody is ambushed by the first
          one — and clickable, so a question can be gone back to on purpose. */}
      <div className="lx-cp-strip">
        <span className="lx-cp-k">
          {questions.length} checkpoint{questions.length === 1 ? "" : "s"} in this session
        </span>
        {questions.map((q) => (
          <button
            key={q._id}
            type="button"
            className={done.current.has(String(q._id)) ? "on" : undefined}
            title={`Checkpoint at ${clock(q.atSec)}`}
            onClick={() => {
              const v = videoRef?.current;
              if (!v) return;
              done.current.delete(String(q._id));
              v.currentTime = Math.max(0, q.atSec - 20);
              v.play?.().catch(() => {});
            }}
          >
            {clock(q.atSec)}
          </button>
        ))}
      </div>
    </>
  );
}

function clock(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
