// src/pages/AdminFreebies.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function safeStr(v) {
  return v == null ? "" : String(v);
}

function linesToVideos(txt) {
  return safeStr(txt)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url }));
}

function videosToLines(videos) {
  return (Array.isArray(videos) ? videos : [])
    .map((v) => (v?.url || "").trim())
    .filter(Boolean)
    .join("\n");
}

function uniqLines(txt) {
  const set = new Set();
  const out = [];
  safeStr(txt)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((u) => {
      const key = u.toLowerCase();
      if (!set.has(key)) {
        set.add(key);
        out.push(u);
      }
    });
  return out.join("\n");
}

function toYoutubeWatchUrl(youtubeId) {
  const id = safeStr(youtubeId).trim();
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

function fallbackYouTubeThumb(youtubeId) {
  const id = safeStr(youtubeId).trim();
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

export default function AdminFreebies() {
  const { accessToken } = useAuth();

  const [items, setItems] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [editingId, setEditingId] = React.useState(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [downloadUrl, setDownloadUrl] = React.useState("");
  const [videosText, setVideosText] = React.useState("");
  const [published, setPublished] = React.useState(true);

  // image upload state
  const [uploading, setUploading] = React.useState(false);
  const [pct, setPct] = React.useState(0);
  const [imgErr, setImgErr] = React.useState(false);
  const [localPreview, setLocalPreview] = React.useState(""); // objectURL for immediate preview
  const fileRef = React.useRef(null);

  // learn suggestions
  const [learnLoading, setLearnLoading] = React.useState(false);
  const [learnMsg, setLearnMsg] = React.useState("");
  const [learnQuery, setLearnQuery] = React.useState("");
  const [learnFree, setLearnFree] = React.useState([]); // FreeVideo
  const [learnCourses, setLearnCourses] = React.useState([]); // PaidCourse
  const [showLearnPicker, setShowLearnPicker] = React.useState(true);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const url = q
        ? `/admin/freebies?q=${encodeURIComponent(q)}`
        : "/admin/freebies";
      const data = await apiAuthed(url, { token: accessToken });
      if (!data?.ok) throw new Error(data?.error || "Failed to load freebies");
      setItems(data.items || []);
    } catch (e) {
      setMsg(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  // Fetch Learn library (free videos + courses) for suggestions
  async function loadLearnLibrary() {
    setLearnLoading(true);
    setLearnMsg("");
    try {
      // Fetch all published free videos (paged endpoint)
      const pageSize = 12;
      const maxPages = 20; // safety cap
      let page = 1;
      let allFree = [];
      let total = 0;

      while (page <= maxPages) {
        const res = await apiAuthed(
          `/learn/free?page=${page}&pageSize=${pageSize}`,
          { token: accessToken },
        );
        const items = Array.isArray(res?.items) ? res.items : [];
        total = Number(res?.total || 0);

        allFree = allFree.concat(items);

        if (!total) break;
        if (allFree.length >= total) break;
        if (items.length === 0) break;

        page += 1;
      }

      // Fetch published courses (non-paged endpoint)
      const coursesRes = await apiAuthed("/learn/courses", {
        token: accessToken,
      });
      const courses = Array.isArray(coursesRes) ? coursesRes : [];

      setLearnFree(allFree);
      setLearnCourses(courses);
    } catch (e) {
      setLearnMsg(e?.message || "Failed to load Learn videos");
      setLearnFree([]);
      setLearnCourses([]);
    } finally {
      setLearnLoading(false);
    }
  }

  React.useEffect(() => {
    if (!accessToken) return;
    load();
    loadLearnLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // cleanup local preview objectURL
  React.useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setDownloadUrl("");
    setVideosText("");
    setPublished(true);
    setMsg("");
    setImgErr(false);

    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview("");
    }
  }

  function startEdit(it) {
    setEditingId(it._id);
    setTitle(it.title || "");
    setDescription(it.description || "");
    setImageUrl(it.imageUrl || "");
    setDownloadUrl(it.downloadUrl || "");
    setVideosText(videosToLines(it.videos));
    setPublished(it.published !== false);
    setMsg("");
    setImgErr(false);

    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview("");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addVideoUrlToTextarea(url) {
    const u = safeStr(url).trim();
    if (!u) return;

    // merge into textarea (unique)
    const next = uniqLines([videosText, u].filter(Boolean).join("\n"));
    setVideosText(next);
  }

  function hasVideoUrl(url) {
    const u = safeStr(url).trim().toLowerCase();
    if (!u) return false;
    const set = new Set(
      safeStr(videosText)
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    return set.has(u);
  }

  async function save() {
    setMsg("");
    try {
      const body = {
        title: title.trim(),
        description,
        imageUrl,
        downloadUrl,
        videos: linesToVideos(videosText),
        published,
      };

      if (!body.title) throw new Error("Title is required");

      if (!editingId) {
        const data = await apiAuthed("/admin/freebies", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!data?.ok) throw new Error(data?.error || "Create failed");
        setMsg("✅ Freebie created.");
      } else {
        const data = await apiAuthed(`/admin/freebies/${editingId}`, {
          token: accessToken,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!data?.ok) throw new Error(data?.error || "Update failed");
        setMsg("✅ Freebie updated.");
      }

      await load();
      resetForm();
    } catch (e) {
      setMsg(`❌ ${e?.message || "Save failed"}`);
    }
  }

  async function togglePublish(it, next) {
    setMsg("");
    try {
      const data = await apiAuthed(`/admin/freebies/${it._id}/publish`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!data?.ok) throw new Error(data?.error || "Publish update failed");
      await load();
    } catch (e) {
      setMsg(`❌ ${e?.message || "Publish failed"}`);
    }
  }

  async function remove(it) {
    if (!window.confirm("Delete this freebie?")) return;
    setMsg("");
    try {
      const data = await apiAuthed(`/admin/freebies/${it._id}`, {
        token: accessToken,
        method: "DELETE",
      });
      if (!data?.ok) throw new Error(data?.error || "Delete failed");
      setMsg("✅ Deleted.");
      await load();
      if (editingId === it._id) resetForm();
    } catch (e) {
      setMsg(`❌ ${e?.message || "Delete failed"}`);
    }
  }

  async function uploadToCloudinary(file) {
    setUploading(true);
    setPct(0);
    setMsg("Uploading image…");

    try {
      const sig = await apiAuthed(`/admin/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: "image",
          folder: "adlm/freebies",
        }),
      });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);
      if (sig.public_id) fd.append("public_id", sig.public_id);
      if (sig.eager) fd.append("eager", sig.eager);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`;

      const secureUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setPct(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
              resolve(json.secure_url);
            } else {
              reject(
                new Error(
                  json?.error?.message || `Upload failed (${xhr.status})`,
                ),
              );
            }
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fd);
      });

      return secureUrl;
    } finally {
      setUploading(false);
      setTimeout(() => setPct(0), 700);
    }
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImgErr(false);

    // instant preview
    try {
      if (localPreview) URL.revokeObjectURL(localPreview);
      const obj = URL.createObjectURL(file);
      setLocalPreview(obj);
    } catch {
      // ignore preview errors
    }

    try {
      const url = await uploadToCloudinary(file);
      setImageUrl(url);
      setMsg("✅ Image uploaded.");
    } catch (err) {
      setMsg(`❌ ${err?.message || "Upload failed"}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const imagePreviewSrc = localPreview || imageUrl;

  // build learn suggestion list
  const suggestions = React.useMemo(() => {
    const qx = safeStr(learnQuery).trim().toLowerCase();

    const free = (Array.isArray(learnFree) ? learnFree : []).map((v) => {
      const url = toYoutubeWatchUrl(v.youtubeId);
      const thumb = v.thumbnailUrl || fallbackYouTubeThumb(v.youtubeId);
      return {
        key: `free:${v._id || v.youtubeId || url}`,
        type: "Free video",
        title: v.title || "Untitled",
        url,
        thumb,
      };
    });

    const courses = (Array.isArray(learnCourses) ? learnCourses : []).map(
      (c) => {
        const url = safeStr(c.previewUrl).trim();
        return {
          key: `course:${c._id || c.sku || url}`,
          type: "Course",
          title: c.title || c.sku || "Course preview",
          url,
          thumb: safeStr(c.thumbnailUrl).trim(), // if you have it in model
        };
      },
    );

    const all = free.concat(courses).filter((x) => !!x.url);

    if (!qx) return all;

    return all.filter((x) => {
      const hay = `${x.type} ${x.title} ${x.url}`.toLowerCase();
      return hay.includes(qx);
    });
  }, [learnFree, learnCourses, learnQuery]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="rounded-xl bg-slate-900 text-white p-5 shadow">
        <div className="text-xl font-semibold">Admin · Freebies</div>
        <div className="text-sm text-slate-300 mt-1">
          Add image, download link, description, and related videos.
        </div>
      </div>

      {msg && (
        <div className="bg-white rounded-lg ring-1 ring-slate-200 p-3 text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="lg:col-span-1 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4 space-y-3">
          <div className="font-semibold">
            {editingId ? "Edit Freebie" : "Create Freebie"}
          </div>

          <div>
            <label className="text-xs text-slate-500">Title *</label>
            <input
              className="mt-1 w-full input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., ADLM Time Management Setup"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">Description</label>
            <textarea
              className="mt-1 w-full input min-h-[110px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description..."
            />
          </div>

          {/* Image URL + Upload + Preview */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-500">Image URL</label>
              <input
                className="mt-1 w-full input"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImgErr(false);
                  // if admin types URL manually, don't keep old local preview
                  if (localPreview) {
                    URL.revokeObjectURL(localPreview);
                    setLocalPreview("");
                  }
                }}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                className={`btn btn-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}
              >
                Upload image
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickImage}
                  disabled={uploading}
                  className="hidden"
                />
              </label>

              {uploading && (
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden">
                      <div
                        className="h-2 bg-blue-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right">{pct}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-slate-50 p-2">
              <div className="text-xs text-slate-500 mb-2">Image preview</div>
              <div className="w-full aspect-video bg-white rounded overflow-hidden ring-1 ring-slate-200">
                {imagePreviewSrc && !imgErr ? (
                  <img
                    src={imagePreviewSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImgErr(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                    {imgErr ? "Couldn’t load image." : "No image yet."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">Download link</label>
            <input
              className="mt-1 w-full input"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://... (setup file)"
            />
          </div>

          {/* Learn video suggestions */}
          <div className="rounded-xl border bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Learn videos picker</div>
                <div className="text-xs text-slate-500">
                  Click “Add” to append to the URL list below.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm bg-white text-slate-800 border border-slate-200 hover:bg-slate-50"
                onClick={() => setShowLearnPicker((s) => !s)}
              >
                {showLearnPicker ? "Hide" : "Show"}
              </button>
            </div>

            {showLearnPicker && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    className="input w-full"
                    value={learnQuery}
                    onChange={(e) => setLearnQuery(e.target.value)}
                    placeholder="Search Learn videos…"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={loadLearnLibrary}
                    disabled={learnLoading}
                  >
                    Refresh
                  </button>
                </div>

                {learnMsg && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded p-2">
                    {learnMsg}
                  </div>
                )}

                {learnLoading ? (
                  <div className="text-xs text-slate-500">
                    Loading Learn videos…
                  </div>
                ) : (
                  <div className="max-h-[260px] overflow-auto space-y-2 pr-1">
                    {suggestions.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        No videos found.
                      </div>
                    ) : (
                      suggestions.slice(0, 80).map((v) => {
                        const added = hasVideoUrl(v.url);
                        return (
                          <div
                            key={v.key}
                            className="flex items-center gap-3 rounded-lg border bg-slate-50 p-2"
                          >
                            <div className="w-16 h-10 rounded overflow-hidden bg-slate-200 shrink-0">
                              {v.thumb ? (
                                <img
                                  src={v.thumb}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // hide broken thumb
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-slate-500">
                                {v.type}
                              </div>
                              <div
                                className="text-sm font-medium truncate"
                                title={v.title}
                              >
                                {v.title}
                              </div>
                              <div
                                className="text-[11px] text-slate-500 truncate"
                                title={v.url}
                              >
                                {v.url}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                className="text-xs underline text-slate-600"
                                href={v.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                              <button
                                type="button"
                                className={`btn btn-sm ${added ? "opacity-60 pointer-events-none" : ""}`}
                                onClick={() => addVideoUrlToTextarea(v.url)}
                                title={
                                  added
                                    ? "Already added"
                                    : "Add to related videos"
                                }
                              >
                                {added ? "Added" : "Add"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500">
              Related videos (one URL per line)
            </label>
            <textarea
              className="mt-1 w-full input min-h-[110px]"
              value={videosText}
              onChange={(e) => setVideosText(e.target.value)}
              placeholder="https://youtu.be/...\nhttps://youtube.com/watch?v=..."
            />
            <div className="mt-1 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Tip: duplicates are okay, but “Add” avoids duplicates
                automatically.
              </div>
              <button
                type="button"
                className="text-[11px] underline text-slate-600"
                onClick={() => setVideosText(uniqLines(videosText))}
              >
                Remove duplicates
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Published
          </label>

          <div className="flex gap-2">
            <button onClick={save} className="btn w-full" disabled={uploading}>
              {editingId ? "Save changes" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="btn w-full bg-white text-slate-800 border border-slate-200 hover:bg-slate-50"
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">All Freebies</div>
            <div className="ml-auto flex gap-2">
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
              />
              <button className="btn" onClick={load} disabled={loading}>
                Search
              </button>
            </div>
          </div>

          {loading && <div className="text-sm text-slate-600">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="text-sm text-slate-600">No freebies yet.</div>
          )}

          <div className="space-y-3">
            {items.map((it) => (
              <div
                key={it._id}
                className="rounded-xl ring-1 ring-slate-200 p-4 flex gap-3 items-start"
              >
                <div className="w-20 h-16 bg-slate-100 rounded overflow-hidden shrink-0">
                  {it.imageUrl ? (
                    <img
                      src={it.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : null}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{it.title}</div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ring-1 ${
                        it.published
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-amber-50 text-amber-800 ring-amber-100"
                      }`}
                    >
                      {it.published ? "Published" : "Draft"}
                    </span>
                  </div>

                  {it.description ? (
                    <div className="text-sm text-slate-600 mt-1 line-clamp-2">
                      {it.description}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {it.downloadUrl ? (
                      <span>✅ Download</span>
                    ) : (
                      <span>— No download</span>
                    )}
                    {Array.isArray(it.videos) && it.videos.length > 0 ? (
                      <span>🎥 {it.videos.length} video(s)</span>
                    ) : (
                      <span>— No videos</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button className="btn btn-sm" onClick={() => startEdit(it)}>
                    Edit
                  </button>

                  <button
                    className="btn btn-sm bg-white text-slate-800 border border-slate-200 hover:bg-slate-50"
                    onClick={() => togglePublish(it, !it.published)}
                  >
                    {it.published ? "Unpublish" : "Publish"}
                  </button>

                  <button
                    className="btn btn-sm bg-rose-600 hover:bg-rose-700"
                    onClick={() => remove(it)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
