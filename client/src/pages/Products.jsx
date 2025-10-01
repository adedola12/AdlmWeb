// src/pages/Products.jsx
import React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

function CardVideo({ src, poster }) {
  const ref = React.useRef(null);
  const onEnter = () => ref.current?.play();
  const onLeave = () => {
    if (ref.current) {
      ref.current.pause();
      ref.current.currentTime = 0;
    }
  };
  return (
    <div
      className="rounded-xl overflow-hidden border aspect-video bg-black"
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
      ) : (
        poster && <img src={poster} className="w-full h-full object-cover" />
      )}
    </div>
  );
}

export default function Products() {
  const [qs, setQs] = useSearchParams();
  const pageFromQs = Math.max(parseInt(qs.get("page") || "1", 10), 1);
  const [page, setPage] = React.useState(pageFromQs);
  const pageSize = 9; // 3x3
  const [data, setData] = React.useState({
    items: [],
    total: 0,
    page,
    pageSize,
  });
  const [loading, setLoading] = React.useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/products?page=${page}&pageSize=${pageSize}`,
          { credentials: "include" }
        );
        const json = await res.json();
        setData(json);
      } finally {
        setLoading(false);
      }
    })();

    setQs(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("page", String(page));
        return n;
      },
      { replace: true }
    );
  }, [page]);

  const pages = Math.max(Math.ceil(data.total / pageSize), 1);
  const hasPrev = page > 1;
  const hasNext = page < pages;

  function goPurchase(key) {
    if (!user) {
      const next = encodeURIComponent(`/purchase?product=${key}`);
      return navigate(`/login?next=${next}`);
    }
    navigate(`/purchase?product=${key}`);
  }

  return (
    <div className="space-y-6">
      {/* Header + admin-only button */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        {user?.role === "admin" && (
          <Link to="/admin/products" className="btn btn-sm">
            Add product
          </Link>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.items.map((p) => (
              <article key={p._id} className="card flex flex-col">
                <CardVideo src={p.previewUrl} poster={p.thumbnailUrl} />
                <Link
                  to={`/product/${encodeURIComponent(p.key)}`}
                  className="mt-3 text-lg font-semibold hover:text-blue-700"
                  title={p.name}
                >
                  {p.name}
                </Link>
                {p.blurb && <p className="mt-1 text-slate-600">{p.blurb}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="btn btn-sm"
                    onClick={() => goPurchase(p.key)}
                  >
                    Purchase
                  </button>
                  <Link
                    className="btn btn-sm"
                    to={`/product/${encodeURIComponent(p.key)}`}
                  >
                    View details
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              className="btn btn-sm"
              disabled={!hasPrev}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <div className="text-sm text-slate-600">
              Page {page} of {pages}
            </div>
            <button
              className="btn btn-sm"
              disabled={!hasNext}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
