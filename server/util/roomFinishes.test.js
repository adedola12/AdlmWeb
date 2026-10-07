// QUIV's per-room finishes: what the save routes store, and how Ada picks and
// totals the rooms a user asks about ("floor area and skirting for the
// toilets").
import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  MAX_ROOM_FINISHES,
  MAX_ELEMENT_IDS_PER_ROOM,
  NO_ROOM_DATA_HINT,
  sanitizeRoomFinishes,
  sanitizeRoomFinish,
  filterRoomFinishes,
  summariseRoomFinishes,
  formatRoomFinishes,
  singular,
} from "./roomFinishes.js";
import { roomFinishesFromBody } from "../routes/projects.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const room = (o = {}) => ({
  roomId: 1001,
  name: "Toilet",
  number: "G01",
  level: "Ground Floor",
  floorFinish: "Ceramic tiles",
  floorAreaM2: 4.5,
  skirtingM: 8.4,
  wallFinishAreaM2: 18.2,
  elementIds: [1, 2],
  ...o,
});

// ── sanitiser ──────────────────────────────────────────────────────────────

test("a well-formed room is kept field for field, numbers to 2 dp", () => {
  const [r] = sanitizeRoomFinishes([room({ floorAreaM2: 4.56789, skirtingM: "8.4049" })]);
  assert.deepEqual(r, {
    roomId: 1001,
    name: "Toilet",
    number: "G01",
    level: "Ground Floor",
    floorFinish: "Ceramic tiles",
    floorAreaM2: 4.57,
    skirtingM: 8.4,
    wallFinishAreaM2: 18.2,
    elementIds: [1, 2],
  });
});

test("junk numbers become 0, never NaN or negative; wall finish stays null when absent", () => {
  const [r] = sanitizeRoomFinishes([
    room({ floorAreaM2: "abc", skirtingM: -3, wallFinishAreaM2: null }),
  ]);
  assert.equal(r.floorAreaM2, 0);
  assert.equal(r.skirtingM, 0);
  assert.equal(r.wallFinishAreaM2, null);
  const [r2] = sanitizeRoomFinishes([room({ wallFinishAreaM2: undefined })]);
  assert.equal(r2.wallFinishAreaM2, null);
  const [r3] = sanitizeRoomFinishes([room({ wallFinishAreaM2: 0 })]);
  assert.equal(r3.wallFinishAreaM2, 0, "a measured 0 is not the same as no data");
});

test("strings are trimmed, a numeric room number is kept as text, objects are refused", () => {
  const [r] = sanitizeRoomFinishes([
    room({ name: "  Male   Toilet ", number: 12, level: { $gt: "" }, floorFinish: ["x"] }),
  ]);
  assert.equal(r.name, "Male Toilet");
  assert.equal(r.number, "12");
  assert.equal(r.level, "");
  assert.equal(r.floorFinish, "");
});

test("rows with nothing to identify them, and non-objects, are dropped", () => {
  const out = sanitizeRoomFinishes([
    null,
    "Toilet",
    [1, 2],
    { floorAreaM2: 5 },
    room({ roomId: 0, name: "", number: "" }),
    room({ roomId: 0, name: "Store", number: "" }),
  ]);
  assert.deepEqual(out.map((r) => r.name), ["Store"]);
  assert.equal(sanitizeRoomFinish({ roomId: "x", name: "" }), null);
});

test("element ids are integers, de-duplicated and capped", () => {
  const [r] = sanitizeRoomFinishes([room({ elementIds: [5, "5", 6.5, "x", 7, null, 7] })]);
  assert.deepEqual(r.elementIds, [5, 7]);
  const many = Array.from({ length: MAX_ELEMENT_IDS_PER_ROOM + 50 }, (_, i) => i + 1);
  const [big] = sanitizeRoomFinishes([room({ elementIds: many })]);
  assert.equal(big.elementIds.length, MAX_ELEMENT_IDS_PER_ROOM);
});

