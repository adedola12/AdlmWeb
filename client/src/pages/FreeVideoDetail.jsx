// src/pages/FreeVideoDetail.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { SecureEmbed } from "../components/SecureVideo.jsx";
import { IconLock } from "../components/icons.jsx";
import {
  fetchFreeVideo,
  fetchFreeVideosInSection,
  formatDuration,
} from "../lib/freeVideos.js";
import FreeVideoCard from "../components/FreeVideoCard.jsx";

export default function FreeVideoDetail() {
  const { id } = useParams(); // Mongo _id
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // The rest of the shelf this lesson sits on, minus itself.
  const [related, setRelated] = React.useState([]);

  React.useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setItem(null);
    setRelated([]);
    (async () => {
      try {
        // One video by id — the library is a hundred-odd deep now, so the old
        // "fetch the first fifty and find it" would miss most of them.
        const v = await fetchFreeVideo(id, ac.signal);
        if (ac.signal.aborted) return;
        setItem(v);
        setLoading(false);
        if (v?.section) {
          const list = await fetchFreeVideosInSection(v.section, 12, ac.signal);
          if (!ac.signal.aborted) setRelated(list.filter((x) => x._id !== v._id).slice(0, 6));
        }
      } catch (e) {
        if (e?.name !== "AbortError") setLoading(false);
      }
    })();
    return () => ac.abort();
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

  const shelf = item.sectionInfo;
  const shelfHref = shelf ? `/learn#free-${shelf.slug}` : "/learn#free";
  const clock = formatDuration(item.durationSec);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-adlm-dark-muted" aria-label="Breadcrumb">
        <Link to="/learn" className="hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition">
          Learn
        </Link>
        <span aria-hidden>›</span>
        <Link to="/learn#free" className="hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition">
          Free lessons
        </Link>
        {shelf && (
          <>
            <span aria-hidden>›</span>
            <Link to={shelfHref} className="hover:text-adlm-blue-700 dark:hover:text-adlm-blue-400 transition">
              {shelf.label}
            </Link>
          </>
        )}
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Free lesson
          </span>
          {shelf && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-adlm-blue-700 bg-adlm-blue-50 ring-1 ring-adlm-blue-200 dark:bg-adlm-blue-700/15 dark:text-adlm-blue-300 dark:ring-adlm-blue-700/30">
              {shelf.label}
            </span>
          )}
          {clock && (
            <span className="text-xs text-slate-500 dark:text-adlm-dark-muted tabular-nums">{clock}</span>
          )}
        </div>
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
        <Link to={shelfHref} className="btn btn-ghost">
          {shelf ? `All ${shelf.label} lessons` : "Back to Learn"}
        </Link>
      </div>

      {related.length > 0 && shelf && (
        <section className="pt-4">
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text">
              More in {shelf.label}
            </h2>
            <Link
              to={shelfHref}
              className="text-sm font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline"
            >
              See the whole shelf
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {related.map((v) => (
              <FreeVideoCard key={v._id} v={v} sectionLabel={shelf.label} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
