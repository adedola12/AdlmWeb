// ──────────────────────────────────────────────────────────────────────────
// EventTemplate — training / webinar promo (the richest body).
// ──────────────────────────────────────────────────────────────────────────
// Renders ONLY the middle body: header text → speaker band → meta+QR row →
// enquiries line. WHITE-on-dark, `accent` (ADLM orange) for the one highlight.
// Reuses Badge/Headline/Subtitle from ./parts.jsx and formatDateRange/splitUrl
// from ../lib/helpers.js. The QR comes from qrcode.react (the only third-party
// import allowed, and only here). Everything stays within ~1050px tall.
import React from "react";
import { Badge, Headline, Subtitle, Rule } from "./parts.jsx";
import { formatDateRange, splitUrl } from "../lib/helpers.js";
import { QRCodeSVG } from "qrcode.react";
import { WHITE, NAVY } from "../lib/brand.js";

// Friendly platform labels (raw enum values come from the data contract).
const PLATFORM_LABELS = {
  GoogleMeet: "Google Meet",
  XSpaces: "X Spaces",
  YouTube: "YouTube Live",
  WhatsApp: "WhatsApp Live",
};

// One speaker card: photo box on top (cover, or translucent placeholder),
// name + role/topic anchored below.
function SpeakerCard({ speaker, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {speaker.photo ? (
        <div style={{ height: 230, borderRadius: 12, overflow: "hidden" }}>
          <img
            src={speaker.photo}
            alt={speaker.name}
            crossOrigin="anonymous"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
              display: "block",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            height: 230,
            borderRadius: 12,
            overflow: "hidden",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "52%",
              height: "74%",
              background: "rgba(255,255,255,0.18)",
              borderRadius: "50% 50% 0 0",
            }}
          />
        </div>
      )}
      <div style={{ paddingTop: 12 }}>
        <p
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {speaker.name}
        </p>
        {(speaker.role || speaker.topic) && (
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.3,
              margin: "4px 0 0",
            }}
          >
            {speaker.role || speaker.topic}
          </p>
        )}
      </div>
    </div>
  );
}

export default function EventTemplate({ flyer, accent, days }) {
  const speakers = (flyer.speakers || [])
    .filter((s) => s.name && s.name.trim())
    .slice(0, 4);
  const presentersLabel = flyer.eventCategory === "Webinar" ? "PRESENTERS" : "FACULTY";

  // Meta cells: date, venue, platform — built conditionally per the contract.
  const dateStr = formatDateRange(flyer.dateStart, flyer.dateEnd);
  const dateSub = [flyer.time, flyer.timeZone].filter(Boolean).join(" · ");

  const cells = [];
  if (dateStr) {
    cells.push({ key: "date", label: "DATE", value: dateStr, sub: dateSub });
  }
  if (flyer.venueType !== "Virtual" && (flyer.venueCity || flyer.venuePhysical)) {
    cells.push({
      key: "venue",
      label: "VENUE",
      value: flyer.venueCity || flyer.venuePhysical,
      sub: "",
    });
  }
  if (flyer.venueType !== "In-Person" && flyer.platform) {
    cells.push({
      key: "platform",
      label: "PLATFORM",
      value: PLATFORM_LABELS[flyer.platform] || flyer.platform,
      sub: flyer.platformNote || "",
    });
  }

  const reg = flyer.registrationUrl ? splitUrl(flyer.registrationUrl) : null;
  const hasMetaRow = cells.length > 0 || (reg && reg.href);

  const enquiries = (flyer.enquiries || []).filter(Boolean);

  const divider = (
    <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.16)" }} />
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 26,
      }}
    >
      {/* Header text */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {flyer.showBadge && <Badge accent={accent}>{flyer.badge}</Badge>}
        <Headline
          title={flyer.title}
          highlightWordIndex={flyer.highlightWordIndex}
          accent={accent}
          size={62}
        />
        {flyer.subtitle && <Subtitle size={26}>{flyer.subtitle}</Subtitle>}
      </div>

      {/* Speakers */}
      {speakers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Rule accent={accent} w={28} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: accent,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {presentersLabel}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
            {speakers.map((s, i) => (
              <SpeakerCard key={s.id || i} speaker={s} accent={accent} />
            ))}
          </div>
        </div>
      )}

      {/* Meta + QR row */}
      {hasMetaRow && (
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "center",
            background: "rgba(0,0,20,0.5)",
            borderRadius: 14,
            padding: 18,
          }}
        >
          {cells.length > 0 && (
            <div style={{ flex: 1, display: "flex", gap: 20, alignItems: "stretch" }}>
              {cells.map((cell, i) => (
                <React.Fragment key={cell.key}>
                  {i > 0 && divider}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: accent,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        lineHeight: 1,
                        margin: "0 0 6px",
                      }}
                    >
                      {cell.label}
                    </p>
                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: WHITE,
                        letterSpacing: "-0.01em",
                        lineHeight: 1.15,
                        margin: 0,
                      }}
                    >
                      {cell.value}
                    </p>
                    {cell.sub && (
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: 400,
                          color: "rgba(255,255,255,0.6)",
                          lineHeight: 1.25,
                          margin: "5px 0 0",
                        }}
                      >
                        {cell.sub}
                      </p>
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          {reg && reg.href && (
            <>
              {cells.length > 0 && divider}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <div
                  style={{
                    background: WHITE,
                    padding: 6,
                    borderRadius: 8,
                    lineHeight: 0,
                    flexShrink: 0,
                  }}
                >
                  <QRCodeSVG value={reg.href} size={120} level="M" fgColor={NAVY} />
                </div>
                <div style={{ maxWidth: 150 }}>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.3,
                      margin: "0 0 4px",
                    }}
                  >
                    Scan to register
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: accent,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.25,
                      margin: 0,
                      wordBreak: "break-word",
                    }}
                  >
                    {reg.label}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Enquiries */}
      {enquiries.length > 0 && (
        <p
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            margin: 0,
          }}
        >
          Enquiries: {enquiries.join("  ·  ")}
        </p>
      )}
    </div>
  );
}
