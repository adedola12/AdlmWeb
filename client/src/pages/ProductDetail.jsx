// src/pages/ProductDetail.jsx
import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

export default function ProductDetail() {
  const { key } = useParams();
  const [p, setP] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/products/${encodeURIComponent(key)}`,
        {
          credentials: "include",
        }
      );
      if (res.ok) setP(await res.json());
      setLoading(false);
    })();
  }, [key]);

  function purchase() {
    if (!user) {
      const next = encodeURIComponent(`/purchase?product=${key}`);
      return navigate(`/login?next=${next}`);
    }
    navigate(`/purchase?product=${key}&months=12`);
  }

  if (loading) return <div className="text-sm text-slate-600">Loading…</div>;
  if (!p) return <div className="text-sm text-red-600">Product not found.</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <div className="mt-3 rounded-xl overflow-hidden border bg-black">
          {p.previewUrl ? (
            <video
              className="w-full aspect-video"
              src={p.previewUrl}
              controls
              muted
              playsInline
              preload="metadata"
              poster={p.thumbnailUrl || undefined}
            />
          ) : p.thumbnailUrl ? (
            <img
              className="w-full aspect-video object-cover"
              src={p.thumbnailUrl}
            />
          ) : null}
        </div>
        {p.priceMonthly > 0 && (
          <div className="mt-2 text-sm text-slate-700">
            From <span className="font-semibold">${p.priceMonthly}/month</span>
          </div>
        )}
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
    </div>
  );
}
