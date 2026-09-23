// src/components/KeyboardShortcutsDialog.jsx
// The shortcut sheet: what the keys do on this screen, grouped. Opened with "?"
// or Ctrl+/ (see useKeyboardShortcuts), closed with Esc, the same keys again,
// the X or a click outside. The desktop products show the same sheet on F1.
import React from "react";
import { formatShortcut } from "../hooks/useKeyboardShortcuts.js";
import "../styles/keyboard-shortcuts.css";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => object[]} props.items  useKeyboardShortcuts().visible
 * @param {string} [props.product]
 */
export default function KeyboardShortcutsDialog({ open, onClose, items, product = "ADLM Studio" }) {
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const back = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (back && typeof back.focus === "function") back.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const groups = [];
  for (const s of items()) {
    const g = s.group || "General";
    let entry = groups.find((x) => x.name === g);
    if (!entry) groups.push((entry = { name: g, rows: [] }));
    entry.rows.push(s);
  }

  return (
    <div className="kbd-sheet-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kbd-sheet" role="dialog" aria-modal="true" aria-labelledby="kbd-sheet-title">
        <header>
          <div>
            <h2 id="kbd-sheet-title">Keyboard shortcuts</h2>
            <p>{product} · Esc closes this</p>
          </div>
          <button ref={closeRef} type="button" className="kbd-sheet-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="kbd-sheet-body">
          {groups.map((g) => (
            <section key={g.name}>
              <h3>{g.name}</h3>
              <dl>
                {g.rows.map((s, i) => (
                  <div className="kbd-row" key={`${g.name}-${i}`}>
                    <dt>{s.label}</dt>
                    <dd>
                      <kbd>{formatShortcut(s)}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The top-bar button that opens the sheet, for people who never press "?". */
export function KeyboardShortcutsButton({ onClick }) {
  return (
    <button
      type="button"
      className="kbd-open"
      onClick={onClick}
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6 12.5h.01M18 12.5h.01M9 12.5h6M8 15h8" />
      </svg>
    </button>
  );
}