test("the list is capped", () => {
  const many = Array.from({ length: MAX_ROOM_FINISHES + 10 }, (_, i) => room({ roomId: i + 1 }));
  assert.equal(sanitizeRoomFinishes(many).length, MAX_ROOM_FINISHES);
  assert.deepEqual(sanitizeRoomFinishes("nope"), []);
});

test("the schema stores a sanitised room as sent and defaults to an empty list", () => {
  const doc = new TakeoffProject({
    userId: new mongoose.Types.ObjectId(),
    name: "Rooms",
    roomFinishes: sanitizeRoomFinishes([room({ wallFinishAreaM2: null })]),
  });
  const obj = doc.toObject();
  assert.equal(obj.roomFinishes.length, 1);
  assert.equal(obj.roomFinishes[0].wallFinishAreaM2, null);
  assert.equal(obj.roomFinishes[0]._id, undefined);
  assert.deepEqual(new TakeoffProject({ name: "x" }).toObject().roomFinishes, []);
});

// ── the save routes' contract ──────────────────────────────────────────────

test("a revit save that sends the list replaces it; one that does not keeps it", () => {
  assert.equal(roomFinishesFromBody("revit", { items: [] }), undefined, "not sent: keep");
  assert.equal(roomFinishesFromBody("revit", { roomFinishes: null }), undefined, "null: keep");
  assert.deepEqual(roomFinishesFromBody("revit", { roomFinishes: [] }), [], "empty list: cleared");
  const out = roomFinishesFromBody("revit", { roomFinishes: [room({ floorAreaM2: 1.239 })] });
  assert.equal(out[0].floorAreaM2, 1.24);
});

test("rooms are a revit take-off field only", () => {
  for (const pk of ["revit-materials", "planswift", "mep", "archicad"]) {
    assert.equal(roomFinishesFromBody(pk, { roomFinishes: [room()] }), undefined, pk);
  }
});

// ── matching ───────────────────────────────────────────────────────────────

const ROOMS = [
  room({ name: "Toilet", number: "G01", level: "Ground Floor", floorAreaM2: 4.5, skirtingM: 8.4 }),
  room({ name: "Toilets", number: "G02", level: "Ground Floor", floorAreaM2: 6, skirtingM: 10 }),
  room({ name: "Male Toilet", number: "101", level: "Level 1", floorAreaM2: 3.25, skirtingM: 7.2 }),
  room({ name: "WC", number: "102", level: "Level 1", floorAreaM2: 2, skirtingM: 5.6 }),
  room({ name: "Bathroom", number: "103", level: "Level 10", floorAreaM2: 5, skirtingM: 9 }),
  room({ name: "Living Room", number: "G03", level: "Ground Floor", floorFinish: "Porcelain", floorAreaM2: 30, skirtingM: 22 }),
  room({ name: "Store", number: "G04", level: "Ground Floor", floorFinish: "", floorAreaM2: 2.5, skirtingM: 6.3, wallFinishAreaM2: null }),
];

const names = (rows) => rows.map((r) => r.name);

test("singular forms meet in the middle", () => {
  assert.equal(singular("toilets"), "toilet");
  assert.equal(singular("WCs"), "wc");
  assert.equal(singular("lobbies"), "lobby");
  assert.equal(singular("offices"), "office");
  assert.equal(singular("classes"), "class");
  assert.equal(singular("01"), "1");
});

test("'toilets' finds every toilet, singular or plural, case-insensitive", () => {
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "toilets" })), ["Toilet", "Toilets", "Male Toilet"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "TOILET" })), ["Toilet", "Toilets", "Male Toilet"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "the toilet rooms" })), ["Toilet", "Toilets", "Male Toilet"]);
});

test("alternatives: 'toilets and WCs', 'toilet, bathroom'", () => {
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "toilets and WCs" })), ["Toilet", "Toilets", "Male Toilet", "WC"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "toilet, bath" })), ["Toilet", "Toilets", "Male Toilet", "Bathroom"]);
});

