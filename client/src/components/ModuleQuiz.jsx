import React from "react";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/**
 * The quiz for one module. Renders nothing at all when the module has no
 * published quiz, so it can sit unconditionally in the course page.
 *
 * Grading happens server-side — the answer key is never sent to the browser,
 * and the explanations only come back with the result.
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

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{quiz.title || "Quiz"}</div>
        <div className="text-xs text-slate-500">
          Pass mark {quiz.passMark}%
          {attempts.length > 0 ? ` · best ${best}%` : ""}
          {attemptsLeft !== null ? ` · ${attemptsLeft} attempt(s) left` : ""}
        </div>
      </div>

      {quiz.intro ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-adlm-dark-dim">
          {quiz.intro}
        </p>
      ) : null}

      {result ? (
        <div
          className={`mt-3 rounded-lg p-3 ${
            result.passed
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
              : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
          }`}
        >
          <div className="font-medium">
            {result.passed ? "Passed" : "Not passed yet"} — {result.score}% (
            {result.correctCount}/{result.totalQuestions})
          </div>
        </div>
      ) : null}

      <ol className="mt-3 space-y-4">
        {questions.map((question, i) => {
          const outcome = result?.results?.[i];
          return (
            <li key={question._id || i}>
              <div className="text-sm font-medium">
                {i + 1}. {question.prompt}
              </div>
              <div className="mt-2 space-y-1">
                {(question.options || []).map((option, oi) => {
                  const chosen = answers[i] === oi;
                  const isKey = outcome && oi === outcome.correctIndex;
                  const wrongPick = outcome && chosen && !outcome.correct;
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-sm ${
                        isKey
                          ? "border-emerald-300 bg-emerald-50"
                          : wrongPick
                            ? "border-rose-300 bg-rose-50"
                            : chosen
                              ? "border-adlm-blue-700"
                              : "border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-0.5"
                        name={`q-${moduleCode}-${i}`}
                        checked={chosen}
                        disabled={!!result || outOfAttempts}
                        onChange={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
              {outcome?.explanation ? (
                <p className="mt-1 text-xs text-slate-600 dark:text-adlm-dark-dim">
                  {outcome.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}

      <div className="mt-4 flex items-center gap-2">
        {result ? (
          outOfAttempts ? (
            <span className="text-sm text-slate-500">No attempts remaining.</span>
          ) : (
            <button className="btn btn-sm" onClick={retake}>
              Try again
            </button>
          )
        ) : (
          <button
            className="btn btn-sm"
            onClick={submit}
            disabled={busy || outOfAttempts || answered < questions.length}
          >
            {busy ? "Submitting…" : "Submit answers"}
          </button>
        )}
        {!result && answered < questions.length ? (
          <span className="text-xs text-slate-500">
            {questions.length - answered} question(s) left
          </span>
        ) : null}
      </div>
    </div>
  );
}
