// src/pages/ProductDetail.jsx
//
// The page a visitor lands on from an ad, a WhatsApp share or the product grid.
// It has four jobs, in this order: make the product legible, make the price
// legible, answer the question that is stopping the purchase, and offer the
// next thing to look at.
//
// Two things worth knowing before editing:
//
//  * The term selector's prices come from lib/termPricing.js, which mirrors the
//    tiers in Purchase.jsx. If the tiers move there, move them there too — a
//    page that advertises a price checkout does not honour is worse than a page
//    with no prices on it.
//
//  * `blurb` is the subtitle. This page used to read `p.tagline ||
//    p.shortDescription`, neither of which exists on the Product schema, so the
//    subtitle silently never rendered while `blurb` sat unused in the document.

import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import Seo from "../components/Seo.jsx";
import ComingSoonModal from "../components/ComingSoonModal.jsx";
import StorageBar from "../components/StorageBar.jsx";
import { apiAuthed } from "../api.js";
import { Reveal, Stagger, StaggerItem } from "../components/effects.jsx";
import { Eyebrow } from "../components/brand.jsx";
import {
  softwareApplicationSchema,
  courseSchema,
  breadcrumbSchema,
  faqSchema,
} from "../lib/schema.js";
import { readPreloaded } from "../lib/preload.js";
import { termOptions, termTotalNGN, unitPrices } from "../lib/termPricing.js";
import { addProductToCart, getProductKey, getCategory } from "../lib/cart.js";
import { faqFor } from "../data/productFaq.js";
import { guideForProductKey } from "../data/guides.js";
import { trackEvent } from "../ga";
import { IconBook, IconCheck, IconPlus } from "../components/icons.jsx";

