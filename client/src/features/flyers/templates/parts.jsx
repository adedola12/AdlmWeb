// Shared presentational atoms used by every flyer template body. Keeping these
// here means the 4 templates stay visually consistent (same pill, same headline
// treatment, same accent rule) and the template files stay small.
import React from "react";
import { FONT, FONT_DISPLAY, WHITE } from "../lib/brand.js";
import { highlightWords } from "../lib/helpers.js";

// Short accent bar — the ADLM equivalent of the NIQS gold "eyebrow" rule.
export function Rule({ accent, w = 56, center = false }) {
  return (
    <span
      style={{
        display: "block",
        width: w,
        height: 4,
        background: accent,
        borderRadius: 4,
        margin: center ? "0 auto" : 0,
      }}
    />
  );
}

// Eyebrow / category pill, e.g. "BIM COURSE", "COUNTDOWN".
export function Badge({ children, accent, center = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.16)",
        alignSelf: center ? "center" : "flex-start",
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: accent,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: FONT,
          fontSize: 17,
          fontWeight: 700,
          color: WHITE,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    </div>
  );
}

// Big display headline with one accent-coloured word.
export function Headline({
  title,
  highlightWordIndex,
  accent,
  size = 92,
  center = false,
  lineHeight = 0.98,
}) {
  const words = highlightWords(title, highlightWordIndex, accent);
  return (
    <h1
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: 800,
        color: WHITE,
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
export function Subtitle({ children, center = false, size = 30, maxWidth }) {
  if (!children) return null;
  return (
    <p
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 400,
        color: "rgba(255,255,255,0.66)",
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
