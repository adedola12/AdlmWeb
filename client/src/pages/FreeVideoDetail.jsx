// src/pages/FreeVideoDetail.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "../config";
import { SecureEmbed } from "../components/SecureVideo.jsx";
import { IconLock } from "../components/icons.jsx";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

export default function FreeVideoDetail() {
  const { id } = useParams(); // Mongo _id
  const { accessToken } = useAuth();
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Feed "Free lessons watched" on My learning.
  //
  // Only for somebody signed in — a free lesson needs no account, and a watch
  // cannot be attributed to one that does not exist. Everyone else watches
  // exactly as before and nothing is recorded, which is the point of the free
  // library rather than a gap in it.
  //
  // What is sent is dwell on this page, not player position: the lesson is a
  // cross-origin YouTube iframe, so there is no play or ended event to read
  // without loading YouTube's own API, and the panel is worded for what this
  // actually measures. The tab being hidden stops the clock, so leaving the
  // page open in a background tab does not accumulate hours.
  React.useEffect(() => {
    if (!id || !accessToken) return undefined;

    const send = (seconds) =>
      apiAuthed(`/me/free-lessons/${encodeURIComponent(id)}/watch`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      }).catch(() => {
        // Never surface this. Nobody opened a free lesson in order to have
        // their history recorded, and a failure here must not sit on top of
        // the thing they came for.
      });

    // No seconds on the first call: that is the "opened it" row.
    send(0);

    const STEP = 30;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") send(STEP);
    }, STEP * 1000);

    return () => clearInterval(timer);
  }, [id, accessToken]);

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
        <IconLock className="w-3.5 h-3.5" />
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
