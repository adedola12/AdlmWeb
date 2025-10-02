import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

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
    // 1 month for monthly, 1 year for yearly (both = 1 unit)
    const nextUrl = `/purchase?product=${encodeURIComponent(key)}&months=1`;
    if (!user) return navigate(`/login?next=${encodeURIComponent(nextUrl)}`);
    navigate(nextUrl);
  }

  if (loading) return <div className="text-sm text-slate-600">Loading…</div>;
  if (!p) return <div className="text-sm text-red-600">Product not found.</div>;

  const cadence = p.billingInterval === "yearly" ? "year" : "month";
  const unitNGN =
    p.billingInterval === "yearly" ? p.price?.yearlyNGN : p.price?.monthlyNGN;
  const unitUSD =
    p.billingInterval === "yearly" ? p.price?.yearlyUSD : p.price?.monthlyUSD;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold">
          {p.name} ·{" "}
          <span className="text-slate-700">
            {ngn(unitNGN)} / {cadence}
          </span>
        </h1>

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
              alt=""
            />
          ) : null}
        </div>

        {/* Secondary pricing info */}
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

      {(p.relatedFreeVideoIds?.length || 0) > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">Related learning</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {p.relatedFreeVideoIds.map((v) => {
              const id = extractYouTubeId(v.youtubeId);
              const thumb =
                v.thumbnailUrl ||
                (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "");
              return (
                <a
                  key={v._id}
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
                  <div className="p-2 text-sm">{v.title}</div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
