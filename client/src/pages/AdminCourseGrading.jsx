// src/pages/AdminCourseGrading.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminCourseGrading() {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

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
  React.useEffect(() => {
    load(); /* eslint-disable */
  }, []);

  async function grade(id, status, feedback = "") {
    await apiAuthed(`/admin/course-grading/submissions/${id}/grade`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, feedback }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Course Grading</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      <div className="space-y-2">
        {items.map((s) => (
          <div key={s._id} className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">{s.email}</div>
                <div className="text-slate-600">
                  {s.courseSku} · {s.moduleCode}
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
    </div>
  );
}
