// src/pages/PTrainingDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

function money(n) {
  const x = Number(n || 0);
  if (!x) return "₦0";
  return `₦${x.toLocaleString()}`;
}

function mapsLink(address, placeUrl) {
  if (placeUrl) return placeUrl;
  const dest = encodeURIComponent(address || "");
  return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${dest}`;
}

function normKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase();
}

function prettyKey(k) {
  const s = String(k || "").trim();
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function isYouTubeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  return /youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\//i.test(u);
}

function toYouTubeEmbed(url) {
  const u = String(url || "").trim();
  if (!u) return "";

  const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;

  const watch = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}`;

  const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (embed) return `https://www.youtube.com/embed/${embed[1]}`;

  return "";
}

/** ✅ IMPORTANT: do not touch http.js — we pass token via opts.token */
function getAccessToken(user) {
  // from auth store (common patterns)
  const t1 =
    user?.accessToken ||
    user?.token ||
    user?.jwt ||
    user?.auth?.accessToken ||
    user?.session?.accessToken ||
    "";

  if (t1) return String(t1);

  // from storage (common keys)
  if (typeof window === "undefined") return "";
  const keys = [
    "accessToken",
    "token",
    "jwt",
    "adlm_access_token",
    "ADLM_ACCESS_TOKEN",
  ];

  for (const k of keys) {
    const v =
      window.localStorage?.getItem(k) || window.sessionStorage?.getItem(k);
    if (v) return String(v);
  }
  return "";
}

const PRODUCT_CATALOG = {
  revit_plugin_building: {
    name: "ADLM Revit Plugin (Architecture & Structure)",
    to: "/product/revit",
  },
  revit_plugin_services: {
    name: "ADLM Revit Plugin (MEP & HVAC)",
    to: "/product/revit-mep",
  },
  planswift_plugin_building: {
    name: "ADLM PlanSwift Plugin (Building Works & Services)",
    to: "/product/planswift",
  },
  planswift_plugin_civil: {
    name: "ADLM PlanSwift Plugin (Civil Works)",
    to: "/product/planswift-civil",
  },
  rategen: { name: "ADLM RateGen", to: "/product/rategen" },
};

function getProductMeta(productKey) {
  const k = normKey(productKey);
  const meta = PRODUCT_CATALOG[k];
  if (meta?.name && meta?.to) return meta;
  return { name: prettyKey(productKey), to: `/product/${k}` };
}

function CopyRow({ label, value }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      alert("Copied!");
    } catch {
      alert("Copy failed (browser permissions).");
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-gray-50">
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="font-semibold break-all">{value || "—"}</div>
      </div>
      <button
        onClick={copy}
        className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
      >
        Copy
      </button>
    </div>
  );
}

async function uploadReceiptToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset =
    import.meta.env.VITE_CLOUDINARY_UNSIGNED_PRESET_RECEIPT ||
    import.meta.env.VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET;

  if (!cloudName || !preset) {
    throw new Error(
      "Receipt upload is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UNSIGNED_PRESET_RECEIPT.",
    );
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", preset);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const r = await fetch(endpoint, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Upload failed");
  if (!j?.secure_url) throw new Error("Upload failed (no URL returned)");
  return j.secure_url;
}

