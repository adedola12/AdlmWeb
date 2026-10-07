// His side panel — layer L5 of the project page.
//
// WORK.md §13 puts it plainly: a bill line, a rate build-up, a task or the model
// changes open "over the tab — never a new page". It is the single biggest
// structural difference between his design and the classic workspace, where the
// same things are separate screens or inline expansions.
//
// Faithful to work-proj.js:407-427 (openPanel / closePanel):
//
//   <aside class="pj-panel" role="dialog" aria-label="…">
//     <div class="hd"><b>title</b><button class="x">✕</button></div>
//     <div class="bd">…</div>
//   </aside>
//
// appended to document.body, given `.on` on the next frame so it slides in, and
// on close losing `.on` and being removed 220ms later — the length of the
// transition in ds-work-proj.css:296-298.
//
// WHY IT IS PORTALLED, AND WHY INTO A .ds WRAPPER
//
// He appends to document.body, and so do we, for the same reason: .pj-panel is
// position:fixed, and an ancestor with a transform, filter or backdrop-filter
// would make itself the containing block and pin the panel inside the page
// instead of the viewport. That is not hypothetical here — .ds .nav carries a
// backdrop-filter, and it is exactly what put the mobile menu behind the header.
//
// But our stylesheet is scoped (`.ds .pj-panel`), so a bare portal to body would
// match nothing and render an unstyled stack. Hence the `.ds` wrapper: the
// selector matches, and the colour tokens come from :root (ds.css:17) which the
// wrapper inherits either way.

import React from "react";
import { createPortal } from "react-dom";

/**
 * @param {object} p
 * @param {string} p.title      the panel's heading, and its accessible name
 * @param {boolean} p.visible   false starts the slide-out; the caller unmounts
 *                              after PANEL_EXIT_MS (see useProjectPanel)
 * @param {() => void} p.onClose
 */
export default function WorkProjectPanel({ title, visible = true, onClose, children }) {
  // Whether the entrance has been allowed to start. The node has to be in the
  // document for one frame WITHOUT `.on`, or the browser has nothing to
  // transition from and the panel simply appears.
  const [entered, setEntered] = React.useState(false);
  const closeRef = React.useRef(null);
  // Where focus was before the panel took it, so closing hands it back rather
  // than dropping the caret at the top of the document.
  const returnTo = React.useRef(null);

  React.useEffect(() => {
    returnTo.current = document.activeElement;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  React.useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      // His guard (work-proj.js:427): a feedback dialog is modal OVER the panel,
      // so Escape belongs to whichever is on top. Without this, one press closes
      // both.
      if (document.querySelector(".fb-back")) return;
      onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    closeRef.current?.focus();
    return () => {
      const el = returnTo.current;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
    };
  }, []);

  const on = entered && visible;

  return createPortal(
    <div className="ds">
      <aside className={on ? "pj-panel on" : "pj-panel"} role="dialog" aria-label={title}>
        <div className="hd">
          <b>{title}</b>
          <button type="button" className="x" aria-label="Close" ref={closeRef} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="bd">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
