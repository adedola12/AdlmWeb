import React from "react";
import { FONT, FONT_DISPLAY, LOGO_SRC } from "../lib/brand.js";
import { Badge, Headline, Subtitle } from "./parts.jsx";

export default function ThumbFeatures({ flyer, accent, days, palette }) {
  const PAD_H = 48;
  const PAD_TOP = 36;

  const bullets = Array.isArray(flyer.bullets) ? flyer.bullets.slice(0, 4) : [];

  // Split into 2 rows × 2 cols
  const topRow = bullets.slice(0, 2);
  const bottomRow = bullets.slice(2, 4);

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
      {/* ── Top bar: ADLM logo left, badge right ── */}
      <div
        style={{
          position: "absolute",
          top: PAD_TOP,
          left: PAD_H,
          right: PAD_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <img
          src={LOGO_SRC}
          crossOrigin="anonymous"
          height={44}
          style={{ objectFit: "contain" }}
          alt="ADLM"
        />
        {flyer.showBadge && flyer.badge && (
          <Badge accent={accent} palette={palette}>
            {flyer.badge}
          </Badge>
        )}
      </div>

      {/* ── Centre hero zone — icon with glow + feature pills ── */}
      <div
        style={{
          position: "absolute",
          top: PAD_TOP + 44 + 16,
          left: 0,
          right: 0,
          height: Math.round(720 * 0.55),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          zIndex: 1,
        }}
      >
        {/* Product icon with glow */}
        <div
          style={{
            width: 160,
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 30,
            boxShadow: `0 0 60px ${accent}55`,
          }}
        >
          <img
            src={LOGO_SRC}
            crossOrigin="anonymous"
            style={{ width: 160, height: 160, objectFit: "contain" }}
            alt=""
          />
        </div>

        {/* Feature pills — 2-col grid */}
        {bullets.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px 16px",
              width: "auto",
              maxWidth: 860,
            }}
          >
            {[...topRow, ...bottomRow].map((text, i) => (
              <div
                key={i}
                style={{
                  background: palette.panel,
                  border: `1.5px solid ${palette.border}`,
                  borderRadius: 999,
                  padding: "12px 20px",
                  fontSize: 20,
                  fontWeight: 600,
                  color: palette.text,
                  fontFamily: FONT,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: accent, fontSize: 22, lineHeight: 1 }}>•</span>
                {text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom third: Headline + Subtitle ── */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: PAD_H,
          right: PAD_H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          zIndex: 2,
        }}
      >
        <Headline
          title={flyer.title || "Feature Highlights"}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          palette={palette}
          size={52}
          center={true}
          lineHeight={1.0}
        />
        {flyer.subtitle && (
          <Subtitle palette={palette} size={22} center={true} maxWidth={800}>
            {flyer.subtitle}
          </Subtitle>
        )}
      </div>

      {/* ── Full-width accent rule at bottom ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: accent,
          zIndex: 3,
        }}
      />
    </div>
  );
}
