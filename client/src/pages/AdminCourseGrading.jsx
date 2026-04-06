// src/pages/AdminCourseGrading.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminCourseGrading() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("enrollments");
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  // enrollments state
  const [enrollments, setEnrollments] = React.useState([]);
  const [enrMsg, setEnrMsg] = React.useState("");
  const [enrFilter, setEnrFilter] = React.useState("");
  const [courseFilter, setCourseFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  async function load() {
    try {
      const data = await apiAuthed("/admin/course-grading/submissions", {
        token: accessToken,
      });
      setItems(data);
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function loadEnrollments() {
    try {
      setEnrMsg("");
      const data = await apiAuthed("/admin/course-grading/enrollments", {
        token: accessToken,
      });
      setEnrollments(Array.isArray(data) ? data : []);
    } catch (e) {
      setEnrMsg(e.message || "Failed to load enrollments");
    }
  }

  React.useEffect(() => {
    load();
    loadEnrollments();
    /* eslint-disable */
  }, []);

  async function grade(id, status, feedback = "") {
    await apiAuthed(`/admin/course-grading/submissions/${id}/grade`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, feedback }),
    });
    load();
    loadEnrollments();
  }

  async function markComplete(id) {
    if (!window.confirm("Mark this enrollment as completed? The user will be able to download their certificate.")) return;
    try {
      setEnrMsg("");
      const res = await apiAuthed(
        `/admin/course-grading/enrollments/${id}/complete`,
        {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.alreadyCompleted) {
        setEnrMsg("Already completed.");
      } else {
        setEnrMsg("Marked as completed. The user can now download their certificate.");
      }
      loadEnrollments();
    } catch (e) {
      setEnrMsg(e.message || "Failed to mark complete");
    }
  }

  // unique course titles for dropdown
  const courseOptions = React.useMemo(() => {
    const set = new Map();
    enrollments.forEach((e) => {
      if (e.courseSku && e.courseTitle) set.set(e.courseSku, e.courseTitle);
    });
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [enrollments]);

  const filteredEnrollments = React.useMemo(() => {
    let rows = enrollments;

    // course filter
    if (courseFilter !== "all") {
      rows = rows.filter((e) => e.courseSku === courseFilter);
    }

    // status filter
    if (statusFilter !== "all") {
      rows = rows.filter((e) => e.status === statusFilter);
    }

    // text search
    if (enrFilter) {
      const q = enrFilter.toLowerCase();
      rows = rows.filter(
        (e) =>
          (e.email || "").toLowerCase().includes(q) ||
          (e.courseTitle || "").toLowerCase().includes(q) ||
          (e.firstName || "").toLowerCase().includes(q) ||
          (e.lastName || "").toLowerCase().includes(q),
      );
    }

    return rows;
  }, [enrollments, courseFilter, statusFilter, enrFilter]);

  // counts
  const activeCount = enrollments.filter((e) => e.status === "active").length;
  const completedCount = enrollments.filter((e) => e.status === "completed").length;

  const tabClass = (t) =>
    `px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition ${
      tab === t
        ? "border-adlm-blue-700 text-adlm-blue-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin - Course Grading & Enrollments</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage course enrollments and mark users as complete so they can download their certificate.
        </p>
        <div className="mt-3 flex gap-1 border-b">
          <button className={tabClass("enrollments")} onClick={() => setTab("enrollments")}>
            Enrollments ({enrollments.length})
          </button>
          <button className={tabClass("submissions")} onClick={() => setTab("submissions")}>
            Pending Submissions ({items.length})
          </button>
        </div>
      </div>

      {tab === "enrollments" ? (
        <div className="space-y-4">
          {enrMsg && (
            <div className="text-sm px-3 py-2 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
              {enrMsg}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 text-center">
              <div className="text-2xl font-bold">{enrollments.length}</div>
              <div className="text-xs text-slate-500">Total</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{activeCount}</div>
              <div className="text-xs text-slate-500">Active</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{completedCount}</div>
              <div className="text-xs text-slate-500">Completed</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="input w-auto"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All courses</option>
              {courseOptions.map(([sku, title]) => (
                <option key={sku} value={sku}>
                  {title}
                </option>
              ))}
            </select>

            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="completed">Completed only</option>
            </select>

            <input
              className="input flex-1 min-w-[200px]"
              placeholder="Search by email or name..."
              value={enrFilter}
              onChange={(e) => setEnrFilter(e.target.value)}
            />

            <button className="btn btn-sm" onClick={loadEnrollments}>
              Refresh
            </button>
          </div>

          {/* Results */}
          {filteredEnrollments.length === 0 ? (
            <div className="text-sm text-slate-600">No enrollments found.</div>
          ) : (
            <div className="space-y-2">
              {filteredEnrollments.map((enr) => (
                <div
                  key={enr._id}
                  className={`border rounded-lg p-4 ${
                    enr.status === "completed" ? "bg-emerald-50/30" : "bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm min-w-0">
                      <div className="font-semibold text-base">
                        {enr.firstName || enr.lastName
                          ? `${enr.firstName} ${enr.lastName}`.trim()
                          : enr.email}
                      </div>
                      <div className="text-slate-500">{enr.email}</div>
                      <div className="text-slate-600 mt-1 font-medium">
                        {enr.courseTitle}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Enrolled: {new Date(enr.createdAt).toLocaleDateString()}
                        {enr.completedModules?.length > 0 && (
                          <span className="ml-2">
                            Modules completed: {enr.completedModules.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          enr.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {enr.status === "completed" ? "Completed" : "Active"}
                      </span>

                      {enr.status !== "completed" ? (
                        <button
                          className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                          onClick={() => markComplete(enr._id)}
                        >
                          Mark Complete
                        </button>
                      ) : (
                        enr.certificateIssuedAt && (
                          <span className="text-xs text-emerald-600">
                            Completed{" "}
                            {new Date(enr.certificateIssuedAt).toLocaleDateString()}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {msg && <div className="text-sm text-red-600">{msg}</div>}
          {items.map((s) => (
            <div key={s._id} className="border rounded p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{s.email}</div>
                  <div className="text-slate-600">
                    {s.courseSku} - {s.moduleCode}
                  </div>
                </div>
                <a
                  className="btn btn-sm"
                  href={s.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open submission
                </a>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => grade(s._id, "approved")}
                >
                  Approve
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const fb = window.prompt("Feedback (optional):", "");
                    grade(s._id, "rejected", fb || "");
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {!items.length && (
            <div className="text-sm text-slate-600">No pending submissions.</div>
          )}
        </div>
      )}
    </div>
  );
}
