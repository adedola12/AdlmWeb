import React from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { API_BASE } from "../config";

/** Simple list with add/remove/reorder controls */
function ReorderableList({
  title,
  items,
  setItems,
  placeholder = "Add item…",
}) {
  const [input, setInput] = React.useState("");

  function add() {
    const v = input.trim();
    if (!v) return;
    setItems((arr) => [...arr, v]);
    setInput("");
  }
  function remove(i) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }
  function move(i, dir) {
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  return (
    <div className="space-y-2">
      <div className="font-medium">{title}</div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-sm" type="button" onClick={add}>
          Add
        </button>
      </div>
      <ul className="text-sm space-y-1">
        {items.map((v, i) => (
          <li
            key={`${v}-${i}`}
            className="border rounded px-2 py-1 flex items-center justify-between gap-2"
          >
            <span className="truncate">{v}</span>
            <div className="flex gap-1">
              <button
                className="btn btn-xs"
                type="button"
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                className="btn btn-xs"
                type="button"
                onClick={() => move(i, +1)}
              >
                ↓
              </button>
              <button
                className="btn btn-xs"
                type="button"
                onClick={() => remove(i)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-slate-500">No items yet.</li>}
      </ul>
    </div>
  );
}

/** Video picker from Learn/free */
function FreeVideoPicker({ selected, setSelected }) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState({
    items: [],
    total: 0,
    page: 1,
    pageSize: 6,
  });
  const [loading, setLoading] = React.useState(false);

  async function load(p = 1) {
    setLoading(true);
    try {
      // Using public Learn endpoint (published only). Swap to admin if needed.
      const res = await fetch(`${API_BASE}/learn/free?page=${p}&pageSize=6`, {
        credentials: "include",
      });
      const json = await res.json();
      // naive client-side "search"
      const items = (json.items || []).filter(
        (x) => !query || x.title.toLowerCase().includes(query.toLowerCase())
      );
      setData({ ...json, items });
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);

  function toggle(v) {
    setSelected((arr) => {
      const exists = arr.find((id) => id === v._id);
      if (exists) return arr.filter((id) => id !== v._id);
      return [...arr, v._id];
    });
  }

  return (
    <div className="space-y-2">
      <div className="font-medium">Reference free videos</div>
      <input
        className="input"
        placeholder="Search title…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.items.map((v) => {
              const checked = selected.includes(v._id);
              return (
                <label
                  key={v._id}
                  className="border rounded p-2 flex items-start gap-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(v)}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <div className="font-medium">{v.title}</div>
                    <div className="text-slate-600">YT: {v.youtubeId}</div>
                  </div>
                </label>
              );
            })}
            {!data.items.length && (
              <div className="text-sm text-slate-600">No results.</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <div className="text-sm text-slate-600">
              Page {page} of {pages}
            </div>
            <button
              className="btn btn-sm"
              disabled={page >= pages}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminProductEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { accessToken } = useAuth();

  const [p, setP] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // local pieces we can manipulate
  const [name, setName] = React.useState("");
  const [blurb, setBlurb] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [features, setFeatures] = React.useState([]);
  const [images, setImages] = React.useState([]);
  const [billingInterval, setBillingInterval] = React.useState("monthly");
  const [price, setPrice] = React.useState({
    monthlyNGN: 0,
    yearlyNGN: 0,
    installNGN: 0,
    monthlyUSD: "",
    yearlyUSD: "",
    installUSD: "",
  });
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [thumbnailUrl, setThumbnailUrl] = React.useState("");
  const [isPublished, setIsPublished] = React.useState(true);
  const [sort, setSort] = React.useState(0);
  const [relatedFreeVideoIds, setRelatedFreeVideoIds] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      const data = await apiAuthed(`/admin/products/${id}`, {
        token: accessToken,
      });
      setP(data);
      setName(data.name || "");
      setBlurb(data.blurb || "");
      setDescription(data.description || "");
      setFeatures(Array.isArray(data.features) ? data.features : []);
      setImages(Array.isArray(data.images) ? data.images : []);
      setBillingInterval(data.billingInterval || "monthly");
      setPrice({
        monthlyNGN: data.price?.monthlyNGN ?? 0,
        yearlyNGN: data.price?.yearlyNGN ?? 0,
        installNGN: data.price?.installNGN ?? 0,
        monthlyUSD: data.price?.monthlyUSD ?? "",
        yearlyUSD: data.price?.yearlyUSD ?? "",
        installUSD: data.price?.installUSD ?? "",
      });
      setPreviewUrl(data.previewUrl || "");
      setThumbnailUrl(data.thumbnailUrl || "");
      setIsPublished(!!data.isPublished);
      setSort(data.sort ?? 0);
      setRelatedFreeVideoIds(
        (data.relatedFreeVideoIds || []).map((v) => v._id)
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        name,
        blurb,
        description,
        features,
        images,
        billingInterval,
        price: {
          monthlyNGN: Number(price.monthlyNGN || 0),
          yearlyNGN: Number(price.yearlyNGN || 0),
          installNGN: Number(price.installNGN || 0),
        },
        previewUrl: previewUrl || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        isPublished,
        sort: Number(sort || 0),
        relatedFreeVideoIds,
      };
      // optional USD overrides (empty string → unset)
      if (price.monthlyUSD !== "")
        payload.price.monthlyUSD = Number(price.monthlyUSD);
      if (price.yearlyUSD !== "")
        payload.price.yearlyUSD = Number(price.yearlyUSD);
      if (price.installUSD !== "")
        payload.price.installUSD = Number(price.installUSD);

      await apiAuthed(`/admin/products/${id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMsg("✅ Saved.");
    } catch (e) {
      setMsg(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!p) return <div className="card">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit product</h1>
        <div className="flex gap-2">
          <Link className="btn btn-sm" to="/products">
            Back to products
          </Link>
          <button className="btn btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card space-y-2">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <textarea
            className="input"
            rows={2}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Short blurb"
          />
          <textarea
            className="input"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Long description (markdown/plain)"
          />

          <label className="text-sm">
            Billing interval
            <select
              className="input mt-1"
              value={billingInterval}
              onChange={(e) => setBillingInterval(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              NGN / month
              <input
                className="input mt-1"
                type="number"
                value={price.monthlyNGN}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, monthlyNGN: e.target.value }))
                }
              />
            </label>
            <label className="text-xs">
              NGN / year
              <input
                className="input mt-1"
                type="number"
                value={price.yearlyNGN}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, yearlyNGN: e.target.value }))
                }
              />
            </label>
            <label className="text-xs">
              NGN install
              <input
                className="input mt-1"
                type="number"
                value={price.installNGN}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, installNGN: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              USD / month (opt)
              <input
                className="input mt-1"
                type="number"
                value={price.monthlyUSD}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, monthlyUSD: e.target.value }))
                }
              />
            </label>
            <label className="text-xs">
              USD / year (opt)
              <input
                className="input mt-1"
                type="number"
                value={price.yearlyUSD}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, yearlyUSD: e.target.value }))
                }
              />
            </label>
            <label className="text-xs">
              USD install (opt)
              <input
                className="input mt-1"
                type="number"
                value={price.installUSD}
                onChange={(e) =>
                  setPrice((d) => ({ ...d, installUSD: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              Published
            </label>
            <label className="text-xs">
              Sort
              <input
                className="input ml-2 w-24"
                type="number"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="card space-y-4">
          <ReorderableList
            title="Features"
            items={features}
            setItems={setFeatures}
            placeholder="Add a feature…"
          />

          <ReorderableList
            title="Images (URLs)"
            items={images}
            setItems={setImages}
            placeholder="https://…"
          />

          <div className="space-y-2">
            <div className="font-medium">Preview & Thumbnail</div>
            <input
              className="input"
              placeholder="Preview video URL"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
            />
            <input
              className="input"
              placeholder="Thumbnail URL"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <FreeVideoPicker
          selected={relatedFreeVideoIds}
          setSelected={setRelatedFreeVideoIds}
        />
        {!!relatedFreeVideoIds.length && (
          <div className="mt-2 text-sm text-slate-600">
            Selected: {relatedFreeVideoIds.length} video(s)
          </div>
        )}
      </div>
    </div>
  );
}
