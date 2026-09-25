import React from "react";
import PageSeo from "../components/PageSeo.jsx";
import { Link, useLocation } from "react-router-dom";
import { API_BASE } from "../config";
import { readPreloaded } from "../lib/preload.js";
import { fetchFreeVideoSections } from "../lib/freeVideos.js";
import FreeVideoCard from "../components/FreeVideoCard.jsx";
import { IconGraduation, IconPlaySquare } from "../components/icons.jsx";

function makePreviewUrl(url, seconds = 60, startAt = 0) {
  if (!url) return url;
  return url.replace(
    /\/upload\/(?!.*\/upload\/)/,
    `/upload/so_${startAt},du_${seconds}/`,
  );
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

function PaidCard({ c }) {
  const preview = makePreviewUrl(c.previewUrl, 60, 0);
  const purchaseKey = c.productKey || c.sku;

  return (
    <div className="group card p-0 lift spotlight">
      <HoverVideo src={preview || c.previewUrl} poster={c.thumbnailUrl} />
      <Link
        to={`/dash-course/${encodeURIComponent(c.sku)}`}
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

// How many tiles a shelf shows before "Show all". Two rows on desktop.
const SHELF_PREVIEW = 6;

/**
 * One shelf of the free library: a heading, its videos, and a "show all"
 * toggle once the shelf is longer than two rows. The shelves come from the
 * server already grouped and ordered (GET /learn/free/sections), so this
 * only decides how much of each to show at once.
 */
function Shelf({ section, open, onToggle }) {
  const all = section.videos || [];
  const shown = open ? all : all.slice(0, SHELF_PREVIEW);
  const hidden = all.length - shown.length;
  return (
    <section id={`free-${section.slug || "more"}`} className="scroll-mt-24">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-adlm-dark-text">
            {section.label}
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-adlm-dark-muted tabular-nums">
              {all.length} {all.length === 1 ? "video" : "videos"}
            </span>
          </h3>
          {section.blurb && (
            <p className="text-sm text-slate-600 dark:text-adlm-dark-muted">{section.blurb}</p>
          )}
        </div>
        {all.length > SHELF_PREVIEW && (
          <button type="button" className="btn btn-sm" onClick={onToggle}>
            {open ? "Show fewer" : `Show all ${all.length}`}
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((v) => (
          <FreeVideoCard key={v._id} v={v} sectionLabel={section.label} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 text-sm font-semibold text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline"
        >
          {hidden} more in {section.label}
        </button>
      )}
    </section>
  );
}

export default function Learn() {
  const location = useLocation();

  // The free library, grouped by shelf: QUIV, HERON, the MEP plugin, RateGen,
  // then the generic PlanSwift and Revit teaching, the course recordings and
  // the rest. Empty shelves never arrive.
  const [sections, setSections] = React.useState(null);
  const [freeError, setFreeError] = React.useState("");
  // "all" or one shelf slug. A single shelf opens fully; "all" shows the
  // first two rows of each and lets you expand one at a time.
  const [filter, setFilter] = React.useState("all");
  const [openShelves, setOpenShelves] = React.useState(() => new Set());

  // Seeded by the server so the catalogue is in the HTML rather than appearing
  // a second later. Undefined on any route the server did not render, which is
  // the signal for loadCourses() below to behave exactly as it always has.
  const [courses, setCourses] = React.useState(
    () => readPreloaded("learn:courses") ?? [],
  );
  const [loadingCourses, setLoadingCourses] = React.useState(false);

  const [coursePage, setCoursePage] = React.useState(1);
  const perPage = 9;
  const totalCoursePages = Math.max(Math.ceil(courses.length / perPage), 1);
  const pageSlice = courses.slice(
    (coursePage - 1) * perPage,
    coursePage * perPage,
  );

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
    const ac = new AbortController();
    fetchFreeVideoSections(ac.signal)
      .then((list) => {
        setSections(list);
        setFreeError("");
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setSections([]);
        setFreeError("The video library could not be loaded right now.");
      });
    loadCourses();
    return () => ac.abort();
  }, []);

  // /learn#free-heron lands on that shelf, opened. Only once the shelves have
  // arrived; before that there is nothing to scroll to.
  React.useEffect(() => {
    if (!sections || !location.hash) return;
    const id = location.hash.slice(1);
    const slug = id.startsWith("free-") ? id.slice(5) : "";
    if (slug && sections.some((s) => s.slug === slug)) {
      setFilter(slug);
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sections, location.hash]);

  const toggleShelf = (slug) =>
    setOpenShelves((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const visible = !sections
    ? []
    : filter === "all"
      ? sections
      : sections.filter((s) => s.slug === filter);
  const totalFree = (sections || []).reduce((n, s) => n + (s.count || 0), 0);

  return (
    <div className="space-y-10">
      <PageSeo path="/learn" crumb="Learn" />
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
            Free YouTube lessons and in-depth paid courses with certificates,
            learn at your own pace, anywhere.
          </p>
        </div>
      </div>

      <section id="free" className="card scroll-mt-24">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 flex-shrink-0">
            <IconPlaySquare className="w-5 h-5" />
          </span>
          <h2 className="text-xl font-semibold">Free Lessons</h2>
          {totalFree > 0 && (
            <span className="ml-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {totalFree}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-adlm-dark-muted mb-4 ml-0.5">
          The whole ADLM Studio channel, shelved by software. Hover to preview, click a title to watch.
        </p>

        {sections && sections.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter lessons by software">
            {[{ slug: "all", label: "All", count: totalFree }, ...sections].map((s) => {
              const on = filter === s.slug;
              return (
                <button
                  key={s.slug || "more"}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(s.slug)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition " +
                    (on
                      ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                      : "bg-white dark:bg-white/5 text-slate-700 dark:text-adlm-dark-text ring-slate-200 dark:ring-white/10 hover:ring-adlm-blue-400")
                  }
                >
                  {s.label}
                  <span className={"tabular-nums " + (on ? "text-white/70" : "text-slate-400")}>
                    {s.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!sections ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : !sections.length ? (
          <div className="text-sm text-slate-600">{freeError || "No videos yet."}</div>
        ) : (
          <div className="space-y-10">
            {visible.map((s) => (
              <Shelf
                key={s.slug || "more"}
                section={s}
                open={filter !== "all" || openShelves.has(s.slug)}
                onToggle={() => toggleShelf(s.slug)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-400 flex-shrink-0">
            <IconGraduation className="w-5 h-5" />
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
