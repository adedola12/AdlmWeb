// get_room_finishes: Ada reads rooms only from projects the signed-in user
// owns or collaborates on, defaults to the project open on the page, and
// never answers from somebody else's model.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { canReadRoomFinishes, getRoomFinishes, resolveRoomProject } from "./agentRoomFinishes.js";

const id = () => new mongoose.Types.ObjectId();
const ME = id();
const OTHER = id();

const rooms = [
  { name: "Toilet", number: "G01", level: "Ground Floor", floorFinish: "Tiles", floorAreaM2: 4.5, skirtingM: 8.4, wallFinishAreaM2: null },
  { name: "Toilets", number: "101", level: "Level 1", floorFinish: "Tiles", floorAreaM2: 6, skirtingM: 10, wallFinishAreaM2: null },
  { name: "Lounge", number: "G02", level: "Ground Floor", floorFinish: "Porcelain", floorAreaM2: 30, skirtingM: 22, wallFinishAreaM2: null },
];

const MINE = { _id: id(), name: "Duplex Lekki", productKey: "revit", slug: "duplex-lekki", userId: ME, collaborators: [], roomFinishes: rooms, updatedAt: new Date(3) };
const MINE_MATS = { _id: id(), name: "Duplex Lekki", productKey: "revit-materials", slug: "duplex-lekki", userId: ME, collaborators: [], roomFinishes: [], updatedAt: new Date(4) };
const SHARED = { _id: id(), name: "Office Block", productKey: "revit", slug: "office-block", userId: OTHER, collaborators: [{ userId: ME, accessLevel: "view" }], roomFinishes: rooms.slice(0, 1), updatedAt: new Date(2) };
const OLD = { _id: id(), name: "Old Bungalow", productKey: "revit", slug: "old-bungalow", userId: ME, collaborators: [], roomFinishes: [], updatedAt: new Date(1) };
const STRANGER = { _id: id(), name: "Secret Tower", productKey: "revit", slug: "secret-tower", userId: OTHER, collaborators: [], roomFinishes: rooms, updatedAt: new Date(5) };
const ALL = [MINE, MINE_MATS, SHARED, OLD, STRANGER];

// A tiny stand-in for Mongo that honours the filters the service sends:
// _id, productKey, slug and the owner-or-collaborator $or.
function matches(doc, filter) {
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === "$or") {
      if (!v.some((f) => matches(doc, f))) return false;
    } else if (v && typeof v === "object" && "$ne" in v) {
      if (doc[k] === v.$ne) return false;
    } else if (k === "collaborators.userId") {
      if (!(doc.collaborators || []).some((c) => String(c.userId) === String(v))) return false;
    } else if (String(doc[k]) !== String(v)) {
      return false;
    }
  }
  return true;
}

const realFind = TakeoffProject.find;
const realFindOne = TakeoffProject.findOne;
const seen = [];
function install(docs = ALL) {
  seen.length = 0;
  TakeoffProject.find = (filter) => {
    seen.push(filter);
    let out = docs.filter((d) => matches(d, filter));
    const q = {
      sort: (s) => {
        if (s?.updatedAt === -1) out = [...out].sort((a, b) => b.updatedAt - a.updatedAt);
        return q;
      },
      lean: async () => out,
    };
    return q;
  };
  TakeoffProject.findOne = (filter) => {
    seen.push(filter);
    const hit = docs.find((d) => matches(d, filter)) || null;
    return { lean: async () => hit };
  };
}
afterEach(() => {
  TakeoffProject.find = realFind;
  TakeoffProject.findOne = realFindOne;
});

test("access: owner and listed collaborators only", () => {
  assert.equal(canReadRoomFinishes(ME, MINE), true);
  assert.equal(canReadRoomFinishes(ME, SHARED), true);
  assert.equal(canReadRoomFinishes(ME, STRANGER), false);
  assert.equal(canReadRoomFinishes(ME, { ...STRANGER, isSample: true }), false);
  assert.equal(canReadRoomFinishes(null, MINE), false);
  assert.equal(canReadRoomFinishes(ME, null), false);
});

test("every query is scoped to the caller", async () => {
  install();
  await getRoomFinishes(ME, { project: "duplex", room: "toilets" });
  assert.ok(seen.length > 0);
  for (const f of seen) {
    assert.ok(Array.isArray(f.$or), `unscoped query: ${JSON.stringify(f)}`);
    assert.deepEqual(
      f.$or.map((o) => String(Object.values(o)[0])),
      [String(ME), String(ME)],
    );
  }
});

test("by name: answers per room with totals, from the take-off not its materials twin", async () => {
  install();
  const out = await getRoomFinishes(ME, { project: "duplex lekki", room: "toilets" });
  assert.match(out, /Room finishes for "Duplex Lekki"/);
  assert.match(out, /2 room\(s\) of 3/);
  assert.match(out, /TOTAL floor area 10\.5 m2; TOTAL skirting 18\.4 m/);
  assert.match(out, /G01 Toilet/);
  assert.match(out, /101 Toilets/);
});

test("a shared project is readable by its collaborator", async () => {
  install();
  const out = await getRoomFinishes(ME, { project: "office block" });
  assert.match(out, /Room finishes for "Office Block"/);
});

test("somebody else's project is never found, by name or by id", async () => {
  install();
  const byName = await getRoomFinishes(ME, { project: "Secret Tower" });
  assert.doesNotMatch(byName, /Room finishes/);
  assert.match(byName, /No project clearly matches/);
  assert.doesNotMatch(byName, /Secret Tower\b(?!")/);

  const byId = await getRoomFinishes(ME, { project: String(STRANGER._id) });
  assert.doesNotMatch(byId, /Room finishes for "Secret Tower"/);
});

test("no project named: the open project is used, if the caller may read it", async () => {
  install();
  const out = await getRoomFinishes(ME, { room: "lounge" }, { projectRef: String(MINE._id), productKey: "revit" });
  assert.match(out, /Room finishes for "Duplex Lekki"/);
  assert.match(out, /G02 Lounge/);

  const bySlug = await getRoomFinishes(ME, {}, { projectRef: "office-block", productKey: "revit" });
  assert.match(bySlug, /Room finishes for "Office Block"/);

  const theirs = await getRoomFinishes(ME, {}, { projectRef: String(STRANGER._id), productKey: "revit" });
  assert.match(theirs, /Ask the user which project/);

  const none = await getRoomFinishes(ME, {}, {});
  assert.match(none, /Ask the user which project/);
});

test("the open project wins over a look-alike when named by its own name", async () => {
  const twin = { ...MINE, _id: id(), roomFinishes: [], updatedAt: new Date(9) };
  install([...ALL, twin]);
  const { project } = await resolveRoomProject(ME, "Duplex Lekki", { projectRef: String(MINE._id), productKey: "revit" });
  assert.equal(String(project._id), String(MINE._id));
});

test("a project with no rooms says to re-save from QUIV 4.0.2", async () => {
  install();
  const out = await getRoomFinishes(ME, { project: "old bungalow", room: "toilet" });
  assert.match(out, /no room data/);
  assert.match(out, /re-save it from QUIV 4\.0\.2 or later/);
});

test("a guest gets nothing", async () => {
  install();
  const out = await getRoomFinishes(null, { project: "duplex" });
  assert.match(out, /not signed in/);
  assert.equal(seen.length, 0);
});
