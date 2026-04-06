// src/pages/AdminCourses.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { Link, useSearchParams } from "react-router-dom";
import { parseBunny, bunnyIframeSrc } from "../lib/video";

// â”€â”€ Bunny upload helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function bunnyCreate(token, title) {
  return apiAuthed("/admin/bunny/create", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

// XHR so we can track progress
function bunnyUploadWithProgress({ token, videoId, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/bunny/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const form = new FormData();
    form.append("videoId", videoId);
    form.append("file", file);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress?.(pct);
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) return resolve(json);
        reject(new Error(json?.error || "Upload failed"));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

// â”€â”€ Module row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModuleRow({ m, i, onChange, onRemove, accessToken }) {
  const parsed = parseBunny(m.videoUrl || "");
  const isBunny = parsed?.kind === "bunny";
  const playableSrc = isBunny
    ? bunnyIframeSrc(parsed.libId, parsed.videoId)
    : parsed?.src;

  const [prog, setProg] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setProg(1);
      const created = await bunnyCreate(
        accessToken,
        `module-${m.code || "untitled"}-${Date.now()}`
      );
      const uploaded = await bunnyUploadWithProgress({
        token: accessToken,
        videoId: created.videoId,
        file,
        onProgress: (p) => setProg(p),
      });
      onChange(i, { ...m, videoUrl: uploaded.shorthand }); // bunny:LIB:VIDEO
    } catch (err) {
      alert(err.message || "Upload failed");
    } finally {
      setBusy(false);
      setProg(0);
      e.target.value = "";
    }
  }

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

      <div className="sm:col-span-2 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Module video (Bunny embed/CDN URL, bunny:LIB:VIDEO, or MP4/Cloudinary)"
          value={m.videoUrl || ""}
          onChange={(e) => onChange(i, { ...m, videoUrl: e.target.value })}
        />
        <label className={`btn btn-sm shrink-0 ${busy ? "opacity-60" : ""}`}>
          Upload
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={busy}
            onChange={handleUpload}
          />
        </label>
      </div>

      <textarea
        className="input sm:col-span-3"
        rows={2}
        placeholder="Assignment prompt / instructions (optional)"
        value={m.assignmentPrompt || ""}
        onChange={(e) =>
          onChange(i, { ...m, assignmentPrompt: e.target.value })
        }
      />

      {prog > 0 && (
        <div className="sm:col-span-5">
          <div className="h-2 bg-slate-200 rounded overflow-hidden">
            <div className="h-full bg-black" style={{ width: `${prog}%` }} />
          </div>
        </div>
      )}

      {playableSrc && (
        <div className="sm:col-span-5 rounded overflow-hidden border bg-black">
          {isBunny ? (
            <iframe
              src={playableSrc}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              className="w-full h-44"
              title={`module-${i}-bunny`}
            />
          ) : (
            <video
              className="w-full h-44 object-cover"
              src={playableSrc}
              controls
              preload="metadata"
            />
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ AdminCourses page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminCourses() {
  const { accessToken } = useAuth();
  const [qs] = useSearchParams();
  const editingSku = qs.get("edit") || "";

  function blankDraft() {
    return {
      sku: "",
      title: "",
      blurb: "",
      description: "",
      thumbnailUrl: "",
      onboardingVideoUrl: "",
      classroomJoinUrl: "",
      classroomProvider: "google_classroom",
      classroomCourseId: "",
      classroomNotes: "",
      certificateTemplateUrl: "",
      isPublished: true,
      sort: 0,
      modules: [],
    };
  }

  function courseToDraft(course = {}) {
    return {
      sku: course.sku || "",
      title: course.title || "",
      blurb: course.blurb || "",
      description: course.description || "",
      thumbnailUrl: course.thumbnailUrl || "",
      onboardingVideoUrl: course.onboardingVideoUrl || "",
      classroomJoinUrl: course.classroomJoinUrl || "",
      classroomProvider: course.classroomProvider || "google_classroom",
      classroomCourseId: course.classroomCourseId || "",
      classroomNotes: course.classroomNotes || "",
      certificateTemplateUrl: course.certificateTemplateUrl || "",
      isPublished: course.isPublished !== false,
      sort: course.sort ?? 0,
      modules: Array.isArray(course.modules) ? course.modules : [],
    };
  }

  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [draft, setDraft] = React.useState(blankDraft);
  const [onboardingProg, setOnboardingProg] = React.useState(0);
  const [onboardingBusy, setOnboardingBusy] = React.useState(false);

  async function handleOnboardingUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setOnboardingBusy(true);
      setOnboardingProg(50);
      const url = await uploadToCloudinary(file, "video");
      setDraft((prev) => ({ ...prev, onboardingVideoUrl: url }));
    } catch (err) {
      alert(err.message || "Upload failed");
    } finally {
      setOnboardingBusy(false);
      setOnboardingProg(0);
      e.target.value = "";
    }
  }

  async function uploadToCloudinary(file, resourceType) {
    const sig = await apiAuthed(`/admin/media/sign`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_type: resourceType }),
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
      if (sig.access_mode) fd.append("access_mode", sig.access_mode);
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.secure_url) {
      throw new Error(json?.error?.message || "Upload failed");
    }
    return json.secure_url;
  }

  const load = React.useCallback(async () => {
    try {
      const data = await apiAuthed("/admin/courses", { token: accessToken });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg(e.message || "Failed to load courses");
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    let ignore = false;

    (async () => {
      if (!editingSku) {
        setDraft(blankDraft());
        return;
      }

      try {
        const course = await apiAuthed(
          `/admin/courses/${encodeURIComponent(editingSku)}`,
          { token: accessToken },
        );
        if (!ignore) setDraft(courseToDraft(course));
        return;
      } catch {
        try {
          const product = await apiAuthed(
            `/admin/products/${encodeURIComponent(editingSku)}`,
            { token: accessToken },
          );

          const payload = {
            sku: editingSku,
            title: product.name || editingSku,
            blurb: product.blurb || "",
            description: product.description || "",
            thumbnailUrl: product.thumbnailUrl || product.images?.[0] || "",
            onboardingVideoUrl: product.previewUrl || "",
            classroomJoinUrl: "",
            classroomProvider: "google_classroom",
            classroomCourseId: "",
            classroomNotes: "",
            certificateTemplateUrl: "",
            isPublished: false,
            sort: product.sort ?? 0,
            modules: [],
          };

          const created = await apiAuthed("/admin/courses", {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!ignore) {
            setDraft(courseToDraft(created));
            setMsg("Course setup created for this product. Add your Google Classroom link and save.");
            load();
          }
        } catch (inner) {
          if (!ignore) {
            setMsg(inner.message || "Failed to prepare course for editing");
          }
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [editingSku, accessToken, load]);

  async function createCourse(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiAuthed("/admin/courses", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setDraft(blankDraft());
      setMsg("Course created.");
      load();
    } catch (err) {
      setMsg(err.message || "Failed to create course");
    }
  }

  async function patchCourse(sku, body) {
    try {
      setMsg("");
      await apiAuthed(`/admin/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      load();
    } catch (err) {
      setMsg(err.message || "Failed to update course");
    }
  }

  async function delCourse(sku) {
    try {
      setMsg("");
      await apiAuthed(`/admin/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
        method: "DELETE",
      });
      setMsg("Course deleted.");
      load();
    } catch (err) {
      setMsg(err.message || "Failed to delete course");
    }
  }

  async function saveCourse(e) {
    e.preventDefault();
    const targetSku = editingSku || draft.sku;
    try {
      setMsg("");
      await apiAuthed(`/admin/courses/${encodeURIComponent(targetSku)}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setMsg("Course updated.");
      load();
    } catch (err) {
      setMsg(err.message || "Failed to save course");
    }
  }

  const onboardingParsed = parseBunny(draft.onboardingVideoUrl || "");
  const onboardingIsBunny = onboardingParsed?.kind === "bunny";
  const onboardingSrc = onboardingIsBunny
    ? bunnyIframeSrc(onboardingParsed.libId, onboardingParsed.videoId)
    : onboardingParsed?.src;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin - Courses</h1>
        {msg ? <div className="mt-2 text-sm">{msg}</div> : null}
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {editingSku ? `Edit course - ${editingSku}` : "Create course"}
          </h2>
          {editingSku ? (
            <Link className="btn btn-sm" to="/admin/courses">
              New course
            </Link>
          ) : null}
        </div>

        <form
          onSubmit={editingSku ? saveCourse : createCourse}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input
            className="input"
            placeholder="SKU"
            value={draft.sku}
            onChange={(e) => setDraft((prev) => ({ ...prev, sku: e.target.value }))}
            required
            disabled={!!editingSku}
          />
          <input
            className="input"
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            required
          />

          <input
            className="input sm:col-span-2"
            placeholder="Blurb"
            value={draft.blurb}
            onChange={(e) => setDraft((prev) => ({ ...prev, blurb: e.target.value }))}
          />

          <textarea
            className="input sm:col-span-2"
            rows={3}
            placeholder="Course description"
            value={draft.description}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, description: e.target.value }))
            }
          />

          <label className="text-sm">
            <div className="mb-1">Thumbnail URL</div>
            <input
              className="input"
              value={draft.thumbnailUrl}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, thumbnailUrl: e.target.value }))
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
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await uploadToCloudinary(file, "image");
                  if (url) {
                    setDraft((prev) => ({ ...prev, thumbnailUrl: url }));
                  }
                }}
              />
            </label>
            {draft.thumbnailUrl ? (
              <img
                src={draft.thumbnailUrl}
                className="h-10 w-16 rounded border object-cover"
                alt=""
              />
            ) : null}
          </div>

          <label className="text-sm sm:col-span-2">
            <div className="mb-1">Onboarding video</div>
            <input
              className="input"
              value={draft.onboardingVideoUrl}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, onboardingVideoUrl: e.target.value }))
              }
            />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2">
            <label className={`btn btn-sm ${onboardingBusy ? "opacity-60" : ""}`}>
              Upload video
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={onboardingBusy}
                onChange={handleOnboardingUpload}
              />
            </label>

            {onboardingProg > 0 ? (
              <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                <div
                  className="h-full bg-black"
                  style={{ width: `${onboardingProg}%` }}
                />
              </div>
            ) : null}

            {onboardingSrc ? (
              <div className="h-24 w-40 overflow-hidden rounded border bg-black">
                {onboardingIsBunny ? (
                  <iframe
                    src={onboardingSrc}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen
                    className="h-full w-full"
                    title="onboarding-preview"
                  />
                ) : (
                  <video
                    className="h-full w-full object-cover"
                    src={onboardingSrc}
                    controls
                    preload="metadata"
                  />
                )}
              </div>
            ) : null}
          </div>

          <label className="text-sm sm:col-span-2">
            <div className="mb-1">Google Classroom join link</div>
            <input
              className="input"
              placeholder="https://classroom.google.com/..."
              value={draft.classroomJoinUrl}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, classroomJoinUrl: e.target.value }))
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1">Classroom provider</div>
            <select
              className="input"
              value={draft.classroomProvider}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, classroomProvider: e.target.value }))
              }
            >
              <option value="google_classroom">Google Classroom</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1">Classroom course ID</div>
            <input
              className="input"
              placeholder="Optional Google course id"
              value={draft.classroomCourseId}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, classroomCourseId: e.target.value }))
              }
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <div className="mb-1">Learner note</div>
            <textarea
              className="input"
              rows={3}
              placeholder="Instructions for joining or using the classroom"
              value={draft.classroomNotes}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, classroomNotes: e.target.value }))
              }
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <div className="mb-1">Certificate template (PDF)</div>
            <input
              className="input"
              placeholder="Cloudinary URL of the certificate PDF"
              value={draft.certificateTemplateUrl}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  certificateTemplateUrl: e.target.value,
                }))
              }
            />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2">
            <label className="btn btn-sm">
              Upload certificate (PDF)
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.type !== "application/pdf") {
                    alert("Only PDF files are allowed for the certificate template.");
                    e.target.value = "";
                    return;
                  }
                  try {
                    // Upload PDF to Cloudflare R2 (serves with correct Content-Type)
                    const fd = new FormData();
                    fd.append("file", file);
                    const res = await apiAuthed("/admin/media/upload-certificate", {
                      token: accessToken,
                      method: "POST",
                      body: fd,
                    });
                    if (res?.secure_url) {
                      setDraft((prev) => ({ ...prev, certificateTemplateUrl: res.secure_url }));
                    }
                  } catch (err) {
                    alert(err.message || "Certificate upload failed");
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {draft.certificateTemplateUrl ? (
              <a
                className="text-sm text-adlm-blue-700 underline truncate max-w-xs"
                href={draft.certificateTemplateUrl}
                target="_blank"
                rel="noreferrer"
              >
                View uploaded certificate
              </a>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="font-medium">Modules</div>
            {draft.modules.map((module, index) => (
              <ModuleRow
                key={`${module.code || "module"}-${index}`}
                m={module}
                i={index}
                accessToken={accessToken}
                onChange={(idx, nextModule) =>
                  setDraft((prev) => {
                    const modules = prev.modules.slice();
                    modules[idx] = nextModule;
                    return { ...prev, modules };
                  })
                }
                onRemove={(idx) =>
                  setDraft((prev) => ({
                    ...prev,
                    modules: prev.modules.filter((_, moduleIndex) => moduleIndex !== idx),
                  }))
                }
              />
            ))}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  modules: [
                    ...prev.modules,
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
                setDraft((prev) => ({ ...prev, isPublished: e.target.checked }))
              }
            />
            Published
          </label>

          <input
            className="input"
            type="number"
            placeholder="Sort"
            value={draft.sort}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, sort: Number(e.target.value || 0) }))
            }
          />

          <button className="btn sm:col-span-2" type="submit">
            {editingSku ? "Save changes" : "Create"}
          </button>
        </form>
      </div>

      <div className="space-y-2">
        {items.map((course) => (
          <div
            key={course.sku}
            className="flex items-center justify-between gap-3 rounded border p-2"
          >
            <div className="flex items-center gap-3">
              {course.thumbnailUrl ? (
                <img
                  src={course.thumbnailUrl}
                  className="h-10 w-16 rounded border object-cover"
                  alt=""
                />
              ) : (
                <div className="h-10 w-16 rounded border bg-slate-100" />
              )}
              <div className="text-sm">
                <div className="font-medium">{course.title}</div>
                <div className="text-slate-600">
                  sku: {course.sku} - sort: {course.sort} - {course.isPublished ? "published" : "hidden"}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                className="btn btn-sm"
                to={`/admin/courses?edit=${encodeURIComponent(course.sku)}`}
              >
                Edit
              </Link>
              <Link
                className="btn btn-sm"
                to={`/admin/products/${encodeURIComponent(course.sku)}/edit`}
              >
                Product
              </Link>
              {course.classroomJoinUrl ? (
                <a
                  className="btn btn-sm"
                  href={course.classroomJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Classroom
                </a>
              ) : null}
              <button
                className="btn btn-sm"
                onClick={() =>
                  patchCourse(course.sku, { isPublished: !course.isPublished })
                }
              >
                {course.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button className="btn btn-sm" onClick={() => delCourse(course.sku)}>
                Delete
              </button>
            </div>
          </div>
        ))}

        {!items.length ? (
          <div className="text-sm text-slate-600">No courses yet.</div>
        ) : null}
      </div>
    </div>
  );
}
