// Presentational export/save button bar. All capture/upload logic lives in the
// FlyerStudio orchestrator (it owns the export node + store); this is just the
// buttons + busy states.
import React from "react";

const NAVY = "#05111f";
const ORANGE = "#E86A27";

const base = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
  fontFamily: "'Lexend', sans-serif",
};

export default function ExportControls({ onPNG, onPDF, onPack, onSave, busy, saving, isSaved }) {
  const anyBusy = !!busy || saving;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onSave}
          disabled={anyBusy}
          style={{ ...base, background: "#EEF2FB", color: NAVY, border: `1.5px solid ${NAVY}`, opacity: anyBusy ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : isSaved ? "Update in library" : "Save to library"}
        </button>
        <button
          onClick={onPNG}
          disabled={anyBusy}
          style={{ ...base, background: NAVY, color: "#fff", opacity: anyBusy ? 0.6 : 1 }}
        >
          {busy === "png" ? "Rendering…" : "Export PNG"}
        </button>
        <button
          onClick={onPDF}
          disabled={anyBusy}
          style={{ ...base, background: ORANGE, color: "#fff", opacity: anyBusy ? 0.6 : 1 }}
        >
          {busy === "pdf" ? "Rendering…" : "Export PDF"}
        </button>
      </div>
      <button
        onClick={onPack}
        disabled={anyBusy}
        style={{
          ...base,
          background: busy === "pack" ? "#5A6485" : "#162842",
          color: ORANGE,
          border: `1.5px solid ${ORANGE}`,
          opacity: anyBusy && busy !== "pack" ? 0.6 : 1,
        }}
      >
        {busy === "pack" ? "Building pack…" : "Export all 4 layouts (.zip)"}
      </button>
    </div>
  );
}
