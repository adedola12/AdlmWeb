import React from "react";
import {
  FaChevronUp,
  FaChevronDown,
  FaListOl,
  FaTimes,
  FaSearch,
} from "react-icons/fa";

// PmWbsScrollNav — floating navigation aid for long WBS task lists.
//
// Renders three things in a fixed corner of the viewport:
//   1. ↑ "Jump to top"     — window.scrollTo(0)
//   2. ↓ "Jump to bottom"  — scroll to bottom of page
//   3. Sections drawer     — slide-out panel listing summary tasks; click any
//                            row to smooth-scroll the matching task row into
//                            view. Filter box on top to handle very large
//                            projects.
//
// The host (TaskTable) decides which task rows are "sections" and provides
// the matching DOM refs via the sections prop, so all this component does is
// orchestrate visibility + smooth scrolling.

export default function PmWbsScrollNav({
  sections = [], // [{ id, wbs, name, refGetter }]
  scrollOffset = 80, // pixels of nav/header to leave above the target row
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [scrollPct, setScrollPct] = React.useState(0);

  // Track scroll position for the visual progress strip.
  React.useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const cur = Math.min(max, Math.max(0, window.scrollY));
      setScrollPct((cur / max) * 100);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer on Escape for keyboard users.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function scrollToBottom() {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }
  function scrollToSection(section) {
    const el = section.refGetter?.();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const target = rect.top + window.scrollY - scrollOffset;
    window.scrollTo({ top: target, behavior: "smooth" });
    setOpen(false);
  }

  const filteredSections = React.useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter((s) => {
      const hay = `${s.wbs || ""} ${s.name || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query]);

  return (
    <>
      {/* Action buttons — bottom-right corner, always visible */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Scroll progress indicator — small vertical bar shows where you are */}
        <div
          className="hidden sm:block h-24 w-1 rounded-full bg-slate-200 overflow-hidden"
          title={`${scrollPct.toFixed(0)}% scrolled`}
        >
          <div
            className="w-full bg-adlm-blue-700 transition-all"
            style={{ height: `${scrollPct}%` }}
          />
        </div>

        {sections.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={`Jump to section (${sections.length} sections)`}
            className="inline-flex items-center gap-2 rounded-full bg-adlm-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-800 transition"
          >
            <FaListOl />
            <span className="hidden sm:inline">Sections</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
              {sections.length}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={scrollToTop}
          title="Jump to top"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50 hover:text-adlm-blue-700 transition"
        >
          <FaChevronUp />
        </button>

        <button
          type="button"
          onClick={scrollToBottom}
          title="Jump to bottom"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50 hover:text-adlm-blue-700 transition"
        >
          <FaChevronDown />
        </button>
      </div>

      {/* Sections drawer — slides in from the right when open */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          aria-modal="true"
          role="dialog"
        >
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-label="Close sections panel"
            onClick={() => setOpen(false)}
            className="flex-1 bg-slate-900/30 backdrop-blur-sm"
          />

          <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-4 py-3 text-white">
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-80">
                  Quick jump
                </div>
                <div className="text-sm font-bold">
                  WBS sections · {sections.length}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            {/* Filter */}
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <FaSearch className="absolute left-3 top-2.5 text-slate-400 text-xs" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by WBS or name…"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
                />
              </div>
            </div>

            {/* Scroll-to-top/bottom shortcuts inside the drawer */}
            <div className="flex gap-2 border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  scrollToTop();
                  setOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FaChevronUp className="text-[10px]" /> Top
              </button>
              <button
                type="button"
                onClick={() => {
                  scrollToBottom();
                  setOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FaChevronDown className="text-[10px]" /> Bottom
              </button>
            </div>

            {/* Section list */}
            <div className="flex-1 overflow-y-auto">
              {filteredSections.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-400">
                  {sections.length === 0
                    ? "No sections detected. Summary tasks (imported from MS Project) and top-level WBS items appear here."
                    : `No sections match "${query}".`}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredSections.map((s, idx) => {
                    // WBS depth is the number of dots — root sections (e.g.
                    // "A") get 0 indent, "A.1" gets 1, "A.1.2" gets 2, etc.
                    const depth = String(s.wbs || "")
                      .split(".")
                      .filter(Boolean).length - 1;
                    const indent = Math.max(0, Math.min(4, depth));
                    return (
                      <li key={s.id || idx}>
                        <button
                          type="button"
                          onClick={() => scrollToSection(s)}
                          className="w-full px-3 py-2.5 text-left hover:bg-blue-50 transition group"
                          style={{ paddingLeft: 12 + indent * 16 }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 bg-slate-100 text-slate-600 group-hover:bg-adlm-blue-700 group-hover:text-white transition"
                            >
                              {s.wbs || "—"}
                            </span>
                            <span className="text-xs font-medium text-slate-900 truncate flex-1">
                              {s.name || "(no name)"}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
              Press <kbd className="rounded border border-slate-300 bg-white px-1 font-mono">Esc</kbd> to close
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