test("a room number matches outright; numbers never match by prefix", () => {
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "g01" })), ["Toilet"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "101" })), ["Male Toilet"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "10" })), []);
});

test("'room' alone still finds rooms named room", () => {
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "rooms" })), ["Living Room"]);
});

test("level filter: by name, by number, and Level 1 is not Level 10", () => {
  assert.equal(filterRoomFinishes(ROOMS, { level: "ground floor" }).length, 4);
  assert.equal(filterRoomFinishes(ROOMS, { level: "Ground" }).length, 4);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { level: "level 1" })), ["Male Toilet", "WC"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { level: "Level 01" })), ["Male Toilet", "WC"]);
  assert.deepEqual(names(filterRoomFinishes(ROOMS, { room: "toilets", level: "ground" })), ["Toilet", "Toilets"]);
});

test("no filter returns every room", () => {
  assert.equal(filterRoomFinishes(ROOMS, {}).length, ROOMS.length);
  assert.deepEqual(filterRoomFinishes(null, { room: "x" }), []);
});

// ── totals ─────────────────────────────────────────────────────────────────

test("totals add per room and are exact to 2 dp", () => {
  const s = summariseRoomFinishes(filterRoomFinishes(ROOMS, { room: "toilets" }));
  assert.equal(s.count, 3);
  assert.equal(s.totals.floorAreaM2, 13.75);
  assert.equal(s.totals.skirtingM, 25.6);
  assert.equal(s.totals.wallFinishAreaM2, 54.6);
  assert.equal(s.totals.roomsWithoutWallFinish, 0);
  // Sorted by level, then number.
  assert.deepEqual(s.rows.map((r) => r.number), ["G01", "G02", "101"]);
});

test("rooms without wall finish are counted, not passed off as zero", () => {
  const s = summariseRoomFinishes(filterRoomFinishes(ROOMS, { room: "store" }));
  assert.equal(s.totals.wallFinishAreaM2, null);
  assert.equal(s.totals.roomsWithoutWallFinish, 1);
  const g = summariseRoomFinishes(filterRoomFinishes(ROOMS, { level: "ground" }));
  assert.equal(g.totals.roomsWithoutWallFinish, 1);
  assert.equal(g.totals.wallFinishAreaM2, 54.6);
});

test("grouped by floor finish, biggest first", () => {
  const s = summariseRoomFinishes(filterRoomFinishes(ROOMS, { level: "ground" }));
  assert.deepEqual(
    s.byFloorFinish.map((f) => [f.floorFinish, f.rooms, f.floorAreaM2]),
    [
      ["Porcelain", 1, 30],
      ["Ceramic tiles", 2, 10.5],
      ["(no floor finish set)", 1, 2.5],
    ],
  );
});

// ── Ada's text ─────────────────────────────────────────────────────────────

test("the answer names each room and the totals", () => {
  const out = formatRoomFinishes("Duplex", ROOMS, { room: "toilets" });
  assert.match(out, /3 room\(s\) of 7/);
  assert.match(out, /TOTAL floor area 13\.75 m2; TOTAL skirting 25\.6 m/);
  assert.match(out, /- G01 Toilet \| Ground Floor \| Ceramic tiles \| 4\.5 m2 \| 8\.4 m/);
  assert.match(out, /- 101 Male Toilet \| Level 1/);
});

test("no room data says how to get it", () => {
  for (const empty of [[], undefined, null]) {
    const out = formatRoomFinishes("Old Job", empty, { room: "toilet" });
    assert.match(out, /has no room data/);
    assert.ok(out.includes(NO_ROOM_DATA_HINT));
  }
});

test("no match lists what the project does have", () => {
  const out = formatRoomFinishes("Duplex", ROOMS, { room: "kitchen" });
  assert.match(out, /No room in "Duplex" matches \(rooms matching "kitchen"\)/);
  assert.match(out, /Toilet, Toilets, Male Toilet/);
  assert.match(out, /Do NOT invent a room/);
});
