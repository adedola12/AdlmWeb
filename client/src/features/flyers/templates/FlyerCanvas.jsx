// ──────────────────────────────────────────────────────────────────────────
// FlyerCanvas — the root 1080×1350 renderer + shared chrome.
// ──────────────────────────────────────────────────────────────────────────
// Layout is a fixed-size box with a padded flex-column of content on top of a
// background layer:
//
//   ┌───────────────────────────── 1080 × 1350 ─────────────────────────────┐
//   │ background (solid/gradient/image) + corner glow                        │
//   │ ┌────────── content (padding 72px) ──────────┐                         │
//   │ │ HEADER  → ADLM logo · partner logo          │  (flex-shrink: 0)      │
//   │ │ BODY    → <TemplateBody/> fills this zone    │  (flex: 1)             │
//   │ └─────────────────────────────────────────────┘                        │
//   │ CONTACT BAR (absolute, bottom) — optional                              │
//   └────────────────────────────────────────────────────────────────────────┘
//
// TEMPLATE BODY CONTRACT — each of the 4 template files is a default export:
//
//     export default function XTemplate({ flyer, accent, days }) { ... }
//
//   • `flyer` — the full flyer object (see lib/defaults.js)
//   • `accent` — resolved accent colour (flyer.accent)
//   • `days`  — days until flyer.launchDate (computed once here)
//   The body should return content that fills the available height (use flex /
//   justifyContent on its own root). It owns the Badge / Headline / Subtitle.
// ──────────────────────────────────────────────────────────────────────────
import React, { forwardRef } from "react";
import {
  CANVAS_W,
  CANVAS_H,
  NAVY,
  WHITE,
  FONT,
  LOGO_SRC,
} from "../lib/brand.js";
import { resolveBackground } from "../lib/backgrounds.js";
import { daysUntil } from "../lib/helpers.js";
import AnnouncementTemplate from "./AnnouncementTemplate.jsx";
import CountdownTemplate from "./CountdownTemplate.jsx";
import LaunchTemplate from "./LaunchTemplate.jsx";
import EventTemplate from "./EventTemplate.jsx";

const PAD = 72;
const BAR_H = 96;

const BODIES = {
  announcement: AnnouncementTemplate,
  countdown: CountdownTemplate,
  launch: LaunchTemplate,
  event: EventTemplate,
};

function Header({ flyer }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        flexShrink: 0,
        minHeight: 64,
      }}
    >
      <img
        src={LOGO_SRC}
        alt="ADLM Studio"
        crossOrigin="anonymous"
        style={{ height: 60, width: "auto", objectFit: "contain" }}
      />
      {flyer.partnerLogo && (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span
            style={{
              width: 1,
              height: 44,
              background: "rgba(255,255,255,0.18)",
            }}
          />
          <img
            src={flyer.partnerLogo}
            alt="Partner"
            crossOrigin="anonymous"
            style={{ height: 56, width: "auto", maxWidth: 300, objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}

function ContactBar({ flyer, accent }) {
  const showWebsite = flyer.showWebsite && flyer.website;
  return (
    <div
      style={{
        position: "absolute",
        left: PAD,
        right: PAD,
        bottom: 40,
        height: BAR_H - 24,
        borderRadius: 18,
        background:
          "linear-gradient(145deg, rgba(0,91,227,0.92) 0%, rgba(54,163,255,0.92) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 32px",
        boxShadow: "0 12px 40px rgba(0,91,227,0.28)",
      }}
    >
      <span
        style={{
          fontFamily: FONT,
          fontSize: 24,
          fontWeight: 600,
          color: WHITE,
          letterSpacing: "0.01em",
          textAlign: "center",
        }}
      >
        {flyer.contact}
      </span>
      {showWebsite && (
        <>
          <span style={{ width: 1, height: 28, background: "rgba(255,255,255,0.4)" }} />
          <span
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 700,
              color: WHITE,
            }}
          >
            {flyer.website}
          </span>
        </>
      )}
    </div>
  );
}

const FlyerCanvas = forwardRef(function FlyerCanvas({ flyer }, ref) {
  const accent = flyer.accent || "#E86A27";
  const bgStyle = resolveBackground(flyer.background, flyer.backgroundImage);
  const isImageBg = !!flyer.backgroundImage;
  const days = daysUntil(flyer.launchDate);
  const Body = BODIES[flyer.template] || AnnouncementTemplate;
  const bottomPad = flyer.showContactBar ? BAR_H + 32 : PAD;

  return (
    <div
      ref={ref}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT,
        boxSizing: "border-box",
        color: WHITE,
        ...(bgStyle.background ? { background: bgStyle.background } : { background: NAVY }),
        ...bgStyle,
      }}
    >
      {/* darken uploaded photo backgrounds so text stays legible */}
      {isImageBg && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(5,17,31,0.55), rgba(4,13,24,0.78))",
            pointerEvents: "none",
          }}
        />
      )}
      {/* accent corner glow */}
      <div
        style={{
          position: "absolute",
          bottom: -120,
          right: -120,
          width: 460,
          height: 460,
          background: `radial-gradient(circle, ${accent}26 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: `${PAD}px ${PAD}px ${bottomPad}px ${PAD}px`,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          zIndex: 1,
          boxSizing: "border-box",
        }}
      >
        <Header flyer={flyer} />
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Body flyer={flyer} accent={accent} days={days} />
        </div>
      </div>

      {flyer.showContactBar && <ContactBar flyer={flyer} accent={accent} />}
    </div>
  );
});

export default FlyerCanvas;
