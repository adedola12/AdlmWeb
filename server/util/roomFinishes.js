// server/util/roomFinishes.js
//
// ROOM FINISHES: what QUIV (Revit) measures per room.
//
// From QUIV 4.0.2 the plugin sends a top-level `roomFinishes` list with every
// Revit project save: one row per Revit room with its floor finish, floor
// area, skirting run and (when the model has it) wall finish area. Ada reads
// it to answer "what is the floor area and skirting for the toilets?" per
// room, with totals.
//
// Everything here is pure, so the save routes and Ada's tool share one
// sanitiser and one filter and both are tested without a database:
//   sanitizeRoomFinishes  - what the routes store (shape, rounding, caps)
//   filterRoomFinishes    - "toilets", "G01", "ground floor" -> matching rows
//   summariseRoomFinishes - per-room rows + totals + count
//   formatRoomFinishes    - the text Ada is handed

export const MAX_ROOM_FINISHES = 5000;
export const MAX_ELEMENT_IDS_PER_ROOM = 500;

const MAX_NAME = 200;
const MAX_NUMBER = 60;
const MAX_LEVEL = 120;
const MAX_FINISH = 200;

function text(v, max) {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Two decimals, never negative, never NaN. Areas and runs are not signed. */
export function roundQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function intId(v) {
  // Number(null) and Number("") are 0, which is not an id.
  if (typeof v !== "number" && !(typeof v === "string" && /^-?\d+$/.test(v.trim()))) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * One room as stored. `null` when the row is not a room at all (not an
 * object, or nothing to identify it by).
 */
export function sanitizeRoomFinish(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const roomId = intId(raw.roomId) ?? 0;
  const name = text(raw.name, MAX_NAME);
  const number = text(raw.number, MAX_NUMBER);
  if (!roomId && !name && !number) return null;

  const ids = [];
  const seen = new Set();
  if (Array.isArray(raw.elementIds)) {
    for (const e of raw.elementIds) {
      const id = intId(e);
      if (id === null || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_ELEMENT_IDS_PER_ROOM) break;
    }
  }

  // null means "the model has no wall finish for this room", which is not the
  // same as a measured 0 m2, so it is kept as null.
  const wall = raw.wallFinishAreaM2;
  const wallFinishAreaM2 =
    wall === null || wall === undefined || wall === "" || !Number.isFinite(Number(wall))
      ? null
      : roundQty(wall);

  return {
    roomId,
    name,
    number,
    level: text(raw.level, MAX_LEVEL),
    floorFinish: text(raw.floorFinish, MAX_FINISH),
    floorAreaM2: roundQty(raw.floorAreaM2),
    skirtingM: roundQty(raw.skirtingM),
    wallFinishAreaM2,
    elementIds: ids,
  };
}

/**
 * The list as stored. Callers decide whether the field was SENT at all
 * (Array.isArray on the body) - a save without it keeps what is stored.
 */
export function sanitizeRoomFinishes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const row = sanitizeRoomFinish(raw);
    if (row) out.push(row);
    if (out.length >= MAX_ROOM_FINISHES) break;
  }
  return out;
}

// ── Matching ───────────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "all", "every", "of", "in", "on", "at", "for", "my", "our"]);
// "room" is how people talk, not how rooms are named: "toilet rooms" must still
// find "Toilet 1". It only counts when it is the whole query.
const SOFT = new Set(["room", "rooms"]);

/** Singular form, so "toilets" finds "Toilet" and "WCs" finds "WC". */
export function singular(w) {
  const s = String(w || "").toLowerCase();
  // Both sides of every comparison go through this, so over-trimming a short
  // word ("gas" -> "ga") is harmless; under-trimming "WCs" is not.
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "");
  if (s.length <= 2) return s;
  if (s.endsWith("ies")) return `${s.slice(0, -3)}y`;
  if (/(sses|xes|zes|ches|shes)$/.test(s)) return s.slice(0, -2);
  if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

