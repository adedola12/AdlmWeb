// server/services/modelDriftStore.js
//
// The database side of model drift (work-board item r2-model-drift-alerts).
// The rules live in services/modelDrift.js and are pure; this file only
// writes what they decided.
//
// Every write to the project here passes { timestamps: false } and leaves
// `version` alone: a drift report is not an edit, so it must not reorder the
// projects gallery (sorted by updatedAt) or make the plugin's next save look
// stale against baseVersion.
import { TakeoffProject } from "../models/TakeoffProject.js";
import { ModelDriftEvent } from "../models/ModelDriftEvent.js";
import { clearDriftOnTakeoffSave } from "./modelDrift.js";

/**
 * Persist the result of applyDriftReport() / dismissDrift().
 *
 * @param project   the loaded project document
 * @param decision  { action, drift } from the rules
 * @param ctx       { userId, productKey, now }
 * @returns the drift as stored
 */
export async function persistDriftDecision(project, decision, ctx = {}) {
  const now = ctx.now || new Date();
  const drift = { ...decision.drift };
  const counts = {
    added: drift.counts?.added || 0,
    removed: drift.counts?.removed || 0,
    changed: drift.counts?.changed || 0,
    linesAffected: drift.counts?.linesAffected || 0,
  };

  if (decision.action === "open") {
    const ev = await ModelDriftEvent.create({
      projectId: project._id,
      ownerId: project.userId || null,
      reportedBy: ctx.userId || null,
      productKey: String(ctx.productKey || project.productKey || ""),
      productVersion: drift.productVersion || "",
      modelRef: drift.modelRef || "",
      signature: drift.signature || "",
      openedAt: drift.detectedAt || now,
      lastSeenAt: now,
      counts,
    });
    drift.eventId = ev._id;
  } else if (drift.eventId) {
    const set =
      decision.action === "refresh"
        ? { lastSeenAt: now, counts, signature: drift.signature || "" }
        : { clearedAt: drift.clearedAt || now, clearedBy: drift.clearedBy || "", dismissedReason: drift.dismissedReason || "" };
    await ModelDriftEvent.updateOne(
      { _id: drift.eventId },
      decision.action === "refresh" ? { $set: set, $inc: { reports: 1 } } : { $set: set },
    );
  }

  await TakeoffProject.updateOne({ _id: project._id }, { $set: { modelDrift: drift } }, { timestamps: false });
  return drift;
}

/**
 * A take-off was just saved from the model: close any open drift on it.
 * Atomic on status, so it never touches a project with nothing open, and it
 * never fails the save that called it.
 */
export async function closeDriftAfterTakeoffSave(projectId, now = new Date()) {
  try {
    const before = await TakeoffProject.findOne(
      { _id: projectId, "modelDrift.status": "open" },
      { modelDrift: 1 },
    ).lean();
    const next = before ? clearDriftOnTakeoffSave(before.modelDrift, now) : null;
    if (!next) return false;
    const r = await TakeoffProject.updateOne(
      { _id: projectId, "modelDrift.status": "open" },
      {
        $set: {
          "modelDrift.status": next.status,
          "modelDrift.clearedAt": next.clearedAt,
          "modelDrift.clearedBy": next.clearedBy,
        },
      },
      { timestamps: false },
    );
    if (r.modifiedCount && next.eventId) {
      await ModelDriftEvent.updateOne(
        { _id: next.eventId, clearedAt: null },
        { $set: { clearedAt: now, clearedBy: "takeoff-save" } },
      );
    }
    return r.modifiedCount > 0;
  } catch (err) {
    console.error("[model-drift] close after save failed:", err?.message || err);
    return false;
  }
}

/** A certificate was issued while the project's drift was open. */
export async function noteCertificateWhileDriftOpen(project) {
  const d = project?.modelDrift;
  if (!d || d.status !== "open" || !d.eventId) return;
  try {
    await ModelDriftEvent.updateOne({ _id: d.eventId }, { $inc: { certificatesWhileOpen: 1 } });
  } catch (err) {
    console.error("[model-drift] certificate note failed:", err?.message || err);
  }
}

/**
 * The project's own drift was closed in the same save that wrote the bill
 * (routes/projects.js updateProject); record it on the event. Fire and forget.
 */
export function closeDriftEvent(drift) {
  if (!drift?.eventId) return;
  ModelDriftEvent.updateOne(
    { _id: drift.eventId, clearedAt: null },
    { $set: { clearedAt: drift.clearedAt || new Date(), clearedBy: drift.clearedBy || "takeoff-save" } },
  ).catch((err) => console.error("[model-drift] event close failed:", err?.message || err));
}
