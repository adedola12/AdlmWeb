// Countdown template body — "N days to go".
//
// Rendered inside FlyerCanvas's body zone (see the TEMPLATE BODY CONTRACT in
// FlyerCanvas.jsx). White text on the dark navy canvas, one ADLM-orange accent.
// Left-aligned flex column that fills the available height: a GIANT day count
// up top, the event info block anchored at the bottom.
//
// `days` is precomputed by FlyerCanvas (= daysUntil(flyer.launchDate)); we use
// it directly and never recompute. When no launch date is set we show a muted
// placeholder instead of the number.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";
import { WHITE } from "../lib/brand.js";

export default function CountdownTemplate({ flyer, accent, days }) {
  const hasDate = !!flyer.launchDate;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      {/* ── Top: the giant day count (or a muted placeholder) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {hasDate ? (
          <>
            <span
              style={{
                display: "block",
                fontSize: 300,
                fontWeight: 800,
                color: WHITE,
                lineHeight: 0.85,
                letterSpacing: "-0.05em",
              }}
            >
              {String(days)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.72)",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                }}
              >
                {flyer.countdownLabel}
              </span>
              <Rule accent={accent} w={88} />
            </div>
          </>
        ) : (
          <span
            style={{
              display: "block",
              fontSize: 40,
              fontWeight: 600,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.01em",
              lineHeight: 1.1,
            }}
          >
            — set a launch date —
          </span>
        )}
      </div>

      {/* ── Bottom: event info block ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {flyer.showBadge && <Badge accent={accent}>{flyer.badge}</Badge>}
        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          size={58}
        />
        <Subtitle>{flyer.subtitle}</Subtitle>
      </div>
    </div>
  );
}
