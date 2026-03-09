import React from "react";
import dayjs from "dayjs";
import { useParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { parseBunny, bunnyIframeSrc } from "../lib/video.js";

function accessTone(access) {
  if (access?.isExpired) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
  }
  if (typeof access?.daysLeft === "number" && access.daysLeft <= 7) {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  }
  if (access?.expiresAt) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }
  return "bg-slate-50 text-slate-700 ring-1 ring-slate-100";
}

function statCard(label, value, helper = "") {
  return { label, value, helper };
}

export default function CourseDetail() {
  const { sku } = useParams();
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [activeCode, setActiveCode] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setErr("");
      const res = await apiAuthed(`/me/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
      });
      setData(res);
      const first = res?.moduleSubmissions?.[0]?.moduleCode || "";
      setActiveCode((prev) => prev || first);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    }
  }, [sku, accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function markComplete(moduleCode) {
    try {
      await apiAuthed(`/me/courses/${encodeURIComponent(sku)}/complete`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode }),
      });
      await load();
    } catch (e) {
      alert(e.message || "Failed to mark complete");
    }
  }

  async function uploadToCloudinary(file, resourceType = "raw") {
    setUploading(true);
    try {
      const sig = await apiAuthed(`/me/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: resourceType }),
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.secure_url) {
        throw new Error(json?.error?.message || "Upload failed");
      }
      return json.secure_url;
    } finally {
      setUploading(false);
    }
  }

  async function submitAssignment(moduleCode, file) {
    if (!file) return;
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
    const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
    const resourceType = isVideo ? "video" : isImage ? "image" : "raw";

    try {
      const fileUrl = await uploadToCloudinary(file, resourceType);
      await apiAuthed(`/me/courses/${encodeURIComponent(sku)}/submit`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode, fileUrl }),
      });
      await load();
      alert("Submitted!");
    } catch (e) {
      alert(e.message || "Submit failed");
    }
  }

  if (err) return <div className="card text-red-600">{err}</div>;
  if (!data) return <div className="card text-sm text-slate-600">Loading...</div>;

  const { course, enrollment, progress, moduleSubmissions, summary, access, classroom } = data;
  const active =
    moduleSubmissions.find((module) => module.moduleCode === activeCode) ||
    moduleSubmissions[0] ||
    {};

  const parsed = parseBunny(active?.videoUrl || course?.onboardingVideoUrl || "");
  const isBunny = parsed?.kind === "bunny";
  const playerSrc = isBunny
    ? bunnyIframeSrc(parsed.libId, parsed.videoId)
    : parsed?.src;

  const stats = [
    statCard(
      "Modules",
      `${summary?.completedModules || 0}/${summary?.totalModules || 0}`,
      `${progress}% complete`,
    ),
    statCard(
      "Assignments",
      `${summary?.submittedAssignments || 0}/${summary?.requiredAssignments || 0}`,
      `${summary?.pendingAssignments || 0} pending review`,
    ),
    statCard(
      "Access",
      access?.label || "Open access",
      access?.expiresAt ? dayjs(access.expiresAt).format("MMM D, YYYY") : "No expiry set",
    ),
  ];

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              className="h-28 w-40 rounded border object-cover"
              alt=""
            />
          ) : (
            <div className="h-28 w-40 rounded border bg-slate-100" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{course.title}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${accessTone(access)}`}>
                {access?.label || "Open access"}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-600">{course.blurb}</p>

            <div className="mt-3 h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-600">{progress}% complete</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {classroom?.joinUrl ? (
                <a
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
                  href={classroom.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Go to Google Classroom
                </a>
              ) : null}

              {enrollment?.certificateUrl ? (
                <a
                  className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                  href={enrollment.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download certificate
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-1 font-semibold text-slate-900">{item.value}</div>
              <div className="mt-1 text-xs text-slate-500">{item.helper}</div>
            </div>
          ))}
        </div>

        {(classroom?.joinUrl || classroom?.notes) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">Classroom access</div>
            <div className="mt-1">
              Google Classroom opens in a new tab. Progress shown here reflects work tracked through ADLM Studio.
            </div>
            {classroom?.notes ? (
              <div className="mt-2 whitespace-pre-wrap">{classroom.notes}</div>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="rounded overflow-hidden border bg-black">
            {playerSrc ? (
              isBunny ? (
                <iframe
                  src={playerSrc}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                  className="w-full aspect-video"
                  title="course-player"
                />
              ) : (
                <video
                  className="w-full aspect-video"
                  src={playerSrc}
                  controls
                  preload="metadata"
                />
              )
            ) : (
              <div className="grid w-full aspect-video place-items-center text-white/70">
                No video available
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => markComplete(active.moduleCode)}
              disabled={!active?.moduleCode}
            >
              {active?.completed ? "Completed" : "Mark complete"}
            </button>

            {active?.requiresSubmission && (
              <label className={`btn btn-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                Upload assignment
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) =>
                    submitAssignment(active.moduleCode, e.target.files?.[0])
                  }
                />
              </label>
            )}
          </div>

          {active?.requiresSubmission && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="font-medium">Assignment</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {active.assignmentPrompt || "No instructions provided."}
                </p>
              </div>

              <div>
                <div className="text-xs text-slate-600">Your submissions</div>
                {(active.submissions || []).length === 0 ? (
                  <div className="mt-1 text-xs text-slate-500">No submissions yet.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(active.submissions || []).map((submission) => (
                      <div
                        key={submission._id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <a
                          className="truncate underline"
                          href={submission.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {submission.fileUrl}
                        </a>
                        <span className="shrink-0 text-slate-600">
                          {submission.gradeStatus}
                          {submission.feedback ? ` - ${submission.feedback}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-2 font-semibold">Modules</div>
          <div className="space-y-2">
            {moduleSubmissions.map((module, idx) => (
              <button
                key={module.moduleCode}
                className={`w-full rounded border p-3 text-left hover:bg-slate-50 ${
                  activeCode === module.moduleCode ? "ring-2 ring-blue-600" : ""
                }`}
                onClick={() => setActiveCode(module.moduleCode)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {idx + 1}. {module.moduleTitle}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {module.completed ? "Completed" : "In progress"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {module.requiresSubmission ? "Assignment required" : "Watch and mark complete"}
                  </div>
                </div>
              </button>
            ))}
            {moduleSubmissions.length === 0 && (
              <div className="text-sm text-slate-600">No modules yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
