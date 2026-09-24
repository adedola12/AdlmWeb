import React from "react";
import { FaChevronDown, FaChevronUp } from "../../components/icons.jsx";
import WkModal from "../../ds/WkModal.jsx";

// SectionRail — persistent docked side menu for jumping between page
// sections without scrolling through content.
//
// Why this exists: the BoQ and WBS tabs both grow long (50+ items,
// 200+ tasks). Smooth scrolling across that much content gave users a
// dizzy feeling; jumping straight to the target row is faster AND
// kinder to motion-sensitive users. This rail makes the jumps
// always-accessible without forcing the user to find a hidden drawer.
//
// Built from Richard's pieces, the same ones as the project views sidebar:
//   • xl screens → a sticky .wk-panel docked to the left of the content,
//     with his .dsh-grp title and a .dsh-nav list (.on carries his accent
//     bar, a section's badge rides in .tail).
//   • below xl  → a floating "Sections" ds-btn that opens his .wk-modal
//     (WkModal) holding a .wk-find filter and the same list.
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
// All jumps are instant. Animated smooth scroll was
// removed by user request — see comment above each scrollTo call.

const TRUNCATE = { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
// His .dsh-nav is a grid on an auto track, which grows to the longest
// nowrap label; a fixed track lets the labels truncate instead.
const NAV_TRACK = { gridTemplateColumns: "minmax(0, 1fr)" };
const SHORTCUT = { flex: 1, padding: "6px 10px" };
const RAIL_TITLE = {
  display: "block",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--ink)",
  paddingLeft: 12,
  ...TRUNCATE,
};

