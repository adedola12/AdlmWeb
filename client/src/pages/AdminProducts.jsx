// src/pages/AdminProducts.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function AdminProducts() {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  async function load() {
    setMsg("");
    try {
      const data = await apiAuthed("/admin/products", { token: accessToken });
      setItems(data);
    } catch (e) {
      setMsg(e.message);
    }
  }
  React.useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      key: fd.get("key"),
      name: fd.get("name"),
      blurb: fd.get("blurb"),
      priceMonthly: Number(fd.get("priceMonthly") || 0),
      previewUrl: fd.get("previewUrl") || undefined,
      thumbnailUrl: fd.get("thumbnailUrl") || undefined,
      isPublished: fd.get("isPublished") === "on",
      sort: Number(fd.get("sort") || 0),
    };
    await apiAuthed("/admin/products", {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    e.target.reset();
    load();
  }

  async function toggle(p) {
    await apiAuthed(`/admin/products/${p._id}`, {
      token: accessToken,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !p.isPublished }),
    });
    load();
  }

  async function del(id) {
    await apiAuthed(`/admin/products/${id}`, {
      token: accessToken,
      method: "DELETE",
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Products</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Add product</h2>
        <form onSubmit={add} className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            name="key"
            placeholder="Stable key (e.g. rategen)"
            required
          />
          <input className="input" name="name" placeholder="Name" required />
          <input
            className="input sm:col-span-2"
            name="blurb"
            placeholder="Short blurb"
          />
          <input
            className="input"
            name="priceMonthly"
            placeholder="Price monthly (display)"
            type="number"
          />
          <input
            className="input sm:col-span-2"
            name="previewUrl"
            placeholder="Preview video URL (MP4/Cloudinary)"
          />
          <input
            className="input sm:col-span-2"
            name="thumbnailUrl"
            placeholder="Thumbnail URL (optional)"
          />
          <input
            className="input"
            name="sort"
            placeholder="Sort (higher first)"
            type="number"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPublished" defaultChecked />{" "}
            Published
          </label>
          <button className="btn sm:col-span-2">Add</button>
        </form>
      </div>

      <div className="space-y-2">
        {items.map((p) => (
          <div
            key={p._id}
            className="border rounded p-2 flex items-center justify-between"
          >
            <div className="text-sm">
              <div className="font-medium">{p.name}</div>
              <div className="text-slate-600">
                key: {p.key} · sort: {p.sort} ·{" "}
                {p.isPublished ? "published" : "hidden"}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm" onClick={() => toggle(p)}>
                {p.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button className="btn btn-sm" onClick={() => del(p._id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!items.length && (
          <div className="text-sm text-slate-600">No products yet.</div>
        )}
      </div>
    </div>
  );
}
