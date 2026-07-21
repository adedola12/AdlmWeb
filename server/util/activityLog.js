// server/util/activityLog.js
//
// Fire-and-forget helper for writing project ActivityLog entries. It NEVER
// throws and NEVER blocks the caller — instrumentation sites call it without
// awaiting, so a logging failure can't affect the mutation it records.
//
// Usage at a mutation site (projects.js / projects.pm.js):
//   recordActivity(req, project, ACT.CONTRACT_LOCKED, "Locked the contract", { contractSum });

import { ActivityLog } from "../models/ActivityLog.js";

// Known action keys. Free-form is allowed, but use these for consistency so
// the client can group/label reliably.
export const ACT = {
  PROJECT_CREATED: "project.created",
  PROJECT_DELETED: "project.deleted",
  BOQ_REIMPORTED: "project.boq-reimported",
  CONTRACT_LOCKED: "contract.locked",
  CONTRACT_UNLOCKED: "contract.unlocked",
  VARIATION_ADDED: "variation.added",
  VARIATION_UPDATED: "variation.updated",
  VARIATION_REMOVED: "variation.removed",
  RATES_UPDATED: "rate.updated",
  BUDGET_UPDATED: "budget.updated",
  PROVISIONAL_CHANGED: "provisional.changed",
  PRELIMINARY_CHANGED: "preliminary.changed",
  COLLABORATOR_ADDED: "collaborator.added",
  COLLABORATOR_REMOVED: "collaborator.removed",
  COLLABORATOR_CLAIMED: "collaborator.claimed",
  SHARE_TOGGLED: "share.toggled",
  MODEL_UPLOADED: "model.uploaded",
  MODEL_DELETED: "model.deleted",
  CERTIFICATE_ISSUED: "certificate.issued",
  CERTIFICATE_UPDATED: "certificate.updated",
  CERTIFICATE_DELETED: "certificate.deleted",
  FINAL_ACCOUNT_FINALIZED: "finalaccount.finalized",
  FINAL_ACCOUNT_REOPENED: "finalaccount.reopened",
  PM_UPDATED: "pm.updated",
  PM_GENERATED: "pm.generated",
  PM_IMPORTED: "pm.imported",
  PM_RESCHEDULED: "pm.rescheduled",
  PM_RESET: "pm.reset",
};

// Map an action key to a coarse category for filtering in the UI.
function categoryFor(action) {
  const a = String(action || "");
  if (a.startsWith("project.")) return "project";
  if (a.startsWith("contract.") || a.startsWith("finalaccount.")) return "contract";
  if (a.startsWith("certificate.")) return "valuation";
  if (
    a.startsWith("variation.") ||
    a.startsWith("rate.") ||
    a.startsWith("budget.") ||
    a.startsWith("provisional.") ||
    a.startsWith("preliminary.")
  )
    return "commercial";
  if (a.startsWith("collaborator.") || a.startsWith("share.")) return "collaboration";
  if (a.startsWith("model.")) return "model";
  if (a.startsWith("pm.")) return "pm";
  return "other";
}

function toId(v) {
  if (!v) return null;
  if (typeof v === "object" && v._id) return v._id;
  return v;
}

function idEquals(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/**
 * Record one activity. Best-effort: builds the entry from the request's actor
 * and the loaded project, then writes without awaiting. Safe to call anywhere.
 *
 * @param {object} req      Express request (req.user = decoded JWT { _id, email, ... })
 * @param {object} project  The loaded TakeoffProject doc (owner = project.userId)
 * @param {string} action   One of ACT.* (or a free-form key)
 * @param {string} summary  Human one-liner for the timeline
 * @param {object} [meta]   Structured extras
 */
export function recordActivity(req, project, action, summary, meta = null) {
  try {
    if (!project) return;
    const ownerId = toId(project.userId);
    if (!ownerId) return;

    const actorId = toId(req?.user?._id || req?.user?.id) || null;
    const actorEmail = String(req?.user?.email || "").toLowerCase();
    const actorName = String(
      req?.user?.name || req?.user?.username || req?.user?.firstName || "",
    ).trim();

    ActivityLog.create({
      ownerId,
      actorId,
      actorName,
      actorEmail,
      byCollaborator: actorId ? !idEquals(actorId, ownerId) : false,
      projectId: toId(project._id),
      projectName: String(project.name || "").slice(0, 200),
      productKey: String(project.productKey || "").toLowerCase(),
      action,
      category: categoryFor(action),
      summary: String(summary || "").slice(0, 500),
      meta: meta || null,
    }).catch((e) => {
      // Never surface — activity logging is non-critical.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[activityLog] write failed:", e?.message || e);
      }
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[activityLog] recordActivity error:", e?.message || e);
    }
  }
}
