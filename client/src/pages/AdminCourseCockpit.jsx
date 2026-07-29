import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

/**
 * One screen answering "how is this cohort actually doing".
 *
 * Rows are sorted most-stalled first, because the students who have not
 * started are the ones worth a follow-up — a list sorted by name buries them.
 */

function hours(sec) {
  const s = Number(sec || 0);
  if (!s) return "—";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function ago(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function Bar({ value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-adlm-blue-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">
        {value}/{total}
      </span>
    </div>
  );
}

export default function AdminCourseCockpit() {
  const { accessToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const sku = params.get("sku") || "bim-bld-arch";

  const [courses, setCourses] = React.useState([]);
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [expanded, setExpanded] = React.useState("");

  React.useEffect(() => {
    apiAuthed("/admin/courses", { token: accessToken })
      .then(setCourses)
      .catch(() => {});
  }, [accessToken]);

  React.useEffect(() => {
    setData(null);
    setErr("");
    apiAuthed(`/admin/course-ops/${encodeURIComponent(sku)}/cockpit`, {
      token: accessToken,
    })
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load"));
  }, [sku, accessToken]);

  // Memoised so the summary useMemo below isn't invalidated by a fresh []
  // literal on every render.
  const students = React.useMemo(() => data?.students || [], [data]);
  const modules = React.useMemo(() => data?.modules || [], [data]);

  const totals = React.useMemo(() => {
    if (!students.length) return null;
    const notStarted = students.filter((s) => s.modulesStarted === 0).length;
    const watched = students.reduce((sum, s) => sum + s.watchedSec, 0);
    const submitted = students.reduce((sum, s) => sum + s.assignmentsSubmitted, 0);
    const required = students.reduce((sum, s) => sum + s.assignmentsRequired, 0);
    return { notStarted, watched, submitted, required };
  }, [students]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Course cockpit</h1>
            <p className="text-sm text-slate-600">
              Watch time comes from playback heartbeats, not from students
              ticking &ldquo;mark complete&rdquo;.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <Link className="btn btn-sm" to="/admin/course-grading">
              Grading
            </Link>
          </div>
        </div>

        {totals ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Enrolled</div>
              <div className="text-xl font-semibold">{students.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Never started</div>
              <div className="text-xl font-semibold text-amber-700">
                {totals.notStarted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Total watch time</div>
              <div className="text-xl font-semibold">{hours(totals.watched)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Assignments in</div>
              <div className="text-xl font-semibold">
                {totals.submitted}
                <span className="text-sm text-slate-500">/{totals.required}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {err ? <div className="card text-red-600">{err}</div> : null}
      {!data && !err ? (
        <div className="card text-sm text-slate-600">Loading…</div>
      ) : null}

      {data && !students.length ? (
        <div className="card text-sm text-slate-600">
          Nobody is enrolled on this course yet.
        </div>
      ) : null}

      {students.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Completed</th>
                <th className="py-2 pr-3">Watched</th>
                <th className="py-2 pr-3">Assignments</th>
                <th className="py-2 pr-3">Quiz avg</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const stalled = s.modulesStarted === 0;
                const open = expanded === s.userId;
                return (
                  <React.Fragment key={s.userId}>
                    <tr
                      className={`border-b border-slate-100 ${
                        stalled ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{s.name || s.email}</div>
                        {s.name ? (
                          <div className="text-xs text-slate-500">{s.email}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <Bar value={s.modulesStarted} total={s.modulesTotal} />
                      </td>
                      <td className="py-2 pr-3">
                        <Bar value={s.modulesCompleted} total={s.modulesTotal} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{hours(s.watchedSec)}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {s.assignmentsSubmitted}/{s.assignmentsRequired}
                        {s.assignmentsGraded < s.assignmentsSubmitted ? (
                          <span className="ml-1 text-xs text-amber-700">
                            ({s.assignmentsSubmitted - s.assignmentsGraded} to mark)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {s.quizAvgScore === null ? "—" : `${s.quizAvgScore}%`}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{ago(s.lastSeenAt)}</td>
                      <td className="py-2 text-right">
                        <button
                          className="btn btn-sm"
                          onClick={() => setExpanded(open ? "" : s.userId)}
                        >
                          {open ? "Hide" : "Detail"}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td colSpan={8} className="p-3">
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {s.perModule.map((m) => {
                              const meta = modules.find((x) => x.code === m.code);
                              return (
                                <div
                                  key={m.code}
                                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                >
                                  <span className="truncate" title={meta?.title || m.code}>
                                    {m.code}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-slate-600">
                                    {m.watchedSec ? hours(m.watchedSec) : "—"}
                                    {m.completed ? " ✓" : ""}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
