// src/pages/Freebies.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function toYouTubeEmbed(url) {
  const u = (url || "").trim();
  if (!u) return null;

  // youtu.be/<id>
  const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;

  // youtube.com/watch?v=<id>
  const watch = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}`;

  // youtube.com/embed/<id>
  const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (embed) return `https://www.youtube.com/embed/${embed[1]}`;

  return null;
}

function safeStr(v) {
  return v == null ? "" : String(v);
}

function normalizeFreebie(item) {
  const title = safeStr(item?.title).trim() || "Freebie";
  const description = safeStr(item?.description);
  const imageUrl = safeStr(item?.imageUrl).trim();
  const downloadUrl = safeStr(item?.downloadUrl).trim();

  const videos = Array.isArray(item?.videos) ? item.videos : [];
  const usableVideos = videos
    .map((v) => ({
      url: safeStr(v?.url).trim(),
      title: safeStr(v?.title).trim(),
    }))
    .filter((v) => !!v.url);

  return { title, description, imageUrl, downloadUrl, usableVideos };
}

/* -------------------- Lightweight Modal for Video Playback -------------------- */
function VideoModal({ open, onClose, video }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const url = safeStr(video?.url).trim();
  const title = safeStr(video?.title).trim() || "Video";
  const embed = toYouTubeEmbed(url);

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close video"
      />
      <div className="absolute inset-x-3 top-[10vh] md:inset-x-0 md:left-1/2 md:-translate-x-1/2 md:w-[740px] lg:w-[860px]">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {title}
              </div>
              <div className="text-xs text-slate-500 truncate">{url}</div>
            </div>
            <button
              className="btn btn-sm bg-white text-slate-800 border border-slate-200 hover:bg-slate-100"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          {embed ? (
            <div className="aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src={embed}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="p-4">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                Open video link
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Page -------------------- */
export default function Freebies() {
  const { accessToken } = useAuth();

  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");

  // video modal state (best for mobile performance: only 1 iframe at a time)
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [videoSelected, setVideoSelected] = React.useState(null);

  const openVideo = (v) => {
    setVideoSelected(v);
    setVideoOpen(true);
  };

  const closeVideo = () => {
    setVideoOpen(false);
    setVideoSelected(null);
  };

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const data = await apiAuthed("/freebies", { token: accessToken });
      if (!data?.ok) throw new Error(data?.error || "Failed to load freebies");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e?.message || "Failed to load freebies");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const qq = safeStr(q).trim().toLowerCase();
    const arr = Array.isArray(items) ? items : [];
    if (!qq) return arr;

    return arr.filter((it) => {
      const t = safeStr(it?.title).toLowerCase();
      const d = safeStr(it?.description).toLowerCase();
      return t.includes(qq) || d.includes(qq);
    });
  }, [items, q]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 space-y-4 md:space-y-5 pb-10">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-800 to-slate-900 text-white p-4 sm:p-5 shadow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-lg sm:text-xl font-semibold">
              ADLM Freebies
            </div>
            <div className="text-sm text-blue-100/90 mt-1">
              Download tools, setup files, templates, and watch related videos.
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={load}
              className="btn w-full sm:w-auto bg-white text-slate-900 hover:bg-slate-100"
              disabled={loading}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            className="input w-full bg-white/95 text-slate-900 placeholder:text-slate-500"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search freebies…"
          />
          <button
            type="button"
            onClick={() => setQ("")}
            className="btn w-full sm:w-auto bg-white/10 border border-white/20 hover:bg-white/15"
            disabled={!q}
          >
            Clear
          </button>
        </div>
      </div>

      {/* State */}
      {loading && (
        <div className="text-sm text-slate-600 bg-white rounded-xl ring-1 ring-slate-200 p-3">
          Loading…
        </div>
      )}
      {err && (
        <div className="text-sm text-rose-700 bg-rose-50 rounded-xl ring-1 ring-rose-100 p-3">
          {err}
        </div>
      )}

      {!loading && !err && filtered.length === 0 && (
        <div className="text-sm text-slate-600 bg-white rounded-xl ring-1 ring-slate-200 p-3">
          No freebies found.
        </div>
      )}

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((f) => (
          <FreebieCard key={f._id} item={f} onOpenVideo={openVideo} />
        ))}
      </div>

      <VideoModal open={videoOpen} onClose={closeVideo} video={videoSelected} />
    </div>
  );
}

/* -------------------- Card -------------------- */
function FreebieCard({ item, onOpenVideo }) {
  const [expanded, setExpanded] = React.useState(false);
  const [showList, setShowList] = React.useState(false);

  const { title, description, imageUrl, downloadUrl, usableVideos } =
    React.useMemo(() => normalizeFreebie(item), [item]);

  const hasDesc = !!safeStr(description).trim();
  const hasVideos = usableVideos.length > 0;

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Image */}
      <div className="relative w-full">
        <div className="aspect-[16/9] bg-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              No image
            </div>
          )}
        </div>

        {/* Badge */}
        <div className="absolute top-3 left-3">
          <span className="text-[11px] px-2 py-1 rounded-full bg-white/90 ring-1 ring-slate-200 text-slate-700">
            Freebie
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 leading-6 truncate">
            {title}
          </div>

          {hasDesc && (
            <>
              <div
                className={`text-sm text-slate-600 leading-6 whitespace-pre-wrap mt-2 ${
                  expanded ? "" : "line-clamp-3"
                }`}
              >
                {description}
              </div>

              <button
                type="button"
                className="mt-1 text-xs text-blue-700 hover:underline"
                onClick={() => setExpanded((s) => !s)}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            </>
          )}
        </div>

        {/* Actions – stacked on mobile, inline on larger screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
            >
              Download
            </a>
          ) : (
            <button
              className="px-3 py-2 rounded-lg bg-slate-200 text-slate-600 text-sm cursor-not-allowed"
              disabled
            >
              No download
            </button>
          )}

          {hasVideos ? (
            <button
              onClick={() => setShowList((s) => !s)}
              className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 transition"
            >
              {showList
                ? "Hide videos"
                : `Watch videos (${usableVideos.length})`}
            </button>
          ) : (
            <button
              className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-sm cursor-not-allowed"
              disabled
            >
              No videos
            </button>
          )}
        </div>

        {/* Video list (no iframes here; opens modal -> smooth on mobile) */}
        {showList && hasVideos && (
          <div className="mt-1 space-y-2">
            {usableVideos.slice(0, 8).map((v, idx) => (
              <button
                key={`${v.url}-${idx}`}
                type="button"
                onClick={() => onOpenVideo?.(v)}
                className="w-full text-left rounded-xl border border-slate-200 hover:bg-slate-50 transition p-3"
              >
                <div className="text-sm font-medium text-slate-900 truncate">
                  {v.title || `Video ${idx + 1}`}
                </div>
                <div className="text-[12px] text-slate-500 truncate">
                  {v.url}
                </div>
              </button>
            ))}

            {usableVideos.length > 8 && (
              <div className="text-xs text-slate-500">
                Showing 8 of {usableVideos.length}. Add fewer links if you want
                a shorter list.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="truncate">ADLM Studio</span>
          <span className="shrink-0">
            {downloadUrl ? "Download ready" : "No file"}
          </span>
        </div>
      </div>
    </div>
  );
}
