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
      const res = await fetch(`${API_BASE}/learn/free?page=${p}&pageSize=6`, {
        credentials: "include",
      });
      const json = await res.json();
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

// --- Small UI helpers --- //
function Thumb({ src, onPrimary, onRemove, primaryLabel = "Make thumbnail" }) {
  return (
    <div className="relative">
      <img src={src} className="w-24 h-24 object-cover rounded border" />
      <div className="mt-1 flex gap-1">
        {onPrimary && (
          <button type="button" className="btn btn-xs" onClick={onPrimary}>
            {primaryLabel}
          </button>
        )}
        <button type="button" className="btn btn-xs" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function MediaBrowserModal({
  open,
  onClose,
  type = "image",
  onPick,
  accessToken,
}) {
  const [items, setItems] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [next, setNext] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  async function load(cursor = null) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("type", type);
      if (q) qs.set("q", q);
      if (cursor) qs.set("next", cursor);

      const res = await fetch(
        `${API_BASE}/admin/media/assets?${qs.toString()}`,
        {
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const json = await res.json();

      if (cursor) setItems((prev) => [...prev, ...(json.items || [])]);
      else setItems(json.items || []);

      setNext(json.next || null);
    } finally {
      setLoading(false);
    }
  }

  // load when open / search changes / type changes
  React.useEffect(() => {
    if (open) load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, type]);

  // ESC closes modal
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // close if user clicks the dark overlay (outside the dialog)
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-semibold text-slate-900">
                Choose from Cloudinary{" "}
                <span className="text-slate-500">({type})</span>
              </div>
              <div className="text-xs text-slate-500">
                Click an asset to select • Esc or X to close
              </div>
            </div>

            {/* X close button */}
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full grid place-items-center hover:bg-slate-100 active:scale-95 transition"
              aria-label="Close"
              title="Close"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>
          </div>

          <div className="px-4 pb-3">
            <input
              className="input w-full"
              placeholder="Search filename..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-4 py-4">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <>
              <div
                className="
                  max-h-[65vh]
                  overflow-y-auto
                  pr-1
                "
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {items.map((it) => (
                    <button
                      key={it.public_id}
                      className="border rounded-xl overflow-hidden hover:shadow-sm transition bg-white"
                      onClick={() => onPick(it.url)}
                      title={it.public_id}
                      type="button"
                    >
                      {type === "image" ? (
                        <img
                          src={it.url}
                          className="w-full h-24 object-cover"
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <video
                          src={it.url}
                          className="w-full h-24 object-cover"
                          preload="metadata"
                        />
                      )}
                      <div className="px-2 py-1 text-[11px] text-slate-600 truncate">
                        {it.public_id}
                      </div>
                    </button>
                  ))}

                  {!items.length && (
                    <div className="text-sm text-slate-600 col-span-full">
                      No assets found.
                    </div>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="mt-4 flex items-center justify-between">
                <button type="button" className="btn btn-sm" onClick={onClose}>
                  Close
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!next || loading}
                  onClick={() => load(next)}
                >
                  Load more
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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

  // FIX: add missing modal states
  const [showImagePicker, setShowImagePicker] = React.useState(false);
  const [showVideoPicker, setShowVideoPicker] = React.useState(false);

  // small uploader (no progress UI here)
  async function uploadToCloudinary(
    file,
    resourceType /* "image" | "video" */
  ) {
    try {
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
        if (sig.public_id) fd.append("public_id", sig.public_id);
        if (sig.eager) fd.append("eager", sig.eager);
      }

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`;
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.secure_url) {
        throw new Error(json?.error?.message || "Upload failed");
      }
      return json.secure_url;
    } catch (e) {
      setMsg(`❌ ${e.message || "Upload error"}`);
      return null;
    }
  }

  React.useEffect(() => {
    (async () => {
      try {
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
      } catch (err) {
        setMsg(err?.message || "Failed to load product");
        setP(null);
      }
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
        images: Array.from(new Set(images)), // dedupe
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
          <Link className="btn btn-sm" to="/admin/products">
            Back to admin products
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
          {/* Image gallery */}
          <div>
            <div className="font-medium mb-2">Images</div>
            <div className="flex flex-wrap gap-3">
              {images.map((src, i) => (
                <div key={`${src}-${i}`} className="flex flex-col items-start">
                  <img
                    src={src}
                    className="w-24 h-24 object-cover rounded border"
                  />
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => setThumbnailUrl(src)}
                      title="Use as thumbnail"
                    >
                      Make thumbnail
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() =>
                        setImages((arr) => arr.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!images.length && (
                <div className="text-sm text-slate-600">No images yet.</div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="btn btn-sm">
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await uploadToCloudinary(f, "image");
                    if (url)
                      setImages((prev) => Array.from(new Set([...prev, url])));
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowImagePicker(true)}
              >
                Add from Cloudinary
              </button>
            </div>
          </div>

          {/* Preview & Thumbnail controls with tiny previews */}
          <div className="space-y-2">
            <div className="font-medium">Preview & Thumbnail</div>

            <div className="flex items-center gap-3">
              <div className="rounded overflow-hidden border bg-black">
                {previewUrl ? (
                  <video
                    className="w-40 h-24 object-cover"
                    src={previewUrl}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div className="w-40 h-24 flex items-center justify-center text-xs text-white/70">
                    No preview
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <input
                  className="input"
                  placeholder="Preview video URL"
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                />
                <div className="flex gap-2">
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
                        if (url) {
                          setPreviewUrl(url); // ✅ show it immediately
                          if (previewInputRef.current)
                            previewInputRef.current.value = url; // still persist in form
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowVideoPicker(true)}
                  >
                    Choose from Cloudinary
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {thumbnailUrl || images[0] ? (
                <img
                  src={thumbnailUrl || images[0]}
                  className="w-24 h-24 object-cover rounded border"
                  alt=""
                />
              ) : (
                <div className="w-24 h-24 rounded border bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                  No thumbnail
                </div>
              )}
              <input
                className="input"
                placeholder="Thumbnail URL"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Modals */}
          <MediaBrowserModal
            open={showImagePicker}
            onClose={() => setShowImagePicker(false)}
            type="image"
            accessToken={accessToken}
            onPick={(url) => {
              setImages((prev) => Array.from(new Set([...prev, url])));
              setShowImagePicker(false);
            }}
          />
          <MediaBrowserModal
            open={showVideoPicker}
            onClose={() => setShowVideoPicker(false)}
            type="video"
            accessToken={accessToken}
            onPick={(url) => {
              setPreviewUrl(url); // ✅ show it
              if (previewInputRef.current) previewInputRef.current.value = url; // persist in form
              setShowVideoPicker(false);
            }}
          />
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
