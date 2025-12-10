// src/components/TestUser.jsx
import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const categories = [
  "All Projects",
  "Commercial",
  "Residential",
  "Infrastructure",
  "Sustainable",
  "Industrial",
  "Mixed-Use",
];

const PER_PAGE = 6;

// Avatar with fallback initials if image not available
function Avatar({ name, src }) {
  const [error, setError] = React.useState(false);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (!src || error) {
    return (
      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setError(true)}
      className="h-10 w-10 rounded-full object-cover"
    />
  );
}

function StarRow({ rating = 5 }) {
  const stars = Math.round(rating || 5);
  return (
    <div className="flex items-center gap-0.5 text-amber-400 text-xs">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i < stars ? "" : "opacity-40"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10 1.5l2.47 4.99 5.51.8-3.99 3.89.94 5.49L10 13.9l-4.93 2.6.94-5.49-3.99-3.89 5.51-.8L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

function TestimonialCard({ t }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-200">
      <div>
        {/* quote icon */}
        <div className="text-slate-300 mb-2">
          <span className="text-3xl leading-none">❝</span>
        </div>

        <StarRow rating={t.rating} />

        <p className="mt-3 text-sm text-slate-700 leading-relaxed line-clamp-6">
          {t.text}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={t.name} src={t.avatarUrl} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1 text-sm font-medium text-slate-900">
              {t.name}
              {/* small blue tick */}
              <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-blue-600 text-[9px] text-white">
                ✓
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              {t.role} · {t.company}
              <br />
              {t.location}
            </div>
          </div>
        </div>

        <span className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
          {t.category}
        </span>
      </div>
    </div>
  );
}

const TestUser = () => {
  const [search, setSearch] = React.useState("");
  const [testimonials, setTestimonials] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [activeCat, setActiveCat] = React.useState("All Projects");
  const [page, setPage] = React.useState(1);

  // load from backend
  React.useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_BASE}/showcase/testimonials`);
        if (!res.ok) throw new Error("Failed to load testimonials");
        const data = await res.json();
        if (!mounted) return;
        setTestimonials(data.items || []);
      } catch (err) {
        console.error(err);
        if (mounted) setError(err.message || "Error loading testimonials");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // reset to first page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [search, activeCat]);

  // filter testimonials
  const filtered = testimonials.filter((t) => {
    const matchesCat =
      activeCat === "All Projects" ? true : t.category === activeCat;
    const s = search.trim().toLowerCase();
    if (!matchesCat) return false;
    if (!s) return true;
    const haystack =
      `${t.name} ${t.company} ${t.location} ${t.text}`.toLowerCase();
    return haystack.includes(s);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  return (
    <section className="w-full bg-[#F8FAFC] py-10 md:py-14 px-4">
      <div className="max-w-6xl mx-auto">
        {/* search + tabs */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* search */}
          <div className="w-full md:max-w-sm">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, company, or location..."
                className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500"
              />
            </div>
          </div>

          {/* tabs */}
          <div className="w-full md:w-auto overflow-x-auto">
            <div className="inline-flex gap-2 whitespace-nowrap">
              {categories.map((cat) => {
                const active = activeCat === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    className={`px-3 md:px-4 py-1.5 rounded-full text-xs md:text-sm border transition ${
                      active
                        ? "bg-blue-700 text-white border-blue-700"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* cards */}
        <div className="mt-6">
          {loading && (
            <div className="text-center text-sm text-slate-500 py-6">
              Loading testimonials…
            </div>
          )}
          {error && !loading && (
            <div className="text-center text-sm text-red-600 py-6">{error}</div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {pageItems.map((t) => (
                <TestimonialCard key={t._id || t.id} t={t} />
              ))}
              {pageItems.length === 0 && (
                <div className="col-span-full text-center text-sm text-slate-500 py-10">
                  No testimonials found. Try adjusting your filters.
                </div>
              )}
            </div>
          )}
        </div>

        {/* pagination */}
        {!loading && !error && pageCount > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 bg-white text-xs disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: pageCount }).map((_, idx) => {
              const num = idx + 1;
              const active = num === currentPage;
              return (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`h-8 w-8 flex items-center justify-center rounded-full text-xs border ${
                    active
                      ? "bg-blue-700 text-white border-blue-700"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {num}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 bg-white text-xs disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default TestUser;
