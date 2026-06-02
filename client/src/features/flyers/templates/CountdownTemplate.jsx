// Countdown template body — "N days to go". Theme-aware via `palette`. `days`
// is precomputed by FlyerCanvas (= daysUntil(flyer.launchDate)).
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";

export default function CountdownTemplate({ flyer, accent, days, palette }) {
  const hasDate = !!flyer.launchDate;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
      {/* Top: the giant day count (or a muted placeholder) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {hasDate ? (
          <>
            <span style={{ display: "block", fontSize: 300, fontWeight: 800, color: palette.text, lineHeight: 0.85, letterSpacing: "-0.05em" }}>
              {String(days)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ fontSize: 34, fontWeight: 600, color: palette.textSoft, letterSpacing: "0.01em", lineHeight: 1 }}>
                {flyer.countdownLabel}
              </span>
              <Rule accent={accent} w={88} />
            </div>
          </>
        ) : (
          <span style={{ display: "block", fontSize: 40, fontWeight: 600, color: palette.textFaint, lineHeight: 1.1 }}>
            — set a launch date —
          </span>
        )}
      </div>

      {/* Bottom: event info block */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {flyer.showBadge && <Badge accent={accent} palette={palette}>{flyer.badge}</Badge>}
        <Headline title={flyer.title} highlightWordIndex={flyer.highlightWordIndex} accent={accent} palette={palette} size={58} />
        <Subtitle palette={palette}>{flyer.subtitle}</Subtitle>
      </div>
    </div>
  );
}
