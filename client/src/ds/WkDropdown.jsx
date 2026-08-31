// His .wk-dd control, on its own so more than one screen can use it.
//
// Lifted verbatim out of WkPrefs, where it was a file-local component, because
// the programme needs the same control to switch project and his own build
// calls one `W.dropdown` helper from both places. Two copies of a listbox is
// two sets of keyboard and outside-click behaviour to keep in step.
//
// Markup and classes are his: .wk-dd (+ .on), .wk-dd-b with .l/.v/<i>, and
// .wk-dd-m holding one button per option.

import React from "react";

export default function WkDropdown({ label, value, options, onPick }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div className={`wk-dd${open ? " on" : ""}`} ref={ref}>
      <button
        type="button"
        className="wk-dd-b"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="l">{label}</span>
        <span className="v">{current?.label || "—"}</span>
        <i />
      </button>
      {open ? (
        <div className="wk-dd-m" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={o.value === value ? "on" : undefined}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onPick(o.value);
              }}
            >
              <span>
                {o.label}
                {o.note ? <i>{o.note}</i> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