export default function PTrainingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const token = useMemo(() => pickToken(user), [user]);
  const authedOpts = useMemo(() => (token ? { token } : {}), [token]);

  const [loading, setLoading] = useState(true);
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");

  const [busy, setBusy] = useState(false);

  // payment modal state
  const [payOpen, setPayOpen] = useState(false);
  const [payInfo, setPayInfo] = useState(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payerName, setPayerName] = useState("");
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");

  // receipt upload state (optional)
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptUploading, setReceiptUploading] = useState(false);

  // gallery modal (images + videos)
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIdx, setGalleryIdx] = useState(0);

  // flyer lightbox
  const [flyerOpen, setFlyerOpen] = useState(false);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(
          `${API_BASE}/ptrainings/events/${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed");
        if (ok) setT(j);
      } catch (e) {
        if (ok) setErr(e?.message || "Failed");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => (ok = false);
  }, [id]);

  const address = useMemo(() => {
    const loc = t?.location || {};
    return [loc.name, loc.address, loc.city, loc.state]
      .filter(Boolean)
      .join(", ");
  }, [t]);

  const galleryMedia = useMemo(() => {
    const locPhotos = Array.isArray(t?.location?.photos)
      ? t.location.photos
          .filter((x) => x?.url)
          .map((x) => ({
            type: "image",
            url: x.url,
            title: x.title || "Location Photo",
            _src: "location",
          }))
      : [];

    const venueMedia = Array.isArray(t?.media)
      ? t.media
          .filter((x) => x?.url)
          .map((x) => {
            const type0 = String(x?.type || "image").toLowerCase();
            const type = type0 === "video" ? "video" : "image";
            return {
              type,
              url: x.url,
              title:
                x.title || (type === "video" ? "Venue Video" : "Venue Photo"),
              _src: "venue",
            };
          })
      : [];

    const combined = [...locPhotos, ...venueMedia];

    const seen = new Set();
    const out = [];
    for (const m of combined) {
      const key = `${m.type}::${m.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }, [t]);

  const mediaCounts = useMemo(() => {
    const imgs = galleryMedia.filter((m) => m.type === "image").length;
    const vids = galleryMedia.filter((m) => m.type === "video").length;
    return { imgs, vids };
  }, [galleryMedia]);

  useEffect(() => {
    if (!galleryOpen) return;
    if (galleryMedia.length <= 0) {
      setGalleryOpen(false);
      setGalleryIdx(0);
      return;
    }
    if (galleryIdx >= galleryMedia.length) setGalleryIdx(0);
  }, [galleryOpen, galleryMedia.length, galleryIdx]);

  const flyerImage = useMemo(() => {
    if (t?.flyerUrl) return t.flyerUrl;
    const firstMediaImg = (t?.media || []).find(
      (m) => String(m?.type || "").toLowerCase() === "image" && m?.url,
    );
    return firstMediaImg?.url || "";
  }, [t]);

  const pricingRow = useMemo(() => {
    const pricing = t?.pricing || {};
    const normal = Number(pricing?.normalNGN ?? t?.priceNGN ?? 0) || 0;
    const group = Number(pricing?.groupOf3NGN ?? 0) || 0;
    const eb = Number(pricing?.earlyBird?.priceNGN ?? 0) || 0;
    const ebEndsAt = pricing?.earlyBird?.endsAt
      ? new Date(pricing.earlyBird.endsAt)
      : null;

    const ebActive =
      eb > 0 &&
      ebEndsAt &&
      !Number.isNaN(ebEndsAt.getTime()) &&
      Date.now() < ebEndsAt.getTime();

    const payable = ebActive ? eb : normal;

    return { normal, group, eb, ebEndsAt, ebActive, payable };
  }, [t]);

  const includedPlugins = useMemo(() => {
    const grants = Array.isArray(t?.entitlementGrants)
      ? t.entitlementGrants
      : [];

    if (grants.length) {
      return grants
        .map((g) => {
          const productKey = normKey(g?.productKey);
          if (!productKey) return null;
          const meta = getProductMeta(productKey);
          return {
            productKey,
            name: meta.name,
            to: meta.to,
            months: Math.max(Number(g?.months || 0), 0),
            seats: Math.max(Number(g?.seats || 1), 1),
          };
        })
        .filter(Boolean);
    }

    const keys = Array.isArray(t?.softwareProductKeys)
      ? t.softwareProductKeys
      : [];
    return keys
      .map((k) => {
        const productKey = normKey(k);
        if (!productKey) return null;
        const meta = getProductMeta(productKey);
        return {
          productKey,
          name: meta.name,
          to: meta.to,
          months: 0,
          seats: 1,
        };
      })
      .filter(Boolean);
  }, [t]);

  function pickToken(user) {
    return (
      user?.accessToken ||
      user?.token ||
      user?.access_token ||
      user?.jwt ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("adlm_accessToken") ||
      ""
    );
  }

  async function onRegister() {
    if (!user) return nav("/login");

    setBusy(true);
    setErr("");
    try {
      // ✅ PASS TOKEN HERE (no http.js change)
      const { data } = await apiAuthed.post(
        `/ptrainings/${id}/enroll`,
        {},
        authedOpts,
      );

      if (!data?.enrollmentId) throw new Error("No enrollmentId returned");

      if (
        data?.paymentSubmitted ||
        String(data?.paymentState || "").toLowerCase() === "submitted"
      ) {
        return nav(`/ptrainings/enrollment/${data.enrollmentId}`);
      }

      if (!data?.manualPayment) {
        return nav(`/ptrainings/enrollment/${data.enrollmentId}`);
      }

      setEnrollmentId(data.enrollmentId);
      setPayInfo(data.paymentInstructions || null);
      setPayOpen(true);

      setReceiptUrl("");
      setPayNote("");
      setPayerName("");
      setBankName("");
      setReference("");
    } catch (e) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaymentSubmission() {
    if (!enrollmentId) return;

    try {
      // ✅ PASS TOKEN HERE TOO
      await apiAuthed.post(
        `/ptrainings/enrollments/${enrollmentId}/payment-submitted`,
        { note: payNote, payerName, bankName, reference, receiptUrl },
        authedOpts,
      );

      setPayOpen(false);
      nav(`/ptrainings/enrollment/${enrollmentId}`);
    } catch (e) {
      alert(e?.message || "Failed");
    }
  }

  async function onPickReceipt(file) {
    if (!file) return;
    setReceiptUploading(true);
    try {
      const url = await uploadReceiptToCloudinary(file);
      setReceiptUrl(url);
    } catch (e) {
      alert(e?.message || "Receipt upload failed");
    } finally {
      setReceiptUploading(false);
    }
  }

  function openGalleryAt(i) {
    setGalleryIdx(i);
    setGalleryOpen(true);
  }

  function nextItem() {
    setGalleryIdx((p) => {
      const n = galleryMedia.length || 1;
      return (p + 1) % n;
    });
  }

  function prevItem() {
    setGalleryIdx((p) => {
      const n = galleryMedia.length || 1;
      return (p - 1 + n) % n;
    });
  }

  if (loading) return <div className="p-4 sm:p-6">Loading…</div>;
  if (err) return <div className="p-4 sm:p-6 text-red-600">{err}</div>;
  if (!t) return <div className="p-4 sm:p-6">Not found</div>;

  const cap = t.capacityApproved || 14;
  const approved = t.approvedCount || 0;
  const closed = approved >= cap;
  const mapsHref = mapsLink(address, t.location?.googleMapsPlaceUrl);

  const activeMedia = galleryMedia[galleryIdx] || null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* HERO */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm border ${
              pricingRow.ebActive ? "bg-green-50 border-green-200" : "bg-white"
            }`}
          >
            <b>Earlybird:</b> {money(pricingRow.eb)}
            {pricingRow.ebEndsAt ? (
              <span className="text-gray-500">
                {" "}
                • ends {fmtDate(pricingRow.ebEndsAt)}
              </span>
            ) : null}
          </span>

          <span
            className={`px-3 py-1 rounded-full text-sm border ${
              !pricingRow.ebActive ? "bg-green-50 border-green-200" : "bg-white"
            }`}
          >
            <b>Normal:</b> {money(pricingRow.normal)}
          </span>

          <span className="px-3 py-1 rounded-full text-sm border bg-white">
            <b>Group of 3:</b> {money(pricingRow.group)}
          </span>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
            {t.title}
          </h1>
          {t.subtitle ? (
            <p className="text-gray-600 mt-1">{t.subtitle}</p>
          ) : null}
        </div>

        <div className="mt-4 text-sm text-gray-700 space-y-2">
          <div>
            <span className="font-semibold">Date:</span> {fmtDate(t.startAt)} —{" "}
            {fmtDate(t.endAt)}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div>
              <span className="font-semibold">Capacity:</span> {approved}/{cap}{" "}
              approved
            </div>
            {closed ? (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                Enrollment Closed
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                Open
              </span>
            )}
          </div>

          <div>
            <span className="font-semibold">Payable now:</span>{" "}
            {pricingRow.payable <= 0 ? "Free" : money(pricingRow.payable)}
            {pricingRow.ebActive ? (
              <span className="ml-2 text-xs text-green-700 font-semibold">
                (Earlybird active)
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onRegister}
            disabled={busy || closed}
            className={`px-4 py-2 rounded-xl font-semibold shadow-sm ${
              closed
                ? "bg-gray-200 text-gray-500"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {busy ? "Processing…" : "Register Now"}
          </button>

          <a
            href="#location"
            className="px-4 py-2 rounded-xl font-semibold border border-gray-300 hover:bg-gray-50 text-center"
          >
            View Location
          </a>
        </div>
      </div>

      {/* PROGRAM OVERVIEW */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <h2 className="text-xl font-bold">Program Overview</h2>
          <p className="mt-3 text-gray-700 whitespace-pre-wrap">
            {t.fullDescription || t.description || "—"}
          </p>

          {!!includedPlugins.length && (
            <>
              <h3 className="text-lg font-bold mt-6">
                Included Plugins & Subscription
              </h3>
              <div className="mt-3 space-y-2">
                {includedPlugins.map((p) => (
                  <div
                    key={p.productKey}
                    className="p-3 rounded-xl border bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <Link
                        to={p.to}
                        className="font-semibold text-blue-700 hover:underline break-words"
                        title="Open product page"
                      >
                        {p.name}
                      </Link>

                      <div className="text-xs text-gray-600 mt-1">
                        {p.months > 0 ? `${p.months} month(s)` : "Duration: —"}{" "}
                        {" • "} Seats: {p.seats || 1}
                      </div>
                    </div>

                    <Link
                      to={p.to}
                      className="text-sm font-semibold px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 w-fit"
                    >
                      Learn more →
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}

          {!!(t.whatYouGet || []).length && (
            <>
              <h3 className="text-lg font-bold mt-6">What You Get</h3>
              <ul className="mt-3 space-y-2">
                {t.whatYouGet.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                    <span className="text-gray-700">{x}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!!(t.requirements || []).length && (
            <>
              <h3 className="text-lg font-bold mt-6">Requirements</h3>
              <ul className="mt-3 space-y-2">
                {t.requirements.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-gray-500 shrink-0" />
                    <span className="text-gray-700">{x}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Right: flyer */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Event Flyer</h3>
          </div>

          <div className="mt-4 rounded-2xl border bg-gray-50 overflow-hidden">
            {flyerImage ? (
              <button
                type="button"
                onClick={() => setFlyerOpen(true)}
                className="w-full"
                title="Click to view full flyer"
              >
                <img
                  src={flyerImage}
                  alt="Training flyer"
                  className="w-full h-auto object-contain bg-white"
                />
              </button>
            ) : (
              <div className="h-40 grid place-items-center text-gray-500">
                No flyer image
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LOCATION */}
      <div
        id="location"
        className="mt-6 bg-white rounded-2xl shadow-sm border p-4 sm:p-6"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Training Location</h2>
            <p className="mt-2 text-gray-700 break-words">{address || "—"}</p>

            {!!(t.location?.amenities || []).length && (
              <div className="mt-4">
                <div className="font-semibold">Amenities</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.location.amenities.map((a, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm bg-gray-100 border"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex">
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 text-center w-full sm:w-auto"
            >
              Open in Google Maps
            </a>
          </div>
        </div>

        {/* Combined Gallery */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Location & Venue Gallery</div>
            {!!galleryMedia.length && (
              <div className="text-xs text-gray-600">
                {mediaCounts.imgs} photo(s) • {mediaCounts.vids} video(s)
              </div>
            )}
          </div>

          {galleryMedia.length ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {galleryMedia.map((m, i) => (
                <button
                  key={`${m.type}-${m.url}-${i}`}
                  type="button"
                  onClick={() => openGalleryAt(i)}
                  className="rounded-2xl border overflow-hidden hover:opacity-95 bg-black relative"
                  title={m.title || "View"}
                >
                  {m.type === "image" ? (
                    <img
                      src={m.url}
                      alt={m.title || "Image"}
                      className="w-full h-28 object-cover bg-white"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-28 bg-black grid place-items-center text-white">
                      <div className="text-center">
                        <div className="text-2xl leading-none">▶</div>
                        <div className="text-xs mt-1 opacity-90">Video</div>
                      </div>
                    </div>
                  )}

                  <span className="absolute left-2 top-2 text-[10px] px-2 py-0.5 rounded-full bg-white/90 border">
                    {m._src === "location" ? "Location" : "Venue"}
                  </span>

                  <span className="absolute right-2 top-2 text-[10px] px-2 py-0.5 rounded-full bg-white/90 border">
                    {m.type === "video" ? "Video" : "Photo"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-600">
              No gallery media yet.
            </div>
          )}
        </div>

        {t.location?.googleMapsEmbedUrl ? (
          <div className="mt-6 rounded-2xl overflow-hidden border">
            <iframe
              title="Google Maps"
              src={t.location.googleMapsEmbedUrl}
              className="w-full h-72 sm:h-80"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : null}
      </div>

      {/* NEXT STEPS */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <h3 className="text-lg font-bold">Next Steps</h3>
        <div className="mt-3 text-gray-700 text-sm grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-gray-50 border">
            <div className="font-semibold">1) Make Payment</div>
            <div>Click “Register Now” to see ADLM account details.</div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border">
            <div className="font-semibold">2) Upload Receipt (Optional)</div>
            <div>
              You can upload a transfer receipt image while submitting payment.
            </div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border">
            <div className="font-semibold">3) Fill Registration Form</div>
            <div>After submitting transfer, complete the participant form.</div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border">
            <div className="font-semibold">4) Admin Approval</div>
            <div>
              Admin confirms your payment, approves your slot and activates your
              tool access.
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Lightbox */}
      {galleryOpen && galleryMedia.length ? (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden border shadow-lg">
            <div className="flex items-center justify-between p-3 border-b gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  {activeMedia?.title ||
                    (activeMedia?.type === "video" ? "Video" : "Photo")}
                </div>
                <div className="text-xs text-gray-600">
                  {activeMedia?._src === "location" ? "Location" : "Venue"} •{" "}
                  {activeMedia?.type === "video" ? "Video" : "Photo"} •{" "}
                  {galleryIdx + 1}/{galleryMedia.length}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeMedia?.url ? (
                  <a
                    href={activeMedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                    title="Open in new tab"
                  >
                    Open
                  </a>
                ) : null}

                <button
                  onClick={() => setGalleryOpen(false)}
                  className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="relative bg-black">
              {activeMedia?.type === "video" ? (
                isYouTubeUrl(activeMedia.url) ? (
                  <iframe
                    title={activeMedia.title || "Video"}
                    src={toYouTubeEmbed(activeMedia.url)}
                    className="w-full h-[70vh]"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={activeMedia.url}
                    className="w-full max-h-[70vh] object-contain"
                    controls
                    autoPlay
                  />
                )
              ) : (
                <img
                  src={activeMedia?.url}
                  alt={activeMedia?.title || "Image"}
                  className="w-full max-h-[70vh] object-contain"
                />
              )}

              {galleryMedia.length > 1 ? (
                <>
                  <button
                    onClick={prevItem}
                    className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-white/90 border font-semibold hover:bg-white"
                  >
                    Prev
                  </button>
                  <button
                    onClick={nextItem}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-white/90 border font-semibold hover:bg-white"
                  >
                    Next
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Flyer Lightbox */}
      {flyerOpen && flyerImage ? (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden border shadow-lg">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="font-semibold truncate">Event Flyer</div>
              <button
                onClick={() => setFlyerOpen(false)}
                className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="bg-black">
              <img
                src={flyerImage}
                alt="Training flyer"
                className="w-full max-h-[80vh] object-contain bg-black"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Manual payment popup */}
      {payOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xl font-bold">ADLM Payment Details</div>
                <div className="text-sm text-gray-600 mt-1">
                  Make a transfer and click <b>I’ve Paid / Continue</b>.
                </div>
              </div>
              <button
                onClick={() => setPayOpen(false)}
                className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-sm text-blue-700">
                  Amount: <b>{money(Number(payInfo?.amountNGN || 0))}</b>
                </div>
              </div>

              <CopyRow label="Bank Name" value={payInfo?.bankName} />
              <CopyRow label="Account Name" value={payInfo?.accountName} />
              <CopyRow label="Account Number" value={payInfo?.accountNumber} />

              {payInfo?.note ? (
                <div className="p-3 rounded-xl border bg-gray-50 text-sm text-gray-700">
                  {payInfo.note}
                  {payInfo.whatsapp ? (
                    <div className="mt-2">
                      WhatsApp: <b>{payInfo.whatsapp}</b>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="p-3 rounded-xl border bg-gray-50">
                <div className="font-semibold">
                  Upload Payment Receipt (Optional)
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  If configured, you can upload a screenshot/photo of the
                  transfer.
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="px-3 py-2 rounded-xl bg-white border font-semibold hover:bg-gray-100 cursor-pointer">
                    {receiptUploading ? "Uploading…" : "Choose Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={receiptUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        onPickReceipt(f);
                      }}
                    />
                  </label>

                  {receiptUrl ? (
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
                      onClick={() => setReceiptUrl("")}
                      disabled={receiptUploading}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {receiptUrl ? (
                  <img
                    src={receiptUrl}
                    alt="Receipt"
                    className="mt-3 w-full max-h-56 object-contain rounded-2xl border bg-white"
                  />
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Payer Name (optional)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Your Bank (optional)"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
                <input
                  className="border rounded-xl px-3 py-2 md:col-span-2"
                  placeholder="Transfer Reference / Narration (optional)"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <textarea
                  className="border rounded-xl px-3 py-2 md:col-span-2"
                  rows={3}
                  placeholder="Note to admin (optional)"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>

              <button
                onClick={confirmPaymentSubmission}
                className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                disabled={receiptUploading}
              >
                I’ve Paid / Continue
              </button>

              <button
                onClick={() => nav(`/ptrainings/enrollment/${enrollmentId}`)}
                className="w-full px-4 py-3 rounded-xl border font-semibold hover:bg-gray-50"
              >
                Continue Without Submitting Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
