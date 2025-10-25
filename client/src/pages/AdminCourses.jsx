// src/pages/AdminCourses.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useSearchParams } from "react-router-dom";

// Extract a Google Drive file id
const extractDriveId = (url = "") => {
  if (!url) return "";
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  return "";
};

// Make a direct-stream URL for <video src=...>
const driveDirectVideo = (id = "") =>
  id ? `https://drive.google.com/uc?export=download&id=${id}` : "";

// Given a user-entered videoUrl, return a playable src
const toPlayableVideo = (url = "") => {
  const id = extractDriveId(url);
  if (id) return { src: driveDirectVideo(id), type: "drive" };
  return { src: url, type: "direct" };
};

function ModuleRow({ m, i, onChange, onRemove }) {
  const { src: playableSrc } = toPlayableVideo(m.videoUrl || "");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 border rounded p-2">
      <input
        className="input"
        placeholder="Code"
        value={m.code}
        onChange={(e) => onChange(i, { ...m, code: e.target.value })}
      />
      <input
        className="input sm:col-span-2"
        placeholder="Title"
        value={m.title}
        onChange={(e) => onChange(i, { ...m, title: e.target.value })}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!m.requiresSubmission}
          onChange={(e) =>
            onChange(i, { ...m, requiresSubmission: e.target.checked })
          }
        />
        Requires submission
      </label>
      <button className="btn btn-sm" onClick={() => onRemove(i)}>
        Remove
      </button>

      <input
        className="input sm:col-span-2"
        placeholder="Module video URL (Google Drive or MP4/Cloudinary)"
        value={m.videoUrl || ""}
        onChange={(e) => onChange(i, { ...m, videoUrl: e.target.value })}
      />
      <textarea
        className="input sm:col-span-3"
        rows={2}
        placeholder="Assignment prompt / instructions (optional)"
        value={m.assignmentPrompt || ""}
        onChange={(e) =>
          onChange(i, { ...m, assignmentPrompt: e.target.value })
        }
      />

      {playableSrc && (
        <div className="sm:col-span-5 rounded overflow-hidden border bg-black">
          <video
            className="w-full h-44 object-cover"
            src={playableSrc}
            controls
            preload="metadata"
          />
        </div>
      )}
    </div>
  );
}

