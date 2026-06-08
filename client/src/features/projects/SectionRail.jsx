import React from "react";
import {
  FaChevronUp,
  FaChevronDown,
  FaBars,
  FaTimes,
  FaSearch,
  FaListUl,
} from "react-icons/fa";

// SectionRail — persistent docked side menu for jumping between page
// sections without scrolling through content.
//
// Why this exists: the BoQ and WBS tabs both grow long (50+ items,
// 200+ tasks). Smooth scrolling across that much content gave users a
// dizzy feeling; jumping straight to the target row is faster AND
// kinder to motion-sensitive users. This rail makes the jumps
// always-accessible without forcing the user to find a hidden drawer.
//
// Layout:
//   • xl screens → sticky vertical rail docked to the left of the
//     content. Each section is a one-click jump button.
//   • below xl  → collapses into a floating "Sections" pill in the
//     bottom-right corner that opens an overlay drawer (same content
//     pattern as before, just instant-jump now).
//
// Each `section` shape: { id, label, refGetter, badge?, indent? }
//   refGetter must return the live DOM node to jump to. We use a
//   getter rather than passing the ref directly so the parent can
//   express anchors that are computed on the fly (category headers).
//
// Props:
//   title         — header label shown in the rail and drawer
//   sections      — see above
//   scrollOffset  — pixels of fixed nav to leave above the target row
//   onScrollTop   — optional override for "jump to top"
//   onScrollBottom — optional override for "jump to bottom"
//   activeId      — optionally highlight the section currently in view
//
// All jumps use behavior: "auto" (instant). Animated smooth scroll was
// removed by user request — see comment above each scrollTo call.
export default function SectionRail({
  title = "Sections",
  sections = [],
  scrollOffset = 80,
  onScrollTop,
  onScrollBottom,
  activeId = null,
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("adlm:sectionRailCollapsed") === "1";
    } catch {
      return false;
    }
  });

  // Persist the collapsed preference so power-users who fold the rail
  // away once don't have to do it every time they reload.
  React.useEffect(() => {
    try {
      localStorage.setItem(
        "adlm:sectionRailCollapsed",
        collapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Close the drawer on Escape so keyboard users can dismiss without
  // hunting for the X button.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const jumpToTop = React.useCallback(() => {
    if (onScrollTop) onScrollTop();
    else window.scrollTo({ top: 0, behavior: "auto" });
  }, [onScrollTop]);

  const jumpToBottom = React.useCallback(() => {
    if (onScrollBottom) onScrollBottom();
    else
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "auto",
      });
  }, [onScrollBottom]);

  const jumpToSection = React.useCallback(
    (section) => {
      const el = section.refGetter?.();
      if (!el) return;
      // Compute the destination scroll position manually so we can
      // subtract the fixed header height. behavior: "auto" → instant.
      const rect = el.getBoundingClientRect();
      const target = rect.top + window.scrollY - scrollOffset;
      window.scrollTo({ top: target, behavior: "auto" });
      setDrawerOpen(false);
    },
    [scrollOffset],
  );

  const filteredSections = React.useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter((s) => {
      const hay = `${s.label || ""} ${s.badge || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query]);

  // Hide the rail entirely when there's nothing to jump to.
  if (sections.length === 0) return null;

  return (
    <>
      {/* Docked rail — visible on xl+ screens, sticky alongside content.
          On smaller viewports it's hidden; the floating button below
          takes over. */}
      <aside
        className={`hidden xl:flex flex-col sticky top-24 self-start rounded-2xl border border-slate-200 bg-white shadow-depth dark:bg-slate-800 dark:border-slate-700 transition-all ${
          collapsed ? "w-14" : "w-60"
        }`}
        style={{ maxHeight: "calc(100vh - 7rem)" }}
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-700 px-2 py-2">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sections rail"
              className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-adlm-blue-700 dark:hover:bg-slate-700"
            >
              <FaBars />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <FaListUl className="text-adlm-blue-700 text-xs shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                    Quick jump
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {title}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="Collapse rail"
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-700"
              >
                <FaTimes className="text-[10px]" />
              </button>
            </>
          )}
        </div>

        {/* Top / bottom shortcuts */}
        {!collapsed ? (
          <div className="flex gap-1 px-2 py-2 border-b border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={jumpToTop}
              title="Jump to top"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 px-1.5 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FaChevronUp className="text-[8px]" /> Top
            </button>
            <button
              type="button"
              onClick={jumpToBottom}
              title="Jump to bottom"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 px-1.5 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FaChevronDown className="text-[8px]" /> Bottom
            </button>
          </div>
        ) : null}

        {/* Section list */}
        <div className="flex-1 overflow-y-auto py-1">
          {!collapsed ? (
            <ul className="space-y-0.5 px-1.5">
              {sections.map((s) => {
                const indent = Math.max(0, Math.min(3, s.indent ?? 0));
                const isActive = s.id && s.id === activeId;
                return (
                  <li key={s.id || s.label}>
                    <button
                      type="button"
                      onClick={() => jumpToSection(s)}
                      className={`group w-full rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                        isActive
                          ? "bg-adlm-blue-700 text-white shadow-sm"
                          : "text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700"
                      }`}
                      style={{ paddingLeft: 8 + indent * 10 }}
                    >
                      <div className="flex items-center gap-1.5">
                        {s.badge ? (
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                              isActive
                                ? "bg-white/20 text-white"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 group-hover:bg-adlm-blue-700 group-hover:text-white"
                            }`}
                          >
                            {s.badge}
                          </span>
                        ) : null}
                        <span className="font-medium truncate flex-1">
                          {s.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            // Collapsed view — show just the section icons / first letter.
            <ul className="space-y-1 px-1">
              {sections.slice(0, 12).map((s) => (
                <li key={s.id || s.label}>
                  <button
                    type="button"
                    onClick={() => jumpToSection(s)}
                    title={s.label}
                    className="block w-full rounded-md py-1.5 text-center text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-adlm-blue-700 dark:hover:bg-slate-700 transition"
                  >
                    {s.badge?.slice(0, 3) ||
                      String(s.label || "").slice(0, 2).toUpperCase()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Floating "Sections" pill — visible below xl breakpoint, opens
          a drawer with the same section list. Mirrors the desktop rail
          so mobile/tablet users get the same instant-jump UX. */}
      <div className="xl:hidden fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          title={`Jump to section (${sections.length} sections)`}
          className="inline-flex items-center gap-2 rounded-full bg-adlm-blue-700 px-3 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-800 transition"
        >
          <FaListUl />
          <span>Sections</span>
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
            {sections.length}
          </span>
        </button>
      </div>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          aria-modal="true"
          role="dialog"
        >
          <button
            type="button"
            aria-label="Close sections"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-slate-900/30 backdrop-blur-sm"
          />
          <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-4 py-3 text-white">
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-80">
                  Quick jump
                </div>
                <div className="text-sm font-bold">
                  {title} · {sections.length}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                title="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-700 p-3">
              <div className="relative">
                <FaSearch className="absolute left-3 top-2.5 text-slate-400 text-xs" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter sections…"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/30 focus:border-adlm-blue-700"
                />
              </div>
            </div>
            <div className="flex gap-2 border-b border-slate-100 dark:border-slate-700 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  jumpToTop();
                  setDrawerOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <FaChevronUp className="text-[10px]" /> Top
              </button>
              <button
                type="button"
                onClick={() => {
                  jumpToBottom();
                  setDrawerOpen(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <FaChevronDown className="text-[10px]" /> Bottom
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredSections.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-400">
                  No sections match "{query}".
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredSections.map((s) => {
                    const indent = Math.max(0, Math.min(4, s.indent ?? 0));
                    return (
                      <li key={s.id || s.label}>
                        <button
                          type="button"
                          onClick={() => jumpToSection(s)}
                          className="w-full px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-slate-700 transition group"
                          style={{ paddingLeft: 12 + indent * 16 }}
                        >
                          <div className="flex items-center gap-2">
                            {s.badge ? (
                              <span className="font-mono text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-200 group-hover:bg-adlm-blue-700 group-hover:text-white transition">
                                {s.badge}
                              </span>
                            ) : null}
                            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate flex-1">
                              {s.label}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400">
              Press{" "}
              <kbd className="rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-1 font-mono">
                Esc
              </kbd>{" "}
              to close
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
