// src/hooks/useKeyboardShortcuts.js
// The web half of the shortcut scheme the desktop products share (HERON, QUIV,
// RateGen, the MEP Suite and the Installer Hub all carry KeyboardShortcutMap).
// Same meanings, browser-safe keys: the browser owns Ctrl+1..9 (tabs) and
// Ctrl+F (find in page), so the web uses Alt+1..9 for the rail and Ctrl/⌘+K
// or "/" for search. "?" and Ctrl+/ open the sheet everywhere.
import React from "react";

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/**
 * A shortcut:
 *   key    KeyboardEvent.key, compared case-insensitively ("k", "/", "?", "F5")
 *          or KeyboardEvent.code when it starts with "Digit"/"Key" (layout-proof,
 *          and what Alt+digit needs: Alt changes `key` on some layouts)
 *   mod    true = Ctrl on Windows, ⌘ on Mac
 *   alt, shift
 *   group, label   what the sheet shows
 *   run(e)         the action
 *   when()         optional; false leaves the key alone and hides the row
 *   typing         true = also fires while a text field has focus
 */

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function matches(s, e) {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (!!s.mod !== mod || !!s.alt !== e.altKey) return false;
  // "?" is Shift+/ on most layouts; only enforce shift where the key is not
  // itself the shifted character.
  if (s.key !== "?" && !!s.shift !== e.shiftKey) return false;
  if (/^(Digit|Key)/.test(s.key)) return e.code === s.key;
  return String(e.key).toLowerCase() === String(s.key).toLowerCase();
}

export function formatShortcut(s) {
  if (s.display) return s.display;
  const parts = [];
  if (s.mod) parts.push(IS_MAC ? "⌘" : "Ctrl");
  if (s.shift) parts.push("Shift");
  if (s.alt) parts.push(IS_MAC ? "⌥" : "Alt");
  const k = String(s.key).replace(/^Digit/, "").replace(/^Key/, "");
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join(IS_MAC ? "" : "+");
}

/**
 * Registers `shortcuts` on the document for as long as the calling component is
 * mounted, and owns the open/closed state of the sheet.
 * @returns {{ sheetOpen: boolean, setSheetOpen: Function, visible: () => object[] }}
 */
export function useKeyboardShortcuts(shortcuts) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const ref = React.useRef(shortcuts);
  ref.current = shortcuts;

  const all = React.useCallback(
    () => [
      {
        key: "?",
        group: "General",
        label: "Show keyboard shortcuts",
        display: `?  or  ${IS_MAC ? "⌘/" : "Ctrl+/"}`,
        run: () => setSheetOpen((v) => !v),
      },
      { key: "/", mod: true, hidden: true, typing: true, run: () => setSheetOpen((v) => !v) },
      ...(ref.current || []),
    ],
    [],
  );

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      const typing = isTypingTarget(e.target);
      for (const s of all()) {
        if (s.note || !s.run || !matches(s, e)) continue;
        // A plain key (no Ctrl/⌘/Alt) would type a character: leave it to the field.
        if (typing && !s.typing && !s.mod && !s.alt) continue;
        if (s.when && !safe(s.when)) continue;
        e.preventDefault();
        s.run(e);
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [all]);

  const visible = React.useCallback(
    () => all().filter((s) => !s.hidden && (s.note || !s.when || safe(s.when))),
    [all],
  );

  return { sheetOpen, setSheetOpen, visible };
}

function safe(fn) {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

/**
 * Alt+1..9 for the links in a rail, in the order they are on screen. Read at
 * key time, not render time, so it follows whatever the rail is showing (the
 * rail differs by surface and by role).
 * @param {() => HTMLElement|null} getRoot
 * @param {(href: string) => void} go
 */
export function railShortcuts(getRoot, go) {
  const links = () => {
    const root = getRoot();
    if (!root) return [];
    const seen = new Set();
    return [...root.querySelectorAll("a[href]")].filter((a) => {
      const href = a.getAttribute("href");
      if (!href || href === "#" || a.classList.contains("off") || seen.has(href)) return false;
      if (a.closest(".dsh-brand, .adm-brand") || a.matches(".dsh-brand, .adm-brand")) return false;
      if (!a.offsetParent && getComputedStyle(a).position !== "fixed") return false;
      seen.add(href);
      return true;
    });
  };
  return Array.from({ length: 9 }, (_, i) => {
    const s = {
      key: `Digit${i + 1}`,
      alt: true,
      group: "Navigate",
      label: `Go to item ${i + 1} in the menu`,
      typing: true,
      run: () => {
        const a = links()[i];
        if (a) go(a.getAttribute("href"));
      },
      when: () => {
        const a = links()[i];
        // The sheet names the link that is actually there.
        if (a) s.label = `Go to ${(a.textContent || "").replace(/\s+/g, " ").trim().replace(/\s\d+( of \d+)?$/, "")}`;
        return !!a;
      },
    };
    return s;
  });
}