export default function AdminCourses() {
  const { accessToken } = useAuth();
  const [qs] = useSearchParams();
  const editingSku = qs.get("edit") || "";

  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [draft, setDraft] = React.useState({
    sku: "",
    title: "",
    blurb: "",
    thumbnailUrl: "",
    onboardingVideoUrl: "",
    classroomJoinUrl: "",
    certificateTemplateUrl: "",
    isPublished: true,
    sort: 0,
    modules: [],
  });

  async function uploadToCloudinary(file, resource_type) {
    const sig = await apiAuthed(`/admin/media/sign`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_type }),
    });
    const fd = new FormData();
    fd.append("file", file);
    if (sig.mode === "unsigned" && sig.upload_preset) {
      fd.append("upload_preset", sig.upload_preset);
    } else {
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);
    }
    const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resource_type}/upload`;
    const r = await fetch(endpoint, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok || !j.secure_url)
      throw new Error(j?.error?.message || "Upload failed");
    return j.secure_url;
  }

  async function load() {
    try {
      const data = await apiAuthed("/admin/courses", { token: accessToken });
      setItems(data);
    } catch (e) {
      setMsg(e.message);
    }
  }
  React.useEffect(() => {
    load(); // eslint-disable-line
  }, []);

  // Preload form when ?edit=SKU is present
  React.useEffect(() => {
    (async () => {
      if (!editingSku) return;
      try {
        const c = await apiAuthed(
          `/admin/courses/${encodeURIComponent(editingSku)}`,
          {
            token: accessToken,
          }
        );
        setDraft({
          sku: c.sku,
          title: c.title || "",
          blurb: c.blurb || "",
          thumbnailUrl: c.thumbnailUrl || "",
          onboardingVideoUrl: c.onboardingVideoUrl || "",
          classroomJoinUrl: c.classroomJoinUrl || "",
          certificateTemplateUrl: c.certificateTemplateUrl || "",
          isPublished: !!c.isPublished,
          sort: c.sort ?? 0,
          modules: Array.isArray(c.modules) ? c.modules : [],
        });
      } catch (e) {
        try {
          const prod = await apiAuthed(
            `/admin/products/${encodeURIComponent(editingSku)}`,
            {
              token: accessToken,
            }
          );
          const created = await apiAuthed(`/admin/courses`, {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sku: editingSku,
              title: prod.name || editingSku,
              blurb: prod.blurb || "",
              thumbnailUrl: prod.thumbnailUrl || prod.images?.[0] || "",
              onboardingVideoUrl: prod.previewUrl || "",
              classroomJoinUrl: "",
              certificateTemplateUrl: "",
              isPublished: false,
              sort: prod.sort ?? 0,
              modules: [],
            }),
          });
          setDraft({
            sku: created.sku,
            title: created.title || "",
            blurb: created.blurb || "",
            thumbnailUrl: created.thumbnailUrl || "",
            onboardingVideoUrl: created.onboardingVideoUrl || "",
            classroomJoinUrl: created.classroomJoinUrl || "",
            certificateTemplateUrl: created.certificateTemplateUrl || "",
            isPublished: !!created.isPublished,
            sort: created.sort ?? 0,
            modules: Array.isArray(created.modules) ? created.modules : [],
          });
          load();
        } catch (inner) {
          setMsg(inner.message || "Failed to prepare course for editing");
        }
      }
    })();
  }, [editingSku, accessToken]);

  async function createCourse(e) {
    e.preventDefault();
    await apiAuthed("/admin/courses", {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDraft({
      sku: "",
      title: "",
      blurb: "",
      thumbnailUrl: "",
      onboardingVideoUrl: "",
      classroomJoinUrl: "",
      certificateTemplateUrl: "",
      isPublished: true,
      sort: 0,
      modules: [],
    });
    load();
  }

  async function patchCourse(sku, body) {
    await apiAuthed(`/admin/courses/${encodeURIComponent(sku)}`, {
      token: accessToken,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function delCourse(sku) {
    await apiAuthed(`/admin/courses/${encodeURIComponent(sku)}`, {
      token: accessToken,
      method: "DELETE",
    });
    load();
  }

  async function saveCourse(e) {
    e.preventDefault();
    await apiAuthed(`/admin/courses/${encodeURIComponent(draft.sku)}`, {
      token: accessToken,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Courses</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Create course</h2>
        <form onSubmit={createCourse} className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="SKU"
            value={draft.sku}
            onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
            required
          />
          <input
            className="input"
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            required
          />
          <input
            className="input sm:col-span-2"
            placeholder="Blurb"
            value={draft.blurb}
            onChange={(e) => setDraft((d) => ({ ...d, blurb: e.target.value }))}
          />

          <label className="text-sm">
            <div className="mb-1">Thumbnail URL</div>
            <input
              className="input"
              value={draft.thumbnailUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, thumbnailUrl: e.target.value }))
              }
            />
          </label>
          <div className="flex gap-2">
            <label className="btn btn-sm">
              Upload thumbnail
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await uploadToCloudinary(f, "image");
                  if (url) setDraft((d) => ({ ...d, thumbnailUrl: url }));
                }}
              />
            </label>
            {draft.thumbnailUrl && (
              <img
                src={draft.thumbnailUrl}
                className="w-16 h-10 rounded border object-cover"
              />
            )}
          </div>

          <label className="text-sm">
            <div className="mb-1">Onboarding video URL</div>
            <input
              className="input"
              value={draft.onboardingVideoUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, onboardingVideoUrl: e.target.value }))
              }
            />
          </label>
          <div className="flex gap-2 items-center">
            <label className="btn btn-sm">
              Upload video
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await uploadToCloudinary(f, "video");
                  if (url) setDraft((d) => ({ ...d, onboardingVideoUrl: url }));
                }}
              />
            </label>
            {draft.onboardingVideoUrl && (
              <video
                className="w-40 h-24 border rounded object-cover"
                src={toPlayableVideo(draft.onboardingVideoUrl).src}
                controls
                preload="metadata"
              />
            )}
          </div>

          <input
            className="input"
            placeholder="Classroom join URL"
            value={draft.classroomJoinUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, classroomJoinUrl: e.target.value }))
            }
          />
          <input
            className="input sm:col-span-2"
            placeholder="Certificate template URL"
            value={draft.certificateTemplateUrl}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                certificateTemplateUrl: e.target.value,
              }))
            }
          />

          <div className="sm:col-span-2 space-y-2">
            <div className="font-medium">Modules</div>
            {draft.modules.map((m, i) => (
              <ModuleRow
                key={i}
                m={m}
                i={i}
                onChange={(idx, nm) =>
                  setDraft((d) => {
                    const mods = d.modules.slice();
                    mods[idx] = nm;
                    return { ...d, modules: mods };
                  })
                }
                onRemove={(idx) =>
                  setDraft((d) => ({
                    ...d,
                    modules: d.modules.filter((_, j) => j !== idx),
                  }))
                }
              />
            ))}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  modules: [
                    ...d.modules,
                    { code: "", title: "", requiresSubmission: false },
                  ],
                }))
              }
            >
              Add module
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) =>
                setDraft((d) => ({ ...d, isPublished: e.target.checked }))
              }
            />{" "}
            Published
          </label>
          <input
            className="input"
            type="number"
            placeholder="Sort"
            value={draft.sort}
            onChange={(e) =>
              setDraft((d) => ({ ...d, sort: Number(e.target.value || 0) }))
            }
          />
          {editingSku ? (
            <button className="btn sm:col-span-2" onClick={saveCourse}>
              Save changes
            </button>
          ) : (
            <button className="btn sm:col-span-2">Create</button>
          )}
        </form>
      </div>

      <div className="space-y-2">
        {items.map((c) => (
          <div
            key={c.sku}
            className="border rounded p-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              {c.thumbnailUrl ? (
                <img
                  src={c.thumbnailUrl}
                  className="w-16 h-10 object-cover rounded border"
                />
              ) : (
                <div className="w-16 h-10 rounded border bg-slate-100" />
              )}
              <div className="text-sm">
                <div className="font-medium">{c.title}</div>
                <div className="text-slate-600">
                  sku: {c.sku} · sort: {c.sort} ·{" "}
                  {c.isPublished ? "published" : "hidden"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-sm"
                onClick={() =>
                  patchCourse(c.sku, { isPublished: !c.isPublished })
                }
              >
                {c.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button className="btn btn-sm" onClick={() => delCourse(c.sku)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!items.length && (
          <div className="text-sm text-slate-600">No courses yet.</div>
        )}
      </div>
    </div>
  );
}
