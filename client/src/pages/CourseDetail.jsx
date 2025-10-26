// src/pages/CourseDetail.jsx
import React from "react";
import { useParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { parseBunny, bunnyIframeSrc } from "../lib/video.js";

export default function CourseDetail() {
  const { sku } = useParams();
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [activeCode, setActiveCode] = React.useState("");

  async function load() {
    try {
      const res = await apiAuthed(`/me/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
      });
      setData(res);
      const first = res?.moduleSubmissions?.[0]?.moduleCode || "";
      setActiveCode((prev) => prev || first);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    }
  }
  React.useEffect(() => {
    load(); // eslint-disable-line
  }, [sku, accessToken]);

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

  async function uploadToCloudinary(file, resource_type = "raw") {
    setUploading(true);
    try {
      const sig = await apiAuthed(`/me/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type }),
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resource_type}/upload`;
      const r = await fetch(endpoint, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.secure_url)
        throw new Error(j?.error?.message || "Upload failed");
      return j.secure_url;
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
  if (!data) return <div className="card text-sm text-slate-600">Loading…</div>;

  const { course, enrollment, progress, moduleSubmissions } = data;
  const active =
    moduleSubmissions.find((m) => m.moduleCode === activeCode) ||
    moduleSubmissions[0] ||
    {};

  const parsed = parseBunny(
    active?.videoUrl || course?.onboardingVideoUrl || ""
  );
  const isBunny = parsed?.kind === "bunny";
  const playerSrc = isBunny
    ? bunnyIframeSrc(parsed.libId, parsed.videoId)
    : parsed?.src;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center gap-4">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              className="w-24 h-16 object-cover rounded border"
              alt=""
            />
          ) : (
            <div className="w-24 h-16 rounded border bg-slate-100" />
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{course.title}</h1>
            <p className="text-slate-600 text-sm">{course.blurb}</p>
            <div className="mt-2 h-2 rounded bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-black"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {progress}% complete
            </div>
          </div>
        </div>
      </div>

      {/* Player + Assignment */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="rounded overflow-hidden border bg-black">
            {playerSrc ? (
              isBunny ? (
                <iframe
                  src={playerSrc}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                  className="w-full aspect-video"
                  title="bunny-player"
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
              <div className="w-full aspect-video grid place-items-center text-white/70">
                No video available
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => markComplete(active.moduleCode)}
              disabled={!active?.moduleCode}
            >
              {active?.completed ? "Completed ✓" : "Mark complete"}
            </button>

            {active?.requiresSubmission && (
              <label
                className={`btn btn-sm ${
                  uploading ? "opacity-60 pointer-events-none" : ""
                }`}
              >
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
            <div className="mt-4">
              <div className="font-medium">Assignment</div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {active.assignmentPrompt || "No instructions provided."}
              </p>
              <div className="mt-2 space-y-1">
                <div className="text-xs text-slate-600">Your submissions:</div>
                {(active.submissions || []).length === 0 && (
                  <div className="text-xs text-slate-500">
                    No submissions yet.
                  </div>
                )}
                {(active.submissions || []).map((s) => (
                  <div
                    key={s._id}
                    className="text-xs flex items-center justify-between gap-2"
                  >
                    <a
                      className="underline truncate"
                      href={s.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.fileUrl}
                    </a>
                    <span className="shrink-0">
                      {s.gradeStatus}
                      {s.feedback ? ` · ${s.feedback}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modules list */}
        <div className="card">
          <div className="font-semibold mb-2">Modules</div>
          <div className="space-y-2">
            {moduleSubmissions.map((m, idx) => (
              <button
                key={m.moduleCode}
                className={`w-full border rounded p-2 text-left hover:bg-slate-50 ${
                  activeCode === m.moduleCode ? "ring-2 ring-black" : ""
                }`}
                onClick={() => setActiveCode(m.moduleCode)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {idx + 1}. {m.moduleTitle}
                  </div>
                  <div
                    className={`text-xs ${
                      m.completed ? "text-green-600" : "text-slate-500"
                    }`}
                  >
                    {m.completed ? "Completed" : "In progress"}
                  </div>
                </div>
                {m.requiresSubmission && (
                  <div className="text-xs text-slate-600">
                    Assignment required
                  </div>
                )}
              </button>
            ))}
            {moduleSubmissions.length === 0 && (
              <div className="text-sm text-slate-600">No modules yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: certificate */}
      {enrollment?.certificateUrl && (
        <div className="card">
          <a
            className="btn"
            href={enrollment.certificateUrl}
            target="_blank"
            rel="noreferrer"
          >
            Download Certificate
          </a>
        </div>
      )}
    </div>
  );
}
