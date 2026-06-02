// ──────────────────────────────────────────────────────────────────────────
// FlyerCanvas — the root 1080×1350 renderer + shared, theme-aware chrome.
// ──────────────────────────────────────────────────────────────────────────
// Background plate + corner glow, a padded flex-column of content (logo header
// + template body), and an optional contact bar. The Style sets the theme
// (light/dark) → `palette`, which the header, body and bar all read.
//
// TEMPLATE BODY CONTRACT — each template file is a default export:
//     export default function XTemplate({ flyer, accent, days, palette }) { ... }
//   It returns content that fills the available height (flex on its own root),
//   reads colours from `palette` (palette.text / textSoft / panel / border …),
//   and owns its Badge / Headline / Subtitle.
// ──────────────────────────────────────────────────────────────────────────
import React, { forwardRef } from "react";
import { CANVAS_W, CANVAS_H, NAVY, WHITE, FONT, LOGO_LIGHTBG, LOGO_DARKBG } from "../lib/brand.js";
import { resolveBackground } from "../lib/backgrounds.js";
import { getPalette } from "../lib/styles.js";
import { daysUntil } from "../lib/helpers.js";
import AnnouncementTemplate from "./AnnouncementTemplate.jsx";
import CountdownTemplate from "./CountdownTemplate.jsx";
import LaunchTemplate from "./LaunchTemplate.jsx";
import EventTemplate from "./EventTemplate.jsx";
import SubscriptionTemplate from "./SubscriptionTemplate.jsx";
import TicketTemplate from "./TicketTemplate.jsx";

const PAD = 72;
const BAR_H = 96;

const BODIES = {
  announcement: AnnouncementTemplate,
  countdown: CountdownTemplate,
  launch: LaunchTemplate,
  event: EventTemplate,
  subscription: SubscriptionTemplate,
  ticket: TicketTemplate,
};

function Header({ flyer, palette }) {
  const logo = palette.isLight ? LOGO_LIGHTBG : LOGO_DARKBG;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexShrink: 0, minHeight: 64 }}>
      <img src={logo} alt="ADLM Studio" crossOrigin="anonymous" style={{ height: 58, width: "auto", objectFit: "contain" }} />
      {flyer.partnerLogo && (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ width: 1, height: 44, background: palette.border }} />
          <img src={flyer.partnerLogo} alt="Partner" crossOrigin="anonymous" style={{ height: 54, width: "auto", maxWidth: 300, objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

function ContactBar({ flyer }) {
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
        background: "linear-gradient(145deg, rgba(0,91,227,0.95) 0%, rgba(54,163,255,0.95) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 32px",
        boxShadow: "0 12px 40px rgba(0,91,227,0.30)",
      }}
    >
      <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 600, color: WHITE, textAlign: "center" }}>{flyer.contact}</span>
      {showWebsite && (
        <>
          <span style={{ width: 1, height: 28, background: "rgba(255,255,255,0.4)" }} />
          <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: WHITE }}>{flyer.website}</span>
        </>
      )}
    </div>
  );
}

const FlyerCanvas = forwardRef(function FlyerCanvas({ flyer }, ref) {
  const accent = flyer.accent || "#E86A27";
  const palette = getPalette(flyer.theme);
  const bgStyle = resolveBackground(flyer.background, flyer.backgroundImage);
  const isUploadedImg = !!flyer.backgroundImage;
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
        color: palette.text,
        ...(bgStyle.background ? { background: bgStyle.background } : { background: palette.isLight ? "#ffffff" : NAVY }),
        ...bgStyle,
      }}
    >
      {/* darken only uploaded photo backgrounds on dark themes (keep text legible) */}
      {isUploadedImg && !palette.isLight && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,17,31,0.55), rgba(4,13,24,0.78))", pointerEvents: "none" }} />
      )}
      {/* accent corner glow */}
      <div
        style={{
          position: "absolute",
          bottom: -120,
          right: -120,
          width: 460,
          height: 460,
          background: `radial-gradient(circle, ${accent}22 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

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
        <Header flyer={flyer} palette={palette} />
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Body flyer={flyer} accent={accent} days={days} palette={palette} />
        </div>
      </div>

      {flyer.showContactBar && <ContactBar flyer={flyer} />}
    </div>
  );
});

export default FlyerCanvas;
