// FlyerCalendar — the editorial calendar for the flyer engine.
//
// A plan, not an automation. Nothing here posts anything: flyer images are
// rendered by html2canvas in the browser, so there is no image for a scheduled
// job to send. What this gives you is the thing that was actually missing —
// knowing what is meant to go out, on which channel, and whether it is ready.
//
// Three states, moved by hand:
//   planned  the slot exists, the artwork may not be final
//   ready    the artwork is done and exported, waiting for its date
//   posted   someone published it (postedAt is stamped server-side)
//
// Same light editor chrome as SavedFlyersList — this is tooling, not flyer art.
import React from "react";

import { CHANNELS } from "../lib/channels.js";

const NAVY = "#05111f";
const ORANGE = "#E86A27";
const MUTED = "#5A6485";
const LINE = "#DDE3F0";

const STATUS_TONE = {
  planned: { bg: "#EEF1F8", fg: MUTED, label: "Planned" },
  ready: { bg: "#FFF1E8", fg: ORANGE, label: "Ready" },
  posted: { bg: "#E7F6EC", fg: "#1E7B45", label: "Posted" },
};

/** Local YYYY-MM-DD. toISOString() would shift the day for anyone east of UTC. */
function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function humanDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Overdue = a date that has passed with nobody marking it posted. */
function isOverdue(flyer) {
  const when = flyer?.schedule?.scheduledFor;
  if (!when || flyer?.schedule?.status === "posted") return false;
  return new Date(when).getTime() < Date.now();
}

