// Theme provider — drives the colour theme across the app.
//
// Strategy:
//   • User preference wins. Stored in localStorage under "adlm:theme"
//     as "light" | "dark" | "black" | "system".
//   • Default = "system" — follows the OS / browser preference via the
//     prefers-color-scheme media query, with live updates.
//   • When the resolved theme is dark, we add the `dark` class to
//     <html>. Tailwind's darkMode:class config keys off this.
//   • Black (Richard, 17 Sep 2026) is the dark theme on neutral greys. It is
//     painted as `.dark` plus data-shade="black" on <html>, so every dark rule
//     still applies and only his token block in ds.css changes the surfaces.
//   • Exposed as <ThemeProvider> wrapping the app + a useTheme hook. His
//     #tt button opens a four-way menu (openMenu) rather than cycling.
//
// Why localStorage and not a server-side setting? Theme is a per-device
// preference (laptop dark, phone light, projector light). Keeping it
// client-side means no auth round trip and no race on initial paint.

import React from "react";
import ThemeMenu from "./ds/ThemeMenu.jsx";

const STORAGE_KEY = "adlm:theme";
const VALID = new Set(["light", "dark", "black", "system"]);

function readPreference() {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return VALID.has(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveActive(preference) {
  if (preference === "dark" || preference === "black") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

// Apply / remove the `dark` class and the black shade on <html>. Done outside
// React so it runs as soon as preference resolves — avoids a flash of light UI
// on dark-mode reloads.
function applyClass(active, preference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (active === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  if (preference === "black") root.setAttribute("data-shade", "black");
  else root.removeAttribute("data-shade");
  // Also set a colour-scheme hint so native controls (scrollbars, date
  // pickers, autofill highlights) follow the theme.
  root.style.colorScheme = active === "dark" ? "dark" : "light";
}

const ThemeContext = React.createContext({
  preference: "system",
  active: "light",
  setPreference: () => {},
  toggle: () => {},
  openMenu: () => {},
  closeMenu: () => {},
});

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = React.useState(readPreference);
  const [active, setActive] = React.useState(() => resolveActive(readPreference()));
  // The element the theme menu hangs from, or null when it is shut.
  const [menuAnchor, setMenuAnchor] = React.useState(null);

  // Re-resolve active mode whenever preference changes or the OS theme
  // changes (when preference === "system").
  React.useEffect(() => {
    const next = resolveActive(preference);
    setActive(next);
    applyClass(next, preference);

    if (preference !== "system") return undefined;
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      const resolved = resolveActive("system");
      setActive(resolved);
      applyClass(resolved, "system");
    }
    // addEventListener is the modern path; Safari < 14 needs addListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [preference]);

  const setPreference = React.useCallback((value) => {
    const next = VALID.has(value) ? value : "system";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore (private mode etc.) — runtime state still works
    }
    setPreferenceState(next);
  }, []);

  const toggle = React.useCallback(() => {
    // The classic nav's cycle: light → dark → system → light. His screens
    // open the four-way menu (openMenu) instead.
    setPreference(
      preference === "light"
        ? "dark"
        : preference === "dark"
          ? "system"
          : "light",
    );
  }, [preference, setPreference]);

  const openMenu = React.useCallback((anchor) => {
    setMenuAnchor((cur) => (cur === anchor ? null : anchor || null));
  }, []);
  const closeMenu = React.useCallback(() => setMenuAnchor(null), []);

  const value = React.useMemo(
    () => ({ preference, active, setPreference, toggle, openMenu, closeMenu }),
    [preference, active, setPreference, toggle, openMenu, closeMenu],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {menuAnchor && <ThemeMenu anchor={menuAnchor} onClose={closeMenu} />}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

// Pre-paint flash guard — call once at the top of main.jsx (before
// React mounts) so the initial render is in the correct mode.
export function initThemeBeforeRender() {
  const pref = readPreference();
  applyClass(resolveActive(pref), pref);
}
