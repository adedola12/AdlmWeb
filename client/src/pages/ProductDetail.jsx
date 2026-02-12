// src/pages/ProductDetail.jsx
import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

function getProductKey(p) {
  return String(p?.key || p?.slug || p?._id || "").trim();
}

// Safe extractor for various YouTube URL/ID shapes
function extractYouTubeId(input = "") {
  try {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return id;
      const m = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return "";
}

async function fetchJsonStrict(url, options = {}) {
  const res = await fetch(url, options);
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  // If server returns HTML (like your meta/index fallback), treat it as failure
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    let detail = "";
    try {
      detail = isJson ? JSON.stringify(await res.json()) : await res.text();
    } catch {}
    const err = new Error(
      `Request failed (${res.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
    err.status = res.status;
    throw err;
  }

  if (!isJson) {
    const txt = await res.text().catch(() => "");
    const err = new Error(
      `Expected JSON but got ${ct || "unknown content-type"} (${txt.slice(0, 120)})`,
    );
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function findProductFromListFallback(key, signal) {
  const wanted = String(key || "").trim();

  // Try large pageSize first (you currently only have a few products)
  const tryPageSizes = [200, 100, 50];

  for (const pageSize of tryPageSizes) {
    const first = await fetchJsonStrict(
      `${API_BASE}/products?page=1&pageSize=${pageSize}`,
      { credentials: "include", signal },
    );

    // Your list API returns {items,total,page,pageSize}
    const items = Array.isArray(first?.items)
      ? first.items
      : Array.isArray(first)
        ? first
        : [];
    const total = Number(first?.total || items.length || 0);

    const match = items.find((p) => {
      const pk = getProductKey(p);
      return pk === wanted || String(p?._id || "") === wanted;
    });
    if (match) return match;

    // If server really paginates and total > pageSize, loop remaining pages (bounded)
    const pages = Math.max(Math.ceil(total / pageSize), 1);
    const maxPages = Math.min(pages, 25);

    for (let page = 2; page <= maxPages; page++) {
      const next = await fetchJsonStrict(
        `${API_BASE}/products?page=${page}&pageSize=${pageSize}`,
        { credentials: "include", signal },
      );

      const nextItems = Array.isArray(next?.items)
        ? next.items
        : Array.isArray(next)
          ? next
          : [];
      const found = nextItems.find((p) => {
        const pk = getProductKey(p);
        return pk === wanted || String(p?._id || "") === wanted;
      });

      if (found) return found;
      if (!nextItems.length) break;
    }
  }

  return null;
}

export default function ProductDetail() {
  const { key } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [p, setP] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    const ctl = new AbortController();
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");
      setP(null);

      const safeKey = String(key || "").trim();

      try {
        // 1) Try direct endpoint (if your backend supports it)
        const direct = await fetchJsonStrict(
          `${API_BASE}/products/${encodeURIComponent(safeKey)}`,
          { credentials: "include", signal: ctl.signal },
        );

        if (!mounted) return;
        if (direct && (direct._id || direct.key || direct.slug)) {
          setP(direct);
          return;
        }

        // 2) Fallback to list endpoint (works even when /products/:key crashes)
        const fallback = await findProductFromListFallback(safeKey, ctl.signal);
        if (!mounted) return;
        setP(fallback);
      } catch (e) {
        // 3) If direct fails (500 / HTML), still try list fallback once
        try {
          const fallback = await findProductFromListFallback(
            safeKey,
            ctl.signal,
          );
          if (!mounted) return;
          setP(fallback);
          if (!fallback) setErr(e?.message || "Failed to load product");
        } catch (e2) {
          if (!mounted) return;
          setErr(e2?.message || e?.message || "Failed to load product");
          setP(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      ctl.abort();
    };
  }, [key]);

  // Build slides: video first (if any) then thumbnail + images
  const slides = React.useMemo(() => {
    const out = [];
    if (p?.previewUrl) {
      out.push({
        type: "video",
        src: p.previewUrl,
        poster: p.thumbnailUrl || "",
      });
    }
    if (p?.thumbnailUrl) out.push({ type: "image", src: p.thumbnailUrl });

    if (Array.isArray(p?.images)) {
      for (const src of p.images) {
        if (!src) continue;
        if (src === p.thumbnailUrl) continue;
        out.push({ type: "image", src });
      }
    }

    // de-dupe
    const seen = new Set();
    return out.filter((s) => {
      const k = `${s.type}:${s.src}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [p]);

  const [activeSlide, setActiveSlide] = React.useState(0);
  React.useEffect(() => setActiveSlide(0), [key]);

  const hasMany = slides.length > 1;
  const prevSlide = () =>
    setActiveSlide((i) => (i - 1 + slides.length) % slides.length);
  const nextSlide = () => setActiveSlide((i) => (i + 1) % slides.length);

  React.useEffect(() => {
    if (!hasMany) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "ArrowRight") nextSlide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMany, slides.length]);

  function purchase() {
    const productKey = getProductKey(p) || key;
    const nextUrl = `/purchase?product=${encodeURIComponent(productKey)}&months=1`;
    if (!user) return navigate(`/login?next=${encodeURIComponent(nextUrl)}`);
    navigate(nextUrl);
  }

  if (loading)
    return <div className="text-sm text-slate-600 px-5 py-8">Loading…</div>;

  if (!p) {
    return (
      <div className="px-5 md:px-10 lg:px-20 py-8 space-y-3">
        <div className="text-sm text-red-600">
          {err || "Product not found."}
        </div>
        <Link className="btn" to="/products">
          Back to products
        </Link>
      </div>
    );
  }

  const cadence = p.billingInterval === "yearly" ? "year" : "month";
  const unitNGN =
    p.billingInterval === "yearly" ? p.price?.yearlyNGN : p.price?.monthlyNGN;
  const unitUSD =
    p.billingInterval === "yearly" ? p.price?.yearlyUSD : p.price?.monthlyUSD;

  const related = Array.isArray(p.relatedFreeVideoIds)
    ? p.relatedFreeVideoIds
    : [];

  return (
    <div className="space-y-6 px-5 md:px-10 lg:px-20 py-8">
      <div className="card">
        <h1 className="text-2xl font-semibold">
          {p.name} ·{" "}
          <span className="text-slate-700">
            {ngn(unitNGN)} / {cadence}
          </span>
        </h1>

        <div className="mt-3 rounded-xl overflow-hidden border bg-black relative">
          {slides.length === 0 ? null : slides[activeSlide]?.type ===
            "video" ? (
            <video
              className="w-full aspect-video"
              src={slides[activeSlide].src}
              controls
              muted
              playsInline
              preload="metadata"
              poster={slides[activeSlide].poster || undefined}
            />
          ) : (
            <img
              className="w-full aspect-video object-cover"
              src={slides[activeSlide].src}
              alt=""
            />
          )}

          {hasMany && (
            <>
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous"
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-900 rounded-full w-10 h-10 grid place-items-center shadow"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-900 rounded-full w-10 h-10 grid place-items-center shadow"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveSlide(i)}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i === activeSlide ? "bg-white" : "bg-white/40"
                    }`}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {hasMany && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {slides.map((s, i) => (
              <button
                key={`${s.type}-${i}`}
                type="button"
                onClick={() => setActiveSlide(i)}
                className={`rounded border overflow-hidden text-left ${
                  i === activeSlide ? "ring-2 ring-blue-500" : ""
                }`}
                title={s.type === "video" ? "Video preview" : "Image"}
              >
                {s.type === "video" ? (
                  <div className="relative">
                    <img
                      src={s.poster || p.thumbnailUrl || ""}
                      alt=""
                      className="w-full aspect-video object-cover"
                    />
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="bg-black/60 text-white text-xs px-2 py-1 rounded">
                        Video
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={s.src}
                    alt=""
                    className="w-full aspect-video object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 text-sm text-slate-700">
          NGN: <span className="font-semibold">{ngn(unitNGN)}</span> / {cadence}
          {unitUSD ? (
            <>
              {" · "}USD: <span className="font-semibold">{usd(unitUSD)}</span>{" "}
              / {cadence}
            </>
          ) : null}
          {Number(p.price?.installNGN) > 0 && (
            <>
              {" · "}Install fee:{" "}
              <span className="font-semibold">{ngn(p.price.installNGN)}</span>
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn" onClick={purchase}>
            Purchase
          </button>
          <Link className="btn" to="/products">
            Back to products
          </Link>
        </div>
      </div>

      {(p.features?.length || 0) > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Features</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {p.features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {p.description && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Description</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">
            {p.description}
          </p>
        </div>
      )}

      {related.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">Related learning</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {related.map((v, idx) => {
              const youtubeId = typeof v === "string" ? v : v?.youtubeId;
              const title =
                typeof v === "string"
                  ? "Watch video"
                  : v?.title || "Watch video";
              const id = extractYouTubeId(youtubeId || "");
              const thumb =
                (typeof v === "object" && v?.thumbnailUrl) ||
                (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "");

              return (
                <a
                  key={v?._id || id || idx}
                  href={id ? `https://www.youtube.com/watch?v=${id}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="border rounded overflow-hidden hover:shadow"
                >
                  {thumb && (
                    <img
                      src={thumb}
                      className="w-full aspect-video object-cover"
                      alt=""
                    />
                  )}
                  <div className="p-2 text-sm">{title}</div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