function words(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

function queryWords(q) {
  const all = words(q).filter((w) => !STOP.has(w));
  const firm = all.filter((w) => !SOFT.has(w));
  return firm.length ? firm : all;
}

// A number must match exactly ("Toilet 1" is not "Toilet 10"); a word may be
// the start of a word ("bath" finds "Bathroom").
function wordHit(q, hay) {
  if (/^\d+$/.test(q)) return hay.includes(q);
  return hay.some((h) => h === q || h.startsWith(q));
}

function matchesAll(qs, hayText) {
  if (!qs.length) return true;
  const hay = words(hayText);
  return qs.every((q) => wordHit(q, hay));
}

/**
 * "toilets and bathrooms", "toilet, store" -> alternatives; a room matches
 * when it matches ANY alternative and an alternative needs ALL its words.
 */
export function roomMatches(row, roomQuery) {
  const q = String(roomQuery || "").trim();
  if (!q) return true;
  const name = String(row?.name || "");
  const number = String(row?.number || "");
  // A room number asked for outright ("G01", "1.04").
  if (number && number.toLowerCase() === q.toLowerCase()) return true;
  const alts = q
    .split(/,|&|\/|\band\b|\bor\b/i)
    .map((s) => queryWords(s))
    .filter((a) => a.length);
  if (!alts.length) return true;
  const hay = `${name} ${number}`;
  return alts.some((a) => matchesAll(a, hay));
}

export function levelMatches(row, levelQuery) {
  const q = String(levelQuery || "").trim();
  if (!q) return true;
  const level = String(row?.level || "");
  if (level.toLowerCase() === q.toLowerCase()) return true;
  const qs = words(q).filter((w) => !STOP.has(w) && w !== "floor" && w !== "level");
  if (!qs.length) return matchesAll(words(q), level);
  return matchesAll(qs, level);
}

export function filterRoomFinishes(rows, { room = "", level = "" } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => roomMatches(r, room) && levelMatches(r, level));
}

// ── Totals ─────────────────────────────────────────────────────────────────

const r2 = (n) => Math.round(n * 100) / 100;

function byText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "en", { numeric: true, sensitivity: "base" });
}

/**
 * Per-room rows (sorted level, number, name) plus totals and a count.
 * Wall finish is totalled over the rooms that HAVE it, and the rooms without
 * it are counted, so a partial figure is never passed off as the whole.
 */
export function summariseRoomFinishes(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r?.name || ""),
      number: String(r?.number || ""),
      level: String(r?.level || ""),
      floorFinish: String(r?.floorFinish || ""),
      floorAreaM2: roundQty(r?.floorAreaM2),
      skirtingM: roundQty(r?.skirtingM),
      wallFinishAreaM2:
        r?.wallFinishAreaM2 === null || r?.wallFinishAreaM2 === undefined
          ? null
          : roundQty(r.wallFinishAreaM2),
    }))
    .sort((a, b) => byText(a.level, b.level) || byText(a.number, b.number) || byText(a.name, b.name));

  let floor = 0;
  let skirting = 0;
  let wall = 0;
  let wallMissing = 0;
  const finishes = new Map();
  for (const r of list) {
    floor += r.floorAreaM2;
    skirting += r.skirtingM;
    if (r.wallFinishAreaM2 === null) wallMissing += 1;
    else wall += r.wallFinishAreaM2;
    const key = r.floorFinish || "(no floor finish set)";
    const f = finishes.get(key) || { floorFinish: key, rooms: 0, floorAreaM2: 0, skirtingM: 0 };
    f.rooms += 1;
    f.floorAreaM2 += r.floorAreaM2;
    f.skirtingM += r.skirtingM;
    finishes.set(key, f);
  }

  return {
    count: list.length,
    rows: list,
    totals: {
      floorAreaM2: r2(floor),
      skirtingM: r2(skirting),
      wallFinishAreaM2: list.length && wallMissing < list.length ? r2(wall) : null,
      roomsWithoutWallFinish: wallMissing,
    },
    byFloorFinish: [...finishes.values()]
      .map((f) => ({ ...f, floorAreaM2: r2(f.floorAreaM2), skirtingM: r2(f.skirtingM) }))
      .sort((a, b) => b.floorAreaM2 - a.floorAreaM2),
  };
}

