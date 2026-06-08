import React from "react";
import { FONT, FONT_DISPLAY, LOGO_SRC } from "../lib/brand.js";
import { Badge, Headline, Subtitle } from "./parts.jsx";

export default function ThumbBoldTitle({ flyer, accent, days, palette }) {
  const PAD = 48;
  const RIGHT_W = Math.round(1280 * 0.38);

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
      {/* Right accent block — split-screen panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: RIGHT_W,
          height: 720,
          background: accent,
          boxShadow: `inset -60px 0 120px rgba(0,0,0,0.18), inset 0 0 80px rgba(255,255,255,0.08)`,
          zIndex: 0,
        }}
      >
        {/* Thin horizontal lines on the accent block */}
        <div
          style={{
            position: "absolute",
            top: "35%",
            left: 0,
            right: 0,
            height: 2,
            background: "rgba(255,255,255,0.25)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "65%",
            left: 0,
            right: 0,
            height: 2,
            background: "rgba(255,255,255,0.25)",
          }}
        />

        {/* ADLM icon centred on the accent block */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={LOGO_SRC}
            crossOrigin="anonymous"
            height={120}
            style={{ objectFit: "contain", filter: "brightness(0) invert(1) opacity(0.85)" }}
            alt=""
          />
        </div>
      </div>

      {/* Left content area */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1280 - RIGHT_W,
          height: 720,
          display: "flex",
          flexDirection: "column",
          padding: PAD,
          boxSizing: "border-box",
          zIndex: 1,
        }}
      >
        {/* ADLM logo top-left */}
        <img
          src={LOGO_SRC}
          crossOrigin="anonymous"
          height={44}
          style={{ objectFit: "contain", alignSelf: "flex-start" }}
          alt="ADLM"
        />

        {/* Vertically centred content block */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 20,
          }}
        >
          {flyer.showBadge && flyer.badge && (
            <Badge accent={accent} palette={palette}>
              {flyer.badge}
            </Badge>
          )}

          <Headline
            title={flyer.title || "Bold Title"}
            highlightWordIndex={flyer.highlightWordIndex}
            accent={accent}
            palette={palette}
            size={100}
            center={false}
            lineHeight={0.96}
          />

          {flyer.subtitle && (
            <Subtitle palette={palette} size={30} maxWidth={680}>
              {flyer.subtitle}
            </Subtitle>
          )}
        </div>
      </div>

      {/* Bottom accent strip */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          background: accent,
          zIndex: 2,
        }}
      />
    </div>
  );
}
