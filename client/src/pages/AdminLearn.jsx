// src/pages/AdminLearn.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminLearn() {
  const { accessToken } = useAuth();
  const [free, setFree] = React.useState([]);
  const [courses, setCourses] = React.useState([]);
  const [msg, setMsg] = React.useState("");

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
    load();
  }, []);

  /* ------- Free videos ------- */
  async function addFree(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      title: fd.get("title"),
      youtubeId: fd.get("youtubeId"),
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

  /* ------- Paid courses ------- */
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
            placeholder="YouTube ID (e.g. dQw4...)"
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
            <input name="isPublished" type="checkbox" defaultChecked />
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
                  className="btn btn-sm"
                  onClick={() =>
                    saveFree({ ...v, isPublished: !v.isPublished })
                  }
                >
                  {v.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-sm" onClick={() => delFree(v._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
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
          <input
            name="previewUrl"
            className="input"
            placeholder="Preview video URL (MP4, HLS, etc.)"
            required
          />
          <input
            name="sort"
            type="number"
            className="input"
            placeholder="Sort (higher first)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input name="isPublished" type="checkbox" defaultChecked />
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
                    className="btn btn-sm"
                    onClick={() =>
                      saveCourse({ ...c, isPublished: !c.isPublished })
                    }
                  >
                    {c.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button
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
        </div>
      </div>
    </div>
  );
}
