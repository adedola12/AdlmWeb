import React from "react";

// SavedFlyersList — light-themed right-side drawer listing the user's saved
// flyers (server docs). White surface / dark text, deliberately NOT using the
// dark flyer tokens since this is editor chrome, not flyer art.
//
// Props:
//   flyers     array of server docs { _id, title, template, thumbnailUrl, updatedAt }
//   currentId  _id of the flyer currently loaded in the editor (gets a ring)
//   onLoad     (flyer)  -> load this flyer into the editor
//   onDelete   (_id)    -> delete this flyer
//   onClose    ()       -> close the drawer

export default function SavedFlyersList({ flyers, currentId, onLoad, onDelete, onClose }) {
  const list = Array.isArray(flyers) ? flyers : [];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: "#fff",
        zIndex: 100,
        boxShadow: "-4px 0 20px rgba(5,17,31,0.12)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Lexend', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1.5px solid #DDE3F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "#05111f" }}>Saved flyers</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close saved flyers"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            color: "#5A6485",
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Empty state */}
      {list.length === 0 && (
        <div
          style={{
            padding: 24,
            color: "#5A6485",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          No saved flyers yet.
        </div>
      )}

      {/* Scrollable card list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {list.map((f) => {
          const isCurrent = f._id === currentId;
          return (
            <div
              key={f._id}
              style={{
                border: isCurrent ? "2px solid #05111f" : "1.5px solid #DDE3F0",
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                background: "#FAFBFF",
              }}
            >
              {/* Thumbnail (or placeholder) */}
              {f.thumbnailUrl ? (
                <img
                  src={f.thumbnailUrl}
                  alt={f.title || "Flyer thumbnail"}
                  style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 6 }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 96,
                    borderRadius: 6,
                    background: "#EEF1F8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "#5A6485",
                  }}
                >
                  {f.template || "flyer"}
                </div>
              )}

              {/* Title */}
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "#05111f",
                  margin: "8px 0 4px",
                  lineHeight: 1.3,
                }}
              >
                {f.title || "Untitled flyer"}
              </p>

              {/* Template label + date */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#E86A27",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {f.template}
                </span>
                <span style={{ fontSize: 10, color: "#5A6485" }}>
                  {f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : ""}
                </span>
              </div>

              {/* Actions */}
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoad(f);
                  }}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#05111f",
                    background: "none",
                    border: "1px solid #05111f",
                    borderRadius: 4,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontFamily: "'Lexend', sans-serif",
                  }}
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(f._id);
                  }}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#C9302C",
                    background: "none",
                    border: "1px solid #C9302C",
                    borderRadius: 4,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontFamily: "'Lexend', sans-serif",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
