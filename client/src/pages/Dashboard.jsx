// src/pages/Dashboard.jsx
import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useNavigate } from "react-router-dom";

// Local helpers (or import from ../lib/video)
const extractDriveId = (url = "") => {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  return "";
};
const driveDirect = (id = "") =>
  id ? `https://drive.google.com/uc?export=download&id=${id}` : "";
const toPlayable = (url = "") => {
  const id = extractDriveId(url);
  return id ? driveDirect(id) : url;
};

export default function Dashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [courses, setCourses] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const navigate = useNavigate();

  const displayName =
    (user?.firstName && user.firstName.trim()) ||
    (user?.username && user.username.trim()) ||
    user?.email ||
    "there";

  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiAuthed(`/me/summary`, { token: accessToken });
        setSummary(data);
      } catch (e) {
        setErr(e.message || "Failed to load summary");
      }
    })();
  }, [accessToken]);

  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiAuthed(`/me/courses`, { token: accessToken });
        setCourses(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [accessToken]);

  async function signUpload(resource_type = "raw") {
    const res = await apiAuthed(`/me/media/sign`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_type }),
    });
    return res;
  }

  async function uploadToCloudinary(file, resource_type = "raw") {
    setUploading(true);
    setMsg("Uploading…");
    try {
      const sig = await signUpload(resource_type);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resource_type}/upload`;
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.secure_url)
        throw new Error(json?.error?.message || "Upload failed");
      return json.secure_url;
    } finally {
      setUploading(false);
      setMsg("");
    }
  }

  async function submitAssignment(courseSku, moduleCode, file) {
    try {
      if (!file) return;
      const ext = (file.name || "").split(".").pop().toLowerCase();
      const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
      const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
      const resourceType = isVideo ? "video" : isImage ? "image" : "raw";
      const fileUrl = await uploadToCloudinary(file, resourceType);
      await apiAuthed(`/me/courses/${encodeURIComponent(courseSku)}/submit`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode, fileUrl }),
      });
      setMsg("✅ Submitted");
      const data = await apiAuthed(`/me/courses`, { token: accessToken });
      setCourses(data);
    } catch (e) {
      setMsg(`❌ ${e.message || "Submit failed"}`);
    }
  }

  function SubscriptionList() {
    if (!summary) return "Loading…";
    const list = (summary.entitlements || []).filter((e) => !e.isCourse);
    return (
      <div className="space-y-2">
        {list.length === 0 && <div>No subscriptions yet.</div>}
        {list.map((e, i) => {
          const isActive = e.status === "active";
          return (
            <button
              key={i}
              type="button"
              onClick={() => openProduct(e)}
              className={`w-full border rounded p-3 flex items-center justify-between text-left transition hover:bg-slate-50 ${
                isActive ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div>
                <div className="font-medium">{e.productKey}</div>
                <div className="text-sm text-slate-600">Status: {e.status}</div>
              </div>
              <div className="text-sm">
                Expires:{" "}
                {e.expiresAt ? dayjs(e.expiresAt).format("YYYY-MM-DD") : "-"}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function Courses() {
    if (!courses) return <div>Loading courses…</div>;
    if (!courses.length)
      return <div className="text-sm text-slate-600">No courses yet.</div>;

    return (
      <div className="space-y-4">
        {courses.map((c, i) => {
          const {
            course,
            enrollment,
            progress = 0,
            moduleSubmissions = [],
          } = c || {};
          const hasCourse = !!course;
          const sku = course?.sku || enrollment?.courseSku || `unknown-${i}`;

          return (
            <div
              key={sku}
              className="border rounded p-3 hover:bg-slate-50 cursor-pointer"
              onClick={() =>
                hasCourse && navigate(`/learn/course/${course.sku}`)
              }
            >
              <div className="flex items-center gap-3">
                {hasCourse && course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    className="w-20 h-14 object-cover rounded border"
                  />
                ) : (
                  <div className="w-20 h-14 rounded border bg-slate-100" />
                )}

                <div className="flex-1">
                  <div className="font-semibold">
                    {hasCourse ? course.title : enrollment?.courseSku}
                  </div>
                  <div className="text-sm text-slate-600">
                    {hasCourse
                      ? course.blurb
                      : "Course details are not available yet."}
                  </div>
                </div>

                <div className="text-sm font-medium">
                  {Number(progress) || 0}% complete
                </div>
              </div>

              {hasCourse && (
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  <div className="rounded overflow-hidden border bg-black">
                    {course.onboardingVideoUrl ? (
                      <video
                        className="w-full h-40 object-cover"
                        src={toPlayable(course.onboardingVideoUrl || "")}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-40 grid place-items-center text-white/70">
                        No onboarding video
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {course.classroomJoinUrl && (
                      <a
                        className="btn btn-sm"
                        href={course.classroomJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Google Classroom
                      </a>
                    )}
                    {enrollment?.certificateUrl && (
                      <a
                        className="btn btn-sm"
                        href={enrollment.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download Certificate
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="font-medium mb-1">Modules & Assignments</div>
                <div className="space-y-2">
                  {(moduleSubmissions || []).map((m) => (
                    <div key={m.moduleCode} className="border rounded p-2">
                      {m.requiresSubmission && (
                        <div className="mt-2">
                          {(m.submissions?.length ?? 0) === 0 && (
                            <div className="text-xs text-slate-500">
                              No submissions yet.
                            </div>
                          )}
                          {(m.submissions || []).map((s) => (
                            <div
                              key={s._id}
                              className="text-xs flex items-center justify-between"
                            >
                              <a
                                href={s.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                {s.fileUrl}
                              </a>
                              <span>{s.gradeStatus || "pending"}</span>
                            </div>
                          ))}
                          <label
                            className={`btn btn-xs mt-2 ${
                              uploading ? "opacity-50 pointer-events-none" : ""
                            }`}
                          >
                            Upload assignment
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploading}
                              onChange={(e) =>
                                submitAssignment(
                                  sku,
                                  m.moduleCode,
                                  e.target.files?.[0]
                                )
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function openProduct(e) {
    if (e.status !== "active") return;
    const key = (e.productKey || "").toLowerCase();
    if (key === "revit") return navigate("/projects/revit");
    if (key === "mep") return navigate("/projects/mep");
    if (key === "planswift") return navigate("/projects/planswift");
    if (key === "rategen") return navigate("/rategen");
    navigate(`/product/${e.productKey}`);
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">Welcome, {displayName}</h1>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Active Subscriptions</h2>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        {!summary ? "Loading…" : <SubscriptionList />}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">My Courses</h2>
        <Courses />
      </div>

      {user?.role === "admin" && (
        <div className="card">
          <h2 className="font-semibold mb-2">Admin tools</h2>
          <div className="flex gap-2 flex-wrap">
            <a href="/admin/products" className="btn btn-sm">
              Products
            </a>
            <a href="/admin/courses" className="btn btn-sm">
              Courses
            </a>
            <a href="/admin/course-grading" className="btn btn-sm">
              Course grading
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
