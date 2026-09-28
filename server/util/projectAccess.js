// What a requester may do with a project they can already see.
//
// Matching a project is not the same as being allowed to change it. The
// project routes have always drawn that line; the ArchiCAD routes never did.
// They query {$or: [{userId}, {"collaborators.userId": userId}]} — so a
// collaborator reaches the document — and then read no access level at all
// across fourteen endpoints. A view-only collaborator could re-price the
// owner's bill, and a collaborator without RateGen was handed every rate, the
// grand totals, the XLSX and the PDF of a project whose money they are not
// entitled to see.
//
// So the rule lives here now, with one definition rather than one per surface.
//
//   role        owner | full | view | sample | none
//   canEdit     owner or full   — mutations
//   canExport   owner or full   — xlsx / pdf / model download
//   canManage   owner only      — share codes, collaborators, deleting
//   canSeeRates owner always; a collaborator only with active RateGen
//
// The entitlement check is injected rather than imported so this file stays
// free of route and model wiring, and so a caller that has already resolved
// it does not pay for a second lookup.

import mongoose from "mongoose";

/** The requester's id as an ObjectId, or null. */
export function userObjectId(req) {
  const raw = req?.user?._id || req?.user?.id;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

export const NO_ACCESS = Object.freeze({
  role: "none",
  accessLevel: null,
  canEdit: false,
  canExport: false,
  canManage: false,
  canSeeRates: false,
});

/**
 * @param {ObjectId|null} uid        the requester
 * @param {object|null}   project    an already-loaded project document
 * @param {object}        [deps]
 * @param {(uid:any)=>Promise<boolean>} [deps.hasRateGen]  active RateGen check
 */
export async function resolveProjectAccess(uid, project, deps = {}) {
  const out = { ...NO_ACCESS };
  if (!project || !uid) return out;

  // Samples: look at everything, including rates, but change nothing.
  if (project.isSample) {
    return { ...out, role: "sample", accessLevel: "view", canExport: true, canSeeRates: true };
  }

  if (project.userId && uid.equals(project.userId)) {
    return {
      ...out,
      role: "owner",
      canEdit: true,
      canExport: true,
      canManage: true,
      canSeeRates: true,
    };
  }

  const collab = (project.collaborators || []).find((c) => c.userId && uid.equals(c.userId));
  if (!collab) return out; // not owner, not collaborator → nothing

  const role = collab.accessLevel === "full" ? "full" : "view";
  const hasRateGen = typeof deps.hasRateGen === "function" ? deps.hasRateGen : async () => false;
  return {
    ...out,
    role,
    accessLevel: role,
    canEdit: role === "full",
    canExport: role === "full",
    canSeeRates: await hasRateGen(uid),
  };
}

/** Is this an active, unexpired entitlement for `key`? */
export function entitlementIsActive(entitlements, key, now = Date.now()) {
  const e = (Array.isArray(entitlements) ? entitlements : []).find(
    (x) => x?.productKey === key && x?.status === "active",
  );
  if (!e) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < now) return false;
  return true;
}

export default resolveProjectAccess;
