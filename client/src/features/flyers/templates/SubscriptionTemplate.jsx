// ──────────────────────────────────────────────────────────────────────────
// SubscriptionTemplate — "Subscription Packages" pricing body (3 tiers).
// ──────────────────────────────────────────────────────────────────────────
// Renders ONLY the middle body (FlyerCanvas paints the bg, logo header and the
// bottom contact bar). Theme-aware: heading/text colours come from `palette`
// and are passed down to Badge/Headline/Subtitle so it reads correctly on both
// light (navy-on-white "podium") and dark (white-on-navy "tech") flyers.
//
// Layout, top→bottom:
//   TOP (centered, flex-shrink:0) — optional Badge, product Headline, the
//     "Subscription Packages" sub-line, and an optional "Initial Installation"
//     line in `accent`.
//   MIDDLE (flex:1, centered) — up to 3 self-contained DARK NAVY ribbon price
//     cards in a row. The middle card is the featured "podium" tier: lifted,
//     with an accent glow/border so it stands out.
//
// Each card is intentionally dark navy (independent of theme) so the gold/blue
// ribbon + white price always pop on both light and dark backgrounds — matching
// the ADLM Revit / Planswift reference art.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";

const CARD_BG = "#0a1f3a";

// One dark-navy ribbon price card. `featured` lifts + glows the middle tier.
function PriceCard({ tier, accent, currency, featured }) {
  return (
    <div
      style={{
        position: "relative",
        width: 280,
        display: "flex",
        flexDirection: "column",
        background: CARD_BG,
        borderRadius: 20,
        overflow: "hidden",
        transform: featured ? "translateY(-18px)" : "none",
        border: featured ? `2px solid ${accent}` : "2px solid rgba(255,255,255,0.06)",
        boxShadow: featured
          ? `0 26px 60px rgba(0,0,0,0.45), 0 0 0 6px ${accent}22`
          : "0 18px 44px rgba(0,0,0,0.38)",
      }}
    >
      {/* Top ribbon banner — accent strip with a small white ADLM-style diamond. */}
      <div
        style={{
          background: accent,
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 30,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            background: "#ffffff",
            transform: "rotate(45deg)",
            borderRadius: 3,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.04em",
            lineHeight: 1,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {tier.label}
        </span>
      </div>

      {/* Card body — big price, period (with divider), optional savings note. */}
      <div
        style={{
          flex: 1,
          padding: "34px 22px 30px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
            {currency}
          </span>
          <span style={{ fontSize: 58, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {tier.price}
          </span>
        </div>

        {tier.period && (
          <div style={{ width: "100%", marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.25)", display: "flex", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                lineHeight: 1,
                textAlign: "center",
              }}
            >
              {tier.period}
            </span>
          </div>
        )}

        {tier.note && (
          <span style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1.2, textAlign: "center" }}>
            {tier.note}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionTemplate({ flyer, accent, days, palette }) {
  const tiers = (flyer.tiers || [])
    .filter((t) => t && (t.price || t.label))
    .slice(0, 3);
  const currency = flyer.currency || "NGN";
  // Feature the middle tier (the "6 months / most popular" podium card).
  const featuredIdx = tiers.length ? Math.floor(tiers.length / 2) : -1;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── TOP: product name + "Subscription Packages" + installation ── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        {flyer.showBadge && flyer.badge && (
          <Badge accent={accent} palette={palette} center>
            {flyer.badge}
          </Badge>
        )}

        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          palette={palette}
          size={76}
          center
        />

        {flyer.packagesHeading && (
          <span
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: palette.text,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            {flyer.packagesHeading}
          </span>
        )}

        {flyer.installation && (
          <span style={{ fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1.2 }}>
            Initial Installation: {flyer.installation}
          </span>
        )}
      </div>

      {/* ── MIDDLE: the hero — a row of dark navy ribbon price cards ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          justifyContent: "center",
          gap: 28,
          paddingTop: 36,
        }}
      >
        {tiers.length > 0 ? (
          tiers.map((tier, i) => (
            <PriceCard
              key={tier.id || i}
              tier={tier}
              accent={accent}
              currency={currency}
              featured={i === featuredIdx}
            />
          ))
        ) : (
          <div style={{ alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Rule accent={accent} w={88} center />
            <Subtitle palette={palette} center>
              Add up to 3 pricing tiers to build your packages.
            </Subtitle>
          </div>
        )}
      </div>
    </div>
  );
}
