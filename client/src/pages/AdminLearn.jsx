// src/pages/AdminLearn.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

// normalize any YT input into just an ID before saving
function normalizeYouTubeId(input) {
  if (!input) return "";
  let id = String(input).trim();
  try {
    const u = new URL(id);
    if (u.host.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.searchParams.get("v")) id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/\/(embed|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  } catch {}
  return id;
}

export default function AdminLearn() {
  const { accessToken } = useAuth();
  const [free, setFree] = React.useState([]);
  const [courses, setCourses] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const previewUrlInputRef = React.useRef(null);

  async function load() {
    setMsg("");
    try {
      const [fv, pc] = await Promise.all([
        apiAuthed(`/admin/learn/free`, { token: accessToken }),
        apiAuthed(`/admin/learn/courses`, { token: accessToken }),
      ]);
      setFree(fv);
      setCourses(pc);
    } catch (e) {
      setMsg(e.message);
    }
  }

  React.useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  // ----- Free videos -----
  async function addFree(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      title: fd.get("title"),
      youtubeId: normalizeYouTubeId(fd.get("youtubeId")),
      thumbnailUrl: fd.get("thumbnailUrl") || undefined,
      isPublished: fd.get("isPublished") === "on",
      sort: Number(fd.get("sort") || 0),
    };
    await apiAuthed(`/admin/learn/free`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    e.target.reset();
    await load();
  }

  async function saveFree(item) {
    await apiAuthed(`/admin/learn/free/${item._id}`, {
      token: accessToken,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    await load();
  }

  async function delFree(id) {
    await apiAuthed(`/admin/learn/free/${id}`, {
      token: accessToken,
      method: "DELETE",
    });
    await load();
  }

  // ----- Paid courses -----
  async function addCourse(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const bullets = (fd.get("bullets") || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      sku: fd.get("sku"),
      title: fd.get("title"),
      previewUrl: fd.get("previewUrl"),
      bullets,
      description: fd.get("description") || "",
      isPublished: fd.get("isPublished") === "on",
      sort: Number(fd.get("sort") || 0),
    };
    await apiAuthed(`/admin/learn/courses`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    e.target.reset();
    await load();
  }

  async function saveCourse(item) {
    await apiAuthed(`/admin/learn/courses/${item._id}`, {
      token: accessToken,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    await load();
  }

  async function delCourse(id) {
    await apiAuthed(`/admin/learn/courses/${id}`, {
      token: accessToken,
      method: "DELETE",
    });
    await load();
  }

  // ----- Cloudinary: signed client upload -----
  async function uploadPreviewFromFile(file) {
    if (!file) return;
    setUploading(true);
    setMsg("");
    try {
      const sig = await apiAuthed(`/admin/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: "video" }), // folder defaults server-side
      });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);

      const cloudUrl = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`;
      const upRes = await fetch(cloudUrl, { method: "POST", body: fd }).then(
        (r) => r.json()
      );
      if (upRes.error) throw new Error(upRes.error.message || "Upload failed");

      if (previewUrlInputRef.current) {
        previewUrlInputRef.current.value = upRes.secure_url;
      }
      setMsg("Preview uploaded to Cloudinary.");
    } catch (e) {
      setMsg(e.message || "Upload error");
    } finally {
      setUploading(false);
    }
  }

  // Server-side ingestion of a remote MP4/WebM
  async function uploadPreviewFromUrl(remoteUrl) {
    if (!remoteUrl) return;
    setUploading(true);
    setMsg("");
    try {
      const out = await apiAuthed(`/admin/media/upload-url`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: remoteUrl }),
      });
      if (previewUrlInputRef.current) {
        previewUrlInputRef.current.value = out.secure_url;
      }
      setMsg("Remote preview ingested to Cloudinary.");
    } catch (e) {
      setMsg(e.message || "Upload error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Learn</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Free videos */}
      <div className="card">
        <h2 className="font-semibold mb-3">Free Videos (YouTube)</h2>

        <form onSubmit={addFree} className="grid sm:grid-cols-2 gap-3 mb-4">
          <input name="title" className="input" placeholder="Title" required />
          <input
            name="youtubeId"
            className="input"
            placeholder="YouTube URL or ID"
            required
          />
          <input
            name="thumbnailUrl"
            className="input"
            placeholder="(Optional) Thumbnail URL"
          />
          <input
            name="sort"
            type="number"
            className="input"
            placeholder="Sort (higher first)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input name="isPublished" type="checkbox" defaultChecked />{" "}
            Published
          </label>
          <button className="btn">Add video</button>
        </form>

        <div className="space-y-2">
          {free.map((v) => (
            <div
              key={v._id}
              className="border rounded p-2 flex items-center justify-between gap-3"
            >
              <div className="text-sm">
                <div className="font-medium">{v.title}</div>
                <div className="text-slate-600">
                  yt: {v.youtubeId} · sort: {v.sort} ·{" "}
                  {v.isPublished ? "published" : "hidden"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    saveFree({ ...v, isPublished: !v.isPublished })
                  }
                >
                  {v.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => delFree(v._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!free.length && (
            <div className="text-sm text-slate-600">No videos yet.</div>
          )}
        </div>
      </div>

      {/* Paid courses */}
      <div className="card">
        <h2 className="font-semibold mb-3">Paid Courses</h2>

        <form onSubmit={addCourse} className="grid sm:grid-cols-2 gap-3 mb-4">
          <input
            name="sku"
            className="input"
            placeholder="SKU (unique)"
            required
          />
          <input name="title" className="input" placeholder="Title" required />

          <div className="sm:col-span-2 grid gap-2">
            <input
              name="previewUrl"
              className="input"
              placeholder="Preview video URL (MP4, etc.)"
              ref={previewUrlInputRef}
              required
            />
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-sm cursor-pointer">
                Upload file
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => uploadPreviewFromFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                className="btn btn-sm"
                disabled={uploading}
                onClick={() => {
                  const u = prompt("Remote video URL to ingest (mp4/webm)?");
                  if (u) uploadPreviewFromUrl(u);
                }}
              >
                Ingest remote URL
              </button>
              {uploading && (
                <span className="text-sm text-slate-600">Uploading…</span>
              )}
            </div>
          </div>

          <input
            name="sort"
            type="number"
            className="input"
            placeholder="Sort (higher first)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input name="isPublished" type="checkbox" defaultChecked />{" "}
            Published
          </label>
          <textarea
            name="bullets"
            className="input"
            rows={4}
            placeholder="Bullets (one per line)"
          />
          <textarea
            name="description"
            className="input sm:col-span-2"
            rows={4}
            placeholder="Description"
          />
          <button className="btn sm:col-span-2">Add course</button>
        </form>

        <div className="space-y-2">
          {courses.map((c) => (
            <div key={c._id} className="border rounded p-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-slate-600">
                    sku: {c.sku} · sort: {c.sort} ·{" "}
                    {c.isPublished ? "published" : "hidden"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      saveCourse({ ...c, isPublished: !c.isPublished })
                    }
                  >
                    {c.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => delCourse(c._id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {c.previewUrl && (
                <video
                  className="w-full mt-2 rounded border"
                  src={c.previewUrl}
                  controls
                  preload="metadata"
                />
              )}
            </div>
          ))}
          {!courses.length && (
            <div className="text-sm text-slate-600">No courses yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
