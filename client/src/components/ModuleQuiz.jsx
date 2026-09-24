import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/**
 * The quiz for one module. Renders nothing at all when the module has no
 * published quiz, so it can sit unconditionally in the course page.
 *
 * Grading happens server-side — the answer key is never sent to the browser,
 * and the explanations only come back with the result. That is why the
 * correct/incorrect styling only exists after a submission: before one, the
 * page genuinely does not know.
 *
 * Richard has no student-facing quiz anywhere in his build, so there was
 * nothing to port. The markup is written in his idiom instead — his .lx-*
 * naming, his tokens, and the row shape .lx-res uses — with the styling in
 * ds-local.css, which is where a control we have and he does not belongs.
 */
export default function ModuleQuiz({ sku, moduleCode }) {
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [answers, setAnswers] = React.useState({});
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setResult(null);
    setAnswers({});
    setErr("");

    if (!sku || !moduleCode || !accessToken) return undefined;

    apiAuthed(
      `/me/courses/${encodeURIComponent(sku)}/quiz/${encodeURIComponent(moduleCode)}`,
      { token: accessToken },
    )
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // 404 just means this module has no quiz — not an error worth showing.
      });

    return () => {
      cancelled = true;
    };
  }, [sku, moduleCode, accessToken]);

  if (!data?.quiz) return null;

  const { quiz, attempts = [], attemptsLeft, best } = data;
  const questions = quiz.questions || [];
  const answered = questions.filter((_, i) => answers[i] !== undefined).length;
  const outOfAttempts = attemptsLeft === 0;

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const payload = questions.map((_, i) =>
        answers[i] === undefined ? -1 : answers[i],
      );
      const res = await apiAuthed(
        `/me/courses/${encodeURIComponent(sku)}/quiz/${encodeURIComponent(moduleCode)}`,
        {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        },
      );
      setResult(res);
    } catch (e) {
      setErr(e?.message || "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setResult(null);
    setAnswers({});
  }

  const left = questions.length - answered;

  return (
    <div>
      <div className="lx-quiz-h">
        <b>{quiz.title || "Quiz"}</b>
        <span>
          Pass mark {quiz.passMark}%
          {attempts.length > 0 ? ` · best ${best}%` : ""}
          {attemptsLeft !== null
            ? ` · ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`
            : ""}
        </span>
      </div>

      {quiz.intro ? <p className="lx-desc">{quiz.intro}</p> : null}

      {result ? (
        <div className={`lx-verdict ${result.passed ? "pass" : "fail"}`}>
          <b>{result.passed ? "Passed" : "Not passed yet"}</b>
          <span>
            {result.score}% · {result.correctCount} of {result.totalQuestions} right · pass mark{" "}
            {quiz.passMark}%
          </span>
        </div>
      ) : null}

      <ol className="lx-qs">
        {questions.map((question, i) => {
          const outcome = result?.results?.[i];
          return (
            <li className="lx-q" key={question._id || i}>
              <b>
                {i + 1}. {question.prompt}
              </b>
              <div className="lx-opts">
                {(question.options || []).map((option, oi) => {
                  const chosen = answers[i] === oi;
                  // The key is only known once the server has marked it, which
                  // is the whole point of grading server-side.
                  const isKey = outcome && oi === outcome.correctIndex;
                  const wrongPick = outcome && chosen && !outcome.correct;
                  const locked = !!result || outOfAttempts;
                  const state = isKey ? "key" : wrongPick ? "wrong" : chosen ? "on" : "";
                  return (
                    <label
                      key={oi}
                      className={`lx-opt${state ? ` ${state}` : ""}${locked ? " done" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`q-${moduleCode}-${i}`}
                        checked={chosen}
                        disabled={locked}
                        onChange={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
              {outcome?.explanation ? <p className="lx-why">{outcome.explanation}</p> : null}
            </li>
          );
        })}
      </ol>

      <div className="lx-qacts">
        {result ? (
          outOfAttempts ? (
            <em>No attempts remaining. The marked answers stay above.</em>
          ) : (
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={retake}>
              Try again
            </button>
          )
        ) : (
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={submit}
            disabled={busy || outOfAttempts || left > 0}
          >
            {busy ? "Submitting…" : "Submit answers"}
          </button>
        )}
        {!result && left > 0 ? (
          <em>
            {left} question{left === 1 ? "" : "s"} left
          </em>
        ) : null}
        {err ? <em className="bad">{err}</em> : null}
      </div>
    </div>
  );
}
