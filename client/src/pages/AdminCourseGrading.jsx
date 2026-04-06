// src/pages/AdminCourseGrading.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminCourseGrading() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("submissions");
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  // enrollments state
  const [enrollments, setEnrollments] = React.useState([]);
  const [enrMsg, setEnrMsg] = React.useState("");
  const [enrFilter, setEnrFilter] = React.useState("");

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
    if (!window.confirm("Mark this enrollment as completed?")) return;
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
        setEnrMsg("Marked as completed.");
      }
      loadEnrollments();
    } catch (e) {
      setEnrMsg(e.message || "Failed to mark complete");
    }
  }

  const filteredEnrollments = enrFilter
    ? enrollments.filter(
        (e) =>
          (e.email || "").toLowerCase().includes(enrFilter.toLowerCase()) ||
          (e.courseTitle || "").toLowerCase().includes(enrFilter.toLowerCase()) ||
          (e.firstName || "").toLowerCase().includes(enrFilter.toLowerCase()) ||
          (e.lastName || "").toLowerCase().includes(enrFilter.toLowerCase()),
      )
    : enrollments;

  const tabClass = (t) =>
    `px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition ${
      tab === t
        ? "border-adlm-blue-700 text-adlm-blue-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin - Course Grading</h1>
        <div className="mt-3 flex gap-1 border-b">
          <button className={tabClass("submissions")} onClick={() => setTab("submissions")}>
            Pending Submissions
          </button>
          <button className={tabClass("enrollments")} onClick={() => setTab("enrollments")}>
            Enrollments
          </button>
        </div>
      </div>

      {tab === "submissions" ? (
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
      ) : (
        <div className="space-y-3">
          {enrMsg && <div className="text-sm text-amber-700">{enrMsg}</div>}

          <input
            className="input w-full max-w-sm"
            placeholder="Filter by email, name, or course..."
            value={enrFilter}
            onChange={(e) => setEnrFilter(e.target.value)}
          />

          {filteredEnrollments.length === 0 ? (
            <div className="text-sm text-slate-600">No enrollments found.</div>
          ) : (
            filteredEnrollments.map((enr) => (
              <div key={enr._id} className="border rounded p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm min-w-0">
                    <div className="font-medium">
                      {enr.firstName || enr.lastName
                        ? `${enr.firstName} ${enr.lastName}`.trim()
                        : enr.email}
                    </div>
                    <div className="text-slate-600">{enr.email}</div>
                    <div className="text-slate-500 mt-1">{enr.courseTitle}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        enr.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      }`}
                    >
                      {enr.status}
                    </span>
                    {enr.status !== "completed" ? (
                      <button
                        className="btn btn-sm"
                        onClick={() => markComplete(enr._id)}
                      >
                        Mark Complete
                      </button>
                    ) : (
                      enr.certificateIssuedAt && (
                        <span className="text-xs text-slate-500">
                          Completed{" "}
                          {new Date(enr.certificateIssuedAt).toLocaleDateString()}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
