// src/pages/AdminCourses.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function ModuleRow({ m, i, onChange, onRemove }) {
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
    </div>
  );
}

export default function AdminCourses() {
  const { accessToken } = useAuth();
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

  async function load() {
    try {
      const data = await apiAuthed("/admin/courses", { token: accessToken });
      setItems(data);
    } catch (e) {
      setMsg(e.message);
    }
  }
  React.useEffect(() => {
    load(); /* eslint-disable */
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Courses</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Create */}
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
          <input
            className="input"
            placeholder="Thumbnail URL"
            value={draft.thumbnailUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, thumbnailUrl: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="Onboarding video URL"
            value={draft.onboardingVideoUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, onboardingVideoUrl: e.target.value }))
            }
          />
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

          <button className="btn sm:col-span-2">Create</button>
        </form>
      </div>

      {/* List */}
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
