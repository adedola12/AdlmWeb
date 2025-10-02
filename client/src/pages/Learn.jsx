import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";

// Cloudinary 60s preview
function makePreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`
  );
}

// Robust YT ID extractor
export function extractYouTubeId(input = "") {
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
  } catch {}
  return "";
}

/* --------- Hover helpers --------- */
function HoverVideo({ src, poster }) {
  const ref = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hovered) {
      el.currentTime = 0;
      el.muted = true;
      el.play().catch(() => {});
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

/* --------- Cards --------- */
function FreeCard({ v }) {
  const id = extractYouTubeId(v.youtubeId);
  return (
    <div className="group card p-0">
      <HoverYouTube id={id} title={v.title} thumb={v.thumbnailUrl} />
      <Link
        to={`/learn/free/${encodeURIComponent(v._id)}`}
        className="block p-3 text-sm font-medium group-hover:text-blue-700"
      >
        {v.title}
      </Link>
    </div>
  );
}

function PaidCard({ c }) {
  const preview = makePreviewUrl(c.previewUrl, 60, 0);
  return (
    <div className="group card p-0">
      <HoverVideo src={preview || c.previewUrl} />
      <Link
        to={`/learn/course/${encodeURIComponent(c.sku)}`}
        className="block p-3 text-sm font-medium group-hover:text-blue-700"
      >
        {c.title}
      </Link>
      <div className="px-3 pb-3">
        <Link
          to={`/purchase?product=${encodeURIComponent(c.sku)}&months=12`}
          className="btn btn-sm"
        >
          Purchase
        </Link>
      </div>
    </div>
  );
}

/* --------- Page --------- */
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

  // client-side pagination for paid: 9 per page
  const [coursePage, setCoursePage] = React.useState(1);
  const perPage = 9;
  const totalCoursePages = Math.max(Math.ceil(courses.length / perPage), 1);
  const pageSlice = courses.slice(
    (coursePage - 1) * perPage,
    coursePage * perPage
  );

  async function loadFree(page = 1) {
    setLoadingFree(true);
    try {
      const res = await fetch(
        `${API_BASE}/learn/free?page=${page}&pageSize=5`,
        { credentials: "include" }
      );
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
      {/* Free (YouTube) */}
      <section className="card">
        <h2 className="text-xl font-semibold mb-4">Free Courses (YouTube)</h2>
        <p className="text-sm text-slate-600 mb-4">
          Hover to preview. Click title for details.
        </p>

        {loadingFree ? (
          <div className="text-sm text-slate-600">Loading…</div>
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
                Page {free.page} of{" "}
                {Math.max(Math.ceil(free.total / free.pageSize), 1)}
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

      {/* Paid */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Paid Courses</h2>
        {loadingCourses ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : courses.length ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageSlice.map((c) => (
                <PaidCard key={c._id} c={c} />
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
                onClick={() =>
                  setCoursePage((p) => Math.min(p + 1, totalCoursePages))
                }
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
