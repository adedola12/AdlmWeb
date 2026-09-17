// Richard's theme menu (site.js, 17 Sep 2026): Light, Dark blue, Black,
// Match my device, hung under the #tt button. His markup and classes
// (.tt-menu, .sw) on ThemeProvider's preference.
//
// ds.css scopes .tt-menu under .ds, so the portal carries a .ds wrapper with
// display: contents — the wrapper adds no box of its own.

import React from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../theme.jsx";
import { THEMES } from "./themes.js";

export default function ThemeMenu({ anchor, onClose }) {
  const { preference, setPreference } = useTheme();
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState(null);

  // Under the button, right-aligned to it, kept 12px inside the window.
  React.useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    setPos({
      top: r.bottom + 8,
      left: Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)),
    });
    anchor.setAttribute("aria-expanded", "true");
    const first = menu.querySelector('[aria-checked="true"]') || menu.querySelector("button");
    first?.focus();
    return () => anchor.setAttribute("aria-expanded", "false");
  }, [anchor]);

  // Shut on a click elsewhere, Escape, resize or scroll, as his does.
  React.useEffect(() => {
    const away = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, { capture: true });
    };
  }, [anchor, onClose]);

  const onKeyDown = (e) => {
    const items = Array.from(ref.current?.querySelectorAll("button") || []);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };

  const pick = (key) => {
    setPreference(key);
    setTimeout(onClose, 140);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ds" style={{ display: "contents" }}>
      <div
        ref={ref}
        className="tt-menu"
        role="menu"
        aria-label="Theme"
        onKeyDown={onKeyDown}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
      >
        <span className="tt-k">Theme</span>
        {THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="menuitemradio"
            aria-checked={preference === t.key}
            data-theme-pick={t.key}
            onClick={() => pick(t.key)}
          >
            <i className={`sw ${t.key}`} />
            <span>
              <b>{t.label}</b>
              <em>{t.note}</em>
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * His Appearance picker for Account settings (dash-settings.html, .th-pick):
 * the same four choices as radio buttons.
 */
export function ThemePicker({ onPicked }) {
  const { preference, setPreference } = useTheme();
  return (
    <div className="th-pick" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.key}
          type="button"
          role="radio"
          aria-checked={preference === t.key}
          data-theme-pick={t.key}
          onClick={() => {
            setPreference(t.key);
            onPicked?.(t);
          }}
        >
          <i className={`sw ${t.key}`} />
          <span>
            <b>{t.label}</b>
            <em>{t.key === "system" ? "Follows the system" : t.note}</em>
          </span>
        </button>
      ))}
    </div>
  );
}
