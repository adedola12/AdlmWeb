// src/pages/Learn.jsx
import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";

function YtThumb({ id, title, thumbnailUrl }) {
  const src = thumbnailUrl || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  const href = `https://www.youtube.com/watch?v=${id}`;
  return (
    <a
      href={href}
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
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-3">{course.title}</h3>
      <div className="rounded-xl overflow-hidden border">
        <video
          className="w-full aspect-video"
          src={course.previewUrl}
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
      const res = await fetch(`${API_BASE}/learn/free?page=${page}&pageSize=5`);
      const data = await res.json();
      setFree(data);
    } finally {
      setLoadingFree(false);
    }
  }

  async function loadCourses() {
    setLoadingCourses(true);
    try {
      const res = await fetch(`${API_BASE}/learn/courses`);
      const data = await res.json();
      setCourses(data);
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
          Watch free tutorials from the ADLM channel. Click any thumbnail to
          view on YouTube.
        </p>

        {loadingFree ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {free.items.map((v) => (
                <YtThumb
                  key={v._id}
                  id={v.youtubeId}
                  title={v.title}
                  thumbnailUrl={v.thumbnailUrl}
                />
              ))}
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
        ) : (
          courses.map((c) => <PaidCourseCard key={c._id} course={c} />)
        )}
      </section>
    </div>
  );
}
