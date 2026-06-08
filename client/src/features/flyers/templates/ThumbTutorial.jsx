import React from "react";
import { FONT, FONT_DISPLAY, LOGO_SRC } from "../lib/brand.js";
import { Badge, Headline, Subtitle } from "./parts.jsx";

export default function ThumbTutorial({ flyer, accent, days, palette }) {
  const LEFT_W = Math.round(1280 * 0.55);
  const RIGHT_W = 1280 - LEFT_W;
  const PAD = 48;

  const hasImage = Boolean(flyer.heroImage);

  return (
    <div
      style={{
        position: "relative",
        width: 1280,
        height: 720,
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: FONT,
        display: "flex",
      }}
    >
      {/* ── Left half ── */}
      <div
        style={{
          width: LEFT_W,
          height: 720,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          padding: PAD,
          boxSizing: "border-box",
          gap: 18,
        }}
      >
        {/* ADLM logo */}
        <img
          src={LOGO_SRC}
          crossOrigin="anonymous"
          height={40}
          style={{ objectFit: "contain", alignSelf: "flex-start" }}
          alt="ADLM"
        />

        {/* Badge */}
        {flyer.showBadge && flyer.badge && (
          <Badge accent={accent} palette={palette}>
            {flyer.badge}
          </Badge>
        )}

        {/* Headline */}
        <Headline
          title={flyer.title || "Tutorial Title"}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          palette={palette}
          size={72}
          center={false}
          lineHeight={0.97}
        />

        {/* Subtitle */}
        {flyer.subtitle && (
          <Subtitle palette={palette} size={24} maxWidth={LEFT_W - PAD * 2}>
            {flyer.subtitle}
          </Subtitle>
        )}

        {/* Spacer pushes TUTORIAL pill to bottom */}
        <div style={{ flex: 1 }} />

        {/* TUTORIAL pill */}
        <div style={{ alignSelf: "flex-start" }}>
          <span
            style={{
              display: "inline-block",
              background: accent,
              color: "#ffffff",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 22,
              padding: "10px 22px",
              borderRadius: 999,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Tutorial
          </span>
        </div>
      </div>

      {/* ── Right half — device frame ── */}
      <div
        style={{
          width: RIGHT_W,
          height: 720,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "36px 36px 36px 0",
          boxSizing: "border-box",
        }}
      >
        {/* Elevated card wrapper */}
        <div
          style={{
            width: "100%",
            height: "100%",
            background: palette.panel,
            borderRadius: 14,
            padding: 10,
            boxSizing: "border-box",
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Browser top bar */}
          <div
            style={{
              height: 40,
              background: "rgba(0,0,20,0.5)",
              borderRadius: "6px 6px 0 0",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              gap: 7,
            }}
          >
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span
                key={c}
                style={{ width: 12, height: 12, borderRadius: "50%", background: c, flexShrink: 0 }}
              />
            ))}
          </div>

          {/* Content area */}
          <div
            style={{
              flex: 1,
              borderRadius: "0 0 6px 6px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {hasImage ? (
              <img
                src={flyer.heroImage}
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                alt=""
              />
            ) : (
              /* Branded placeholder */
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: `linear-gradient(135deg, ${accent}44, ${accent}18)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                }}
              >
                <img
                  src={LOGO_SRC}
                  crossOrigin="anonymous"
                  height={56}
                  style={{ objectFit: "contain", opacity: 0.7 }}
                  alt=""
                />
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 16,
                    fontWeight: 400,
                    color: palette.textFaint,
                    letterSpacing: "0.04em",
                  }}
                >
                  Upload a screenshot
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