// The element that actually scrolls. Inside his app shell that is .dsh-main,
// not the window, so a window.scrollTo there does nothing.
function scrollBox(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

// "instant", not "auto": his CSS sets scroll-behavior:smooth, which "auto"
// would inherit, and these jumps are meant to be instant (see above).
function scrollBoxTo(box, top) {
  if (box) box.scrollTo({ top, behavior: "instant" });
  else window.scrollTo({ top, behavior: "instant" });
}

function SectionList({ sections, activeId, onJump, indentStep }) {
  return (
    <ul className="dsh-nav" style={NAV_TRACK}>
      {sections.map((s) => {
        const indent = Math.max(0, Math.min(4, s.indent ?? 0));
        const isActive = Boolean(s.id) && s.id === activeId;
        return (
          <li key={s.id || s.label}>
            <a
              href={s.id ? `#${s.id}` : "#"}
              className={isActive ? "on" : undefined}
              aria-current={isActive ? "location" : undefined}
              title={s.label}
              style={{ fontSize: 13, paddingLeft: 12 + indent * indentStep }}
              onClick={(e) => {
                e.preventDefault();
                onJump(s);
              }}
            >
              <span style={TRUNCATE}>{s.label}</span>
              {s.badge ? <span className="tail">{s.badge}</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function SectionRail({
  title = "Sections",
  sections = [],
  scrollOffset = 80,
  onScrollTop,
  onScrollBottom,
  activeId = null,
}) {
  const railRef = React.useRef(null);
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

  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);

  const jumpToTop = React.useCallback(() => {
    if (onScrollTop) onScrollTop();
    else scrollBoxTo(scrollBox(railRef.current), 0);
  }, [onScrollTop]);

  const jumpToBottom = React.useCallback(() => {
    if (onScrollBottom) onScrollBottom();
    else {
      const box = scrollBox(railRef.current);
      scrollBoxTo(box, (box || document.documentElement).scrollHeight);
    }
  }, [onScrollBottom]);

  const jumpToSection = React.useCallback(
    (section) => {
      const el = section.refGetter?.();
      if (!el) return;
      // Compute the destination scroll position manually so we can
      // subtract the fixed header height, in whichever element scrolls.
      const box = scrollBox(el);
      const rect = el.getBoundingClientRect();
      const target = box
        ? rect.top - box.getBoundingClientRect().top + box.scrollTop - scrollOffset
        : rect.top + window.scrollY - scrollOffset;
      scrollBoxTo(box, target);
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

  const shortcuts = (afterJump) => (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        type="button"
        className="ds-btn ds-btn-sm btn-o"
        style={SHORTCUT}
        onClick={() => {
          jumpToTop();
          afterJump?.();
        }}
        title="Jump to top"
      >
        <FaChevronUp size={12} /> Top
      </button>
      <button
        type="button"
        className="ds-btn ds-btn-sm btn-o"
        style={SHORTCUT}
        onClick={() => {
          jumpToBottom();
          afterJump?.();
        }}
        title="Jump to bottom"
      >
        <FaChevronDown size={12} /> Bottom
      </button>
    </div>
  );

  return (
    <>
      {/* Docked rail: xl screens only (the Tailwind display classes; his
          .wk-panel sets no display of its own). */}
      <aside
        ref={railRef}
        className="wk-panel hidden xl:block"
        aria-label={title}
        style={{
          position: "sticky",
          top: 96,
          alignSelf: "flex-start",
          flex: "none",
          width: collapsed ? 64 : 240,
          maxHeight: "calc(100vh - 7rem)",
          overflowY: "auto",
          marginBottom: 0,
          padding: collapsed ? "10px 8px" : "4px 14px 14px",
        }}
      >
        {collapsed ? (
          <>
            <button
              type="button"
              className="ds-btn ds-btn-sm btn-o"
              style={{ width: "100%", padding: "8px 0" }}
              onClick={() => setCollapsed(false)}
              aria-label="Expand sections rail"
              title="Expand sections rail"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                style={{ width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
              >
                <use href="#hi-menu" />
              </svg>
            </button>
            {/* Folded: each section as its badge or first letters. */}
            <ul className="dsh-nav" style={{ marginTop: 8, ...NAV_TRACK }}>
              {sections.slice(0, 12).map((s) => (
                <li key={s.id || s.label}>
                  <a
                    href={s.id ? `#${s.id}` : "#"}
                    title={s.label}
                    style={{ justifyContent: "center", padding: "7px 0", fontSize: 11 }}
                    onClick={(e) => {
                      e.preventDefault();
                      jumpToSection(s);
                    }}
                  >
                    {s.badge?.slice(0, 3) ||
                      String(s.label || "").slice(0, 2).toUpperCase()}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "12px 0 0",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p className="dsh-grp" style={{ margin: 0 }}>
                  Quick jump
                </p>
                <b style={RAIL_TITLE}>{title}</b>
              </div>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o"
                style={{ padding: "6px 10px", flex: "none" }}
                onClick={() => setCollapsed(true)}
                title="Collapse rail"
              >
                Hide
              </button>
            </div>
            <div style={{ margin: "12px 0" }}>{shortcuts()}</div>
            <SectionList
              sections={sections}
              activeId={activeId}
              onJump={jumpToSection}
              indentStep={10}
            />
          </>
        )}
      </aside>

      {/* Below xl: a floating button that opens the list in his modal. It
          sits above the Ask Ada button, which holds the corner. */}
      <div className="xl:hidden" style={{ position: "fixed", right: 24, bottom: 84, zIndex: 30 }}>
        <button
          type="button"
          className="ds-btn ds-btn-sm btn-p"
          onClick={() => setDrawerOpen(true)}
          title={`Jump to section (${sections.length} sections)`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
          >
            <use href="#hi-menu" />
          </svg>
          Sections · {sections.length}
        </button>
      </div>

      <WkModal
        open={drawerOpen}
        title={title}
        sub={`${sections.length} sections. Pick one to jump straight to it.`}
        onClose={closeDrawer}
      >
        <div style={{ display: "grid", gap: 12, ...NAV_TRACK }}>
          <div className="wk-bar" style={{ marginBottom: 0 }}>
            <label className="wk-find">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-search" />
              </svg>
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter sections…"
                aria-label="Filter sections"
                autoComplete="off"
              />
            </label>
          </div>
          {shortcuts(closeDrawer)}
          {filteredSections.length === 0 ? (
            <div className="wk-empty">No sections match “{query}”.</div>
          ) : (
            <div style={{ padding: "0 14px" }}>
              <SectionList
                sections={filteredSections}
                activeId={activeId}
                onJump={jumpToSection}
                indentStep={16}
              />
            </div>
          )}
        </div>
      </WkModal>
    </>
  );
}
