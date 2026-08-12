// src/pages/Products.jsx
import React from "react";
import Seo from "../components/Seo.jsx";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import ComingSoonModal from "../components/ComingSoonModal.jsx";
import { confirmPriceSanity } from "../lib/priceSanity.js";
import { AppTile, Eyebrow } from "../components/brand.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/effects.jsx";
import {
  readCartItems,
  addProductToCart,
  getProductKey,
  getCategory,
} from "../lib/cart.js";
import {
  IconArrowRight,
  IconCalendar,
  IconCart,
  IconClose,
  IconSearch,
} from "../components/icons.jsx";

/* -------------------- UI helpers -------------------- */
const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;

function CardVideo({ src, poster }) {
  const ref = React.useRef(null);

  const onEnter = () => {
    if (!ref.current) return;
    const p = ref.current.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  const onLeave = () => {
    if (!ref.current) return;
    ref.current.pause();
    ref.current.currentTime = 0;
  };

  // The tile is the presentation; this stays responsible only for the media
  // and the hover-to-play behaviour. Handlers live on the outer element so the
  // whole tile is the hover target, not just the video rectangle.
  return (
    <AppTile onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="aspect-video bg-black">
        {src ? (
          <video
            ref={ref}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            src={src}
            poster={poster || undefined}
          />
        ) : poster ? (
          <img src={poster} className="w-full h-full object-cover" alt="Product thumbnail" />
        ) : (
          // Was a flat navy rectangle. A product with no artwork now still
          // reads as a product rather than as a loading failure.
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-adlm-navy-mid to-adlm-navy">
            <img
              src="/Logo.png"
              alt=""
              aria-hidden="true"
              className="h-10 w-auto opacity-45"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </AppTile>
  );
}

/* -------------------- NEW: Training Card -------------------- */
function TrainingCard({ t }) {
  const img =
    t?.flyerUrl ||
    t?.location?.photos?.find((x) => x?.type === "image" && x?.url)?.url ||
    "";

  const start = t?.startAt ? new Date(t.startAt) : null;
  const end = t?.endAt ? new Date(t.endAt) : null;

  const when =
    start && !Number.isNaN(start.getTime())
      ? `${start.toLocaleDateString()}${end && !Number.isNaN(end.getTime()) ? " - " + end.toLocaleDateString() : ""}`
      : "";

  const venue = [t?.location?.name, t?.location?.city, t?.location?.state]
    .filter(Boolean)
    .join(" • ");

  return (
    <article className="relative spotlight rounded-2xl bg-white p-3 md:p-4 shadow-depth ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-depth-lg hover:ring-black/10 transition">
      <div className="rounded-xl overflow-hidden aspect-video bg-slate-100 ring-1 ring-black/5">
        {img ? (
          <img src={img} alt={t?.title || "Training"} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-200" />
        )}
      </div>

      <div className="mt-3">
        <div className="text-xs text-slate-600">{when}</div>
        <div className="text-base font-semibold line-clamp-2">{t?.title}</div>
        {t?.subtitle ? (
          <div className="text-sm text-slate-600 line-clamp-2">
            {t.subtitle}
          </div>
        ) : null}

        {venue ? (
          <div className="mt-1 text-xs text-slate-500">{venue}</div>
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{ngn(t?.priceNGN || 0)}</div>
          <Link
            to={`/ptrainings/${t.slug || t._id}`}
            className="rounded-md px-3 py-2 text-sm font-medium bg-adlm-blue-700 text-white hover:bg-[#0050c8] transition"
          >
            View
          </Link>
        </div>
      </div>
    </article>
  );
}

/* -------------------- Page -------------------- */
export default function Products() {
  const [qs, setQs] = useSearchParams();
  const navigate = useNavigate();

  const page = Math.max(parseInt(qs.get("page") || "1", 10), 1);
  // Search, category and sort all run on the client, so they can only be
  // correct if the client holds the whole catalogue — sorting "price low to
  // high" across one page of nine would silently sort a subset and look right.
  // The catalogue is eight products; one request covers it with room to grow,
  // and the pagination below stays for the day it does not.
  const pageSize = 60;

  const [data, setData] = React.useState({
    items: [],
    total: 0,
    page,
    pageSize,
  });

  const [trainings, setTrainings] = React.useState([]);
  const [trainingsErr, setTrainingsErr] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All Products");
  const [sortBy, setSortBy] = React.useState("popular");

  const [cartCount, setCartCount] = React.useState(() => {
    const n = Number(localStorage.getItem("cartCount") || 0);
    return Number.isFinite(n) ? n : 0;
  });

  const [showModal, setShowModal] = React.useState(false);
  const closeModal = () => setShowModal(false);

  const [editingId, setEditingId] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const isEditing = (id) => editingId === id;

  const [activeCoupons, setActiveCoupons] = React.useState([]);

  const { user, accessToken } = useAuth();
  const isAdmin = user?.role === "admin";

  /* -------------------- cart sync -------------------- */
  React.useEffect(() => {
    const sync = () => {
      const items = readCartItems();
      const total = items.reduce((sum, it) => sum + Number(it.qty || 0), 0);
      localStorage.setItem("cartCount", String(total));
      setCartCount(total);
    };

    sync();

    const onStorage = (e) => {
      if (e.key === "cartItems" || e.key === "cartCount") sync();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* -------------------- pagination helper -------------------- */
  function gotoPage(next) {
    const n = Math.max(1, Number(next) || 1);
    setQs(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("page", String(n));
        return p;
      },
      { replace: true },
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------------------- load products -------------------- */
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMsg("");

      try {
        if (isAdmin) {
          const res = await apiAuthed(`/admin/products`, {
            token: accessToken,
          });
          const all = Array.isArray(res) ? res : [];
          const total = all.length;
          const start = (page - 1) * pageSize;
          const items = all.slice(start, start + pageSize);

          if (!cancelled) setData({ items, total, page, pageSize });
        } else {
          const res = await fetch(
            `${API_BASE}/products?page=${page}&pageSize=${pageSize}`,
            { credentials: "include" },
          );
          const json = await res.json();

          if (!cancelled) {
            setData({
              items: Array.isArray(json?.items) ? json.items : [],
              total: Number(json?.total || 0),
              page: Number(json?.page || page),
              pageSize: Number(json?.pageSize || pageSize),
            });
          }
        }
      } catch (e) {
        if (!cancelled) setMsg(e?.message || "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, isAdmin, accessToken]);

  /* -------------------- NEW: load published physical trainings -------------------- */
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setTrainingsErr("");
        const res = await fetch(`${API_BASE}/ptrainings/events`, {
          credentials: "include",
        });
        const json = await res.json();
        const list = Array.isArray(json) ? json : [];
        if (!cancelled) setTrainings(list);
      } catch (e) {
        if (!cancelled)
          setTrainingsErr(e?.message || "Failed to load trainings");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------- load active coupons -------------------- */
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/coupons/active`, {
          credentials: "include",
        });
        const json = await res.json();
        const list = Array.isArray(json?.items) ? json.items : [];

        const productOnly = list.filter(
          (c) => (c?.appliesTo?.mode || "all") === "include",
        );

        if (!cancelled) setActiveCoupons(productOnly);
      } catch {
        if (!cancelled) setActiveCoupons([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pages = Math.max(Math.ceil((data.total || 0) / pageSize), 1);
  /* -------------------- admin edit -------------------- */
  function startEdit(p) {
    setEditingId(p._id);
    setDraft({
      name: p.name || "",
      blurb: p.blurb || "",
      description: p.description || "",
      featuresText: Array.isArray(p.features) ? p.features.join("\n") : "",
      billingInterval: p.billingInterval || "monthly",
      monthlyNGN: p.price?.monthlyNGN ?? 0,
      yearlyNGN: p.price?.yearlyNGN ?? 0,
      installNGN: p.price?.installNGN ?? 0,
      monthlyUSD: p.price?.monthlyUSD ?? "",
      yearlyUSD: p.price?.yearlyUSD ?? "",
      installUSD: p.price?.installUSD ?? "",
      previewUrl: p.previewUrl || "",
      thumbnailUrl: p.thumbnailUrl || "",
      isPublished: !!p.isPublished,
      sort: p.sort ?? 0,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit(p) {
    try {
      setMsg("");

      const payload = {
        name: draft.name,
        blurb: draft.blurb,
        description: draft.description,
        features: (draft.featuresText || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        billingInterval: draft.billingInterval,
        price: {
          monthlyNGN: Number(draft.monthlyNGN || 0),
          yearlyNGN: Number(draft.yearlyNGN || 0),
          installNGN: Number(draft.installNGN || 0),
        },
        previewUrl: draft.previewUrl || undefined,
        thumbnailUrl: draft.thumbnailUrl || undefined,
        isPublished: !!draft.isPublished,
        sort: Number(draft.sort || 0),
      };

      if (draft.monthlyUSD !== "")
        payload.price.monthlyUSD = Number(draft.monthlyUSD);
      if (draft.yearlyUSD !== "")
        payload.price.yearlyUSD = Number(draft.yearlyUSD);
      if (draft.installUSD !== "")
        payload.price.installUSD = Number(draft.installUSD);

      // Same guard as the full editor: a Naira figure in a USD box would
      // otherwise save without comment.
      if (!confirmPriceSanity(payload)) {
        setMsg("Not saved — check the USD prices.");
        return;
      }

      await apiAuthed(`/admin/products/${p._id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      gotoPage(page);
      setMsg("Product updated.");
      cancelEdit();
    } catch (e) {
      setMsg(e?.message || "Failed to update product");
    }
  }

  /* -------------------- derived: categories -------------------- */
  const allCats = React.useMemo(() => {
    const set = new Set(["All Products"]);
    (data.items || []).forEach((p) => set.add(getCategory(p)));
    return Array.from(set);
  }, [data.items]);

  /* -------------------- derived: what the grid shows -------------------- */
  // The unit price a sort should compare on: whatever the buyer would actually
  // pay today, so a discounted product sorts where its real price puts it.
  const effectivePrice = React.useCallback((p) => {
    const yearly = p?.billingInterval === "yearly";
    const list = yearly ? p?.price?.yearlyNGN : p?.price?.monthlyNGN;
    const disc = yearly
      ? p?.price?.discountedYearlyNGN
      : p?.price?.discountedMonthlyNGN;
    return Number(disc > 0 && disc < list ? disc : list) || 0;
  }, []);

  const visibleProducts = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = (data.items || []).filter((p) => {
      const catOk = category === "All Products" || getCategory(p) === category;
      if (!q) return catOk;
      // Description too — someone searching "BESMM" or "Civil 3D" is searching
      // for words that only appear in the long copy, and getting no results
      // for a product you do sell is the worst outcome on this page.
      const hay = `${p.name || ""} ${p.blurb || ""} ${p.description || ""}`.toLowerCase();
      return catOk && hay.includes(q);
    });

    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
    const sorted = [...filtered];

    if (sortBy === "price-asc") sorted.sort((a, b) => effectivePrice(a) - effectivePrice(b) || byName(a, b));
    else if (sortBy === "price-desc") sorted.sort((a, b) => effectivePrice(b) - effectivePrice(a) || byName(a, b));
    else if (sortBy === "name") sorted.sort(byName);
    else if (sortBy === "newest") {
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() ||
          byName(a, b),
      );
    } else {
      // "popular" — the server's isPopular is earned from live licence counts,
      // so lead with those, then fall back to the admin `sort` order the API
      // already applies. Coming-soon products sink: they cannot be bought.
      sorted.sort((a, b) => {
        const soon = (x) => (x.isComingSoon ? 1 : 0);
        if (soon(a) !== soon(b)) return soon(a) - soon(b);
        const pop = (x) => (x.isPopular ? 0 : 1);
        if (pop(a) !== pop(b)) return pop(a) - pop(b);
        return (Number(b.sort) || 0) - (Number(a.sort) || 0) || byName(a, b);
      });
    }

    return sorted;
  }, [data.items, query, category, sortBy, effectivePrice]);

  /* -------------------- Add-to-cart -------------------- */
  // Cart writes and the GA4 payload live in lib/cart.js so the product detail
  // page cannot drift into a slightly different `add_to_cart` shape — GA4's
  // standard ecommerce report only populates when the shape matches exactly.
  function addToCart(p, months = 1) {
    const totalQty = addProductToCart(p, months);
    if (totalQty != null) setCartCount(totalQty);
  }

  /* -------------------- animations CSS -------------------- */
  const style = `
    @keyframes fade-in-up { from {opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.02);} 100% { transform: scale(1);} }
  `;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-8 md:space-y-12">
      <Seo
        title="Products — BIM Plugins & QS Software"
        description="Quantity takeoff plugins for Revit, ArchiCAD and PlanSwift, automated rate build-ups and cost management tools. Subscription pricing in naira, built for Nigerian quantity surveyors."
        path="/products"
      />
      <style>{style}</style>

      <ComingSoonModal show={showModal} onClose={closeModal} />

      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white px-5 py-7 md:px-8 md:py-9 shadow-depth">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-8 w-64 h-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-20 left-1/4 w-64 h-64 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative">
          <Eyebrow tone="onDark">ADLM Products</Eyebrow>
          <h1 className="mt-3 text-3xl md:text-4xl font-extrabold leading-tight tracking-tight">
            Software, Plugins &amp; Training
          </h1>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-white/70 max-w-2xl">
            Everything a modern Quantity Surveyor needs — instant rate build-ups,
            2D/3D take-off plugins, and hands-on professional training.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/quote")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-adlm-orange px-4 py-2 text-sm font-semibold text-white shadow-glow-orange hover:brightness-110 active:scale-[.98] transition"
            >
              Get a Quotation
            </button>
            <button
              type="button"
              onClick={() => navigate("/trainings")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 hover:border-white/40 transition"
            >
              Training &amp; Events
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-3 md:p-4 sticky top-[56px] z-10 shadow-depth">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="w-full rounded-xl pl-10 pr-10 py-2.5 outline-none border border-slate-200 dark:border-adlm-dark-border bg-transparent focus:border-adlm-blue-600 focus:ring-2 focus:ring-adlm-blue-600/30 transition"
            />
            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition"
              >
                <IconClose className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            className="rounded-xl px-3 py-2.5 border border-slate-200 dark:border-adlm-dark-border bg-transparent focus:border-adlm-blue-600 focus:ring-2 focus:ring-adlm-blue-600/30 transition"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            title="Category"
          >
            {allCats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl px-3 py-2.5 border border-slate-200 dark:border-adlm-dark-border bg-transparent focus:border-adlm-blue-600 focus:ring-2 focus:ring-adlm-blue-600/30 transition"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort products"
            title="Sort"
          >
            <option value="popular">Most popular</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name: A–Z</option>
            <option value="newest">Newest first</option>
          </select>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin/products")}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
              title="Add a new product"
            >
              + Add Product
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              navigate(
                `/purchase?return=${encodeURIComponent("/products?page=" + page)}`,
              )
            }
            className="relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-slate-200 dark:border-adlm-dark-border hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
            title="Cart"
          >
            <IconCart className="w-4 h-4" />
            Cart
            <span className="inline-flex items-center justify-center text-xs px-2 h-5 rounded-full bg-adlm-blue-700 text-white">
              {cartCount}
            </span>
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-adlm-dark-muted">
          <span>
            Showing {visibleProducts.length} of {data.total || 0} products
            {category !== "All Products" ? ` in ${category}` : ""}
            {query ? ` matching “${query}”` : ""}.
          </span>
          {(query || category !== "All Products") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("All Products");
              }}
              className="font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ✅ NEW: Physical Trainings section */}
      <Reveal
        as="section"
        className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-5 md:p-6 shadow-depth"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl grid place-items-center bg-adlm-orange/10 text-adlm-orange flex-shrink-0">
              <IconCalendar className="w-5 h-5" />
            </span>
            <div>
              <Eyebrow tone="orange">In person</Eyebrow>
              <div className="mt-0.5 text-lg md:text-xl font-bold text-slate-900 dark:text-adlm-dark-text">
                Physical Trainings
              </div>
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                Workshops &amp; hands-on sessions
              </div>
            </div>
          </div>
          <button
            className="shrink-0 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-adlm-dark-border font-semibold text-sm hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
            onClick={() => navigate("/trainings")}
            type="button"
          >
            View all
          </button>
        </div>

        {trainingsErr ? (
          <div className="mt-3 text-sm text-red-600">{trainingsErr}</div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(trainings || []).slice(0, 6).map((t) => (
            <TrainingCard key={t._id} t={t} />
          ))}
          {!(trainings || []).length ? (
            <div className="text-sm text-slate-500 dark:text-adlm-dark-muted">
              No trainings published yet.
            </div>
          ) : null}
        </div>
      </Reveal>

      {msg && <div className="text-sm">{msg}</div>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4"
            >
              <div className="aspect-[4/3] rounded-xl bg-slate-200 dark:bg-white/10" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
              <div className="mt-2 h-3 w-full rounded bg-slate-200 dark:bg-white/10" />
              <div className="mt-4 h-7 w-28 rounded bg-slate-200 dark:bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <section>
          <Reveal>
            <Eyebrow tone="orange">The catalogue</Eyebrow>
            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-adlm-dark-text">
              Every ADLM tool
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-adlm-dark-muted max-w-2xl">
              One account signs into all of them, and rates built in one flow
              through to the others.
            </p>
          </Reveal>

          <Stagger className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {visibleProducts.map((p, idx) => (
              <StaggerItem key={p._id || getProductKey(p) || idx} className="h-full">
                <ProductCard
                  p={p}
                  isAdmin={isAdmin}
                  isEditing={isEditing}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  draft={draft}
                  setDraft={setDraft}
                  saveEdit={saveEdit}
                  addToCart={addToCart}
                  coupons={activeCoupons}
                  onComingSoon={() => setShowModal(true)}
                />
              </StaggerItem>
            ))}
          </Stagger>

          {!visibleProducts.length && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border p-10 text-center">
              <div className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text">
                Nothing matches that search
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("All Products");
                }}
                className="mt-3 text-sm font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {pages > 1 && (
            <div className="mt-8 flex items-center justify-between gap-4">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-adlm-dark-border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page <= 1}
                onClick={() => gotoPage(page - 1)}
              >
                Previous
              </button>
              <div className="text-sm text-slate-500 dark:text-adlm-dark-muted">
                Page {page} of {pages}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-adlm-dark-border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page >= pages}
                onClick={() => gotoPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* -------------------- Card -------------------- */
function ProductCard({
  p,
  isAdmin,
  isEditing,
  startEdit,
  cancelEdit,
  draft,
  setDraft,
  saveEdit,
  addToCart,
  coupons,
  onComingSoon,
}) {
  const editing = isEditing(p._id);
  const cat = getCategory(p);
  const rating = Number(p.rating || 0) || null;

  // `isPopular` now comes from the server, computed from how many people hold
  // a live licence (util/popularity.js). No local fallback on purpose: the old
  // one was `(p.sort ?? 99) <= 1`, and since every product carries sort: 0 it
  // badged the entire catalogue. A badge everything wears is not a badge.
  const popular = p.isPopular === true;

  const outOfStock = false;
  const isComingSoon = !!p.isComingSoon;

  const yearly = p.price?.yearlyNGN || 0;
  const monthly = p.price?.monthlyNGN || 0;
  const cadence = p.billingInterval === "yearly" ? "year" : "month";
  const unit = p.billingInterval === "yearly" ? yearly : monthly;

  const discUnit = p.billingInterval === "yearly"
    ? p.price?.discountedYearlyNGN : p.price?.discountedMonthlyNGN;
  const hasDiscount = discUnit != null && discUnit > 0 && discUnit < unit;
  const pctOff = hasDiscount ? Math.round(((unit - discUnit) / unit) * 100) : 0;

  // The reveal is now the <Stagger>/<StaggerItem> wrapper in the grid, which
  // respects prefers-reduced-motion; the old hand-rolled useInView + CSS
  // keyframe did not, and left the card at opacity-0 for anyone who had it on.
  const cardRef = React.useRef(null);

  const productKey = getProductKey(p);

  const applicable = (coupons || []).filter((c) => {
    const mode = c?.appliesTo?.mode || "all";
    if (mode !== "include") return false;
    const keys = (c?.appliesTo?.productKeys || []).map(String);
    return (
      keys.includes(String(productKey)) || keys.includes(String(p._id || ""))
    );
  });

  let bestCoupon = null;
  let bestSavings = 0;

  for (const c of applicable) {
    let savings = 0;
    if (c.type === "percent")
      savings = (Number(unit || 0) * Number(c.value || 0)) / 100;
    else savings = Number(c.value || 0);

    if (savings > bestSavings) {
      bestSavings = savings;
      bestCoupon = c;
    }
  }

  return (
    <article
      ref={cardRef}
      className="group relative h-full rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel p-4 flex flex-col shadow-depth transition duration-200 hover:-translate-y-1 hover:shadow-depth-lg"
    >
      {(popular || outOfStock || isComingSoon) && (
        <div className="absolute right-3 top-3 z-10">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full backdrop-blur ring-1 ${
              isComingSoon
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : outOfStock
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-blue-50 text-adlm-blue-700 ring-blue-200"
            }`}
          >
            {isComingSoon ? "Coming Soon" : outOfStock ? "Out of Stock" : "Popular"}
          </span>
        </div>
      )}

      {bestCoupon && (
        <div className="absolute left-3 top-3 z-10">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            {bestCoupon.code} ·{" "}
            {bestCoupon.type === "percent"
              ? `${bestCoupon.value}% OFF`
              : `SAVE ${ngn(bestCoupon.value)}`}
          </span>
        </div>
      )}

      <CardVideo src={p.previewUrl} poster={p.thumbnailUrl} />

      {/* getCategory falls back to the literal "General" because Product has no
          category field, and a pill reading GENERAL on every card is noise. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Eyebrow tone="blue">
          {p.isCourse ? "ADLM Course" : cat !== "General" ? cat : "ADLM Software"}
        </Eyebrow>
        {rating && (
          <span className="text-[11px] text-amber-500 inline-flex items-center gap-1">
            ★ {rating.toFixed(1)}
          </span>
        )}
      </div>

      <Link
        to={`/product/${encodeURIComponent(productKey)}`}
        className="mt-1.5 text-base md:text-lg font-bold leading-snug text-slate-900 dark:text-adlm-dark-text hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition line-clamp-2"
        title={p.name}
      >
        {p.name}
      </Link>

      {p.blurb && !editing && (
        <p className="mt-1.5 text-xs md:text-sm leading-relaxed text-slate-500 dark:text-adlm-dark-muted line-clamp-2">
          {p.blurb}
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-end gap-2 flex-wrap">
          <span className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {ngn(hasDiscount ? discUnit : unit)}
          </span>
          {hasDiscount && (
            <>
              <span className="text-sm text-slate-400 line-through pb-1">
                {ngn(unit)}
              </span>
              <span className="mb-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                {pctOff}% OFF
              </span>
            </>
          )}
          <span className="pb-1 text-xs text-slate-500 dark:text-adlm-dark-muted">
            / {cadence}
          </span>
        </div>
      </div>

      {editing && isAdmin ? (
        <div className="mt-3 space-y-2 text-sm">
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Name"
          />
          <textarea
            className="input"
            rows={2}
            value={draft.blurb}
            onChange={(e) => setDraft((d) => ({ ...d, blurb: e.target.value }))}
            placeholder="Short blurb"
          />
          <textarea
            className="input"
            rows={4}
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="Full description"
          />

          <label className="text-xs">
            Features (one per line)
            <textarea
              className="input mt-1"
              rows={4}
              value={draft.featuresText}
              onChange={(e) =>
                setDraft((d) => ({ ...d, featuresText: e.target.value }))
              }
              placeholder={`Feature 1\nFeature 2\nFeature 3`}
            />
          </label>

          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => saveEdit(p)}>
              Save
            </button>
            <button className="btn btn-sm" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // mt-auto pins the actions to the bottom so buttons line up across a
        // row whatever the blurb length does to the card above them.
        <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold border border-slate-200 dark:border-adlm-dark-border transition active:scale-[.99] ${
              outOfStock || isComingSoon
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
            }`}
            onClick={() => {
              if (outOfStock) return;
              if (isComingSoon) {
                onComingSoon?.();
                return;
              }
              addToCart(p, 1);
            }}
            title={isComingSoon ? "Coming Soon" : "Add to Cart"}
          >
            {isComingSoon ? "Coming Soon" : "Add to cart"}
          </button>

          <Link
            className="group/cta inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-center bg-adlm-blue-700 text-white hover:bg-adlm-blue-600 shadow-lg shadow-adlm-blue-700/20 transition active:scale-[.99]"
            to={`/product/${encodeURIComponent(productKey)}`}
            title="View details"
          >
            View details
            <IconArrowRight className="w-4 h-4 transition-transform group-hover/cta:translate-x-0.5" />
          </Link>

          {isAdmin && (
            <button
              type="button"
              className="col-span-2 rounded-xl px-3 py-2.5 text-sm font-semibold border border-slate-200 dark:border-adlm-dark-border hover:bg-slate-50 dark:hover:bg-adlm-dark-hover transition"
              onClick={() => startEdit(p)}
              title="Edit product"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {isAdmin && !editing && (
        <div className="mt-2 text-[11px] text-slate-500">
          {p.isPublished ? "Published" : "Hidden"} · sort {p.sort}
        </div>
      )}
    </article>
  );
}

