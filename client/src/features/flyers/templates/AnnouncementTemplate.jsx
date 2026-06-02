// AnnouncementTemplate — the "Coming Soon" teaser body.
//
// Renders ONLY the middle zone (FlyerCanvas paints the navy bg, ADLM logo
// header, and bottom contact bar). White text on dark, one ADLM-orange accent.
// A left-aligned flex column that fills the available height: badge + headline +
// subtitle pinned to the top, and a bold CSS-only "COMING SOON" hero lockup
// pinned to the bottom. No external/raster art — the hero is pure CSS.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";
import { FONT_DISPLAY, WHITE } from "../lib/brand.js";

export default function AnnouncementTemplate({ flyer, accent, days }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 32,
      }}
    >
      {/* Top cluster: eyebrow + headline + supporting line */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 26,
        }}
      >
        {flyer.showBadge && <Badge accent={accent}>{flyer.badge}</Badge>}

        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          size={96}
        />

        {flyer.subtitle && <Subtitle maxWidth={760}>{flyer.subtitle}</Subtitle>}
      </div>

      {/* Bottom hero: CSS-only "COMING SOON" lockup on a translucent slab */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 24,
          width: "100%",
        }}
      >
        <Rule accent={accent} w={88} />

        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "44px 56px",
            borderRadius: 28,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 120,
              fontWeight: 800,
              color: WHITE,
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
            }}
          >
            COMING
          </span>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 120,
              fontWeight: 800,
              color: accent,
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
            }}
          >
            SOON
          </span>
        </div>
      </div>
    </div>
  );
}
