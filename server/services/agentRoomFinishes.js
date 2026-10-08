// server/services/agentRoomFinishes.js
//
// Ada's get_room_finishes tool: the per-room floor area, skirting and finish
// QUIV measures from the Revit rooms (TakeoffProject.roomFinishes).
//
// Kept apart from agentUserData.js on purpose. That module's resolveProject is
// owner-only and returns rates; room data carries no money, so this tool also
// serves the projects the user collaborates on, and it does so with its own,
// narrower lookup rather than widening the one every pricing tool shares.
//
// The model never supplies a user id. Every query is scoped to the caller
// (owner OR listed collaborator), and canReadRoomFinishes checks the loaded
// document again, so a filter mistake cannot hand over another firm's rooms.

import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { similarityScore } from "../util/fuzzyMatch.js";
import { formatRoomFinishes } from "../util/roomFinishes.js";
import { ownOnly, isSampleProject } from "../util/agentSampleGuard.js";

const OID = /^[a-f\d]{24}$/i;

function oid(id) {
  return new mongoose.Types.ObjectId(String(id));
}

/** Owner or listed collaborator. Samples and strangers are refused. */
export function canReadRoomFinishes(userId, project) {
  if (!userId || !project) return false;
  if (isSampleProject(project)) return false;
  const me = String(userId);
  if (project.userId && String(project.userId) === me) return true;
  const collabs = Array.isArray(project.collaborators) ? project.collaborators : [];
  return collabs.some((c) => c?.userId && String(c.userId) === me);
}

// ownOnly: rooms are read from the user's own and shared projects, never from a
// sample (util/agentSampleGuard.js).
function mine(uid) {
  return ownOnly({ $or: [{ userId: uid }, { "collaborators.userId": uid }] });
}

const LIST_FIELDS = { name: 1, productKey: 1, slug: 1, updatedAt: 1, userId: 1, collaborators: 1 };
const LOAD_FIELDS = { name: 1, productKey: 1, userId: 1, collaborators: 1, roomFinishes: 1 };

// The take-off is where rooms live; its "-materials" twin carries the same
// name and never has them. Owner's own copy before a shared one.
function rank(p, uid) {
  let s = 0;
  if (!String(p?.productKey || "").includes("-material")) s += 2;
  if (String(p?.userId || "") === String(uid)) s += 1;
  return s;
}

/** The project the page the user is on points at (id or slug), if theirs. */
async function projectFromPage(uid, context = {}) {
  const ref = String(context.projectRef || "").trim();
  if (!ref) return null;
  const where = { ...mine(uid) };
  const pk = String(context.productKey || "").trim().toLowerCase();
  if (pk) where.productKey = pk;
  if (OID.test(ref)) {
    const byId = await TakeoffProject.findOne({ ...where, _id: ref }, LIST_FIELDS).lean();
    if (byId) return byId;
  }
  // Slugs are unique per owner only, so a shared slug can repeat: prefer the
  // caller's own, then the newest.
  const bySlug = await TakeoffProject.find({ ...where, slug: ref.toLowerCase() }, LIST_FIELDS)
    .sort({ updatedAt: -1 })
    .lean();
  if (!bySlug?.length) return null;
  return [...bySlug].sort((a, b) => rank(b, uid) - rank(a, uid))[0];
}

/**
 * ONE project the caller may read, by id, by name, or (no name) the page.
 * @returns {Promise<{project?: object, error?: string, note?: string}>}
 */
export async function resolveRoomProject(userId, projectQuery, context = {}) {
  const uid = oid(userId);
  const q = String(projectQuery || "").trim();
  const here = await projectFromPage(uid, context);

  if (!q) {
    if (here) return { project: here };
    return { error: "Ask the user which project they mean (by name)." };
  }

  if (OID.test(q)) {
    const byId = await TakeoffProject.findOne({ _id: q, ...mine(uid) }, LIST_FIELDS).lean();
    if (byId) return { project: byId };
  }

  // The project open on the page, named by its own name: no guessing among
  // look-alikes ("New Takeoff" exists many times over).
  if (here && String(here.name || "").trim().toLowerCase() === q.toLowerCase()) {
    return { project: here };
  }

  const candidates = await TakeoffProject.find(mine(uid), LIST_FIELDS).sort({ updatedAt: -1 }).lean();
  if (!candidates?.length) return { error: "The user has no projects yet." };

  const lower = q.toLowerCase();
  const subs = candidates.filter((c) => String(c.name || "").toLowerCase().includes(lower));
  let best = null;
  if (subs.length) {
    best = [...subs].sort((a, b) => rank(b, uid) - rank(a, uid))[0];
  } else {
    let bestScore = 0;
    for (const c of candidates) {
      const score = similarityScore(q, c.name || "") + rank(c, uid) / 100;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best || bestScore < 0.5) {
      const names = candidates.slice(0, 12).map((c) => c.name).join(", ");
      return {
        error: `No project clearly matches "${q}". The user's projects are: ${names}. Ask them which one they mean. Do NOT answer with figures from a guessed project.`,
      };
    }
  }

  const sameName = candidates.filter(
    (c) =>
      String(c.name || "").toLowerCase() === String(best.name || "").toLowerCase() &&
      !String(c.productKey || "").includes("-material"),
  ).length;
  const note =
    sameName > 1
      ? `Note: the user has ${sameName} projects named "${best.name}"; these rooms are from the most recently updated one. Mention that.`
      : "";
  return { project: best, note };
}

/**
 * get_room_finishes. Read-only.
 * @param {string} userId  the signed-in caller (from the token, never the model)
 * @param {{project?: string, room?: string, level?: string}} input
 * @param {{projectRef?: string, productKey?: string}} context  the open project
 */
export async function getRoomFinishes(userId, input = {}, context = {}) {
  if (!userId) return "The user is not signed in, so their projects can't be read.";
  const { project: found, error, note } = await resolveRoomProject(userId, input?.project, context);
  if (error) return error;

  const uid = oid(userId);
  const project = await TakeoffProject.findOne({ _id: found._id, ...mine(uid) }, LOAD_FIELDS).lean();
  if (!project || !canReadRoomFinishes(uid, project)) {
    return "That project could not be loaded for this user.";
  }

  const out = formatRoomFinishes(project.name, project.roomFinishes, {
    room: input?.room,
    level: input?.level,
  });
  return note ? `${out}\n${note}` : out;
}
