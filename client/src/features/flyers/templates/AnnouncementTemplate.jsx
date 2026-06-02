// AnnouncementTemplate — the "Coming Soon" teaser body. Theme-aware: reads
// colours from `palette` so it works on light and dark Styles. FlyerCanvas
// paints the background, ADLM logo header, and bottom contact bar.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";
import { FONT_DISPLAY } from "../lib/brand.js";

export default function AnnouncementTemplate({ flyer, accent, days, palette }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start", gap: 32 }}>
      {/* Top: eyebrow + headline + supporting line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 26 }}>
        {flyer.showBadge && <Badge accent={accent} palette={palette}>{flyer.badge}</Badge>}
        <Headline title={flyer.title} highlightWordIndex={flyer.highlightWordIndex} accent={accent} palette={palette} size={96} />
        {flyer.subtitle && <Subtitle palette={palette} maxWidth={760}>{flyer.subtitle}</Subtitle>}
      </div>

      {/* Bottom hero: CSS-only "COMING SOON" lockup on a translucent slab */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 24, width: "100%" }}>
        <Rule accent={accent} w={88} />
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "44px 56px",
            borderRadius: 28,
            background: palette.panel,
            border: `1px solid ${palette.border}`,
          }}
        >
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 120, fontWeight: 800, color: palette.text, lineHeight: 0.9, letterSpacing: "-0.02em" }}>COMING</span>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 120, fontWeight: 800, color: accent, lineHeight: 0.9, letterSpacing: "-0.02em" }}>SOON</span>
        </div>
      </div>
    </div>
  );
}
