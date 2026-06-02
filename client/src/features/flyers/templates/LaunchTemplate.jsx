// ──────────────────────────────────────────────────────────────────────────
// LaunchTemplate — product / website showcase flyer body.
// ──────────────────────────────────────────────────────────────────────────
// Top: text block (badge → headline → subtitle), flex-shrink 0.
// Bottom: a hero screenshot framed as a browser window, a laptop screen, or a
// plain rounded rect, sitting on a subtle elevated panel. Fills the lower zone.
//
// Renders ONLY the middle body (FlyerCanvas owns the dark bg, logo header and
// contact bar). White text on dark; `accent` is the single ADLM highlight.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";

// One dot for the browser chrome traffic-lights.
function Dot({ color }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// The actual hero <img>, or a dashed placeholder when none is supplied.
function HeroMedia({ src }) {
  if (!src) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 32,
          border: "2px dashed rgba(255,255,255,0.2)",
          borderRadius: 14,
          color: "rgba(255,255,255,0.4)",
          fontSize: 26,
          fontWeight: 500,
          boxSizing: "border-box",
        }}
      >
        Upload a screenshot / hero image
      </div>
    );
  }
  return (
    <img
      src={src}
      crossOrigin="anonymous"
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

export default function LaunchTemplate({ flyer, accent, days }) {
  const frame = flyer.heroFrame || "none";
  const hasImage = !!flyer.heroImage;

  // Inner frame: the rounded surface that directly clips the hero media.
  let innerFrame;
  if (frame === "browser") {
    innerFrame = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {/* top bar with traffic-light dots */}
        <div
          style={{
            height: 44,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <Dot color="#ff5f57" />
          <Dot color="#febc2e" />
          <Dot color="#28c840" />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <HeroMedia src={flyer.heroImage} />
        </div>
      </div>
    );
  } else if (frame === "laptop") {
    innerFrame = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* screen */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <HeroMedia src={flyer.heroImage} />
        </div>
        {/* base bar beneath the screen */}
        <div
          style={{
            height: 26,
            flexShrink: 0,
            marginTop: 6,
            borderRadius: 10,
            background: "rgba(255,255,255,0.10)",
          }}
        />
      </div>
    );
  } else {
    innerFrame = (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <HeroMedia src={flyer.heroImage} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 28,
      }}
    >
      {/* ── text block ── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 22,
        }}
      >
        {flyer.showBadge && <Badge accent={accent}>{flyer.badge}</Badge>}
        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          size={104}
        />
        {flyer.subtitle && (
          <Subtitle size={30} maxWidth={760}>
            {flyer.subtitle}
          </Subtitle>
        )}
        <Rule accent={accent} />
      </div>

      {/* ── hero on an elevated panel ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 20,
          padding: 14,
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: "100%", height: "100%" }}>{innerFrame}</div>
      </div>
    </div>
  );
}