export default function FlyerCalendar({ flyers, onLoad, onSchedule, onClose, busyId }) {
  const list = Array.isArray(flyers) ? flyers : [];

  const scheduled = list.filter((f) => f?.schedule?.scheduledFor);
  const backlog = list.filter((f) => !f?.schedule?.scheduledFor);
  const overdue = scheduled.filter(isOverdue);

  // Group by day, earliest first. One pass, so a hundred flyers is still cheap.
  const byDay = new Map();
  for (const f of scheduled) {
    const key = dayKey(f.schedule.scheduledFor);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(f);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div style={sheet}>
      <div style={header}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Content calendar</span>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {scheduled.length} scheduled · {backlog.length} unscheduled
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close calendar" style={closeBtn}>
          ×
        </button>
      </div>

      {/* The nudge. Only rendered when something is actually late, so it stays
          meaningful instead of becoming a banner people learn to ignore. */}
      {overdue.length > 0 && (
        <div style={nudge}>
          <strong style={{ color: "#8A3A12" }}>
            {overdue.length} past its date
          </strong>
          <span style={{ color: "#8A3A12" }}>
            {" "}
, still marked {overdue.length === 1 ? "unposted" : "unposted"}.
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 24px" }}>
        {scheduled.length === 0 && backlog.length === 0 && (
          <p style={empty}>No flyers yet. Save one to the library first.</p>
        )}

        {days.map(([key, items]) => (
          <section key={key} style={{ marginBottom: 14 }}>
            <div style={dayHeading}>
              <span>{humanDay(key)}</span>
              <span style={{ color: MUTED, fontWeight: 500 }}>
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>
            {items.map((f) => (
              <Row
                key={f._id}
                flyer={f}
                onLoad={onLoad}
                onSchedule={onSchedule}
                busy={busyId === f._id}
              />
            ))}
          </section>
        ))}

        {backlog.length > 0 && (
          <section>
            <div style={{ ...dayHeading, color: MUTED }}>
              <span>Unscheduled</span>
              <span style={{ fontWeight: 500 }}>{backlog.length}</span>
            </div>
            {backlog.map((f) => (
              <Row
                key={f._id}
                flyer={f}
                onLoad={onLoad}
                onSchedule={onSchedule}
                busy={busyId === f._id}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ flyer, onLoad, onSchedule, busy }) {
  const schedule = flyer.schedule || {};
  const status = schedule.status || "planned";
  const tone = STATUS_TONE[status] || STATUS_TONE.planned;
  const late = isOverdue(flyer);

  // <input type="datetime-local"> wants local time with no zone. Slicing an ISO
  // string gives UTC and silently shifts the time the admin sees.
  const localValue = schedule.scheduledFor
    ? (() => {
        const d = new Date(schedule.scheduledFor);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
          d.getHours(),
        )}:${pad(d.getMinutes())}`;
      })()
    : "";

  return (
    <div style={{ ...row, borderColor: late ? "#E8A27F" : LINE, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {flyer.thumbnailUrl ? (
          <img src={flyer.thumbnailUrl} alt="" style={thumb} />
        ) : (
          <div style={{ ...thumb, ...thumbPlaceholder }}>{flyer.template || "flyer"}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={title}>{flyer.title || "Untitled flyer"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ ...pill, background: tone.bg, color: tone.fg }}>{tone.label}</span>
            {late && <span style={{ ...pill, background: "#FDEBE3", color: "#8A3A12" }}>Overdue</span>}
            {(schedule.channels || []).map((c) => (
              <span key={c} style={{ ...pill, background: "#EEF1F8", color: MUTED }}>
                {CHANNELS.find((x) => x.id === c)?.label || c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="datetime-local"
          value={localValue}
          disabled={busy}
          onChange={(e) =>
            onSchedule(flyer._id, {
              scheduledFor: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
          style={field}
        />

        <select
          value={status}
          disabled={busy}
          onChange={(e) => onSchedule(flyer._id, { status: e.target.value })}
          style={field}
        >
          <option value="planned">Planned</option>
          <option value="ready">Ready</option>
          <option value="posted">Posted</option>
        </select>

        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const current = schedule.channels || [];
            const next = current.includes(id)
              ? current.filter((c) => c !== id)
              : [...current, id];
            onSchedule(flyer._id, { channels: next });
          }}
          style={field}
        >
          <option value="">Channels…</option>
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {(schedule.channels || []).includes(c.id) ? "✓ " : ""}
              {c.label}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => onLoad(flyer)} disabled={busy} style={ghostBtn}>
          Open
        </button>
      </div>
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */
const sheet = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: 420,
  background: "#fff",
  zIndex: 100,
  boxShadow: "-4px 0 20px rgba(5,17,31,0.12)",
  display: "flex",
  flexDirection: "column",
  fontFamily: "'Lexend', sans-serif",
};
const header = {
  padding: "14px 20px",
  borderBottom: `1.5px solid ${LINE}`,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  flexShrink: 0,
};
const closeBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
  color: MUTED,
  padding: 0,
};
const nudge = {
  margin: "10px 12px 0",
  padding: "8px 10px",
  borderRadius: 6,
  background: "#FDEBE3",
  border: "1px solid #E8A27F",
  fontSize: 12,
};
const empty = { padding: 24, color: MUTED, fontSize: 13, textAlign: "center" };
const dayHeading = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 11,
  fontWeight: 700,
  color: NAVY,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  padding: "6px 2px",
};
const row = {
  border: `1.5px solid ${LINE}`,
  borderRadius: 8,
  padding: 10,
  marginBottom: 8,
  background: "#FAFBFF",
};
const thumb = { width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 };
const thumbPlaceholder = {
  background: "#EEF1F8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  fontWeight: 600,
  textTransform: "uppercase",
  color: MUTED,
  textAlign: "center",
};
const title = {
  fontSize: 12.5,
  fontWeight: 700,
  color: NAVY,
  margin: "0 0 5px",
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const pill = {
  fontSize: 9.5,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const field = {
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 5,
  border: `1px solid ${LINE}`,
  fontFamily: "'Lexend', sans-serif",
  color: NAVY,
  background: "#fff",
};
const ghostBtn = {
  fontSize: 10,
  fontWeight: 600,
  color: NAVY,
  background: "none",
  border: `1px solid ${NAVY}`,
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  fontFamily: "'Lexend', sans-serif",
};
