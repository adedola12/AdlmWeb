// His popover (work-proj.js:124-143), as a component.
//
// Portalled to document.body inside a `.ds` wrapper for the same two reasons as
// WorkProjectPanel: the stylesheet is `.ds`-scoped so a bare portal matches
// nothing, and .pj-pop is positioned against the page, which an ancestor with a
// backdrop-filter would quietly reparent.
//
// His positioning, kept: below the button, right edges aligned, and clamped 12px
// inside the viewport so a button near the right edge does not push it off.
// scrollY is in the sum because .pj-pop is position:absolute, not fixed — it
// scrolls with the page, which is what he wanted for a menu hung off a header.

import React from "react";
import { createPortal } from "react-dom";

export default function WorkProjectPopover({ anchorRef, label, onClose, className = "", children }) {
  const popRef = React.useRef(null);
  const [at, setAt] = React.useState(null);

  // Measured after mount, because the width to align against is the rendered
  // width — his var w = pop.offsetWidth.
  React.useEffect(() => {
    const btn = anchorRef?.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth;
      setAt({
        top: r.bottom + 6 + window.scrollY,
        left: Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w + window.scrollX)),
      });
    };
    place();
    // A resize moves the anchor; a scroll does not, because both the popover and
    // the page scroll together.
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef]);

  React.useEffect(() => {
    // His setTimeout(…, 0) before listening: without it the very click that
    // opened the popover is the click that closes it.
    let armed = false;
    const id = window.setTimeout(() => {
      armed = true;
    }, 0);
    function onDown(e) {
      if (!armed) return;
      if (popRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div className="ds">
      <div
        className={`pj-pop${className ? ` ${className}` : ""}`}
        role="menu"
        aria-label={label}
        ref={popRef}
        // Hidden until measured, so it is never seen at the top-left corner
        // before it is placed.
        style={at ? { top: at.top, left: at.left } : { visibility: "hidden" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
