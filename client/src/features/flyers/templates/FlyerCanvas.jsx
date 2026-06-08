// FlyerCanvas — root renderer for both formats.
// Portrait flyer  (1080×1350): ADLM logo header + body + optional contact bar.
// YouTube thumb   (1280×720):  Background only; each ThumbXxx template is
//                              full-canvas and renders its own logo + content.
import React, { forwardRef } from "react";
import { CANVAS_W, CANVAS_H, NAVY, WHITE, FONT, LOGO_LIGHTBG, LOGO_DARKBG } from "../lib/brand.js";
import { resolveBackground } from "../lib/backgrounds.js";
import { getPalette } from "../lib/styles.js";
import { getFormat } from "../lib/formats.js";
import { daysUntil } from "../lib/helpers.js";

// portrait templates
import AnnouncementTemplate from "./AnnouncementTemplate.jsx";
import CountdownTemplate    from "./CountdownTemplate.jsx";
import LaunchTemplate       from "./LaunchTemplate.jsx";
import EventTemplate        from "./EventTemplate.jsx";
import SubscriptionTemplate from "./SubscriptionTemplate.jsx";
import TicketTemplate       from "./TicketTemplate.jsx";

// thumbnail templates
import ThumbBoldTitle  from "./ThumbBoldTitle.jsx";
import ThumbTutorial   from "./ThumbTutorial.jsx";
import ThumbFeatures   from "./ThumbFeatures.jsx";
import ThumbHook       from "./ThumbHook.jsx";

const PAD     = 72;
const BAR_H   = 96;

const BODIES = {
  announcement: AnnouncementTemplate,
  countdown:    CountdownTemplate,
  launch:       LaunchTemplate,
  event:        EventTemplate,
  subscription: SubscriptionTemplate,
  ticket:       TicketTemplate,
  thumbBold:    ThumbBoldTitle,
  thumbTutorial:ThumbTutorial,
  thumbFeatures:ThumbFeatures,
  thumbHook:    ThumbHook,
};

function PortraitHeader({ flyer, palette }) {
  const logo = palette.isLight ? LOGO_LIGHTBG : LOGO_DARKBG;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:24, flexShrink:0, minHeight:64 }}>
      <img src={logo} alt="ADLM Studio" crossOrigin="anonymous" style={{ height:58, width:"auto", objectFit:"contain" }} />
      {flyer.partnerLogo && (
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <span style={{ width:1, height:44, background:palette.border }} />
          <img src={flyer.partnerLogo} alt="Partner" crossOrigin="anonymous" style={{ height:54, width:"auto", maxWidth:300, objectFit:"contain" }} />
        </div>
      )}
    </div>
  );
}

function ContactBar({ flyer }) {
  return (
    <div style={{ position:"absolute", left:PAD, right:PAD, bottom:40, height:BAR_H-24, borderRadius:18, background:"linear-gradient(145deg,rgba(0,91,227,.95),rgba(54,163,255,.95))", display:"flex", alignItems:"center", justifyContent:"center", gap:18, padding:"0 32px", boxShadow:"0 12px 40px rgba(0,91,227,.30)" }}>
      <span style={{ fontFamily:FONT, fontSize:24, fontWeight:600, color:WHITE, textAlign:"center" }}>{flyer.contact}</span>
      {flyer.showWebsite && flyer.website && (
        <>
          <span style={{ width:1, height:28, background:"rgba(255,255,255,.4)" }} />
          <span style={{ fontFamily:FONT, fontSize:22, fontWeight:700, color:WHITE }}>{flyer.website}</span>
        </>
      )}
    </div>
  );
}

const FlyerCanvas = forwardRef(function FlyerCanvas({ flyer }, ref) {
  const fmt      = getFormat(flyer.format || "portrait");
  const CW       = fmt.w;
  const CH       = fmt.h;
  const accent   = flyer.accent || "#E86A27";
  const palette  = getPalette(flyer.theme);
  const bgStyle  = resolveBackground(flyer.background, flyer.backgroundImage);
  const isUploadedImg = !!flyer.backgroundImage;
  const days     = daysUntil(flyer.launchDate);
  const Body     = BODIES[flyer.template] || AnnouncementTemplate;
  const isThumbnail = fmt.id === "thumbnail";

  const bottomPad = (!isThumbnail && flyer.showContactBar) ? BAR_H + 32 : PAD;

  return (
    <div
      ref={ref}
      style={{
        width:CW, height:CH,
        position:"relative", overflow:"hidden",
        fontFamily:FONT, boxSizing:"border-box", color:palette.text,
        ...(bgStyle.background ? { background:bgStyle.background } : { background:palette.isLight ? "#ffffff" : NAVY }),
        ...bgStyle,
      }}
    >
      {/* darken uploaded photo on dark themes */}
      {isUploadedImg && !palette.isLight && (
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(5,17,31,.55),rgba(4,13,24,.78))", pointerEvents:"none" }} />
      )}
      {/* accent corner glow */}
      <div style={{ position:"absolute", bottom:-120, right:-120, width:460, height:460, background:`radial-gradient(circle,${accent}22 0%,transparent 65%)`, pointerEvents:"none" }} />

      {isThumbnail ? (
        /* Thumbnails: full-canvas — no header/bar chrome */
        <div style={{ position:"absolute", inset:0 }}>
          <Body flyer={flyer} accent={accent} days={days} palette={palette} />
        </div>
      ) : (
        /* Portrait flyers: padded flex column with header + body + bar */
        <div style={{ position:"absolute", inset:0, padding:`${PAD}px ${PAD}px ${bottomPad}px ${PAD}px`, display:"flex", flexDirection:"column", gap:28, zIndex:1, boxSizing:"border-box" }}>
          <PortraitHeader flyer={flyer} palette={palette} />
          <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
            <Body flyer={flyer} accent={accent} days={days} palette={palette} />
          </div>
        </div>
      )}

      {!isThumbnail && flyer.showContactBar && <ContactBar flyer={flyer} />}
    </div>
  );
});

export default FlyerCanvas;
