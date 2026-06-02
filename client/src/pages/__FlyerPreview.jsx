// TEMPORARY visual-verification page — renders all six flyer templates across
// the new Styles (light + dark). Public route /__flyer-preview, for a quick
// review only; removed after. NOT part of the product.
import React from "react";
import FlyerCanvas from "../features/flyers/templates/FlyerCanvas.jsx";
import { defaultFlyer } from "../features/flyers/lib/defaults.js";
import { applyStyle } from "../features/flyers/lib/styles.js";

const W = 1080;
const H = 1350;
const SCALE = 0.3;

const tiles = [
  { label: "Coming Soon · Navy Glow (dark)", flyer: defaultFlyer("announcement") },
  { label: "Countdown · Blue Tech (dark)", flyer: { ...defaultFlyer("countdown"), launchDate: "2026-06-14" } },
  { label: "Launch · Light Hexagon", flyer: defaultFlyer("launch") },
  { label: "Event · Light Hexagon", flyer: defaultFlyer("event") },
  { label: "Pricing · Podium (light)", flyer: defaultFlyer("subscription") },
  { label: "Ticket · Light Hexagon", flyer: defaultFlyer("ticket") },
  { label: "Coming Soon · Clean White (light)", flyer: applyStyle(defaultFlyer("announcement"), "clean") },
  { label: "Pricing · Dark Triangle", flyer: applyStyle(defaultFlyer("subscription"), "triangle-dark") },
];

export default function FlyerPreview() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: 28, background: "#0a1320", minHeight: "100vh", justifyContent: "center", alignItems: "flex-start" }}>
      {tiles.map((s) => (
        <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#e2e8f0", fontFamily: "Lexend, sans-serif", fontSize: 13, fontWeight: 600 }}>{s.label}</span>
          <div style={{ width: W * SCALE, height: H * SCALE, position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${SCALE})`, transformOrigin: "top left", width: W, height: H }}>
              <FlyerCanvas flyer={s.flyer} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
