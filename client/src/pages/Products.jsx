// src/pages/Products.jsx
import React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import ComingSoonModal from "../components/ComingSoonModal.jsx";

/* -------------------- UI helpers -------------------- */
const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;

const getCategory = (p) =>
  p?.metadata?.category || p?.category || p?.type || "General";

function getProductKey(p) {
  return String(p?.key || p?.slug || p?._id || "").trim();
}

/* -------------------- localStorage cart helpers -------------------- */
function readCartItems() {
  try {
    const arr = JSON.parse(localStorage.getItem("cartItems") || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCartItems(items) {
  const safe = Array.isArray(items) ? items : [];
  localStorage.setItem("cartItems", JSON.stringify(safe));
  const totalQty = safe.reduce((sum, it) => sum + Number(it.qty || 0), 0);
  localStorage.setItem("cartCount", String(totalQty));
  return totalQty;
}

/* -------------------- UI: in-view animation -------------------- */
function useInView(ref, threshold = 0.12) {
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold },
    );

    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref, threshold]);

  return inView;
}

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

  return (
    <div
      className="rounded-xl overflow-hidden aspect-video bg-black ring-1 ring-black/5"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
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
        <img src={poster} className="w-full h-full object-cover" alt="" />
      ) : (
        <div className="w-full h-full bg-slate-900" />
      )}
    </div>
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
    <article className="rounded-2xl bg-white p-3 md:p-4 shadow-sm ring-1 ring-black/5 hover:shadow-lg hover:ring-black/10 transition">
      <div className="rounded-xl overflow-hidden aspect-video bg-slate-100 ring-1 ring-black/5">
        {img ? (
          <img src={img} alt="" className="w-full h-full object-cover" />
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
            to={`/ptrainings/${encodeURIComponent(t?._id)}`}
            className="rounded-md px-3 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
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
  const pageSize = 9;

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
  const hasPrev = page > 1;
  const hasNext = page < pages;

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

  /* -------------------- Add-to-cart -------------------- */
  function addToCart(p, months = 1) {
    const productKey = getProductKey(p);
    if (!productKey) return;

    const items = readCartItems();
    const i = items.findIndex((it) => String(it.productKey) === productKey);

    if (i >= 0) {
      items[i].qty = Math.max(parseInt(items[i].qty || 0, 10), 0) + months;
    } else {
      items.push({ productKey, qty: months, firstTime: false });
    }

    const totalQty = writeCartItems(items);
    setCartCount(totalQty);
  }

  /* -------------------- animations CSS -------------------- */
  const style = `
    @keyframes fade-in-up { from {opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.02);} 100% { transform: scale(1);} }
  `;

  return (
    <div className="space-y-4 py-4 px-3 md:px-6 lg:px-12">
      <style>{style}</style>

      <ComingSoonModal show={showModal} onClose={closeModal} />

      {/* Toolbar */}
      <div className="rounded-2xl bg-white p-3 md:p-4 sticky top-[56px] z-10 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-lg px-10 py-2 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-blue-600"
            />
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </div>

          <select
            className="rounded-lg px-3 py-2 ring-1 ring-black/5 focus:ring-2 focus:ring-blue-600"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            title="Category"
          >
            {allCats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin/products")}
              className="rounded-lg px-3 py-2 ring-1 ring-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:animate-[pop_200ms_ease-out]"
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
            className="relative rounded-lg px-3 py-2 ring-1 ring-black/5 hover:bg-slate-50 active:animate-[pop_200ms_ease-out]"
            title="Cart"
          >
            Cart
            <span className="ml-2 inline-flex items-center justify-center text-xs px-2 h-5 rounded-full bg-blue-600 text-white">
              {cartCount}
            </span>
          </button>
        </div>

        <div className="mt-2 text-xs text-slate-600">
          Showing {(data.items || []).length} of {data.total || 0} products.
        </div>
      </div>

      {/* ✅ NEW: Physical Trainings section */}
      <div className="rounded-2xl bg-white p-4 md:p-5 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">Physical Trainings</div>
            {/* <div className="text-sm text-slate-600">
              Upcoming physical programs (flyer + location).
            </div> */}
          </div>
          <button
            className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
            onClick={() => navigate("/trainings")}
            type="button"
          >
            View all trainings
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
            <div className="text-sm text-slate-600">
              No trainings published yet.
            </div>
          ) : null}
        </div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {(data.items || [])
              .filter((p) => {
                const q = query.trim().toLowerCase();
                const catOk =
                  category === "All Products" || getCategory(p) === category;
                if (!q) return catOk;
                const hay = `${p.name || ""} ${p.blurb || ""}`.toLowerCase();
                return catOk && hay.includes(q);
              })
              .map((p, idx) => (
                <ProductCard
                  key={p._id || getProductKey(p) || idx}
                  p={p}
                  idx={idx}
                  isAdmin={isAdmin}
                  isEditing={isEditing}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  draft={draft}
                  setDraft={setDraft}
                  saveEdit={saveEdit}
                  addToCart={addToCart}
                  coupons={activeCoupons}
                />
              ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
            >
              Previous
            </button>
            <div className="text-sm text-slate-600">
              Page {page} of {pages}
            </div>
            <button
              className="btn btn-sm"
              disabled={page >= pages}
              onClick={() => gotoPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------- Card -------------------- */
function ProductCard({
  p,
  idx,
  isAdmin,
  isEditing,
  startEdit,
  cancelEdit,
  draft,
  setDraft,
  saveEdit,
  addToCart,
  coupons,
}) {
  const editing = isEditing(p._id);
  const cat = getCategory(p);
  const rating = Number(p.rating || 0) || null;

  const popular =
    typeof p.isPopular === "boolean"
      ? p.isPopular
      : (p.sort ?? 99) <= 1 || (rating || 0) >= 4.8;

  const outOfStock = false;

  const yearly = p.price?.yearlyNGN || 0;
  const monthly = p.price?.monthlyNGN || 0;
  const cadence = p.billingInterval === "yearly" ? "year" : "month";
  const unit = p.billingInterval === "yearly" ? yearly : monthly;

  const cardRef = React.useRef(null);
  const inView = useInView(cardRef);
  const delay = 80 + idx * 30;

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
      className={`
        relative rounded-2xl bg-white p-3 md:p-4 flex flex-col
        shadow-sm ring-1 ring-black/5 transition will-change-transform
        hover:-translate-y-0.5 hover:shadow-lg hover:ring-black/10
        ${inView ? "opacity-100" : "opacity-0"}
      `}
      style={{
        animation: inView
          ? `fade-in-up 500ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      {(popular || outOfStock) && (
        <div className="absolute right-3 top-3 z-10">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full backdrop-blur ring-1 ${
              outOfStock
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-blue-50 text-blue-700 ring-blue-200"
            }`}
          >
            {outOfStock ? "Out of Stock" : "Popular"}
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

      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px]">
          {cat}
        </span>
        {rating && (
          <span className="text-[11px] text-amber-500 inline-flex items-center gap-1">
            ★ {rating.toFixed(1)}
          </span>
        )}
      </div>

      <Link
        to={`/product/${encodeURIComponent(productKey)}`}
        className="mt-2 text-base md:text-lg font-semibold hover:text-blue-700 line-clamp-2"
        title={p.name}
      >
        {p.name}
      </Link>

      {p.blurb && !editing && (
        <p className="mt-1 text-xs md:text-sm text-slate-600 line-clamp-2">
          {p.blurb}
        </p>
      )}

      <div className="mt-3">
        <div className="text-slate-900 tracking-tight">
          <span className="text-base align-top mr-1">NGN</span>
          <span className="text-2xl md:text-3xl font-bold">
            {(Number(unit) || 0).toLocaleString()}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 -mt-0.5">per {cadence}</div>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ring-1 ring-slate-200 transition active:animate-[pop_180ms_ease-out]
              ${outOfStock ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-50"}
            `}
            onClick={() => {
              if (outOfStock) return;
              addToCart(p, 1);
            }}
            title="Add to Cart"
          >
            Add to Cart
          </button>

          <Link
            className="rounded-md px-3 py-2 text-sm font-medium text-center bg-blue-600 text-white hover:bg-blue-700 transition active:animate-[pop_180ms_ease-out]"
            to={`/product/${encodeURIComponent(productKey)}`}
            title="View details"
          >
            View details
          </Link>

          {isAdmin && (
            <button
              className="col-span-2 rounded-md px-3 py-2 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50 transition"
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