const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// Safe extractor for various YouTube URL/ID shapes
function extractYouTubeId(input = "") {
  try {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
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

  // If server returns HTML (like the meta/index fallback), treat it as failure
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

async function fetchProductList(signal, pageSize = 200) {
  const data = await fetchJsonStrict(
    `${API_BASE}/products?page=1&pageSize=${pageSize}`,
    { credentials: "include", signal },
  );
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
}

async function findProductFromListFallback(key, signal) {
  const wanted = String(key || "").trim();
  for (const pageSize of [200, 100, 50]) {
    const items = await fetchProductList(signal, pageSize);
    const match = items.find(
      (p) => getProductKey(p) === wanted || String(p?._id || "") === wanted,
    );
    if (match) return match;
    if (!items.length) break;
  }
  return null;
}

export default function ProductDetail() {
  const { key } = useParams();
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  // Seeded from whatever the server already fetched for this key. On a
  // server-rendered request that is the product itself, so the first browser
  // render matches the HTML being hydrated instead of flashing the skeleton
  // over a page that was already complete. Everywhere else it is undefined and
  // the effect below fetches exactly as it always did.
  const preloadedProduct = readPreloaded(`product:${String(key || "").trim()}`);

  const [p, setP] = React.useState(preloadedProduct ?? null);
  const [loading, setLoading] = React.useState(!preloadedProduct);
  const [err, setErr] = React.useState("");
  const [productStorage, setProductStorage] = React.useState(null);
  const [siblings, setSiblings] = React.useState([]);
  const [months, setMonths] = React.useState(1);
  const [added, setAdded] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState(0);

  // Set once the seeded product has been consumed, so this only ever skips the
  // very first fetch. Navigating to a different product still loads normally.
  const usedPreload = React.useRef(Boolean(preloadedProduct));

  React.useEffect(() => {
    if (usedPreload.current) {
      usedPreload.current = false;
      return undefined;
    }

    const ctl = new AbortController();
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");
      setP(null);

      const safeKey = String(key || "").trim();

      try {
        const direct = await fetchJsonStrict(
          `${API_BASE}/products/${encodeURIComponent(safeKey)}`,
          { credentials: "include", signal: ctl.signal },
        );
        if (!mounted) return;
        if (direct && (direct._id || direct.key || direct.slug)) {
          setP(direct);
          return;
        }
        const fallback = await findProductFromListFallback(safeKey, ctl.signal);
        if (!mounted) return;
        setP(fallback);
      } catch (e) {
        try {
          const fallback = await findProductFromListFallback(safeKey, ctl.signal);
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

  // Everything else in the catalogue, for the cross-sell strip. Failing here
  // must not take the page down — it is the least important thing on it.
  React.useEffect(() => {
    const ctl = new AbortController();
    fetchProductList(ctl.signal)
      .then((items) => setSiblings(items))
      .catch(() => setSiblings([]));
    return () => ctl.abort();
  }, []);

  // GA4 ecommerce: the funnel is view_item -> add_to_cart -> purchase, and
  // without this first step the other two have nothing to convert against.
  React.useEffect(() => {
    if (!p) return;
    const price =
      (p.billingInterval === "yearly"
        ? p.price?.discountedYearlyNGN || p.price?.yearlyNGN
        : p.price?.discountedMonthlyNGN || p.price?.monthlyNGN) || 0;
    trackEvent("view_item", {
      currency: "NGN",
      value: Number(price),
      items: [
        {
          item_id: getProductKey(p),
          item_name: p.name || getProductKey(p),
          item_category: getCategory(p),
          price: Number(price),
          quantity: 1,
        },
      ],
    });
  }, [p]);

  // Build slides: video first (if any) then thumbnail + images
  const slides = React.useMemo(() => {
    const out = [];
    if (p?.previewUrl) {
      out.push({ type: "video", src: p.previewUrl, poster: p.thumbnailUrl || "" });
    }
    if (p?.thumbnailUrl) out.push({ type: "image", src: p.thumbnailUrl });
    if (Array.isArray(p?.images)) {
      for (const src of p.images) {
        if (!src || src === p.thumbnailUrl) continue;
        out.push({ type: "image", src });
      }
    }
    const seen = new Set();
    return out.filter((s) => {
      const k = `${s.type}:${s.src}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [p]);

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
  React.useEffect(() => {
    setActiveSlide(0);
    setMonths(1);
    setAdded(false);
    setOpenFaq(0);
  }, [key]);

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

  // Sticky buy bar: shown once the hero's CTA has scrolled away, so the price
  // and the button are never more than a thumb-reach from the visitor.
  const ctaRef = React.useRef(null);
  const [showBar, setShowBar] = React.useState(false);
  React.useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;

    // A scroll listener rather than an IntersectionObserver on purpose. An
    // observer only fires when the element crosses the threshold, so a single
    // callback that lands before a programmatic scroll settles — or a load that
    // starts part-way down the page — leaves the bar stuck in the wrong state
    // until the next crossing.
    //
    // Measured directly in the handler rather than inside requestAnimationFrame:
    // rAF does not run while the document is hidden or not compositing, which
    // silently freezes the bar in whatever state it was last in. It is one
    // getBoundingClientRect on one element, and React drops a setState to the
    // same value, so there is nothing to save by deferring it.
    const check = () => setShowBar(el.getBoundingClientRect().bottom < 0);

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [loading, p]);

  const isComingSoon = !!p?.isComingSoon;
  const [showComingSoon, setShowComingSoon] = React.useState(false);

  function purchase() {
    if (isComingSoon) {
      setShowComingSoon(true);
      return;
    }
    const productKey = getProductKey(p) || key;
    const nextUrl = `/purchase?product=${encodeURIComponent(productKey)}&months=${months}`;
    if (!user) return navigate(`/login?next=${encodeURIComponent(nextUrl)}`);
    navigate(nextUrl);
  }

  function addToCart() {
    if (isComingSoon || !p) return;
    addProductToCart(p, months);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-40 rounded bg-slate-200 dark:bg-white/10" />
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="w-full lg:w-[480px] aspect-[4/5] rounded-2xl bg-slate-200 dark:bg-white/10" />
            <div className="flex-1 space-y-4 py-2">
              <div className="h-8 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-white/10" />
              <div className="h-12 w-40 rounded bg-slate-200 dark:bg-white/10" />
              <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 text-center space-y-4">
        <Seo title="Product not found" path={`/product/${key}`} noindex />
        <div className="text-4xl">🔍</div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          We couldn&apos;t find that product
        </h1>
        <p className="text-sm text-slate-500 dark:text-adlm-dark-muted max-w-md mx-auto">
          {err || "It may have been renamed or is no longer published."}
        </p>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-adlm-blue-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-adlm-blue-600 transition"
          to="/products"
        >
          Browse all products
        </Link>
      </div>
    );
  }

  const cadence = p.billingInterval === "yearly" ? "year" : "month";
  const u = unitPrices(p);
  const unitNGN = p.billingInterval === "yearly" ? p.price?.yearlyNGN : p.price?.monthlyNGN;
  const unitUSD = p.billingInterval === "yearly" ? p.price?.yearlyUSD : p.price?.monthlyUSD;
  const baseNGN = p.billingInterval === "yearly" ? u.yearly : u.monthly;

  const discNGN =
    p.billingInterval === "yearly"
      ? p.price?.discountedYearlyNGN
      : p.price?.discountedMonthlyNGN;
  const hasDiscount = discNGN != null && discNGN > 0 && discNGN < unitNGN;
  const pctOff = hasDiscount ? Math.round(((unitNGN - discNGN) / unitNGN) * 100) : 0;

  const terms = termOptions(p);
  const selected = terms.find((t) => t.months === months) || terms[0] || null;
  const dueNow = selected ? selected.total : termTotalNGN(p, months);

  const activePrice = hasDiscount ? discNGN : unitNGN || 0;
  const storageUpgradeNGN =
    productStorage?.slotUpgradePrice != null
      ? productStorage.slotUpgradePrice
      : Math.round(activePrice * 0.03);
  const productKey = getProductKey(p) || key;

  const related = Array.isArray(p.relatedFreeVideoIds) ? p.relatedFreeVideoIds : [];
  const active = slides[activeSlide];
  const features = Array.isArray(p.features) ? p.features : [];
  const subtitle = p.blurb || "";
  const guide = guideForProductKey(productKey);
  const faq = faqFor(productKey);
  const isCourse = !!p.isCourse;

  const others = siblings
    .filter((s) => getProductKey(s) !== productKey && s.isPublished !== false)
    .slice(0, 4);

  const canonicalPath = `/product/${productKey}`;
  const metaDescription =
    subtitle ||
    (p.description ? String(p.description).replace(/\s+/g, " ").slice(0, 155) : "") ||
    `${p.name} from ADLM Studio.`;

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
  const card =
    "rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth";

  return (
    <>
      <Seo
        title={p.name}
        description={metaDescription}
        path={canonicalPath}
        image={p.thumbnailUrl || undefined}
        type="product"
        jsonLd={[
          isCourse
            ? courseSchema({
                name: p.name,
                description: metaDescription,
                url: `https://www.adlmstudio.net${canonicalPath}`,
              })
            : softwareApplicationSchema({
                name: p.name,
                description: metaDescription,
                image: p.thumbnailUrl,
                url: `https://www.adlmstudio.net${canonicalPath}`,
                priceNGN: activePrice,
                interval: cadence,
                // The plugins load inside Revit, ArchiCAD and PlanSwift, all of
                // which are Windows-only. The cloud platform is not.
                operatingSystem: /cloud/i.test(productKey || "")
                  ? "Web browser"
                  : "Windows",
              }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
            { name: p.name, path: canonicalPath },
          ]),
          // Built from the same array the accordion below renders, so the
          // marked-up questions and the visible ones cannot drift apart.
          faqSchema(faq.map((item) => ({ question: item.q, answer: item.a }))),
        ].filter(Boolean)}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-10 md:space-y-14">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-adlm-dark-muted">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link to="/" className="hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-slate-300 dark:text-white/25">/</li>
            <li>
              <Link to="/products" className="hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition">
                Products
              </Link>
            </li>
            <li aria-hidden className="text-slate-300 dark:text-white/25">/</li>
            <li className="text-slate-700 dark:text-adlm-dark-text font-medium truncate max-w-[60vw]">
              {p.name}
            </li>
          </ol>
        </nav>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 lg:items-start">
          {/* Gallery */}
          <Reveal className="lg:shrink-0 min-w-0" y={16}>
            <div className="flex gap-3">
              <div className="relative w-full aspect-[4/5] lg:w-[448px] xl:w-[480px] rounded-2xl overflow-hidden bg-slate-950 ring-1 ring-black/10 dark:ring-white/10 group">
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

              {hasMany && (
                <div className="hidden lg:flex flex-col gap-2.5 w-[84px] shrink-0 max-h-[600px] overflow-y-auto pr-0.5">
                  {slides.map((s, i) => (
                    <Thumb key={`v-${i}`} s={s} i={i} className="w-full aspect-[4/5]" />
                  ))}
                </div>
              )}
            </div>

            {hasMany && (
              <div className="lg:hidden mt-3 flex gap-2 overflow-x-auto pb-1">
                {slides.map((s, i) => (
                  <Thumb key={`m-${i}`} s={s} i={i} className="w-16 shrink-0 aspect-[4/5]" />
                ))}
              </div>
            )}
          </Reveal>

          {/* Buy panel */}
          <Reveal className="lg:flex-1 min-w-0" y={16} delay={80}>
            {/* getCategory falls back to the literal "General" because Product
                has no category field — an eyebrow reading "GENERAL" tells the
                visitor nothing and looks like a placeholder someone forgot. */}
            <Eyebrow tone="blue">
              {isCourse
                ? "ADLM Course"
                : getCategory(p) !== "General"
                  ? getCategory(p)
                  : "ADLM Software"}
            </Eyebrow>
            <h1 className="mt-2 text-3xl md:text-4xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-adlm-dark-text">
              {p.name}
            </h1>
            {subtitle && (
              <p className="mt-3 text-base md:text-lg leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
                {subtitle}
              </p>
            )}

            {isComingSoon && (
              <div className="mt-4 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                Coming soon — not yet available for purchase
              </div>
            )}

            {/* Term selector */}
            {!isComingSoon && terms.length > 1 && (
              <div className="mt-6">
                <Eyebrow className="mb-2">Choose your term</Eyebrow>
                {/* A product with no 6-month saving offers only two terms, and
                    a 3-column grid would leave a gap that reads as a bug. */}
                <div className={`grid gap-2 ${terms.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {terms.map((t) => {
                    const on = t.months === months;
                    return (
                      <button
                        key={t.months}
                        type="button"
                        onClick={() => setMonths(t.months)}
                        aria-pressed={on}
                        className={`relative rounded-xl border px-3 py-3 text-left transition ${
                          on
                            ? "border-adlm-blue-600 bg-adlm-blue-50/70 dark:bg-adlm-blue-700/15 ring-1 ring-adlm-blue-600"
                            : "border-slate-200 dark:border-adlm-dark-border hover:border-adlm-blue-300 dark:hover:border-adlm-blue-700/50"
                        }`}
                      >
                        {t.savePct > 0 && (
                          <span className="absolute -top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-adlm-orange text-white shadow">
                            −{t.savePct}%
                          </span>
                        )}
                        <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                          {t.label}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">
                          {ngn(Math.round(t.perMonth))}/mo
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price */}
            <div className="mt-6 flex items-end gap-2.5 flex-wrap">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {ngn(dueNow || baseNGN)}
              </span>
              {hasDiscount && months === 1 && (
                <>
                  <span className="text-lg text-slate-400 line-through pb-1">{ngn(unitNGN)}</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-400 px-2 py-0.5 rounded-full mb-1.5">
                    {pctOff}% OFF
                  </span>
                </>
              )}
              <span className="text-sm text-slate-500 dark:text-adlm-dark-muted pb-1.5">
                {selected && selected.months > 1 ? `for ${selected.label}` : `/ ${cadence}`}
              </span>
            </div>
            <div className="mt-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted">
              {unitUSD ? <>≈ {usd(unitUSD)} / {cadence}</> : null}
              {Number(p.price?.installNGN) > 0 && (
                <>
                  {unitUSD ? " · " : ""}One-time install fee{" "}
                  <span className="font-semibold text-slate-700 dark:text-adlm-dark-text">
                    {ngn(p.price.installNGN)}
                  </span>
                </>
              )}
            </div>

            {/* CTAs */}
            <div ref={ctaRef} className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={purchase}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white transition active:scale-[.99] shadow-lg ${
                  isComingSoon
                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                    : "bg-adlm-blue-700 hover:bg-adlm-blue-600 shadow-adlm-blue-700/25"
                }`}
              >
                {isComingSoon ? "Notify me when available" : "Get started now"}
              </button>
              {!isComingSoon && (
                <button
                  type="button"
                  onClick={addToCart}
                  className={`sm:w-44 inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold border transition active:scale-[.99] ${
                    added
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
                      : "border-slate-200 dark:border-adlm-dark-border text-slate-700 dark:text-adlm-dark-text hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                  }`}
                >
                  {added ? "✓ Added to cart" : "Add to cart"}
                </button>
              )}
            </div>

            {/* Trust */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-adlm-dark-border grid sm:grid-cols-2 gap-2.5 text-xs text-slate-600 dark:text-adlm-dark-muted">
              <TrustRow>Licence activates the moment you pay</TrustRow>
              <TrustRow>Secure checkout · no card stored unless you ask</TrustRow>
              <TrustRow>Support included, from real people</TrustRow>
              <TrustRow muted>Onboarding available as a paid add-on</TrustRow>
            </div>

            {/* Storage, for licensed users */}
            {productStorage && !productStorage.isMaterials ? (
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-adlm-dark-border">
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow>Your cloud storage</Eyebrow>
                  <span className="text-[11px] text-slate-400 dark:text-adlm-dark-dim">
                    {productStorage.limit - productStorage.used} slot
                    {productStorage.limit - productStorage.used === 1 ? "" : "s"} remaining
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
                        `/purchase?addon=storage-slots&for=${encodeURIComponent(productKey)}&slots=10&price=${storageUpgradeNGN}&return=/product/${encodeURIComponent(key)}`,
                      )
                    }
                    className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-adlm-blue-200 dark:border-adlm-blue-700/40 bg-adlm-blue-50 dark:bg-adlm-blue-700/10 px-3 py-2 text-xs font-semibold text-adlm-blue-700 dark:text-adlm-blue-300 hover:bg-adlm-blue-100 dark:hover:bg-adlm-blue-700/20 transition"
                  >
                    Add 10 project slots — {ngn(storageUpgradeNGN)}
                  </button>
                )}
              </div>
            ) : null}
          </Reveal>
        </div>

        {/* ── WHAT YOU GET ─────────────────────────────────────────────── */}
        {features.length > 0 && (
          <section>
            <Reveal>
              <Eyebrow tone="orange">What you get</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
                Everything included in {p.name.split(":")[0]}
              </h2>
            </Reveal>
            <Stagger className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f, i) => (
                <StaggerItem
                  key={i}
                  className={`${card} p-5 hover:-translate-y-1 hover:shadow-depth-lg transition duration-200`}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-adlm-blue-50 dark:bg-adlm-blue-700/15 text-adlm-blue-700 dark:text-adlm-blue-400">
                    <IconCheck className="w-5 h-5" />
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-adlm-dark-text">{f}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        )}

        {/* ── ABOUT ────────────────────────────────────────────────────── */}
        {p.description && (
          <Reveal as="section" className={`${card} p-6 md:p-8`}>
            <Eyebrow tone="blue">About</Eyebrow>
            <h2 className="mt-2 text-xl md:text-2xl font-bold text-slate-900 dark:text-adlm-dark-text">
              Why people use it
            </h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-600 dark:text-adlm-dark-muted max-w-3xl">
              {p.description}
            </p>
            {guide && (
              <a
                href={guide.file}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-3 rounded-xl border border-adlm-blue-100 dark:border-adlm-blue-700/30 bg-adlm-blue-50/60 dark:bg-adlm-blue-700/10 px-4 py-3 hover:bg-adlm-blue-100/70 dark:hover:bg-adlm-blue-700/20 transition group"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-white/10 text-adlm-blue-700 dark:text-adlm-blue-300 shrink-0">
                  <IconBook className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-adlm-blue-900 dark:text-adlm-blue-200 group-hover:underline">
                    Read the {guide.title} guide before you buy
                  </span>
                  <span className="block text-xs text-adlm-blue-700/80 dark:text-adlm-blue-300/80 mt-0.5">
                    {guide.pages}-page illustrated PDF · every screen, start to finish
                  </span>
                </span>
              </a>
            )}
          </Reveal>
        )}

        {/* ── CLOUD STORAGE (licensed users) ───────────────────────────── */}
        {productStorage && !productStorage.isMaterials ? (
          <Reveal as="section" className={`${card} p-6 md:p-8`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <Eyebrow tone="blue">Cloud storage</Eyebrow>
                <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-adlm-dark-text">
                  Project slots for {p.name}
                </h2>
              </div>
              {storageUpgradeNGN > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/purchase?addon=storage-slots&for=${encodeURIComponent(productKey)}&slots=10&price=${storageUpgradeNGN}&return=/product/${encodeURIComponent(key)}`,
                    )
                  }
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adlm-blue-700 text-white text-sm font-semibold hover:bg-adlm-blue-600 transition shadow-md"
                >
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
              {[
                [productStorage.used, "Projects used"],
                [productStorage.limit - productStorage.used, "Slots remaining"],
                [productStorage.limit, "Total included"],
              ].map(([n, label]) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{n}</div>
                  <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        ) : null}

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section>
          <Reveal>
            <Eyebrow tone="orange">Before you buy</Eyebrow>
            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
              Questions people ask
            </h2>
          </Reveal>
          <div className="mt-6 grid lg:grid-cols-2 gap-3">
            {faq.map((item, i) => {
              const open = openFaq === i;
              return (
                <Reveal key={item.q} delay={i * 40} className={`${card} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    aria-expanded={open}
                    className="w-full flex items-start justify-between gap-4 text-left p-5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition"
                  >
                    <span className="text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
                      {item.q}
                    </span>
                    <span
                      className={`shrink-0 mt-0.5 text-adlm-blue-700 dark:text-adlm-blue-400 transition-transform duration-200 ${open ? "rotate-45" : ""}`}
                      aria-hidden
                    >
                      <IconPlus className="w-5 h-5" />
                    </span>
                  </button>
                  {open && (
                    <p className="px-5 pb-5 -mt-1 text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
                      {item.a}
                    </p>
                  )}
                </Reveal>
              );
            })}
          </div>
          <Reveal className="mt-4 text-sm text-slate-500 dark:text-adlm-dark-muted">
            Still unsure?{" "}
            <Link to="/support" className="font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline">
              Ask us directly
            </Link>{" "}
            — we would rather answer than have you guess.
          </Reveal>
        </section>

        {/* ── RELATED LEARNING ─────────────────────────────────────────── */}
        {related.length > 0 && (
          <section>
            <Reveal>
              <Eyebrow tone="blue">See it working</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
                Watch before you commit
              </h2>
            </Reveal>
            <Stagger className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map((v, idx) => {
                const youtubeId = typeof v === "string" ? v : v?.youtubeId;
                const title = typeof v === "string" ? "Watch video" : v?.title || "Watch video";
                const id = extractYouTubeId(youtubeId || "");
                const thumb =
                  (typeof v === "object" && v?.thumbnailUrl) ||
                  (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "");
                return (
                  <StaggerItem key={v?._id || id || idx}>
                    <a
                      href={id ? `https://www.youtube.com/watch?v=${id}` : "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`${card} group block overflow-hidden hover:-translate-y-1 hover:shadow-depth-lg transition duration-200`}
                    >
                      {thumb && (
                        <div className="relative">
                          <img src={thumb} className="w-full aspect-video object-cover" alt="" loading="lazy" />
                          <span className="absolute inset-0 grid place-items-center">
                            <span className="w-12 h-12 rounded-full bg-black/55 text-white grid place-items-center text-sm pl-0.5 group-hover:bg-adlm-orange group-hover:scale-110 transition">
                              ▶
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="p-4 text-sm font-medium text-slate-700 dark:text-adlm-dark-text">
                        {title}
                      </div>
                    </a>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </section>
        )}

        {/* ── CROSS-SELL ───────────────────────────────────────────────── */}
        {others.length > 0 && (
          <section>
            <Reveal>
              <Eyebrow tone="orange">The rest of the suite</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
                Works alongside
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-adlm-dark-muted max-w-2xl">
                Every ADLM tool signs in with the same account, and rates built in one
                flow through to the others.
              </p>
            </Reveal>
            <Stagger className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {others.map((s) => {
                const sk = getProductKey(s);
                const sPrice =
                  (s.billingInterval === "yearly"
                    ? s.price?.discountedYearlyNGN || s.price?.yearlyNGN
                    : s.price?.discountedMonthlyNGN || s.price?.monthlyNGN) || 0;
                return (
                  <StaggerItem key={sk}>
                    <Link
                      to={`/product/${encodeURIComponent(sk)}`}
                      className={`${card} group block overflow-hidden h-full hover:-translate-y-1 hover:shadow-depth-lg transition duration-200`}
                    >
                      <div className="aspect-[4/3] bg-slate-100 dark:bg-white/5 overflow-hidden">
                        {s.thumbnailUrl ? (
                          <img
                            src={s.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-slate-400 text-xs">
                            ADLM
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="text-sm font-bold text-slate-900 dark:text-adlm-dark-text line-clamp-2 group-hover:text-adlm-blue-700 dark:group-hover:text-adlm-blue-400 transition">
                          {s.name}
                        </div>
                        {s.blurb && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-muted line-clamp-2">
                            {s.blurb}
                          </p>
                        )}
                        {sPrice > 0 && (
                          <div className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-white">
                            {ngn(sPrice)}
                            <span className="text-xs font-normal text-slate-500 dark:text-adlm-dark-muted">
                              {" "}/ {s.billingInterval === "yearly" ? "year" : "month"}
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </section>
        )}

        {/* ── CLOSING CTA ──────────────────────────────────────────────── */}
        {!isComingSoon && (
          <Reveal
            as="section"
            className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white p-8 md:p-12 text-center shadow-depth"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-adlm-blue-600/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-adlm-orange/20 blur-3xl" />
            <div className="relative">
              <Eyebrow tone="onDark">Ready when you are</Eyebrow>
              <h2 className="mt-3 text-2xl md:text-4xl font-extrabold tracking-tight">
                Start using {p.name.split(":")[0]} today
              </h2>
              <p className="mt-3 text-sm md:text-base text-blue-100/90 max-w-xl mx-auto">
                {ngn(dueNow || baseNGN)}
                {selected && selected.months > 1 ? ` for ${selected.label}` : ` per ${cadence}`}.
                Activated the moment you pay.
              </p>
              <button
                type="button"
                onClick={purchase}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-adlm-orange px-8 py-3.5 text-base font-bold text-white shadow-glow-orange hover:brightness-110 active:scale-[.99] transition"
              >
                Get started now
              </button>
            </div>
          </Reveal>
        )}
      </div>

      {/* ── STICKY BUY BAR ─────────────────────────────────────────────── */}
      {showBar && !isComingSoon && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-adlm-dark-border bg-white/95 dark:bg-adlm-dark-panel/95 backdrop-blur shadow-[0_-4px_20px_rgba(15,23,42,.10)]">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-4">
            {p.thumbnailUrl && (
              <img
                src={p.thumbnailUrl}
                alt=""
                className="hidden sm:block w-10 h-10 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-adlm-dark-text truncate">
                {p.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                {ngn(dueNow || baseNGN)}
                {selected && selected.months > 1 ? ` · ${selected.label}` : ` / ${cadence}`}
              </div>
            </div>
            <button
              type="button"
              onClick={purchase}
              className="shrink-0 inline-flex items-center justify-center rounded-xl bg-adlm-blue-700 px-5 sm:px-7 py-2.5 text-sm font-semibold text-white hover:bg-adlm-blue-600 active:scale-[.99] transition shadow-lg shadow-adlm-blue-700/25"
            >
              Get started
            </button>
          </div>
        </div>
      )}

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
        className={`w-4 h-4 shrink-0 rounded-full grid place-items-center text-[9px] ${
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
