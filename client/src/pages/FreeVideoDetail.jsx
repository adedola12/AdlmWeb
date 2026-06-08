// src/pages/FreeVideoDetail.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "../config";
import { SecureEmbed } from "../components/SecureVideo.jsx";

export default function FreeVideoDetail() {
  const { id } = useParams(); // Mongo _id
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        // fetch single page (first page big) then find by _id
        const res = await fetch(`${API_BASE}/learn/free?page=1&pageSize=50`, {
          credentials: "include",
        });
        const data = await res.json();
        setItem((data.items || []).find((v) => v._id === id) || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading)
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 text-sm text-slate-500 dark:text-adlm-dark-muted">
        Loading…
      </div>
    );

  if (!item)
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-3">
        <div className="text-sm text-slate-600 dark:text-adlm-dark-muted">Video not found.</div>
        <Link to="/learn" className="btn">Back to Learn</Link>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <Link
        to="/learn"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition"
      >
        <span aria-hidden>←</span> Back to Learn
      </Link>

      <div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Free lesson
        </span>
        <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-adlm-dark-text">
          {item.title}
        </h1>
      </div>

      {/* Protected player */}
      <SecureEmbed
        className="aspect-video w-full rounded-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-depth-lg"
        src={`https://www.youtube.com/embed/${item.youtubeId}?rel=0&modestbranding=1`}
        title={item.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
      <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-adlm-dark-dim">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        This lesson is watermarked to your session. Please don’t record or redistribute.
      </p>

      {item.description && (
        <div className="card">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-adlm-dark-muted">
            {item.description}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          className="btn"
          href={`https://www.youtube.com/watch?v=${item.youtubeId}`}
          target="_blank"
          rel="noreferrer"
        >
          Watch on YouTube
        </a>
        <Link to="/learn" className="btn btn-ghost">
          Back to Learn
        </Link>
      </div>
    </div>
  );
}
