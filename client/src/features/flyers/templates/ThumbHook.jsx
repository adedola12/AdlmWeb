import React from "react";
import { FONT, FONT_DISPLAY, LOGO_SRC } from "../lib/brand.js";
import { Badge, Subtitle } from "./parts.jsx";

export default function ThumbHook({ flyer, accent, days, palette }) {
  const PAD = 36;

  // Split title: first word(s) giant in accent, remaining words in palette.text.
  // highlightWordIndex controls the split; defaults to 1 word (index 0).
  const rawTitle = String(flyer.title || "BIG HOOK");
  const words = rawTitle.split(" ");

  const splitAt =
    flyer.highlightWordIndex != null && flyer.highlightWordIndex >= 1
      ? flyer.highlightWordIndex
      : 1;

  const accentWords = words.slice(0, splitAt).join(" ");
  const restWords = words.slice(splitAt).join(" ");

  return (
    <div
      style={{
        position: "relative",
        width: 1280,
        height: 720,
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: FONT,
      }}
    >
      {/* Right vertical accent stripe */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 64,
          width: 8,
          height: 720,
          background: accent,
          zIndex: 2,
        }}
      />

      {/* Top-left: ADLM logo + optional badge stacked */}
      <div
        style={{
          position: "absolute",
          top: PAD,
          left: PAD,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          zIndex: 3,
        }}
      >
        <img
          src={LOGO_SRC}
          crossOrigin="anonymous"
          height={44}
          style={{ objectFit: "contain", alignSelf: "flex-start" }}
          alt="ADLM"
        />
        {flyer.showBadge && flyer.badge && (
          <Badge accent={accent} palette={palette}>
            {flyer.badge}
          </Badge>
        )}
      </div>

      {/* Main hook text block — vertically centred, left-aligned */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: PAD,
          right: 100, // clear the stripe + padding
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 0,
          zIndex: 1,
        }}
      >
        {/* First word(s) — giant accent */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 220,
            fontWeight: 800,
            color: accent,
            letterSpacing: "-0.04em",
            lineHeight: 0.85,
            margin: 0,
          }}
        >
          {accentWords}
        </div>

        {/* Remaining words — large, palette text */}
        {restWords && (
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 80,
              fontWeight: 700,
              color: palette.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.0,
              margin: 0,
              marginTop: 4,
            }}
          >
            {restWords}
          </div>
        )}

        {/* Subtitle */}
        {flyer.subtitle && (
          <div style={{ marginTop: 20 }}>
            <Subtitle palette={palette} size={26} center={false}>
              {flyer.subtitle}
            </Subtitle>
          </div>
        )}
      </div>
    </div>
  );
}
