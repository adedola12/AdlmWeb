// TEMPORARY visual-verification page — renders all four flyer templates with
// sample data. Mounted on a public route (/__flyer-preview) only for a
// screenshot, then removed. NOT part of the product.
import React from "react";
import FlyerCanvas from "../features/flyers/templates/FlyerCanvas.jsx";
import { defaultFlyer } from "../features/flyers/lib/defaults.js";

const W = 1080;
const H = 1350;
const SCALE = 0.34;

const samples = [
  { label: "Announcement / Coming Soon", flyer: defaultFlyer("announcement") },
  { label: "Countdown", flyer: { ...defaultFlyer("countdown"), launchDate: "2026-06-14" } },
  { label: "Launch / Showcase", flyer: defaultFlyer("launch") },
  { label: "Event / Training", flyer: defaultFlyer("event") },
];

export default function FlyerPreview() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 32,
        padding: 32,
        background: "#0a1320",
        minHeight: "100vh",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      {samples.map((s) => (
        <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <span style={{ color: "#e2e8f0", fontFamily: "Lexend, sans-serif", fontSize: 14, fontWeight: 600 }}>
            {s.label}
          </span>
          <div
            style={{
              width: W * SCALE,
              height: H * SCALE,
              position: "relative",
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                width: W,
                height: H,
              }}
            >
              <FlyerCanvas flyer={s.flyer} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