// ── Ada's text ─────────────────────────────────────────────────────────────

export const NO_ROOM_DATA_HINT = "re-save it from QUIV 4.0.2 or later";
const MAX_ROWS_SHOWN = 60;

function fmt(n) {
  return Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

function roomLabel(r) {
  const parts = [r.number, r.name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(unnamed room)";
}

/**
 * The tool's answer. `all` is the project's whole stored list, `filters` what
 * was asked for; the reply says what was searched when nothing matches.
 */
export function formatRoomFinishes(projectName, all, filters = {}) {
  const name = String(projectName || "Project");
  const stored = Array.isArray(all) ? all : [];
  if (!stored.length) {
    return (
      `Project "${name}" has no room data yet. Room finishes come from QUIV (Revit): ` +
      `${NO_ROOM_DATA_HINT}, with rooms placed in the model, and ask again. ` +
      "Do NOT estimate room areas or skirting."
    );
  }

  const room = String(filters.room || "").trim();
  const level = String(filters.level || "").trim();
  const picked = filterRoomFinishes(stored, { room, level });
  const what = [room ? `rooms matching "${room}"` : "", level ? `on level "${level}"` : ""]
    .filter(Boolean)
    .join(" ");

  if (!picked.length) {
    const levels = [...new Set(stored.map((r) => r.level).filter(Boolean))].slice(0, 12);
    const names = [...new Set(stored.map((r) => r.name).filter(Boolean))].slice(0, 25);
    return [
      `No room in "${name}" matches (${what || "no filter"}). The project has ${stored.length} room(s).`,
      `Room names include: ${names.join(", ") || "(none named)"}.`,
      levels.length ? `Levels: ${levels.join(", ")}.` : "",
      "Ask the user which rooms they mean. Do NOT invent a room.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const s = summariseRoomFinishes(picked);
  const lines = [];
  lines.push(
    `Room finishes for "${name}"${what ? ` (${what})` : ""}: ${s.count} room(s)${
      s.count !== stored.length ? ` of ${stored.length} in the model` : ""
    }.`,
  );
  lines.push(
    `TOTAL floor area ${fmt(s.totals.floorAreaM2)} m2; TOTAL skirting ${fmt(s.totals.skirtingM)} m` +
      (s.totals.wallFinishAreaM2 !== null
        ? `; TOTAL wall finish ${fmt(s.totals.wallFinishAreaM2)} m2${
            s.totals.roomsWithoutWallFinish
              ? ` (${s.totals.roomsWithoutWallFinish} room(s) have no wall finish in the model and are not in this figure)`
              : ""
          }`
        : "; no wall finish data in the model for these rooms") +
      ".",
  );
  lines.push("");
  lines.push("Per room (number name | level | floor finish | floor area | skirting):");
  for (const r of s.rows.slice(0, MAX_ROWS_SHOWN)) {
    lines.push(
      `- ${roomLabel(r)} | ${r.level || "-"} | ${r.floorFinish || "-"} | ${fmt(r.floorAreaM2)} m2 | ${fmt(r.skirtingM)} m` +
        (r.wallFinishAreaM2 !== null ? ` | wall finish ${fmt(r.wallFinishAreaM2)} m2` : ""),
    );
  }
  if (s.rows.length > MAX_ROWS_SHOWN) {
    lines.push(
      `(...and ${s.rows.length - MAX_ROWS_SHOWN} more rooms, included in the totals above. Offer to narrow by room name or level.)`,
    );
  }
  if (s.byFloorFinish.length > 1) {
    lines.push("");
    lines.push("By floor finish:");
    for (const f of s.byFloorFinish) {
      lines.push(`- ${f.floorFinish}: ${f.rooms} room(s), ${fmt(f.floorAreaM2)} m2 floor, ${fmt(f.skirtingM)} m skirting`);
    }
  }
  lines.push("");
  lines.push(
    "Quote these figures exactly, per room and with the totals. They are measured from the Revit rooms, so they are only as complete as the rooms placed in the model.",
  );
  return lines.join("\n");
}
