// src/pages/ProductDetail.jsx
import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import ComingSoonModal from "../components/ComingSoonModal.jsx";
import StorageBar from "../components/StorageBar.jsx";
import { apiAuthed } from "../api.js";

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
  } catch {
    // Ignore invalid or partial YouTube URLs and fall back to no embed id.
  }
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
    } catch {
      // Ignore unreadable error payloads and keep the HTTP status context.
    }
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
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [p, setP] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [productStorage, setProductStorage] = React.useState(null);

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

  // Fetch per-product storage for logged-in users
  React.useEffect(() => {
    if (!user || !accessToken || !key) return;
    const safeKey = String(key).trim();
    if (safeKey.endsWith("-materials")) return;
    apiAuthed(`/projects/${encodeURIComponent(safeKey)}/storage`, { token: accessToken })
      .then((d) => setProductStorage(d || null))
      .catch(() => null);
  }, [user, accessToken, key]);

  const [activeSlide, setActiveSlide] = React.useState(0);
  const [zoom, setZoom] = React.useState(false);
  React.useEffect(() => setActiveSlide(0), [key]);

  const hasMany = slides.length > 1;
  const prevSlide = React.useCallback(() => {
    setActiveSlide((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);
  const nextSlide = React.useCallback(() => {
    setActiveSlide((i) => (i + 1) % slides.length);
  }, [slides.length]);

  React.useEffect(() => {
    if (!hasMany) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "ArrowRight") nextSlide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMany, nextSlide, prevSlide]);

  React.useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const isComingSoon = !!p?.isComingSoon;
  const [showComingSoon, setShowComingSoon] = React.useState(false);

  function purchase() {
    if (isComingSoon) {
      setShowComingSoon(true);
      return;
    }
    const productKey = getProductKey(p) || key;
    const nextUrl = `/purchase?product=${encodeURIComponent(productKey)}&months=1`;
    if (!user) return navigate(`/login?next=${encodeURIComponent(nextUrl)}`);
    navigate(nextUrl);
  }

  if (loading)
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 text-sm text-slate-500 dark:text-adlm-dark-muted">
        Loading…
      </div>
    );

  if (!p) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-3">
        <div className="text-sm text-red-600">{err || "Product not found."}</div>
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


  // Discounted price (sale)
  const discNGN =
    p.billingInterval === "yearly"
      ? p.price?.discountedYearlyNGN
      : p.price?.discountedMonthlyNGN;
  const hasDiscount = discNGN != null && discNGN > 0 && discNGN < unitNGN;
  const pctOff = hasDiscount ? Math.round(((unitNGN - discNGN) / unitNGN) * 100) : 0;

  // Storage upgrade price — admin-configured if set, otherwise 3% of active price
  const activePrice = hasDiscount ? discNGN : (unitNGN || 0);
  const storageUpgradeNGN =
    productStorage?.slotUpgradePrice != null
      ? productStorage.slotUpgradePrice
      : Math.round(activePrice * 0.03);
  const productKey = getProductKey(p) || key;

  const related = Array.isArray(p.relatedFreeVideoIds)
    ? p.relatedFreeVideoIds
    : [];

  const active = slides[activeSlide];
  const features = Array.isArray(p.features) ? p.features : [];
  const subtitle = p.tagline || p.shortDescription || "";

  // One thumbnail button — reused by the desktop rail and the mobile strip.
  function Thumb({ s, i, className }) {
    const activeThumb = i === activeSlide;
    return (
      <button
        type="button"
        onClick={() => setActiveSlide(i)}
        title={s.type === "video" ? "Video preview" : "Image"}
        className={`relative rounded-xl overflow-hidden transition ${className} ${
          activeThumb
            ? "ring-2 ring-adlm-blue-600"
            : "ring-1 ring-black/10 dark:ring-white/10 opacity-60 hover:opacity-100"
        }`}
      >
        <img
          src={s.type === "video" ? s.poster || p.thumbnailUrl || "" : s.src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {s.type === "video" && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center text-[10px] pl-0.5">
              ▶
            </span>
          </span>
        )}
      </button>
    );
  }

  const arrowBtn =
    "absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/85 hover:bg-white text-slate-900 grid place-items-center shadow-lg text-2xl leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition";

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-8">
        {/* Back link */}
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition"
        >
          <span aria-hidden>←</span> Back to products
        </Link>

        {/* Hero: gallery (left) + buy panel (right) */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-stretch">
          {/* GALLERY — main image left, vertical rail right; framed to the
              flyer-engine 4:5 (1080×1350) ratio and matched to the buy-card height */}
          <div className="lg:shrink-0 min-w-0">
            <div className="flex gap-3 lg:h-[560px] xl:h-[600px]">
              <div className="relative w-full aspect-[4/5] lg:aspect-auto lg:w-[448px] xl:w-[480px] lg:h-full rounded-2xl overflow-hidden bg-slate-950 ring-1 ring-black/10 dark:ring-white/10 group">
                {!active ? (
                  <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">
                    No preview available
                  </div>
                ) : active.type === "video" ? (
                  <video
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                    src={active.src}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    poster={active.poster || undefined}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setZoom(true)}
                    aria-label="Zoom image"
                    className="absolute inset-0 w-full h-full cursor-zoom-in"
                  >
                    <img className="w-full h-full object-contain" src={active.src} alt={p.name} />
                  </button>
                )}

                {hasMany && (
                  <>
                    <button type="button" onClick={prevSlide} aria-label="Previous" className={`${arrowBtn} left-3`}>
                      ‹
                    </button>
                    <button type="button" onClick={nextSlide} aria-label="Next" className={`${arrowBtn} right-3`}>
                      ›
                    </button>
                    <div className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-full bg-black/55 text-white">
                      {activeSlide + 1} / {slides.length}
                    </div>
                  </>
                )}
              </div>

              {/* Desktop vertical thumbnail rail (right) */}
              {hasMany && (
                <div className="hidden lg:flex flex-col gap-2.5 w-[84px] shrink-0 lg:h-full overflow-y-auto pr-0.5">
                  {slides.map((s, i) => (
                    <Thumb key={`v-${i}`} s={s} i={i} className="w-full aspect-[4/5]" />
                  ))}
                </div>
              )}
            </div>

            {/* Mobile thumbnail strip (horizontal) */}
            {hasMany && (
              <div className="lg:hidden mt-3 flex gap-2 overflow-x-auto pb-1">
                {slides.map((s, i) => (
                  <Thumb key={`m-${i}`} s={s} i={i} className="w-16 shrink-0 aspect-[4/5]" />
                ))}
              </div>
            )}
          </div>

          {/* BUY PANEL — drives the hero height; the image matches it */}
          <div className="lg:flex-1 min-w-0">
            <div className="lg:h-[560px] xl:h-[600px] lg:overflow-y-auto rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth flex flex-col">
              {p.category && (
                <div className="text-xs font-semibold uppercase tracking-wider text-adlm-blue-700 dark:text-adlm-blue-400 mb-2">
                  {p.category}
                </div>
              )}
              <h1 className="text-2xl md:text-[1.7rem] font-bold leading-tight text-slate-900 dark:text-adlm-dark-text">
                {p.name}
              </h1>
              {subtitle && (
                <p className="mt-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted">{subtitle}</p>
              )}

              {/* Price */}
              <div className="mt-5 flex items-end gap-2 flex-wrap">
                {hasDiscount ? (
                  <>
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{ngn(discNGN)}</span>
                    <span className="text-lg text-slate-400 line-through">{ngn(unitNGN)}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                      {pctOff}% OFF
                    </span>
                  </>
                ) : (
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{ngn(unitNGN)}</span>
                )}
                <span className="text-sm text-slate-500 dark:text-adlm-dark-muted pb-1">/ {cadence}</span>
              </div>
              <div className="mt-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted">
                {unitUSD ? <>≈ {usd(unitUSD)} / {cadence}</> : null}
                {Number(p.price?.installNGN) > 0 && (
                  <>
                    {unitUSD ? " · " : ""}One-time install fee{" "}
                    <span className="font-semibold text-slate-700 dark:text-adlm-dark-text">{ngn(p.price.installNGN)}</span>
                  </>
                )}
              </div>

              {isComingSoon && (
                <div className="mt-4 inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                  Coming Soon — not yet available for purchase
                </div>
              )}

              {/* CTA */}
              <button
                type="button"
                onClick={purchase}
                className={`mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold text-white transition active:scale-[.99] shadow-lg ${
                  isComingSoon
                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                    : "bg-adlm-blue-700 hover:bg-adlm-blue-600 shadow-adlm-blue-700/25"
                }`}
              >
                {isComingSoon ? "Notify me when available" : "Purchase now"}
              </button>
              <Link
                to="/products"
                className="mt-2.5 w-full inline-flex items-center justify-center rounded-xl py-2.5 text-sm font-medium border border-slate-200 dark:border-adlm-dark-border text-slate-700 dark:text-adlm-dark-text hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
              >
                Back to products
              </Link>

              {/* Cloud storage — shown when user has an active subscription */}
              {productStorage && !productStorage.isMaterials ? (
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-adlm-dark-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                      Cloud Storage
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-adlm-dark-dim">
                      {productStorage.limit - productStorage.used} slot{productStorage.limit - productStorage.used === 1 ? "" : "s"} remaining
                    </span>
                  </div>
                  <StorageBar
                    used={productStorage.used}
                    limit={productStorage.limit}
                    productKey={productStorage.productKey || key}
                    compact
                  />
                  {storageUpgradeNGN > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/purchase?addon=storage-slots&for=${encodeURIComponent(productKey)}&slots=10&price=${storageUpgradeNGN}&return=/products/${encodeURIComponent(key)}`,
                        )
                      }
                      className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-adlm-blue-200 dark:border-adlm-blue-700/40 bg-adlm-blue-50 dark:bg-adlm-blue-700/10 px-3 py-2 text-xs font-semibold text-adlm-blue-700 dark:text-adlm-blue-300 hover:bg-adlm-blue-100 dark:hover:bg-adlm-blue-700/20 transition"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                      Add 10 project slots — {ngn(storageUpgradeNGN)}
                    </button>
                  )}
                </div>
              ) : null}

              {/* Trust row */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-adlm-dark-border space-y-2 text-xs text-slate-500 dark:text-adlm-dark-muted">
                <TrustRow>Secure checkout · cancel anytime</TrustRow>
                <TrustRow>Instant license activation</TrustRow>
                <TrustRow>Free support after purchase</TrustRow>
                <TrustRow muted>Onboarding available (paid add-on)</TrustRow>
              </div>

              {/* Quick feature highlights */}
              {features.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-adlm-dark-muted">
                      <span className="text-adlm-blue-700 dark:text-adlm-blue-400 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Features (full) */}
        {features.length > 0 && (
          <section className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text mb-3">What you get</h2>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {features.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-adlm-dark-muted">
                  <span className="text-adlm-blue-700 dark:text-adlm-blue-400 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Description */}
        {p.description && (
          <section className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text mb-2">About this product</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
              {p.description}
            </p>
          </section>
        )}

        {/* Cloud storage — full card for licensed users */}
        {productStorage && !productStorage.isMaterials ? (
          <section className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text">
                  Cloud Storage
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-adlm-dark-muted">
                  Project slots used for <span className="font-medium text-slate-700 dark:text-adlm-dark-text">{p.name}</span>
                </p>
              </div>
              {storageUpgradeNGN > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/purchase?addon=storage-slots&for=${encodeURIComponent(productKey)}&slots=10&price=${storageUpgradeNGN}&return=/products/${encodeURIComponent(key)}`,
                    )
                  }
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adlm-blue-700 text-white text-sm font-semibold hover:bg-adlm-blue-600 transition shadow-md"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add 10 slots — {ngn(storageUpgradeNGN)}
                </button>
              )}
            </div>

            <div className="mt-4">
              <StorageBar
                used={productStorage.used}
                limit={productStorage.limit}
                productKey={productStorage.productKey || key}
              />
            </div>

            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{productStorage.used}</div>
                <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">Projects used</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{productStorage.limit - productStorage.used}</div>
                <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">Slots remaining</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{productStorage.limit}</div>
                <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">Total included</div>
              </div>
            </div>

            {storageUpgradeNGN > 0 && (
              <div className="mt-4 rounded-xl border border-adlm-blue-100 dark:border-adlm-blue-700/30 bg-adlm-blue-50/60 dark:bg-adlm-blue-700/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-adlm-blue-900 dark:text-adlm-blue-200">
                    Need more space?
                  </div>
                  <div className="mt-0.5 text-xs text-adlm-blue-700 dark:text-adlm-blue-300">
                    Add 10 extra project slots for just {ngn(storageUpgradeNGN)} — that's 3% of your {cadence}ly subscription.
                    Slots are added instantly and never expire while your license is active.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/purchase?addon=storage-slots&for=${encodeURIComponent(productKey)}&slots=10&price=${storageUpgradeNGN}&return=/products/${encodeURIComponent(key)}`,
                    )
                  }
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adlm-blue-700 text-white text-sm font-semibold hover:bg-adlm-blue-600 transition"
                >
                  Buy 10 slots — {ngn(storageUpgradeNGN)}
                </button>
              </div>
            )}
          </section>
        ) : null}

        {/* Related learning */}
        {related.length > 0 && (
          <section className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text mb-3">Related learning</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map((v, idx) => {
                const youtubeId = typeof v === "string" ? v : v?.youtubeId;
                const title = typeof v === "string" ? "Watch video" : v?.title || "Watch video";
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
                    className="group rounded-xl border border-slate-200 dark:border-adlm-dark-border overflow-hidden hover:shadow-depth-lg transition lift"
                  >
                    {thumb && (
                      <div className="relative">
                        <img src={thumb} className="w-full aspect-video object-cover" alt="" />
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="w-11 h-11 rounded-full bg-black/55 text-white grid place-items-center text-sm pl-0.5 group-hover:bg-adlm-blue-700 transition">
                            ▶
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="p-3 text-sm font-medium text-slate-700 dark:text-adlm-dark-text">{title}</div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Lightbox */}
      {zoom && active && active.type !== "video" && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 select-none"
          onClick={() => setZoom(false)}
        >
          <img
            src={active.src}
            alt={p.name}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center text-2xl"
          >
            ×
          </button>
          {hasMany && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prevSlide(); }}
                aria-label="Previous"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center text-3xl"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); nextSlide(); }}
                aria-label="Next"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center text-3xl"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}

      <ComingSoonModal
        show={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Coming Soon"
        message="This product isn't available for purchase yet. We'll announce availability here soon."
      />
    </>
  );
}

function TrustRow({ children, muted = false }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-4 h-4 rounded-full grid place-items-center text-[9px] ${
          muted
            ? "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-adlm-dark-muted"
            : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {muted ? "+" : "✓"}
      </span>
      <span>{children}</span>
    </div>
  );
}
