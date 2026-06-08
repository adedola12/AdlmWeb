import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";

function makePreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`,
  );
}

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
    // Invalid URLs should just fall back to an empty id.
  }
  return "";
}

function HoverVideo({ src, poster }) {
  const ref = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hovered) {
      el.currentTime = 0;
      el.muted = true;
      el.play().catch(() => {
        // Preview autoplay can be blocked by the browser.
      });
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [hovered]);

  return (
    <div
      className="rounded-xl overflow-hidden border bg-black"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        ref={ref}
        className="w-full aspect-video object-cover"
        src={src}
        poster={poster}
        playsInline
        muted
        preload="metadata"
        controls={false}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function HoverYouTube({ id, title, thumb }) {
  const [hovered, setHovered] = React.useState(false);
  const thumbUrl =
    thumb || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "");
  const iframeSrc = id
    ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1`
    : "";

  return (
    <div
      className="rounded-xl overflow-hidden border"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
    >
      {hovered && id ? (
        <iframe
          className="w-full aspect-video"
          src={iframeSrc}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        thumbUrl && (
          <img
            src={thumbUrl}
            alt={title}
            className="w-full aspect-video object-cover"
          />
        )
      )}
    </div>
  );
}

function FreeCard({ v }) {
  const id = extractYouTubeId(v.youtubeId);
  return (
    <div className="group card p-0 lift spotlight">
      <HoverYouTube id={id} title={v.title} thumb={v.thumbnailUrl} />
      <Link
        to={`/learn/free/${encodeURIComponent(v._id)}`}
        className="block p-3 text-sm font-medium group-hover:text-adlm-blue-700"
      >
        {v.title}
      </Link>
    </div>
  );
}

function PaidCard({ c }) {
  const preview = makePreviewUrl(c.previewUrl, 60, 0);
  const purchaseKey = c.productKey || c.sku;

  return (
    <div className="group card p-0 lift spotlight">
      <HoverVideo src={preview || c.previewUrl} poster={c.thumbnailUrl} />
      <Link
        to={`/learn/course/${encodeURIComponent(c.sku)}`}
        className="block p-3 text-sm font-medium group-hover:text-adlm-blue-700"
      >
        {c.title}
      </Link>
      <div className="px-3 pb-3">
        <Link
          to={`/purchase?product=${encodeURIComponent(purchaseKey)}&months=12`}
          className="btn btn-sm"
        >
          Purchase
        </Link>
      </div>
    </div>
  );
}

export default function Learn() {
  const [free, setFree] = React.useState({
    items: [],
    total: 0,
    page: 1,
    pageSize: 5,
  });
  const [courses, setCourses] = React.useState([]);
  const [loadingFree, setLoadingFree] = React.useState(false);
  const [loadingCourses, setLoadingCourses] = React.useState(false);

  const [coursePage, setCoursePage] = React.useState(1);
  const perPage = 9;
  const totalCoursePages = Math.max(Math.ceil(courses.length / perPage), 1);
  const pageSlice = courses.slice(
    (coursePage - 1) * perPage,
    coursePage * perPage,
  );

  async function loadFree(page = 1) {
    setLoadingFree(true);
    try {
      const res = await fetch(`${API_BASE}/learn/free?page=${page}&pageSize=5`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Free videos: ${res.status}`);
      setFree(await res.json());
    } finally {
      setLoadingFree(false);
    }
  }

  async function loadCourses() {
    setLoadingCourses(true);
    try {
      const res = await fetch(`${API_BASE}/learn/courses`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Courses: ${res.status}`);
      setCourses(await res.json());
    } finally {
      setLoadingCourses(false);
    }
  }

  React.useEffect(() => {
    loadFree(1);
    loadCourses();
  }, []);

  const hasPrevFree = free.page > 1;
  const hasNextFree = free.page * free.pageSize < free.total;

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white px-5 py-7 md:px-8 md:py-9 shadow-depth">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-8 w-64 h-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-20 left-1/4 w-64 h-64 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-adlm-orange bg-adlm-orange/15 ring-1 ring-adlm-orange/30">
            ADLM Learn
          </span>
          <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">
            Learn BIM, QS &amp; Cost Management
          </h1>
          <p className="mt-2 text-sm md:text-base text-white/70 max-w-2xl">
            Free YouTube lessons and in-depth paid courses with certificates —
            learn at your own pace, anywhere.
          </p>
        </div>
      </div>

      <section className="card">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h2 className="text-xl font-semibold">Free Courses</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-adlm-dark-muted mb-4 ml-0.5">
          Hover to preview. Click a title to watch.
        </p>

        {loadingFree ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {free.items.map((v) => (
                <FreeCard key={v._id} v={v} />
              ))}
              {!free.items.length && (
                <div className="text-sm text-slate-600">No videos yet.</div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                className="btn btn-sm"
                disabled={!hasPrevFree}
                onClick={() => loadFree(free.page - 1)}
              >
                Previous
              </button>
              <div className="text-sm text-slate-600">
                Page {free.page} of {Math.max(Math.ceil(free.total / free.pageSize), 1)}
              </div>
              <button
                className="btn btn-sm"
                disabled={!hasNextFree}
                onClick={() => loadFree(free.page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400 flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10L12 5 2 10l10 5 10-5z" />
              <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
            </svg>
          </span>
          <h2 className="text-xl font-semibold">Paid Courses</h2>
        </div>
        {loadingCourses ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : courses.length ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageSlice.map((c) => (
                <PaidCard key={c._id || c.sku} c={c} />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                className="btn btn-sm"
                disabled={coursePage <= 1}
                onClick={() => setCoursePage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </button>
              <div className="text-sm text-slate-600">
                Page {coursePage} of {totalCoursePages}
              </div>
              <button
                className="btn btn-sm"
                disabled={coursePage >= totalCoursePages}
                onClick={() => setCoursePage((p) => Math.min(p + 1, totalCoursePages))}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">No courses yet.</div>
        )}
      </section>
    </div>
  );
}
