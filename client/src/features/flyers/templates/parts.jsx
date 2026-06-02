// Shared presentational atoms used by every flyer template body. Theme-aware:
// each accepts a `palette` (from styles.getPalette) so the same atom renders
// correctly on light (navy-on-white) and dark (white-on-navy) flyers.
import React from "react";
import { FONT, FONT_DISPLAY } from "../lib/brand.js";
import { getPalette } from "../lib/styles.js";
import { highlightWords } from "../lib/helpers.js";

const DARK = getPalette("dark");

// Short accent bar — the ADLM accent "eyebrow" rule.
export function Rule({ accent, w = 56, center = false }) {
  return (
    <span style={{ display: "block", width: w, height: 4, background: accent, borderRadius: 4, margin: center ? "0 auto" : 0 }} />
  );
}

// Eyebrow / category pill, e.g. "BIM COURSE".
export function Badge({ children, accent, palette = DARK, center = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        borderRadius: 999,
        background: palette.panel,
        border: `1px solid ${palette.border}`,
        alignSelf: center ? "center" : "flex-start",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      <span style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, color: palette.text, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1 }}>
        {children}
      </span>
    </div>
  );
}

// Big display headline with one accent-coloured word.
export function Headline({ title, highlightWordIndex, accent, palette = DARK, size = 92, center = false, lineHeight = 0.98 }) {
  const words = highlightWords(title, highlightWordIndex, accent);
  return (
    <h1
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: 800,
        color: palette.text,
        letterSpacing: "-0.02em",
        lineHeight,
        margin: 0,
        textAlign: center ? "center" : "left",
      }}
    >
      {words.map((w, i) => (
        <span key={i} style={w.color ? { color: w.color } : undefined}>
          {w.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h1>
  );
}

// Muted supporting line under the headline.
export function Subtitle({ children, palette = DARK, center = false, size = 30, maxWidth }) {
  if (!children) return null;
  return (
    <p
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 400,
        color: palette.textSoft,
        lineHeight: 1.4,
        margin: 0,
        textAlign: center ? "center" : "left",
        maxWidth,
        ...(center && maxWidth ? { marginLeft: "auto", marginRight: "auto" } : {}),
      }}
    >
      {children}
    </p>
  );
}
