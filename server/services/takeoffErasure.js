// server/services/takeoffErasure.js
//
// A user's take-off records go when the user goes. The privacy policy says the
// Takeoff Time Log records (TakeoffSession) are deleted on request, and account
// deletion removes a user's data; this is where both happen.
//
// Two ways in:
//   - registerTakeoffErasure(UserSchema): every delete of a User, by any route,
//     script or admin tool that goes through mongoose, erases that user's
//     sessions and calibration answer. There is no account-deletion route yet;
//     whatever is built later inherits this without having to remember it.
//   - eraseTakeoffRecords(userIds): called directly by
//     scripts/erase-takeoff-records.mjs for a "delete my take-off records"
//     request on an account that stays open.
//
// A delete made outside mongoose (the Atlas console, mongosh) does not run the
// hooks; use the script for those.
import mongoose from "mongoose";
import { TakeoffSession } from "../models/TakeoffSession.js";
import { TakeoffCalibration } from "../models/TakeoffCalibration.js";

function toIds(userIds) {
  const list = Array.isArray(userIds) ? userIds : [userIds];
  return list
    .filter((v) => v != null && v !== "")
    .map((v) => {
      try {
        return new mongoose.Types.ObjectId(String(v));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** What erasing these users would remove, without removing it. */
export async function countTakeoffRecords(userIds) {
  const ids = toIds(userIds);
  if (!ids.length) return { sessions: 0, calibrations: 0 };
  const [sessions, calibrations] = await Promise.all([
    TakeoffSession.countDocuments({ userId: { $in: ids } }),
    TakeoffCalibration.countDocuments({ userId: { $in: ids } }),
  ]);
  return { sessions, calibrations };
}

/**
 * Deletes every Takeoff Time Log record belonging to these users: their
 * sessions (seeded ones included, since they carry the user's id too) and
 * their calibration answers. Returns the counts removed.
 */
export async function eraseTakeoffRecords(userIds) {
  const ids = toIds(userIds);
  if (!ids.length) return { sessions: 0, calibrations: 0 };
  const [s, c] = await Promise.all([
    TakeoffSession.deleteMany({ userId: { $in: ids } }),
    TakeoffCalibration.deleteMany({ userId: { $in: ids } }),
  ]);
  return { sessions: s.deletedCount || 0, calibrations: c.deletedCount || 0 };
}

const PENDING = Symbol("takeoffErasureIds");

/**
 * Hooks every way mongoose deletes a User. Query deletes (deleteOne,
 * deleteMany, findOneAndDelete, which findByIdAndDelete uses) note the matching
 * ids before the delete and erase after it succeeds; a document's own
 * deleteOne erases that document's id. A delete that fails erases nothing.
 */
export function registerTakeoffErasure(schema) {
  for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"]) {
    schema.pre(op, { document: false, query: true }, async function () {
      this[PENDING] = await this.model.find(this.getFilter()).distinct("_id");
    });
    schema.post(op, { document: false, query: true }, async function () {
      const ids = this[PENDING] || [];
      this[PENDING] = null;
      if (ids.length) await eraseTakeoffRecords(ids);
    });
  }

  schema.post("deleteOne", { document: true, query: false }, async function () {
    await eraseTakeoffRecords([this._id]);
  });
}
