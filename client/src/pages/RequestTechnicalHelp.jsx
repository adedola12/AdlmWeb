// client/src/pages/RequestTechnicalHelp.jsx
// User-facing form to raise a technical-support ticket. Captures the issue and
// an AnyDesk address so the ADLM team can connect remotely. Auth-gated (mounted
// under ProtectedRoute) so the ticket is tied to the signed-in user.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { api, apiAuthed } from "../http.js";

const CATEGORIES = [
  { value: "technical", label: "Technical issue" },
  { value: "account", label: "Account / login" },
  { value: "billing", label: "Billing / subscription" },
  { value: "feature-request", label: "Feature request" },
  { value: "general", label: "General question" },
];

// Attachment limits — mirrored server-side (support.js), keep in sync.
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Always-available choices; published products are prepended once loaded.
const FALLBACK_PRODUCTS = [
  { key: "website", name: "ADLM Website" },
  { key: "other", name: "Other / not sure" },
];

export default function RequestTechnicalHelp() {
  const { accessToken } = useAuth();

  const [form, setForm] = React.useState({
    title: "",
    description: "",
    anyDeskAddress: "",
    category: "technical",
    productKey: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [done, setDone] = React.useState(false);

  // Screenshot attachments (File objects) + generated preview URLs.
  const [images, setImages] = React.useState([]);
  const fileInputRef = React.useRef(null);

  // Published ADLM products for the "which product?" picker.
  const [products, setProducts] = React.useState(FALLBACK_PRODUCTS);

  // Past tickets so the user can see status / schedule.
  const [mine, setMine] = React.useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    let alive = true;
    api("/products", { params: { pageSize: 50 } })
      .then((res) => {
        if (!alive) return;
        const items = (Array.isArray(res?.items) ? res.items : [])
          .filter((p) => p?.key && !p.isCourse)
          .map((p) => ({ key: p.key, name: p.name || p.key }));
        if (items.length) setProducts([...items, ...FALLBACK_PRODUCTS]);
      })
      .catch(() => {
        /* fallback options remain */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Revoke any remaining object URLs on unmount to avoid leaks (removal and
  // submit-reset paths revoke their own URLs individually).
  const imagesRef = React.useRef(images);
  imagesRef.current = images;
  React.useEffect(
    () => () =>
      imagesRef.current.forEach((im) => URL.revokeObjectURL(im.preview)),
    [],
  );

  function addImages(fileList) {
    setErr("");
    const incoming = Array.from(fileList || []);
    setImages((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_IMAGES) {
          setErr(`You can attach at most ${MAX_IMAGES} images.`);
          break;
        }
        if (!f.type.startsWith("image/")) {
          setErr(`"${f.name}" isn't an image.`);
          continue;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          setErr(`"${f.name}" is larger than 2MB — please compress or crop it.`);
          continue;
        }
        next.push({ file: f, preview: URL.createObjectURL(f) });
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(idx) {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const loadMine = React.useCallback(async () => {
    try {
      const res = await apiAuthed("/api/support/tickets/mine", { token: accessToken });
      setMine(Array.isArray(res?.tickets) ? res.tickets : []);
    } catch {
      /* non-fatal */
    }
  }, [accessToken]);

  React.useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!form.title.trim() || !form.description.trim()) {
      setErr("Please add a title and a description.");
      return;
    }
    if (!form.productKey) {
      setErr("Please select which product or software you're having issues with.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("description", form.description.trim());
      fd.append("anyDeskAddress", form.anyDeskAddress.trim());
      fd.append("category", form.category);
      fd.append("productKey", form.productKey);
      images.forEach((im) => fd.append("images", im.file));

      await apiAuthed("/api/support/tickets", {
        token: accessToken,
        method: "POST",
        body: fd,
      });
      setDone(true);
      setForm({ title: "", description: "", anyDeskAddress: "", category: "technical", productKey: "" });
      images.forEach((im) => URL.revokeObjectURL(im.preview));
      setImages([]);
      loadMine();
    } catch (e) {
      setErr(e?.message || "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Request technical help</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Tell us what's going wrong. If you'd like us to fix it directly on your
          machine, install{" "}
          <a className="text-adlm-blue-700 hover:underline" href="https://anydesk.com/download" target="_blank" rel="noreferrer">
            AnyDesk
          </a>{" "}
          and paste your AnyDesk address below — our team will connect at the
          scheduled time.
        </p>
      </div>

      {done && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 p-4 text-sm">
          ✅ Your request was submitted. We'll be in touch by email. You can track
          its status below.
          <button className="ml-2 underline" onClick={() => setDone(false)}>
            Submit another
          </button>
        </div>
      )}

      {!done && (
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Title</label>
            <input
              className="input"
              placeholder="e.g. Can't open RateGen after update"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">What's happening?</label>
            <textarea
              className="input min-h-[120px]"
              placeholder="Describe the issue, what you were doing, and any error message…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">
                Which product / software?
              </label>
              <select
                className="input"
                value={form.productKey}
                onChange={(e) => set("productKey", e.target.value)}
                required
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Screenshots{" "}
              <span className="text-slate-400 font-normal">
                (optional — up to {MAX_IMAGES} images, 2MB each)
              </span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addImages(e.target.files)}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
            >
              {images.length ? "Add more images" : "Add images"}
            </button>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map((im, i) => (
                  <div key={im.preview} className="relative">
                    <img
                      src={im.preview}
                      alt={`Screenshot ${i + 1}`}
                      className="h-20 w-20 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      aria-label={`Remove image ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 text-white text-xs leading-none"
                      onClick={() => removeImage(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              A screenshot of the error message helps us fix things much faster.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              AnyDesk address <span className="text-slate-400 font-normal">(for remote support)</span>
            </label>
            <input
              className="input"
              placeholder="e.g. 1 234 567 890"
              value={form.anyDeskAddress}
              onChange={(e) => set("anyDeskAddress", e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              We only connect with your permission, at the scheduled time.
            </p>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex items-center gap-3">
            <button className="btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
            <Link to="/support" className="text-sm text-slate-500 hover:underline">
              Other ways to reach us
            </Link>
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Your requests</h2>
          <div className="space-y-2">
            {mine.map((t) => (
              <div key={t._id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                    {t.scheduledForFixingAt
                      ? ` · scheduled ${new Date(t.scheduledForFixingAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap capitalize">
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
