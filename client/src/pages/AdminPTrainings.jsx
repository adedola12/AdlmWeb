// src/pages/AdminPTrainings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiAuthed } from "../http.js";

/* ---------------------- helpers ---------------------- */
function isoLocal(d) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(
    x.getHours(),
  )}:${pad(x.getMinutes())}`;
}

function deepClone(x) {
  if (typeof structuredClone === "function") return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

const normKey = (k) =>
  String(k || "")
    .trim()
    .toLowerCase();

const SW_ITEM_PREFIX = "sw-";
const swItemKey = (productKey) => `${SW_ITEM_PREFIX}${normKey(productKey)}`;
const isSwItem = (item) => String(item?.key || "").startsWith(SW_ITEM_PREFIX);

function blankEvent() {
  return {
    title: "",
    subtitle: "",
    slug: "",
    description: "",
    fullDescription: "",
    startAt: "",
    endAt: "",
    capacityApproved: 14,

    // ✅ NEW pricing tiers (draft uses datetime-local strings)
    pricing: {
      normalNGN: 300000,
      groupOf3NGN: 0,
      earlyBird: {
        priceNGN: 0,
        endsAt: "", // datetime-local string in UI
      },
    },

    flyerUrl: "",

    isPublished: true,
    isFeatured: false,
    sort: 0,

    location: {
      name: "",
      address: "",
      city: "",
      state: "",
      amenities: [],
      googleMapsPlaceUrl: "",
      googleMapsEmbedUrl: "",
      photos: [], // [{type:"image",url,title}]
    },

    // Event media gallery (images/videos)
    media: [], // [{type:"image"|"video", url, title}]

    formFields: [],
    installationChecklist: [],
    entitlementGrants: [],
    softwareProductKeys: [],
    whatYouGet: [],
    requirements: [],
  };
}

function fileLabel(f) {
  if (!f) return "";
  return `${f.name} (${Math.round(f.size / 1024 / 1024)} MB)`;
}

/* ---------------------- UI atoms ---------------------- */
function TextInput({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-gray-700">{label}</div>
      <input
        type={type}
        className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4, placeholder = "" }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-gray-700">{label}</div>
      <textarea
        className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
        value={value ?? ""}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-gray-50">
      <div className="font-semibold text-gray-700">{label}</div>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function ProgressBar({ pct, label }) {
  if (!pct || pct <= 0) return null;
  return (
    <div className="mt-3 rounded-xl border bg-white p-3">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="font-semibold">{label || "Uploading..."}</div>
        <div>{pct}%</div>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MediaThumb({ item }) {
  const type = item?.type || "image";
  const url = item?.url || "";
  if (!url) return null;

  return (
    <div className="rounded-2xl border overflow-hidden bg-black">
      {type === "video" ? (
        <video
          src={url}
          className="w-full h-40 object-cover"
          controls
          preload="metadata"
        />
      ) : (
        <img src={url} alt="" className="w-full h-40 object-cover bg-white" />
      )}
    </div>
  );
}

/* ---------------------- Media Browser Modal (Cloudinary assets) ---------------------- */
function MediaBrowserModal({ open, onClose, type = "image", onPick }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadAssets(cursor = null) {
    setLoading(true);
    try {
      const params = { type };
      if (q) params.q = q;
      if (cursor) params.next = cursor;

      const { data } = await apiAuthed.get("/admin/media/assets", { params });
      const list = Array.isArray(data?.items) ? data.items : [];

      if (cursor) setItems((prev) => [...prev, ...list]);
      else setItems(list);

      setNext(data?.next || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadAssets(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Choose from Cloudinary ({type})</div>
          <button
            className="px-3 py-2 rounded-xl border font-semibold"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <input
          className="w-full border rounded-xl px-3 py-2"
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
                  className="border rounded-xl overflow-hidden hover:opacity-90"
                  onClick={() => onPick(it.url)}
                  title={it.public_id}
                  type="button"
                >
                  {type === "image" ? (
                    <img
                      src={it.url}
                      className="w-full h-24 object-cover"
                      alt=""
                    />
                  ) : (
                    <video src={it.url} className="w-full h-24 object-cover" />
                  )}
                </button>
              ))}

              {!items.length && (
                <div className="text-sm text-slate-600 col-span-full">
                  No assets found.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                disabled={!next || loading}
                onClick={() => loadAssets(next)}
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

/* ---------------------- Software sync logic ---------------------- */
function syncSoftwareIntoDraft(nextDraft, productMap) {
  const selected = Array.from(
    new Set((nextDraft.softwareProductKeys || []).map(normKey).filter(Boolean)),
  );

  nextDraft.softwareProductKeys = selected;

  // ----- checklist
  const list = Array.isArray(nextDraft.installationChecklist)
    ? nextDraft.installationChecklist
    : [];

  const manual = list.filter((it) => !isSwItem(it));
  const existingSw = new Map(
    list.filter(isSwItem).map((it) => [String(it.key), it]),
  );

  const swItems = selected.map((pk) => {
    const p = productMap[pk];
    const k = swItemKey(pk);
    const prev = existingSw.get(k);
    return {
      key: k,
      label: prev?.label || `Install ${p?.name || pk}`,
      helpUrl: prev?.helpUrl || "",
    };
  });

  nextDraft.installationChecklist = [...manual, ...swItems];

  // ----- grants
  const grants = Array.isArray(nextDraft.entitlementGrants)
    ? nextDraft.entitlementGrants
    : [];

  const selectedSet = new Set(selected);
  const keepOther = grants.filter(
    (g) => !selectedSet.has(normKey(g?.productKey)),
  );

  const byKey = new Map(grants.map((g) => [normKey(g?.productKey), g]));
  const managed = selected.map((pk) => {
    const prev = byKey.get(pk);
    return {
      productKey: pk,
      months: Math.max(Number(prev?.months ?? 1), 1),
      seats: Math.max(Number(prev?.seats ?? 1), 1),
      licenseType: prev?.licenseType || "personal",
      organizationName: prev?.organizationName || "",
    };
  });

  nextDraft.entitlementGrants = [...keepOther, ...managed];
}

/* ---------------------- component ---------------------- */
export default function AdminPTrainings() {
  const [tab, setTab] = useState("events");

  const [events, setEvents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [products, setProducts] = useState([]);
  const [productQ, setProductQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [activeId, setActiveId] = useState("");
  const active = useMemo(
    () => events.find((x) => x._id === activeId) || null,
    [events, activeId],
  );

  const [draft, setDraft] = useState(blankEvent());

  // --- upload state (global)
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  // --- Cloudinary picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState("image"); // image|video
  const [pickerTarget, setPickerTarget] = useState(null);

  const productMap = useMemo(() => {
    const m = {};
    (products || []).forEach((p) => {
      const k = normKey(p?.key);
      if (k) m[k] = p;
    });
    return m;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = normKey(productQ);
    const list = Array.isArray(products) ? products : [];
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p?.name || ""} ${p?.key || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, productQ]);

  async function loadEvents() {
    const { data } = await apiAuthed.get("/admin/ptrainings/events");
    setEvents(Array.isArray(data) ? data : []);
  }

  async function loadEnrollments() {
    const { data } = await apiAuthed.get("/admin/ptrainings/enrollments");
    setEnrollments(Array.isArray(data) ? data : []);
  }

  async function loadProducts() {
    const { data } = await apiAuthed.get("/admin/products");
    setProducts(Array.isArray(data) ? data : []);
  }

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadEvents(), loadEnrollments(), loadProducts()]);
    } catch (e) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line
  }, []);

  function pickEvent(e) {
    setActiveId(e._id);

    // ✅ Backward compatibility:
    // If old event has priceNGN but no pricing, treat it as pricing.normalNGN
    const legacyNormal = Number(e?.priceNGN || 0) || 0;
    const pricing = e?.pricing || {};

    const next = {
      ...blankEvent(),
      ...e,
      startAt: isoLocal(e.startAt),
      endAt: isoLocal(e.endAt),

      pricing: {
        normalNGN:
          pricing?.normalNGN != null
            ? pricing.normalNGN
            : legacyNormal || blankEvent().pricing.normalNGN,
        groupOf3NGN: pricing?.groupOf3NGN ?? 0,
        earlyBird: {
          priceNGN: pricing?.earlyBird?.priceNGN ?? 0,
          endsAt: isoLocal(pricing?.earlyBird?.endsAt) || "",
        },
      },

      location: {
        ...blankEvent().location,
        ...(e.location || {}),
        photos: Array.isArray(e?.location?.photos) ? e.location.photos : [],
      },
      media: Array.isArray(e?.media) ? e.media : [],
      formFields: e.formFields || [],
      installationChecklist: e.installationChecklist || [],
      entitlementGrants: e.entitlementGrants || [],
      softwareProductKeys: e.softwareProductKeys || [],
      whatYouGet: e.whatYouGet || [],
      requirements: e.requirements || [],
    };

    syncSoftwareIntoDraft(next, productMap);
    setDraft(next);
    setTab("events");
  }

  function newEvent() {
    setActiveId("");
    setDraft(blankEvent());
    setTab("events");
  }

  function update(path, value) {
    setDraft((p) => {
      const next = deepClone(p);
      const keys = path.split(".");
      let cur = next;

      while (keys.length > 1) {
        const k = keys.shift();
        if (cur[k] === undefined || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }

      cur[keys[0]] = value;

      if (path === "softwareProductKeys") {
        syncSoftwareIntoDraft(next, productMap);
      }

      return next;
    });
  }

  function toggleSoftware(productKey) {
    const k = normKey(productKey);
    if (!k) return;

    setDraft((prev) => {
      const next = deepClone(prev);
      const cur = Array.isArray(next.softwareProductKeys)
        ? next.softwareProductKeys.map(normKey).filter(Boolean)
        : [];

      const set = new Set(cur);
      if (set.has(k)) set.delete(k);
      else set.add(k);

      next.softwareProductKeys = Array.from(set);
      syncSoftwareIntoDraft(next, productMap);
      return next;
    });
  }

  /* ---------------------- Cloudinary upload (with progress) ---------------------- */
  async function uploadToCloudinary(file, resourceType /* "image"|"video" */) {
    if (!file) return null;

    setUploading(true);
    setUploadPct(0);
    setUploadLabel(`Uploading ${resourceType}: ${fileLabel(file)}…`);

    try {
      const { data: sig } = await apiAuthed.post("/admin/media/sign", {
        resource_type: resourceType,
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

      const secureUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadPct(Math.round((ev.loaded / ev.total) * 100));
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
      setTimeout(() => setUploadPct(0), 800);
      setUploading(false);
      setUploadLabel("");
    }
  }

  function openPicker(target, type = "image") {
    setPickerTarget(target);
    setPickerType(type);
    setPickerOpen(true);
  }

  function handlePickedUrl(url) {
    if (!url || !pickerTarget) return;

    const t = pickerTarget;

    if (t.kind === "flyer") {
      update("flyerUrl", url);
    }

    if (t.kind === "locationPhoto") {
      const idx = t.idx;
      const next = deepClone(draft.location?.photos || []);
      if (!next[idx]) return;
      next[idx].type = "image";
      next[idx].url = url;
      update("location.photos", next);
    }

    if (t.kind === "eventMedia") {
      const idx = t.idx;
      const next = deepClone(draft.media || []);
      if (!next[idx]) return;
      next[idx].type = t.type || next[idx].type || "image";
      next[idx].url = url;
      update("media", next);
    }

    setPickerOpen(false);
    setPickerTarget(null);
  }

  async function saveEvent() {
    setErr("");

    if (!String(draft.title || "").trim()) return setErr("Title is required.");
    if (!draft.startAt) return setErr("Start date/time is required.");
    if (!draft.endAt) return setErr("End date/time is required.");

    const s = new Date(draft.startAt);
    const e = new Date(draft.endAt);
    if (Number.isNaN(s.getTime())) return setErr("Start date/time is invalid.");
    if (Number.isNaN(e.getTime())) return setErr("End date/time is invalid.");
    if (e < s) return setErr("End date/time must be after Start date/time.");

    // ✅ pricing validation
    const normalNGN = Number(draft?.pricing?.normalNGN || 0) || 0;
    const groupOf3NGN = Number(draft?.pricing?.groupOf3NGN || 0) || 0;
    const ebPrice = Number(draft?.pricing?.earlyBird?.priceNGN || 0) || 0;
    const ebEndsLocal = String(draft?.pricing?.earlyBird?.endsAt || "").trim();

    let ebEndsISO = null;
    if (ebEndsLocal) {
      const d = new Date(ebEndsLocal);
      if (Number.isNaN(d.getTime()))
        return setErr("Earlybird end date is invalid.");
      ebEndsISO = d.toISOString();
    }

    if (ebPrice > 0 && !ebEndsISO) {
      return setErr(
        "Earlybird ends-at date is required when Earlybird price is set.",
      );
    }

    // Optional: earlybird should end before start
    if (ebEndsISO && new Date(ebEndsISO) > s) {
      // This is a business choice; comment out if you want earlybird to end after start.
      // return setErr("Earlybird end date should be on/before the Start date/time.");
    }

    try {
      const payload = {
        ...draft,
        capacityApproved: Number(draft.capacityApproved || 0),
        sort: Number(draft.sort || 0),
        startAt: s.toISOString(),
        endAt: e.toISOString(),

        // ✅ NEW pricing object
        pricing: {
          normalNGN,
          groupOf3NGN,
          earlyBird: {
            priceNGN: ebPrice,
            endsAt: ebEndsISO, // null or ISO
          },
        },

        // ✅ legacy field for older clients that still read priceNGN
        priceNGN: normalNGN,
      };

      if (activeId) {
        await apiAuthed.patch(`/admin/ptrainings/events/${activeId}`, payload);
      } else {
        const { data } = await apiAuthed.post(
          `/admin/ptrainings/events`,
          payload,
        );
        if (data?._id) setActiveId(data._id);
      }

      await loadEvents();
      alert("Saved!");
    } catch (e2) {
      setErr(e2?.message || "Failed");
    }
  }

  async function deleteEvent() {
    if (!activeId) return;
    if (!confirm("Delete this training event?")) return;

    try {
      await apiAuthed.delete(`/admin/ptrainings/events/${activeId}`);
      setActiveId("");
      setDraft(blankEvent());
      await loadEvents();
    } catch (e) {
      setErr(e?.message || "Failed");
    }
  }

  async function approveEnrollment(id) {
    try {
      await apiAuthed.patch(`/admin/ptrainings/enrollments/${id}/approve`, {});
      await loadEnrollments();
      alert("Approved!");
    } catch (e) {
      alert(e?.message || "Failed");
    }
  }

  async function markInstallComplete(id) {
    try {
      await apiAuthed.patch(
        `/admin/ptrainings/enrollments/${id}/installation-complete`,
        {},
      );
      await loadEnrollments();
      alert("Installation complete + entitlements granted!");
    } catch (e) {
      alert(e?.message || "Failed");
    }
  }

  /* ---------------------- UI ---------------------- */
  if (loading) return <div className="p-6">Loading…</div>;

  const selectedSoftware = new Set(
    (draft.softwareProductKeys || []).map(normKey).filter(Boolean),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Admin PTrainings</h1>
      {err ? <div className="mt-3 text-red-600">{err}</div> : null}

      <ProgressBar pct={uploadPct} label={uploadLabel} />

      <div className="mt-4 flex gap-2">
        <button
          className={`px-4 py-2 rounded-xl font-semibold ${
            tab === "events"
              ? "bg-blue-600 text-white"
              : "border hover:bg-gray-50"
          }`}
          onClick={() => setTab("events")}
        >
          Events
        </button>
        <button
          className={`px-4 py-2 rounded-xl font-semibold ${
            tab === "enrollments"
              ? "bg-blue-600 text-white"
              : "border hover:bg-gray-50"
          }`}
          onClick={() => setTab("enrollments")}
        >
          Enrollments
        </button>

        <button
          className="ml-auto px-4 py-2 rounded-xl border hover:bg-gray-50 font-semibold"
          onClick={loadAll}
          disabled={uploading}
          title={uploading ? "Wait for upload to finish" : undefined}
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left list */}
        <div className="bg-white border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="font-bold">Training Events</div>

            <button
              className="text-sm font-semibold text-blue-600 hover:underline"
              onClick={newEvent}
              type="button"
            >
              + New
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {events.map((e) => (
              <button
                key={e._id}
                onClick={() => pickEvent(e)}
                className={`w-full text-left p-3 rounded-xl border ${
                  e._id === activeId
                    ? "bg-blue-50 border-blue-200"
                    : "hover:bg-gray-50"
                }`}
                type="button"
              >
                <div className="font-semibold">{e.title}</div>
                <div className="text-xs text-gray-600">{e.slug}</div>
              </button>
            ))}

            {!events.length ? (
              <div className="text-sm text-gray-600 mt-2">No events yet.</div>
            ) : null}
          </div>
        </div>

        {/* Main */}
        {tab === "events" ? (
          <div className="lg:col-span-2 bg-white border rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg">
                {activeId ? "Edit Event" : "Create Event"}
              </div>
              <div className="flex gap-2">
                {activeId ? (
                  <button
                    className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                    onClick={deleteEvent}
                    type="button"
                    disabled={uploading}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                  onClick={saveEvent}
                  type="button"
                  disabled={uploading}
                  title={uploading ? "Wait for upload to finish" : undefined}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput
                label="Title"
                value={draft.title}
                onChange={(v) => update("title", v)}
                placeholder="e.g., ADLM Physical BIM Training"
              />
              <TextInput
                label="Subtitle"
                value={draft.subtitle}
                onChange={(v) => update("subtitle", v)}
                placeholder="Short subtitle (optional)"
              />

              <TextInput
                label="Slug"
                value={draft.slug}
                onChange={(v) => update("slug", v)}
                placeholder="e.g., bim-training-march-2026"
              />

              <TextInput
                label="Start (date & time)"
                type="datetime-local"
                value={draft.startAt}
                onChange={(v) => update("startAt", v)}
              />
              <TextInput
                label="End (date & time)"
                type="datetime-local"
                value={draft.endAt}
                onChange={(v) => update("endAt", v)}
              />

              <TextInput
                label="Capacity (approved)"
                type="number"
                value={draft.capacityApproved}
                onChange={(v) => update("capacityApproved", v)}
              />

              <TextInput
                label="Sort order"
                type="number"
                value={draft.sort}
                onChange={(v) => update("sort", v)}
              />
            </div>

            {/* ✅ NEW: Pricing tiers */}
            <div className="mt-6 rounded-2xl border p-4">
              <div className="font-bold text-lg">Pricing Tiers (NGN)</div>
              <div className="text-sm text-gray-600 mt-1">
                Configure Earlybird (with expiry), Normal fee, and Group of 3
                fee.
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput
                  label="Normal fee (NGN)"
                  type="number"
                  value={draft?.pricing?.normalNGN ?? ""}
                  onChange={(v) => update("pricing.normalNGN", v)}
                />

                <TextInput
                  label="Group of 3 fee (NGN)"
                  type="number"
                  value={draft?.pricing?.groupOf3NGN ?? ""}
                  onChange={(v) => update("pricing.groupOf3NGN", v)}
                />

                <TextInput
                  label="Earlybird fee (NGN)"
                  type="number"
                  value={draft?.pricing?.earlyBird?.priceNGN ?? ""}
                  onChange={(v) => update("pricing.earlyBird.priceNGN", v)}
                />

                <TextInput
                  label="Earlybird ends at"
                  type="datetime-local"
                  value={draft?.pricing?.earlyBird?.endsAt ?? ""}
                  onChange={(v) => update("pricing.earlyBird.endsAt", v)}
                />
              </div>

              <div className="mt-2 text-xs text-gray-500">
                If Earlybird fee is set (&gt; 0), “Earlybird ends at” must be
                provided. Checkout logic should use Earlybird until the end
                date/time, then fall back to Normal.
              </div>
            </div>

            {/* Flyer uploader (PC + Cloudinary) */}
            <div className="mt-6 rounded-2xl border p-4">
              <div className="font-bold text-lg">Flyer (Image)</div>
              <div className="text-sm text-gray-600 mt-1">
                Upload from your PC or pick an existing image from Cloudinary.
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <TextInput
                    label="Flyer URL"
                    value={draft.flyerUrl}
                    onChange={(v) => update("flyerUrl", v)}
                    placeholder="https://.../flyer.jpg"
                  />

                  <div className="flex flex-wrap gap-2">
                    <label
                      className={`px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer ${
                        uploading ? "opacity-60 pointer-events-none" : ""
                      }`}
                    >
                      Upload from PC
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;

                          try {
                            const url = await uploadToCloudinary(f, "image");
                            if (url) update("flyerUrl", url);
                          } catch (ex) {
                            setErr(ex?.message || "Upload failed");
                          }
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                      onClick={() => openPicker({ kind: "flyer" }, "image")}
                      disabled={uploading}
                    >
                      Choose from Cloudinary
                    </button>

                    {draft.flyerUrl ? (
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                        onClick={() => update("flyerUrl", "")}
                        disabled={uploading}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Preview
                  </div>
                  <div className="mt-2 rounded-2xl border overflow-hidden bg-gray-50">
                    {draft.flyerUrl ? (
                      <img
                        src={draft.flyerUrl}
                        alt=""
                        className="w-full max-h-72 object-cover"
                      />
                    ) : (
                      <div className="h-40 grid place-items-center text-gray-500">
                        No flyer yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <TextArea
                label="Short description"
                value={draft.description}
                onChange={(v) => update("description", v)}
                rows={3}
              />
              <TextArea
                label="Full description"
                value={draft.fullDescription}
                onChange={(v) => update("fullDescription", v)}
                rows={6}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Toggle
                label="Published"
                checked={draft.isPublished}
                onChange={(v) => update("isPublished", v)}
              />
              <Toggle
                label="Featured"
                checked={draft.isFeatured}
                onChange={(v) => update("isFeatured", v)}
              />
            </div>

            {/* Event Media (Images & Videos) */}
            <div className="mt-6 rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-lg">
                  Event Media (Images / Videos)
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                    onClick={() =>
                      update("media", [
                        ...(draft.media || []),
                        { type: "image", url: "", title: "" },
                      ])
                    }
                    disabled={uploading}
                  >
                    + Add Image
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                    onClick={() =>
                      update("media", [
                        ...(draft.media || []),
                        { type: "video", url: "", title: "" },
                      ])
                    }
                    disabled={uploading}
                  >
                    + Add Video
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                {(draft.media || []).map((m, idx) => (
                  <div key={idx} className="p-3 rounded-2xl border bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {m.type === "video" ? "Video" : "Image"} #{idx + 1}
                      </div>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                        onClick={() =>
                          update(
                            "media",
                            (draft.media || []).filter((_, i) => i !== idx),
                          )
                        }
                        disabled={uploading}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <label className="block">
                        <div className="text-sm font-semibold text-gray-700">
                          Type
                        </div>
                        <select
                          className="mt-1 w-full border rounded-xl px-3 py-2"
                          value={m.type || "image"}
                          onChange={(e) => {
                            const next = deepClone(draft.media || []);
                            next[idx].type = e.target.value;
                            update("media", next);
                          }}
                          disabled={uploading}
                        >
                          <option value="image">image</option>
                          <option value="video">video</option>
                        </select>
                      </label>

                      <TextInput
                        label="Title (optional)"
                        value={m.title || ""}
                        onChange={(v) => {
                          const next = deepClone(draft.media || []);
                          next[idx].title = v;
                          update("media", next);
                        }}
                        placeholder="e.g., Day 1 highlights"
                      />

                      <TextInput
                        label="URL"
                        value={m.url || ""}
                        onChange={(v) => {
                          const next = deepClone(draft.media || []);
                          next[idx].url = v;
                          update("media", next);
                        }}
                        placeholder="https://... "
                      />

                      <div className="flex flex-wrap gap-2">
                        <label
                          className={`px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer ${
                            uploading ? "opacity-60 pointer-events-none" : ""
                          }`}
                        >
                          Upload from PC
                          <input
                            type="file"
                            accept={m.type === "video" ? "video/*" : "image/*"}
                            className="hidden"
                            disabled={uploading}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;

                              const rt = m.type === "video" ? "video" : "image";
                              try {
                                const url = await uploadToCloudinary(f, rt);
                                if (!url) return;
                                const next = deepClone(draft.media || []);
                                next[idx].type = rt;
                                next[idx].url = url;
                                update("media", next);
                              } catch (ex) {
                                setErr(ex?.message || "Upload failed");
                              }
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                          onClick={() =>
                            openPicker(
                              {
                                kind: "eventMedia",
                                idx,
                                type: m.type || "image",
                              },
                              m.type === "video" ? "video" : "image",
                            )
                          }
                          disabled={uploading}
                        >
                          Choose from Cloudinary
                        </button>
                      </div>

                      <MediaThumb item={m} />
                    </div>
                  </div>
                ))}

                {!(draft.media || []).length ? (
                  <div className="text-sm text-gray-500">
                    No event media yet. Add images/videos for the training page.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Location */}
            <div className="mt-6">
              <div className="font-bold text-lg">Location</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput
                  label="Venue name"
                  value={draft.location?.name}
                  onChange={(v) => update("location.name", v)}
                />
                <TextInput
                  label="Address"
                  value={draft.location?.address}
                  onChange={(v) => update("location.address", v)}
                />
                <TextInput
                  label="City"
                  value={draft.location?.city}
                  onChange={(v) => update("location.city", v)}
                />
                <TextInput
                  label="State"
                  value={draft.location?.state}
                  onChange={(v) => update("location.state", v)}
                />
                <TextInput
                  label="Google Maps Place URL"
                  value={draft.location?.googleMapsPlaceUrl}
                  onChange={(v) => update("location.googleMapsPlaceUrl", v)}
                  placeholder="https://maps.google.com/..."
                />
                <TextInput
                  label="Google Maps Embed URL"
                  value={draft.location?.googleMapsEmbedUrl}
                  onChange={(v) => update("location.googleMapsEmbedUrl", v)}
                  placeholder="https://www.google.com/maps/embed?..."
                />
              </div>

              <div className="mt-4">
                <div className="rounded-2xl border p-4">
                  <div className="font-bold">Amenities</div>
                  <AmenityEditor
                    items={draft.location?.amenities || []}
                    onChange={(arr) => update("location.amenities", arr)}
                  />
                </div>
              </div>

              {/* Location Photos (PC + Cloudinary + previews) */}
              <div className="mt-4 rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold">Location Photos</div>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                    onClick={() =>
                      update("location.photos", [
                        ...(draft.location?.photos || []),
                        { type: "image", url: "", title: "" },
                      ])
                    }
                    disabled={uploading}
                  >
                    + Add Photo
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {(draft.location?.photos || []).map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl border bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">Photo #{idx + 1}</div>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                          onClick={() =>
                            update(
                              "location.photos",
                              (draft.location?.photos || []).filter(
                                (_, i) => i !== idx,
                              ),
                            )
                          }
                          disabled={uploading}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <TextInput
                          label="Image URL"
                          value={m.url || ""}
                          onChange={(v) => {
                            const next = deepClone(
                              draft.location?.photos || [],
                            );
                            next[idx].url = v;
                            next[idx].type = "image";
                            update("location.photos", next);
                          }}
                          placeholder="https://.../venue.jpg"
                        />
                        <TextInput
                          label="Title (optional)"
                          value={m.title || ""}
                          onChange={(v) => {
                            const next = deepClone(
                              draft.location?.photos || [],
                            );
                            next[idx].title = v;
                            next[idx].type = "image";
                            update("location.photos", next);
                          }}
                          placeholder="e.g., Training Hall"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <label
                          className={`px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer ${
                            uploading ? "opacity-60 pointer-events-none" : ""
                          }`}
                        >
                          Upload from PC
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploading}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;

                              try {
                                const url = await uploadToCloudinary(
                                  f,
                                  "image",
                                );
                                if (!url) return;
                                const next = deepClone(
                                  draft.location?.photos || [],
                                );
                                next[idx].type = "image";
                                next[idx].url = url;
                                update("location.photos", next);
                              } catch (ex) {
                                setErr(ex?.message || "Upload failed");
                              }
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                          onClick={() =>
                            openPicker({ kind: "locationPhoto", idx }, "image")
                          }
                          disabled={uploading}
                        >
                          Choose from Cloudinary
                        </button>
                      </div>

                      {m.url ? (
                        <img
                          src={m.url}
                          alt=""
                          className="mt-3 w-full max-h-56 object-cover rounded-2xl border"
                        />
                      ) : (
                        <div className="mt-3 text-sm text-gray-500">
                          No photo selected yet.
                        </div>
                      )}
                    </div>
                  ))}

                  {!(draft.location?.photos || []).length ? (
                    <div className="text-sm text-gray-500">
                      No location photos yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* What you get + requirements */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <SimpleStringListEditor
                title="What You Get"
                items={draft.whatYouGet || []}
                onChange={(arr) => update("whatYouGet", arr)}
              />
              <SimpleStringListEditor
                title="Requirements"
                items={draft.requirements || []}
                onChange={(arr) => update("requirements", arr)}
              />
            </div>

            {/* Attached Software Subscriptions */}
            <div className="mt-6 rounded-2xl border p-4">
              <div className="font-bold text-lg">
                Attached Software Subscriptions
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Select from your existing Products library. Selected items will
                auto-generate: <b>Installation Checklist</b> +{" "}
                <b>Entitlement Grants</b>.
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <TextInput
                  label="Search Products"
                  value={productQ}
                  onChange={setProductQ}
                  placeholder="Search by product name or key…"
                />

                <div className="rounded-xl border bg-gray-50 p-3">
                  <div className="text-sm font-semibold text-gray-700">
                    Selected
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    {selectedSoftware.size
                      ? Array.from(selectedSoftware).join(", ")
                      : "None selected"}
                  </div>
                </div>
              </div>

              <div className="mt-3 max-h-72 overflow-auto rounded-2xl border">
                {(filteredProducts || []).map((p) => {
                  const k = normKey(p?.key);
                  if (!k) return null;
                  const checked = selectedSoftware.has(k);

                  return (
                    <label
                      key={k}
                      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSoftware(k)}
                        className="h-5 w-5"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {p?.name || k}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {p?.key}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {!(filteredProducts || []).length ? (
                  <div className="p-4 text-sm text-gray-600">
                    No products found.
                  </div>
                ) : null}
              </div>

              {/* grants editor for selected software */}
              <div className="mt-4">
                <div className="font-bold">Entitlement Grants (auto)</div>
                <div className="mt-3 space-y-3">
                  {(draft.entitlementGrants || [])
                    .filter((g) => selectedSoftware.has(normKey(g?.productKey)))
                    .map((g, idx) => (
                      <div
                        key={`${g.productKey}-${idx}`}
                        className="p-4 rounded-2xl border bg-gray-50"
                      >
                        <div className="font-semibold">{g.productKey}</div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <TextInput
                            label="Months"
                            type="number"
                            value={g.months}
                            onChange={(v) => {
                              const next = deepClone(
                                draft.entitlementGrants || [],
                              );
                              const i = next.findIndex(
                                (x) =>
                                  normKey(x.productKey) ===
                                  normKey(g.productKey),
                              );
                              if (i >= 0)
                                next[i].months = Math.max(Number(v || 1), 1);
                              update("entitlementGrants", next);
                            }}
                          />
                          <TextInput
                            label="Seats"
                            type="number"
                            value={g.seats}
                            onChange={(v) => {
                              const next = deepClone(
                                draft.entitlementGrants || [],
                              );
                              const i = next.findIndex(
                                (x) =>
                                  normKey(x.productKey) ===
                                  normKey(g.productKey),
                              );
                              if (i >= 0)
                                next[i].seats = Math.max(Number(v || 1), 1);
                              update("entitlementGrants", next);
                            }}
                          />

                          <label className="block">
                            <div className="text-sm font-semibold text-gray-700">
                              License Type
                            </div>
                            <select
                              className="mt-1 w-full border rounded-xl px-3 py-2"
                              value={g.licenseType || "personal"}
                              onChange={(e) => {
                                const next = deepClone(
                                  draft.entitlementGrants || [],
                                );
                                const i = next.findIndex(
                                  (x) =>
                                    normKey(x.productKey) ===
                                    normKey(g.productKey),
                                );
                                if (i >= 0)
                                  next[i].licenseType = e.target.value;
                                update("entitlementGrants", next);
                              }}
                            >
                              <option value="personal">personal</option>
                              <option value="organization">organization</option>
                            </select>
                          </label>

                          {(g.licenseType || "personal") === "organization" ? (
                            <div className="md:col-span-3">
                              <TextInput
                                label="Organization Name (optional)"
                                value={g.organizationName || ""}
                                onChange={(v) => {
                                  const next = deepClone(
                                    draft.entitlementGrants || [],
                                  );
                                  const i = next.findIndex(
                                    (x) =>
                                      normKey(x.productKey) ===
                                      normKey(g.productKey),
                                  );
                                  if (i >= 0) next[i].organizationName = v;
                                  update("entitlementGrants", next);
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}

                  {!selectedSoftware.size ? (
                    <div className="text-sm text-gray-500">
                      No software selected.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Installation checklist */}
            <div className="mt-6 rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-lg">Installation Checklist</div>
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                  onClick={() =>
                    update("installationChecklist", [
                      ...(draft.installationChecklist || []),
                      { key: "", label: "", helpUrl: "" },
                    ])
                  }
                  disabled={uploading}
                >
                  + Add Manual Item
                </button>
              </div>

              <div className="mt-2 text-sm text-gray-600">
                Items starting with <b>sw-</b> are auto-managed from selected
                software.
              </div>

              <div className="mt-3 space-y-3">
                {(draft.installationChecklist || []).map((c, idx) => {
                  const locked = isSwItem(c);

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          Item #{idx + 1} {locked ? "• (auto)" : ""}
                        </div>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                          onClick={() =>
                            update(
                              "installationChecklist",
                              (draft.installationChecklist || []).filter(
                                (_, i) => i !== idx,
                              ),
                            )
                          }
                          disabled={uploading}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                          <div className="text-sm font-semibold text-gray-700">
                            Key
                          </div>
                          <input
                            className={`mt-1 w-full border rounded-xl px-3 py-2 ${
                              locked ? "bg-gray-100 text-gray-600" : ""
                            }`}
                            value={c.key || ""}
                            disabled={locked || uploading}
                            onChange={(e) => {
                              const next = deepClone(
                                draft.installationChecklist || [],
                              );
                              next[idx].key = e.target.value;
                              update("installationChecklist", next);
                            }}
                            placeholder="e.g., install-revit"
                          />
                        </label>

                        <TextInput
                          label="Label"
                          value={c.label}
                          onChange={(v) => {
                            const next = deepClone(
                              draft.installationChecklist || [],
                            );
                            next[idx].label = v;
                            update("installationChecklist", next);
                          }}
                          placeholder="e.g., Install Revit 2024"
                        />

                        <div className="md:col-span-2">
                          <TextInput
                            label="Help URL (optional)"
                            value={c.helpUrl}
                            onChange={(v) => {
                              const next = deepClone(
                                draft.installationChecklist || [],
                              );
                              next[idx].helpUrl = v;
                              update("installationChecklist", next);
                            }}
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!(draft.installationChecklist || []).length ? (
                  <div className="text-sm text-gray-500">
                    No checklist items yet.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Endpoints: <b>/admin/ptrainings</b>
              {active ? (
                <span className="ml-2">
                  | Selected: <b>{active.title}</b>
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white border rounded-2xl p-6">
            <div className="font-bold text-lg">Enrollments</div>

            <div className="mt-4 space-y-3">
              {enrollments.map((x) => (
                <div key={x._id} className="p-4 rounded-2xl border bg-gray-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="font-bold">Enrollment: {x._id}</div>
                      <div className="text-sm text-gray-600">
                        status:{" "}
                        <span className="font-semibold">{x.status}</span> |
                        paid:{" "}
                        <span className="font-semibold">
                          {x.payment?.paid ? "yes" : "no"}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        installation:{" "}
                        <span className="font-semibold">
                          {x.installation?.status || "none"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                        onClick={() => approveEnrollment(x._id)}
                        type="button"
                        disabled={uploading}
                      >
                        Approve
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60"
                        onClick={() => markInstallComplete(x._id)}
                        type="button"
                        disabled={uploading}
                      >
                        Mark Installation Complete
                      </button>
                    </div>
                  </div>

                  {x.formSubmittedAt ? (
                    <div className="mt-3 text-sm text-gray-700">
                      <div className="font-semibold">Form Submitted</div>
                      <pre className="mt-2 p-3 rounded-xl bg-white border overflow-auto text-xs">
                        {JSON.stringify(x.formData || {}, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ))}

              {!enrollments.length ? (
                <div className="text-gray-600">No enrollments yet.</div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Cloudinary Browser Modal */}
      <MediaBrowserModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickerTarget(null);
        }}
        type={pickerType}
        onPick={handlePickedUrl}
      />
    </div>
  );
}

/* ---------------------- small inline editors ---------------------- */
function SimpleStringListEditor({
  title,
  items,
  onChange,
  placeholder = "Add item...",
}) {
  const [v, setV] = useState("");

  return (
    <div className="rounded-2xl border p-4">
      <div className="font-bold">{title}</div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2"
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
        />
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          onClick={() => {
            const s = (v || "").trim();
            if (!s) return;
            onChange([...(items || []), s]);
            setV("");
          }}
        >
          Add
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {(items || []).map((x, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 p-2 rounded-xl border bg-white"
          >
            <div className="min-w-0 break-words">{x}</div>
            <button
              type="button"
              className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
              onClick={() =>
                onChange((items || []).filter((_, idx) => idx !== i))
              }
            >
              Remove
            </button>
          </div>
        ))}
        {!(items || []).length ? (
          <div className="text-sm text-gray-500">No items.</div>
        ) : null}
      </div>
    </div>
  );
}

function AmenityEditor({ items, onChange }) {
  const [v, setV] = useState("");

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2"
          value={v}
          placeholder="e.g., WiFi, Power Supply, Parking"
          onChange={(e) => setV(e.target.value)}
        />
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          onClick={() => {
            const s = (v || "").trim();
            if (!s) return;
            onChange([...(items || []), s]);
            setV("");
          }}
        >
          Add
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {(items || []).map((x, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 p-2 rounded-xl border bg-white"
          >
            <div className="min-w-0 break-words">{x}</div>
            <button
              type="button"
              className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
              onClick={() =>
                onChange((items || []).filter((_, idx) => idx !== i))
              }
            >
              Remove
            </button>
          </div>
        ))}
        {!(items || []).length ? (
          <div className="text-sm text-gray-500">No amenities yet.</div>
        ) : null}
      </div>
    </div>
  );
}
