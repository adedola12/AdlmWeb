// ──────────────────────────────────────────────────────────────────────────
// TicketTemplate — the "promo ticket / coupon" body with a price seal.
// ──────────────────────────────────────────────────────────────────────────
// Renders ONLY the middle body (FlyerCanvas paints the bg, logo header and the
// bottom contact bar). Theme-aware: the heading/supporting copy read colours
// from `palette` and are passed down to Badge/Headline/Subtitle so they read
// correctly on both light (navy-on-white "hex") and dark (white-on-navy)
// flyers.
//
// Layout, top→bottom:
//   TOP (flex-shrink:0) — optional Badge, the "Missed the live classes?"
//     Headline (one accent word) and an optional supporting Subtitle.
//   MIDDLE (flex:1, centered) — THE TICKET: a horizontal coupon rendered as a
//     self-contained WHITE card (navy text) so it pops on ANY background. Left
//     panel carries the course title + meta; a dashed perforation with notch
//     cut-outs splits it from the right panel, which holds a CSS barcode and a
//     red+gold PRICE SEAL overlapping the perforation for energy.
//   BELOW (flex-shrink:0) — optional CTA callout in a themed panel.
//
// The ticket card is intentionally white + navy (independent of theme) so the
// red seal, gold ring and barcode always pop — matching the ADLM "Missed the
// live classes?" reference art.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";

// Self-contained ticket palette — fixed regardless of the flyer theme so the
// white coupon reads on both light and dark backgrounds.
const INK = "#0a1a30"; // navy ink for ticket text
const INK_SOFT = "rgba(10,26,48,0.55)"; // muted meta line
const PERF = "rgba(10,26,48,0.18)"; // dashed perforation
const SEAL_RED = "#d6232e";
const SEAL_GOLD = "#e8b84a";
const LABEL_ORANGE = "#E86A27";

export default function TicketTemplate({ flyer, accent, days, palette }) {
  const currency = flyer.currency || "NGN";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── TOP: eyebrow + headline + supporting line ── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 22,
        }}
      >
        {flyer.showBadge && flyer.badge && (
          <Badge accent={accent} palette={palette}>
            {flyer.badge}
          </Badge>
        )}

        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          palette={palette}
          size={84}
        />

        {flyer.subtitle && (
          <Subtitle palette={palette} size={30} maxWidth={820}>
            {flyer.subtitle}
          </Subtitle>
        )}
      </div>

      {/* ── MIDDLE: the hero — a horizontal white ticket/coupon ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          paddingTop: 32,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 300,
            display: "flex",
            background: "#ffffff",
            borderRadius: 18,
            boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
            overflow: "visible",
          }}
        >
          {/* LEFT panel — course title + meta */}
          <div
            style={{
              flex: 1.6,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 14,
              padding: 30,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: LABEL_ORANGE,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Integration of
            </span>
            <span
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: INK,
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
              }}
            >
              {flyer.ticketTitle}
            </span>
            {flyer.ticketMeta && (
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: INK_SOFT,
                  lineHeight: 1.35,
                }}
              >
                {flyer.ticketMeta}
              </span>
            )}
          </div>

          {/* PERFORATION — dashed divider with notch half-circles top & bottom */}
          <div
            style={{
              position: "relative",
              alignSelf: "stretch",
              borderLeft: `3px dashed ${PERF}`,
              flexShrink: 0,
            }}
          >
            {/* top notch — a small circle that nips the edge */}
            <span
              style={{
                position: "absolute",
                top: -16,
                left: -16,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(10,26,48,0.06)",
              }}
            />
            {/* bottom notch */}
            <span
              style={{
                position: "absolute",
                bottom: -16,
                left: -16,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(10,26,48,0.06)",
              }}
            />
          </div>

          {/* RIGHT panel — barcode (with code number under it) */}
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 24,
            }}
          >
            <div
              style={{
                width: 70,
                height: 150,
                background:
                  "repeating-linear-gradient(90deg, #0a1a30 0 3px, transparent 3px 7px)",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: INK_SOFT,
                letterSpacing: "0.12em",
              }}
            >
              0 123456 789111
            </span>

            {/* PRICE SEAL — red disc + gold ring, overlapping the perforation */}
            <div
              style={{
                position: "absolute",
                left: -40,
                top: "50%",
                width: 150,
                height: 150,
                marginTop: -75,
                borderRadius: "50%",
                background: SEAL_RED,
                boxShadow: `0 0 0 6px ${SEAL_GOLD}, 0 8px 20px rgba(0,0,0,0.3)`,
                transform: "rotate(-8deg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                }}
              >
                {currency}
              </span>
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: "#ffffff",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {flyer.ticketPrice}
              </span>
            </div>
          </div>
        </div>

        {/* ── BELOW THE TICKET: optional CTA callout ── */}
        {flyer.ticketCta && (
          <div
            style={{
              padding: "20px 26px",
              borderRadius: 16,
              background: palette.panel,
              border: `1.5px solid ${palette.border}`,
              maxWidth: 860,
            }}
          >
            <span
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: palette.text,
                lineHeight: 1.3,
                textAlign: "center",
                display: "block",
              }}
            >
              {flyer.ticketCta}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
