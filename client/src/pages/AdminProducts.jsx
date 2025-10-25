import React from "react";
import { Link } from "react-router-dom"; // ✅ add this
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config"; // ✅ and this (used in MediaBrowserModal)

export default function AdminProducts() {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState([]);
  const [msg, setMsg] = React.useState("");

  // form helpers
  const [billingInterval, setBillingInterval] = React.useState("monthly");

  // upload state
  const [uploadingPreview, setUploadingPreview] = React.useState(false);
  const [uploadingThumb, setUploadingThumb] = React.useState(false);
  const [previewPct, setPreviewPct] = React.useState(0);
  const [thumbPct, setThumbPct] = React.useState(0);
  const [previewUrl, setPreviewUrl] = React.useState(null); // null = no video yet

  const [images, setImages] = React.useState([]); // gallery (array of URLs)
  const [showImagePicker, setShowImagePicker] = React.useState(false);
  const [showVideoPicker, setShowVideoPicker] = React.useState(false);

  // refs to write URLs after upload
  const previewInputRef = React.useRef(null);
  const thumbInputRef = React.useRef(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseFeatures(s) {
    return (s || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function add(e) {
    e.preventDefault();
    const fd = new FormData(e.target);

    const price = {
      monthlyNGN: Number(fd.get("monthlyNGN") || 0),
      yearlyNGN: Number(fd.get("yearlyNGN") || 0),
      installNGN: Number(fd.get("installNGN") || 0),
    };
    const productType = fd.get("productType") || "software";
    const courseSku = (fd.get("courseSku") || "").trim();
    const monthlyUSD = fd.get("monthlyUSD");
    const yearlyUSD = fd.get("yearlyUSD");
    const installUSD = fd.get("installUSD");
    if (monthlyUSD !== "") price.monthlyUSD = Number(monthlyUSD);
    if (yearlyUSD !== "") price.yearlyUSD = Number(yearlyUSD);
    if (installUSD !== "") price.installUSD = Number(installUSD);

    const payload = {
      key: fd.get("key"),
      name: fd.get("name"),
      blurb: fd.get("blurb") || "",
      description: fd.get("description") || "",
      features: parseFeatures(fd.get("features")),
      billingInterval: fd.get("billingInterval") || "monthly",
      price,
      // previewUrl: previewInputRef.current?.value || undefined,
      previewUrl: previewUrl || undefined,
      thumbnailUrl: thumbInputRef.current?.value || images[0] || undefined,
      images,
      isPublished: fd.get("isPublished") === "on",
      sort: Number(fd.get("sort") || 0),

      // ✅ new fields for course/products
      isCourse: productType === "course",
      courseSku: productType === "course" && courseSku ? courseSku : undefined,
    };

    await apiAuthed("/admin/products", {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    e.target.reset();
    setBillingInterval("monthly");
    load();
  }

  function fileLabel(f) {
    if (!f) return "";
    return `${f.name} (${Math.round(f.size / 1024 / 1024)} MB)`;
  }

  /** Signed/unsigned upload with progress */
  async function uploadToCloudinary(file, type) {
    if (!file) return null;

    const setPct = type === "video" ? setPreviewPct : setThumbPct;
    const setUploading =
      type === "video" ? setUploadingPreview : setUploadingThumb;

    setUploading(true);
    setPct(0);
    setMsg(`Requesting ${type} upload ticket…`);

    try {
      // 1) sign
      const sig = await apiAuthed(`/admin/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: type }),
      });

      // 2) form
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

      // 3) xhr for progress
      const secureUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable)
            setPct(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
              resolve(json.secure_url);
            } else {
              reject(
                new Error(
                  json?.error?.message || `Upload failed (${xhr.status})`
                )
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
      setTimeout(() => setPct(0), 800);
      setUploading(false);
    }
  }

  async function handlePreviewFile(f) {
    if (!f) return;
    setMsg(`Uploading video: ${fileLabel(f)}…`);
    try {
      const url = await uploadToCloudinary(f, "video");
      // if (url && previewInputRef.current) previewInputRef.current.value = url;
      if (url) {
        if (previewInputRef.current) previewInputRef.current.value = url;
        setPreviewUrl(url); // ✅ update state so <video src> is never ""
      }
      setMsg(url ? "✅ Preview video uploaded." : "Upload failed.");
    } catch (e) {
      setMsg(`❌ ${e.message || "Upload error"}`);
    }
  }

  async function handleThumbFile(f) {
    if (!f) return;
    setMsg(`Uploading image: ${fileLabel(f)}…`);
    try {
      const url = await uploadToCloudinary(f, "image");
      if (url && thumbInputRef.current) thumbInputRef.current.value = url;
      setMsg(url ? "✅ Thumbnail image uploaded." : "Upload failed.");
    } catch (e) {
      setMsg(`❌ ${e.message || "Upload error"}`);
    }
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

  // --- Small UI helpers --- //
  function Thumb({
    src,
    onPrimary,
    onRemove,
    primaryLabel = "Make thumbnail",
  }) {
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
        if (cursor) {
          setItems((prev) => [...prev, ...json.items]);
        } else {
          setItems(json.items || []);
        }
        setNext(json.next || null);
      } finally {
        setLoading(false);
      }
    }

    React.useEffect(() => {
      if (open) load(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, q, type]);

    if (!open) return null;
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-4 w-full max-w-3xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Choose from Cloudinary ({type})</div>
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <input
            className="input"
            placeholder="Search filename..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {items.map((it) => (
                  <button
                    key={it.public_id}
                    className="border rounded overflow-hidden"
                    onClick={() => onPick(it.url)}
                    title={it.public_id}
                    type="button"
                  >
                    {type === "image" ? (
                      <img src={it.url} className="w-full h-24 object-cover" />
                    ) : (
                      <video
                        src={it.url}
                        className="w-full h-24 object-cover"
                      />
                    )}
                  </button>
                ))}
                {!items.length && (
                  <div className="text-sm text-slate-600 col-span-full">
                    No assets found.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div />
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
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Products</h1>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      {/* Add product */}
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

          {/* Billing interval */}
          <label className="text-sm">
            <div className="mb-1">Billing interval</div>
            <select
              name="billingInterval"
              className="input"
              value={billingInterval}
              onChange={(e) => setBillingInterval(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          {/* Product type */}
          <label className="text-sm">
            <div className="mb-1">Product type</div>
            <select
              name="productType"
              className="input"
              defaultValue="software"
            >
              <option value="software">Software</option>
              <option value="course">Course</option>
            </select>
          </label>

          {/* Course SKU (only used if Product type is Course) */}
          <label className="text-sm">
            <div className="mb-1">Course SKU (if Course)</div>
            <input
              className="input"
              name="courseSku"
              placeholder="e.g. QS-BASICS-101"
            />
          </label>

          {/* NGN prices */}
          <label className="text-sm">
            <div className="mb-1">NGN · Price / month</div>
            <input
              className="input"
              name="monthlyNGN"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1">NGN · Price / year</div>
            <input
              className="input"
              name="yearlyNGN"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1">NGN · Install fee (one-time)</div>
            <input
              className="input"
              name="installNGN"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
            />
          </label>

          {/* Optional USD overrides */}
          <label className="text-sm">
            <div className="mb-1">USD override · /month (optional)</div>
            <input
              className="input"
              name="monthlyUSD"
              type="number"
              min="0"
              step="0.01"
              placeholder=""
            />
          </label>
          <label className="text-sm">
            <div className="mb-1">USD override · /year (optional)</div>
            <input
              className="input"
              name="yearlyUSD"
              type="number"
              min="0"
              step="0.01"
              placeholder=""
            />
          </label>
          <label className="text-sm">
            <div className="mb-1">USD override · Install (optional)</div>
            <input
              className="input"
              name="installUSD"
              type="number"
              min="0"
              step="0.01"
              placeholder=""
            />
          </label>

          {/* Preview video */}
          {/* <div className="sm:col-span-2 grid gap-2">
            <input
              className="input"
              name="previewUrl"
              placeholder="Preview video URL (MP4 / Cloudinary)"
              ref={previewInputRef}
            />
            <div className="flex items-center gap-3">
              <label
                className={`btn btn-sm ${
                  uploadingPreview ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                Upload preview video
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={uploadingPreview}
                  onChange={(e) => handlePreviewFile(e.target.files?.[0])}
                />
              </label>
              {uploadingPreview && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className="w-40 h-2 bg-slate-200 rounded">
                    <div
                      className="h-2 bg-blue-600 rounded"
                      style={{ width: `${previewPct}%` }}
                    />
                  </div>
                  <span>{previewPct}%</span>
                </div>
              )}
            </div>
          </div> */}

          {/* Thumbnail */}
          {/* <div className="sm:col-span-2 grid gap-2">
            <input
              className="input"
              name="thumbnailUrl"
              placeholder="Thumbnail image URL (optional)"
              ref={thumbInputRef}
            />
            <div className="flex items-center gap-3">
              <label
                className={`btn btn-sm ${
                  uploadingThumb ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                Upload thumbnail image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumb}
                  onChange={(e) => handleThumbFile(e.target.files?.[0])}
                />
              </label>
              {uploadingThumb && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className="w-40 h-2 bg-slate-200 rounded">
                    <div
                      className="h-2 bg-blue-600 rounded"
                      style={{ width: `${thumbPct}%` }}
                    />
                  </div>
                  <span>{thumbPct}%</span>
                </div>
              )}
            </div>
          </div> */}

          {/* Gallery images */}
          <div className="sm:col-span-2">
            <div className="mb-2 font-medium">Images</div>
            <div className="flex flex-wrap gap-3">
              {images.map((src, i) => (
                <Thumb
                  key={`${src}-${i}`}
                  src={src}
                  onPrimary={() => {
                    // make this the thumbnail
                    if (thumbInputRef.current)
                      thumbInputRef.current.value = src;
                  }}
                  onRemove={() =>
                    setImages((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  primaryLabel="Use as thumbnail"
                />
              ))}
              {!images.length && (
                <div className="text-sm text-slate-600">No images yet.</div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label
                className={`btn btn-sm ${
                  uploadingThumb ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumb}
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
              {/* keep a hidden input for thumbnail (can be set by clicking a Thumb) */}
              <input ref={thumbInputRef} name="thumbnailUrl" type="hidden" />
            </div>
          </div>

          {/* Preview video */}
          <div className="sm:col-span-2">
            <div className="mb-2 font-medium">Preview video</div>
            <div className="flex items-center gap-3">
              <div className="rounded overflow-hidden border bg-black">
                {previewUrl ? (
                  <video
                    className="w-48 h-28 object-cover"
                    src={previewUrl} // ✅ valid URL
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div className="w-48 h-28 grid place-items-center text-white/70">
                    No preview video
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label
                  className={`btn btn-sm ${
                    uploadingPreview ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  Upload video
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={uploadingPreview}
                    onChange={(e) => handlePreviewFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setShowVideoPicker(true)}
                >
                  Choose from Cloudinary
                </button>
                <input
                  ref={previewInputRef}
                  name="previewUrl"
                  className="hidden"
                />
              </div>
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
              // if (previewInputRef.current) previewInputRef.current.value = url;
              if (previewInputRef.current) previewInputRef.current.value = url;
              setPreviewUrl(url); // ✅ keep state in syn
              setShowVideoPicker(false);
            }}
          />

          {/* Description + Features */}
          <textarea
            className="input sm:col-span-2"
            name="description"
            rows={4}
            placeholder="Long description (Markdown or plain text)"
          />
          <textarea
            className="input sm:col-span-2"
            name="features"
            rows={4}
            placeholder="Features (one per line)"
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

          <button
            className="btn sm:col-span-2"
            disabled={uploadingPreview || uploadingThumb}
            title={
              uploadingPreview || uploadingThumb
                ? "Wait for uploads to finish"
                : undefined
            }
          >
            Add
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-2">
        {items.map((p) => (
          <div
            key={p._id}
            className="border rounded p-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              {p.thumbnailUrl ? (
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="w-16 h-10 object-cover rounded border"
                />
              ) : (
                <div className="w-16 h-10 rounded border bg-slate-100" />
              )}
              <div className="text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-slate-600">
                  key: {p.key} · sort: {p.sort} ·{" "}
                  {p.isPublished ? "published" : "hidden"}
                </div>
                <div className="text-slate-600">
                  Billing: <b>{p.billingInterval}</b>
                  {p.isCourse && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs">
                      Course{p.courseSku ? ` · ${p.courseSku}` : ""}
                    </span>
                  )}
                </div>
                <div className="text-slate-600">
                  NGN /
                  {p.billingInterval === "yearly" ? (
                    <>
                      yr: <b>₦{(p.price?.yearlyNGN || 0).toLocaleString()}</b>
                    </>
                  ) : (
                    <>
                      mo: <b>₦{(p.price?.monthlyNGN || 0).toLocaleString()}</b>
                    </>
                  )}
                  {p.price?.installNGN > 0 && (
                    <>
                      {" "}
                      · Install:{" "}
                      <b>₦{(p.price.installNGN || 0).toLocaleString()}</b>
                    </>
                  )}
                </div>
                {(p.price?.monthlyUSD ||
                  p.price?.yearlyUSD ||
                  p.price?.installUSD) && (
                  <div className="text-slate-600">
                    USD override ·{" "}
                    {p.billingInterval === "yearly" ? (
                      <>
                        yr: <b>${(p.price?.yearlyUSD || 0).toFixed(2)}</b>
                      </>
                    ) : (
                      <>
                        mo: <b>${(p.price?.monthlyUSD || 0).toFixed(2)}</b>
                      </>
                    )}
                    {p.price?.installUSD > 0 && (
                      <>
                        {" "}
                        · Install:{" "}
                        <b>${(p.price.installUSD || 0).toFixed(2)}</b>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                className="btn btn-sm"
                to={`/admin/products/${encodeURIComponent(p.key)}/edit`}
              >
                Edit
              </Link>
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
