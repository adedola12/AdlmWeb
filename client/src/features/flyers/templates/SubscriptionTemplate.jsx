// ──────────────────────────────────────────────────────────────────────────
// SubscriptionTemplate — "Subscription Packages" pricing body.
// ──────────────────────────────────────────────────────────────────────────
// Renders ONLY the middle body (FlyerCanvas paints bg + logo header + contact
// bar). Theme-aware header (palette); the tier cards come in three export-safe
// styles set by `flyer.tierStyle`, modelled on the ADLM reference flyers:
//   • 'ribbon'  — navy/gold pennant cards with a red ribbon + ADLM mark (Revit)
//   • 'stacked' — colour-coded stacked tier bars with label tabs (BIM training)
//   • 'minimal' — clean panel tiles, theme-aware (Rate Generator)
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";
import { LOGO_SRC } from "../lib/brand.js";

const NAVY = "#0a1f3a";
const GOLD = "#e8b84a";
const RED = "#b3261e";

// ── 'ribbon' — pennant card (gold border, red ribbon, pointed bottom) ────────
function RibbonCard({ tier, accent, featured }) {
  const W = 258;
  return (
    <div style={{ position: "relative", width: W, display: "flex", flexDirection: "column", alignItems: "center", transform: featured ? "translateY(-16px)" : "none" }}>
      <div
        style={{
          width: "100%",
          background: NAVY,
          border: `4px solid ${GOLD}`,
          borderRadius: 16,
          paddingTop: 66,
          paddingBottom: 28,
          position: "relative",
          boxShadow: featured ? "0 26px 60px rgba(0,0,0,0.5)" : "0 16px 40px rgba(0,0,0,0.38)",
        }}
      >
        {/* red ribbon fold with the ADLM mark */}
        <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 92, height: 76, background: `linear-gradient(180deg, ${RED}, #7f160f)`, borderRadius: "0 0 8px 8px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 14px rgba(0,0,0,0.35)" }}>
          <div style={{ width: 46, height: 46, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={LOGO_SRC} alt="" crossOrigin="anonymous" style={{ width: 30, height: 30, objectFit: "contain" }} />
          </div>
        </div>
        {/* dotted inner side rules */}
        <div style={{ position: "absolute", left: 12, top: 64, bottom: 16, borderLeft: "2px dotted rgba(255,255,255,0.18)" }} />
        <div style={{ position: "absolute", right: 12, top: 64, bottom: 16, borderRight: "2px dotted rgba(255,255,255,0.18)" }} />

        <div style={{ textAlign: "center", padding: "0 20px" }}>
          <div style={{ fontSize: 46, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em" }}>{tier.price}</div>
          <div style={{ width: "72%", height: 1, background: "rgba(255,255,255,0.28)", margin: "14px auto" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.82)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{tier.period || tier.label}</div>
          {tier.note && <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: accent }}>{tier.note}</div>}
        </div>
      </div>
      {/* pointed bottom (pennant) */}
      <div style={{ width: 0, height: 0, borderLeft: `${W / 2}px solid transparent`, borderRight: `${W / 2}px solid transparent`, borderTop: `26px solid ${GOLD}` }} />
    </div>
  );
}

function RibbonTiers({ tiers, accent, featuredIdx }) {
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", justifyContent: "center" }}>
      {tiers.map((t, i) => (
        <RibbonCard key={t.id || i} tier={t} accent={accent} featured={i === featuredIdx} />
      ))}
    </div>
  );
}

// ── 'stacked' — colour-coded tier bars with label tabs ───────────────────────
function StackedTiers({ tiers, accent, currency }) {
  const colors = [NAVY, accent, "#E86A27"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "min(620px, 88%)", margin: "0 auto" }}>
      {tiers.map((t, i) => {
        const bg = colors[i % colors.length];
        return (
          <div key={t.id || i} style={{ position: "relative", background: bg, borderRadius: 16, padding: "20px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, boxShadow: "0 14px 34px rgba(0,0,0,0.32)" }}>
            <div style={{ minWidth: 0 }}>
              {t.label && <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{t.label}</div>}
              {t.note && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>{t.note}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>{currency}</span>
              <span style={{ fontSize: 46, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em" }}>{t.price}</span>
              {t.period && <span style={{ fontSize: 16, color: "rgba(255,255,255,0.75)" }}>/{t.period}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 'minimal' — clean theme-aware tiles ─────────────────────────────────────
function MinimalTiers({ tiers, accent, currency, palette, featuredIdx }) {
  return (
    <div style={{ display: "flex", gap: 22, justifyContent: "center", alignItems: "stretch", flexWrap: "wrap" }}>
      {tiers.map((t, i) => {
        const featured = i === featuredIdx;
        return (
          <div
            key={t.id || i}
            style={{
              minWidth: 210,
              padding: "26px 30px",
              borderRadius: 18,
              background: featured ? accent : palette.panel,
              border: `1.5px solid ${featured ? accent : palette.border}`,
              textAlign: "center",
              transform: featured ? "translateY(-10px)" : "none",
              boxShadow: featured ? `0 18px 44px ${accent}40` : "none",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: featured ? "#fff" : accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              {t.label}{t.period ? ` (${currency})` : ""}
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, color: featured ? "#fff" : palette.text, lineHeight: 1, letterSpacing: "-0.02em" }}>{t.price}</div>
            {t.note && <div style={{ marginTop: 8, fontSize: 14, color: featured ? "rgba(255,255,255,0.85)" : palette.textSoft }}>{t.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function SubscriptionTemplate({ flyer, accent, days, palette }) {
  const tiers = (flyer.tiers || []).filter((t) => t && (t.price || t.label)).slice(0, 3);
  const currency = flyer.currency || "NGN";
  const featuredIdx = tiers.length ? Math.floor(tiers.length / 2) : -1;
  const kind = flyer.tierStyle || "ribbon";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
        {flyer.showBadge && flyer.badge && <Badge accent={accent} palette={palette} center>{flyer.badge}</Badge>}
        <Headline title={flyer.title} highlightWordIndex={flyer.highlightWordIndex} accent={accent} palette={palette} size={76} center />
        {flyer.packagesHeading && (
          <span style={{ fontSize: 40, fontWeight: 700, color: palette.text, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{flyer.packagesHeading}</span>
        )}
        {flyer.installation && (
          <span style={{ fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1.2 }}>Initial Installation: {flyer.installation}</span>
        )}
      </div>

      {/* tiers */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 32 }}>
        {tiers.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Rule accent={accent} w={88} center />
            <Subtitle palette={palette} center>Add up to 3 pricing tiers to build your packages.</Subtitle>
          </div>
        ) : kind === "stacked" ? (
          <StackedTiers tiers={tiers} accent={accent} currency={currency} />
        ) : kind === "minimal" ? (
          <MinimalTiers tiers={tiers} accent={accent} currency={currency} palette={palette} featuredIdx={featuredIdx} />
        ) : (
          <RibbonTiers tiers={tiers} accent={accent} featuredIdx={featuredIdx} />
        )}
      </div>
    </div>
  );
}
