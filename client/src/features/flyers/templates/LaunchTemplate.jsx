// LaunchTemplate — product / website showcase. Theme-aware via `palette`.
// Text block on top; a hero screenshot framed as a browser window, laptop, or
// plain rounded rect on a subtle elevated panel below.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";

function HeroMedia({ src, palette }) {
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
          border: `2px dashed ${palette.border}`,
          borderRadius: 14,
          color: palette.textFaint,
          fontSize: 26,
          fontWeight: 500,
          boxSizing: "border-box",
        }}
      >
        Upload a screenshot / hero image
      </div>
    );
  }
  return <img src={src} crossOrigin="anonymous" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}

function Dot({ color }) {
  return <span style={{ width: 14, height: 14, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

export default function LaunchTemplate({ flyer, accent, days, palette }) {
  const frame = flyer.heroFrame || "none";
  const barBg = palette.isLight ? "#e7edf6" : "rgba(255,255,255,0.06)";
  const surface = palette.panel;

  let innerFrame;
  if (frame === "browser") {
    innerFrame = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden", background: surface }}>
        <div style={{ height: 44, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: barBg }}>
          <Dot color="#ff5f57" />
          <Dot color="#febc2e" />
          <Dot color="#28c840" />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <HeroMedia src={flyer.heroImage} palette={palette} />
        </div>
      </div>
    );
  } else if (frame === "laptop") {
    innerFrame = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, borderRadius: 16, overflow: "hidden", background: surface }}>
          <HeroMedia src={flyer.heroImage} palette={palette} />
        </div>
        <div style={{ height: 26, flexShrink: 0, marginTop: 6, borderRadius: 10, background: barBg }} />
      </div>
    );
  } else {
    innerFrame = (
      <div style={{ width: "100%", height: "100%", borderRadius: 18, overflow: "hidden" }}>
        <HeroMedia src={flyer.heroImage} palette={palette} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 28 }}>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 22 }}>
        {flyer.showBadge && <Badge accent={accent} palette={palette}>{flyer.badge}</Badge>}
        <Headline title={flyer.title} highlightWordIndex={flyer.highlightWordIndex} accent={accent} palette={palette} size={104} />
        {flyer.subtitle && <Subtitle palette={palette} size={30} maxWidth={760}>{flyer.subtitle}</Subtitle>}
        <Rule accent={accent} />
      </div>

      <div style={{ flex: 1, minHeight: 0, background: surface, borderRadius: 20, padding: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.25)", boxSizing: "border-box" }}>
        <div style={{ width: "100%", height: "100%" }}>{innerFrame}</div>
      </div>
    </div>
  );
}
