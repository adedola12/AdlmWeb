// tailwind.config.js
//
// Dark mode is opt-in via the `dark` class on <html>. The ThemeProvider
// (src/store/theme.jsx) flips that class based on user preference +
// localStorage, then `dark:` Tailwind variants light up across the app.
//
// Dark palette is derived from the existing ADLM navy/orange/blue
// identity — same brand feel, just inverted. Surface tokens follow a
// 50→900 scale so any place using slate-* in light mode has a clean
// dark equivalent.

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Lexend", "sans-serif"],
        display: ["Lexend", "sans-serif"],
      },
      colors: {
        adlm: {
          orange: "#E86A27",
          blue: {
            // 400 / 500 are friendlier on dark backgrounds — same hue,
            // higher luminance so text + icons stay legible.
            400: "#5cb3ff",
            500: "#36a3ff",
            600: "#239cff",
            700: "#005be3",
          },
          navy: {
            DEFAULT: "#05111f",
            deep: "#040d18",
            mid: "#061528",
            tertiary: "#091e39",
          },
          // ── Dark-mode surfaces ─────────────────────────────────────
          // bg     = page background (replaces light slate-50)
          // panel  = card / modal surface (replaces white)
          // raised = elevated card (slightly lighter than panel)
          // border = subtle border / divider
          // text   = primary text (replaces slate-900)
          // muted  = secondary text (replaces slate-500/600)
          // dim    = tertiary text (replaces slate-400)
          dark: {
            bg: "#0a1320",
            panel: "#101e33",
            raised: "#162842",
            border: "#1f3559",
            hover: "#1a2d4a",
            text: "#e2e8f0",
            muted: "#94a3b8",
            dim: "#64748b",
          },
        },
      },
      borderRadius: {
        adlm: "8px",
        "adlm-lg": "12px",
        "adlm-xl": "16px",
      },
    },
  },
  plugins: [],
};
