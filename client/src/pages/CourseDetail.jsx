// src/pages/CourseDetail.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "../config";

export default function CourseDetail() {
  const { sku } = useParams();
  const [course, setCourse] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/learn/courses`, {
          credentials: "include",
        });
        const list = await res.json();
        setCourse(list.find((c) => c.sku === sku) || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [sku]);

  if (loading) return <div className="card">Loading…</div>;
  if (!course) return <div className="card">Course not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold mb-3">{course.title}</h1>
        <div className="rounded-xl overflow-hidden border">
          <video
            className="w-full aspect-video"
            src={course.previewUrl}
            controls
            preload="metadata"
          />
        </div>

        {course.description && (
          <p className="mt-4 text-sm text-slate-700 whitespace-pre-line">
            {course.description}
          </p>
        )}

        {!!(course.bullets || []).length && (
          <ul className="mt-4 list-disc pl-6 text-sm">
            {course.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex gap-3">
          <Link
            to={`/purchase?product=${encodeURIComponent(course.sku)}&months=12`}
            className="btn"
          >
            Purchase full course
          </Link>
          <Link to="/learn" className="btn btn-ghost">
            Back to Learn
          </Link>
        </div>
      </div>
    </div>
  );
}
