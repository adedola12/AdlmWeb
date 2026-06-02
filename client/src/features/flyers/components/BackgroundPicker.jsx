import React from "react";
import { BACKGROUNDS, backgroundPreviewStyle } from "../lib/backgrounds.js";

// BackgroundPicker renders inside the LIGHT admin form panel (white bg, dark
// text), so it uses a light theme rather than the white-on-dark flyer canvas.
// A simple swatch grid over the ADLM preset BACKGROUNDS; clicking a swatch
// calls onSelect(bg.id).
export default function BackgroundPicker({ value, onSelect }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        fontFamily: "'Lexend', sans-serif",
      }}
    >
      {BACKGROUNDS.map((bg) => {
        const selected = bg.id === value;
        return (
          <button
            key={bg.id}
            type="button"
            onClick={() => onSelect(bg.id)}
            title={bg.name}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 4,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              border: selected
                ? "2px solid #05111f"
                : "1.5px solid #DDE3F0",
              background: selected ? "#EEF2FB" : "#FFFFFF",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div
              style={{
                height: 44,
                borderRadius: 5,
                border: "1px solid #DDE3F0",
                ...backgroundPreviewStyle(bg),
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#475569",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {bg.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
