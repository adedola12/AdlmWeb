import React from "react";
import { useSearchParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/**
 * Quiz authoring, one quiz per module.
 *
 * Saving upserts on (courseSku, moduleCode), so editing an existing quiz and
 * creating a new one are the same operation — there is no way to accidentally
 * end up with two quizzes on one module.
 */

const emptyQuestion = () => ({
  prompt: "",
  options: ["", ""],
  correctIndex: 0,
  explanation: "",
});

const emptyQuiz = (courseSku, moduleCode) => ({
  courseSku,
  moduleCode,
  title: "",
  intro: "",
  passMark: 60,
  maxAttempts: 0,
  isPublished: false,
  questions: [emptyQuestion()],
});

function QuestionEditor({ question, index, onChange, onRemove, canRemove }) {
  const set = (patch) => onChange({ ...question, ...patch });

  function setOption(i, value) {
    const options = [...question.options];
    options[i] = value;
    set({ options });
  }

  function addOption() {
    if (question.options.length >= 6) return;
    set({ options: [...question.options, ""] });
  }

  function removeOption(i) {
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, oi) => oi !== i);
    // Keep the answer key pointing at the same option after a removal.
    let correctIndex = question.correctIndex;
    if (i === correctIndex) correctIndex = 0;
    else if (i < correctIndex) correctIndex -= 1;
    set({ options, correctIndex });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">
          Question {index + 1}
        </div>
        {canRemove ? (
          <button className="btn btn-sm" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>

      <textarea
        className="input mt-2 w-full"
        rows={2}
        placeholder="What are you asking?"
        value={question.prompt}
        onChange={(e) => set({ prompt: e.target.value })}
      />

      <div className="mt-2 space-y-1">
        {question.options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              title="Correct answer"
              checked={question.correctIndex === i}
              onChange={() => set({ correctIndex: i })}
            />
            <input
              className="input flex-1"
              placeholder={`Option ${i + 1}`}
              value={option}
              onChange={(e) => setOption(i, e.target.value)}
            />
            <button
              className="btn btn-sm"
              disabled={question.options.length <= 2}
              onClick={() => removeOption(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          className="btn btn-sm"
          disabled={question.options.length >= 6}
          onClick={addOption}
        >
          Add option
        </button>
        <span className="text-xs text-slate-500">
          The selected radio is the correct answer.
        </span>
      </div>

      <textarea
        className="input mt-2 w-full"
        rows={2}
        placeholder="Explanation — shown after submission, right or wrong. This is where the teaching happens."
        value={question.explanation}
        onChange={(e) => set({ explanation: e.target.value })}
      />
    </div>
  );
}

export default function AdminQuizzes() {
  const { accessToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const sku = params.get("sku") || "bim-bld-arch";

  const [courses, setCourses] = React.useState([]);
  const [course, setCourse] = React.useState(null);
  const [quizzes, setQuizzes] = React.useState([]);
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    apiAuthed("/admin/courses", { token: accessToken })
      .then(setCourses)
      .catch(() => {});
  }, [accessToken]);

  const load = React.useCallback(async () => {
    setErr("");
    try {
      const [detail, list] = await Promise.all([
        apiAuthed(`/admin/courses/${encodeURIComponent(sku)}`, { token: accessToken }),
        apiAuthed(`/admin/course-ops/quizzes?sku=${encodeURIComponent(sku)}`, {
          token: accessToken,
        }),
      ]);
      setCourse(detail);
      setQuizzes(list);
    } catch (e) {
      setErr(e?.message || "Failed to load");
    }
  }, [sku, accessToken]);

  React.useEffect(() => {
    setDraft(null);
    load();
  }, [load]);

  const modules = course?.modules || [];
  const quizByModule = React.useMemo(
    () => Object.fromEntries(quizzes.map((q) => [q.moduleCode, q])),
    [quizzes],
  );

  function edit(moduleCode) {
    const existing = quizByModule[moduleCode];
    setMsg("");
    setDraft(
      existing
        ? {
            ...existing,
            questions: (existing.questions || []).map((q) => ({
              prompt: q.prompt || "",
              options: q.options?.length ? q.options : ["", ""],
              correctIndex: q.correctIndex || 0,
              explanation: q.explanation || "",
            })),
          }
        : emptyQuiz(sku, moduleCode),
    );
  }

  function validate(quiz) {
    const problems = [];
    if (!quiz.questions.length) problems.push("Add at least one question.");
    quiz.questions.forEach((q, i) => {
      const n = i + 1;
      if (!q.prompt.trim()) problems.push(`Question ${n} has no prompt.`);
      const filled = q.options.filter((o) => o.trim());
      if (filled.length < 2) problems.push(`Question ${n} needs two options.`);
      if (!q.options[q.correctIndex]?.trim()) {
        problems.push(`Question ${n}: the correct answer is a blank option.`);
      }
    });
    return problems;
  }

  async function save() {
    if (!draft) return;
    const problems = validate(draft);
    if (problems.length) {
      setErr(problems.join(" "));
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const payload = {
        ...draft,
        questions: draft.questions.map((q) => ({
          ...q,
          options: q.options.filter((o) => o.trim()),
        })),
      };
      await apiAuthed("/admin/course-ops/quizzes", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMsg(
        payload.isPublished
          ? "Saved and published — students can take it now."
          : "Saved as a draft. Tick Published when it is ready.",
      );
      await load();
    } catch (e) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(quiz) {
    if (!window.confirm(`Delete the quiz on ${quiz.moduleCode}? Attempts already recorded are kept.`)) {
      return;
    }
    try {
      await apiAuthed(`/admin/course-ops/quizzes/${quiz._id}`, {
        token: accessToken,
        method: "DELETE",
      });
      setDraft(null);
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  const setDraftField = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Quizzes</h1>
            <p className="text-sm text-slate-600">
              One quiz per module. Answers are graded on the server, so the key
              never reaches the browser.
            </p>
          </div>
          <select
            className="input"
            value={sku}
            onChange={(e) => setParams({ sku: e.target.value })}
          >
            {courses.map((c) => (
              <option key={c.sku} value={c.sku}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err ? <div className="card text-red-600">{err}</div> : null}
      {msg ? <div className="card text-emerald-700">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="mb-2 font-semibold">Modules</div>
          <div className="space-y-1">
            {modules.map((m) => {
              const quiz = quizByModule[m.code];
              const active = draft?.moduleCode === m.code;
              return (
                <button
                  key={m.code}
                  className={`w-full rounded border p-2 text-left text-sm hover:bg-slate-50 ${
                    active ? "ring-2 ring-adlm-blue-700" : ""
                  }`}
                  onClick={() => edit(m.code)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate">{m.title || m.code}</span>
                    {quiz ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                          quiz.isPublished
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {quiz.isPublished ? "live" : "draft"}
                      </span>
                    ) : null}
                  </div>
                  {quiz ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {quiz.questions?.length || 0} questions · {quiz.stats?.attempts || 0}{" "}
                      attempts
                      {quiz.stats?.attempts
                        ? ` · avg ${quiz.stats.avgScore}%`
                        : ""}
                    </div>
                  ) : null}
                </button>
              );
            })}
            {!modules.length ? (
              <div className="text-sm text-slate-600">
                This course has no modules yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="card lg:col-span-2">
          {!draft ? (
            <div className="text-sm text-slate-600">
              Pick a module on the left to write or edit its quiz.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{draft.moduleCode}</div>
                <div className="flex items-center gap-2">
                  {quizByModule[draft.moduleCode] ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => remove(quizByModule[draft.moduleCode])}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button className="btn btn-sm" onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="Quiz title"
                  value={draft.title}
                  onChange={(e) => setDraftField({ title: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    Pass mark
                    <input
                      className="input w-20"
                      type="number"
                      min={0}
                      max={100}
                      value={draft.passMark}
                      onChange={(e) =>
                        setDraftField({ passMark: Number(e.target.value) })
                      }
                    />
                    %
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    Attempts
                    <input
                      className="input w-20"
                      type="number"
                      min={0}
                      value={draft.maxAttempts}
                      onChange={(e) =>
                        setDraftField({ maxAttempts: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Attempts: 0 means unlimited. Every attempt is recorded either way.
              </div>

              <textarea
                className="input mt-2 w-full"
                rows={2}
                placeholder="Intro shown above the questions (optional)"
                value={draft.intro}
                onChange={(e) => setDraftField({ intro: e.target.value })}
              />

              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(e) => setDraftField({ isPublished: e.target.checked })}
                />
                Published — students can see and take it
              </label>

              <div className="mt-4 space-y-3">
                {draft.questions.map((question, i) => (
                  <QuestionEditor
                    key={i}
                    question={question}
                    index={i}
                    canRemove={draft.questions.length > 1}
                    onChange={(next) =>
                      setDraftField({
                        questions: draft.questions.map((q, qi) =>
                          qi === i ? next : q,
                        ),
                      })
                    }
                    onRemove={() =>
                      setDraftField({
                        questions: draft.questions.filter((_, qi) => qi !== i),
                      })
                    }
                  />
                ))}
              </div>

              <button
                className="btn btn-sm mt-3"
                onClick={() =>
                  setDraftField({ questions: [...draft.questions, emptyQuestion()] })
                }
              >
                Add question
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
