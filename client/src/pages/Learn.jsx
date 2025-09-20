// src/pages/Learn.jsx
import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";

// Build a 60s preview from a Cloudinary URL (delivery transform)
function makePreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`
  );
}

// Accept either a full YT URL or a plain ID, and normalize
function parseYouTube(input) {
  if (!input) return { id: "", href: "", thumb: "" };
  let id = input.trim();

  // full URL forms: youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, etc.
  try {
    const u = new URL(id);
    if (u.host.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.searchParams.get("v")) id = u.searchParams.get("v");
    else {
      // /embed/<id> or /v/<id>
      const m = u.pathname.match(/\/(embed|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  } catch {
    // not a URL → assume raw ID
  }

  const href = `https://www.youtube.com/watch?v=${id}`;
  const thumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  return { id, href, thumb };
}

function YtThumb({ youtubeIdOrUrl, title, thumbnailUrl }) {
  const norm = parseYouTube(youtubeIdOrUrl);
  const src = thumbnailUrl || norm.thumb;
  return (
    <a
      href={norm.href}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl overflow-hidden border hover:shadow transition"
      title={title}
    >
      <img src={src} alt={title} className="w-full aspect-video object-cover" />
      <div className="p-3 text-sm group-hover:text-blue-700">{title}</div>
    </a>
  );
}

function PaidCourseCard({ course }) {
  const previewSrc = makePreviewUrl(course.previewUrl, 60, 0);
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-3">{course.title}</h3>
      <div className="rounded-xl overflow-hidden border">
        <video
          className="w-full aspect-video"
          src={previewSrc || course.previewUrl}
          controls
          preload="metadata"
        />
      </div>
      {!!(course.bullets || []).length && (
        <ul className="mt-4 space-y-1 text-sm list-disc pl-5">
          {course.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {course.description && (
        <p className="text-sm text-slate-700 mt-3 whitespace-pre-line">
          {course.description}
        </p>
      )}
      <div className="mt-4">
        <Link
          to={`/purchase?product=${encodeURIComponent(course.sku)}&months=12`}
          className="btn"
        >
          Purchase full course
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

  async function loadFree(page = 1) {
    setLoadingFree(true);
    try {
      const res = await fetch(
        `${API_BASE}/learn/free?page=${page}&pageSize=5`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Free videos: ${res.status}`);
      const data = await res.json();
      setFree(data);
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
      const data = await res.json();
      setCourses(data || []);
    } finally {
      setLoadingCourses(false);
    }
  }

  React.useEffect(() => {
    loadFree(1);
    loadCourses();
  }, []);

  const hasPrev = free.page > 1;
  const hasNext = free.page * free.pageSize < free.total;

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-xl font-semibold mb-4">Free Courses (YouTube)</h2>
        <p className="text-sm text-slate-600 mb-4">
          Watch free tutorials from the ADLM channel.
        </p>

        {loadingFree ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {free.items.map((v) => (
                <YtThumb
                  key={v._id}
                  youtubeIdOrUrl={v.youtubeId} // can be ID or full URL now
                  title={v.title}
                  thumbnailUrl={v.thumbnailUrl}
                />
              ))}
              {!free.items.length && (
                <div className="text-sm text-slate-600">No videos yet.</div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                className="btn btn-sm"
                disabled={!hasPrev}
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
                disabled={!hasNext}
                onClick={() => loadFree(free.page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Paid Courses</h2>
        {loadingCourses ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : courses.length ? (
          courses.map((c) => <PaidCourseCard key={c._id} course={c} />)
        ) : (
          <div className="text-sm text-slate-600">No courses yet.</div>
        )}
      </section>
    </div>
  );
}
