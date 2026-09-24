// Who is asking, and may they export this project?
//
// Split out of routes/projects.boq.js because the export routes got both
// answers wrong in a way no test could see: they read the caller's id from
// `req.user._id`, which the auth middleware never sets. `requireAuth` assigns
// the decoded access token — `{ id, email, role, … }` — and only a hydrated
// User document has `_id`. So the id was undefined on every request, every
// ownership comparison ran against "", and the export routes answered
// "project not found" for projects the caller plainly owned.
//
// The rest of the API reads `_id || id` (getUserObjectId in
// routes/projects.js). These helpers do the same, and are unit-tested, so the
// export routes cannot drift from it again.

import mongoose from "mongoose";

/** The requester's id as an ObjectId, or null when there isn't a usable one. */
export function requestUserId(req) {
  const raw = req?.user?._id || req?.user?.id;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

/** ObjectId | string | null → comparable string ("" when absent). */
export function normalizeId(v) {
  if (!v) return "";
  if (typeof v === "object" && String(v._bsontype || "") === "ObjectId") {
    return String(v);
  }
  return String(v);
}

/**
 * Mirrors resolveProjectAccess in routes/projects.js: the owner and "full"
 * collaborators may export; a "view" collaborator may read the project but not
 * download it.
 */
export function canExportProject(doc, userId) {
  const uid = normalizeId(userId);
  if (!doc || !uid) return false;
  if (doc.userId != null && normalizeId(doc.userId) === uid) return true;
  const collab = (doc.collaborators || []).find(
    (c) => c?.userId != null && normalizeId(c.userId) === uid,
  );
  return collab ? collab.accessLevel === "full" : false;
}

/**
 * Ownership test for the legacy cross-collection fallback, where documents may
 * not use TakeoffProject's field names. A document with no ownership field at
 * all is allowed through — ids are unguessable ObjectIds — but an anonymous
 * caller never is.
 */
export function userOwnsDoc(doc, userId) {
  const uid = normalizeId(userId);
  if (!doc || !uid) return false;

  const ownerFields = ["userId", "ownerId", "createdById", "user", "uid"];
  for (const f of ownerFields) {
    if (doc[f] != null) {
      if (normalizeId(doc[f]) === uid) return true;
      // Not the owner — a "full" collaborator still may.
      return canExportProject(doc, userId);
    }
  }

  return true;
}
