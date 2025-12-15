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

    // main thumbnail as an image slide (avoid duplicates)
    if (p?.thumbnailUrl) out.push({ type: "image", src: p.thumbnailUrl });

    // extra images
    if (Array.isArray(p?.images)) {
      for (const src of p.images) {
        if (!src) continue;
        if (src === p.thumbnailUrl) continue; // de-dupe
        out.push({ type: "image", src });
      }
    }

    // de-dupe by src+type
    const seen = new Set();
    return out.filter((s) => {
      const k = `${s.type}:${s.src}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [p]);

  const [activeSlide, setActiveSlide] = React.useState(0);

  React.useEffect(() => {
    setActiveSlide(0); // reset when product changes
  }, [key]);

  const hasMany = slides.length > 1;

  const prevSlide = () =>
    setActiveSlide((i) => (i - 1 + slides.length) % slides.length);

  const nextSlide = () => setActiveSlide((i) => (i + 1) % slides.length);

  // optional: keyboard arrows
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

          {/* Left/Right buttons */}
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
            </>
          )}

          {/* Dots */}
          {hasMany && (
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
          )}
        </div>

        {Array.isArray(p.images) && p.images.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {slides.length > 1 && (
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
          </div>
        )}

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
          {user?.role === "admin" && p.isCourse && p.courseSku && (
            <Link
              className="btn"
              to={`/admin/courses?edit=${encodeURIComponent(p.courseSku)}`}
            >
              Edit course
            </Link>
          )}
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
