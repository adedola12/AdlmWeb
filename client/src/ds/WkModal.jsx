// His work-surface modal (.wk-modal), as a React component.
//
// Markup is his W.modal from work.js: .wk-modal > .wk-modal-c[role=dialog]
// with .wk-modal-x, an h2, an optional p, and whatever the caller puts in —
// normally a <form> of .wk-f labels ending in a .wk-modal-go button, which his
// CSS lays out as a two-column grid.
//
// Closes on the X, a click on the backdrop and Escape — except while `busy`,
// so an upload or a save cannot be abandoned half way by a stray click.
//
// .wk-modal sits at opacity 0 until .on is added on the next frame. The timer
// is the same fallback as DsLeaveStudio: requestAnimationFrame does not fire
// in a tab that is not compositing, and an invisible modal that still covers
// the page and swallows every click is far worse than one without a fade.
//
// It must render inside the .ds root (his styles are scoped to it), which every
// screen inside DsAppShell already is.

import React from "react";

export default function WkModal({ open, title, sub, onClose, busy = false, children }) {
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setShown(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    const fallback = setTimeout(() => setShown(true), 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const close = () => {
    if (!busy) onClose?.();
  };

  return (
    <div
      className={`wk-modal${shown ? " on" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="wk-modal-c" role="dialog" aria-modal="true" aria-label={title}>
        <button
          type="button"
          className="wk-modal-x"
          aria-label="Close"
          onClick={close}
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-close" />
          </svg>
        </button>
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
        {children}
      </div>
    </div>
  );
}
