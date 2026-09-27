// server/models/ModelDriftEvent.js
//
// One row per model-drift episode on a project (work-board item
// r2-model-drift-alerts). The project carries only the CURRENT drift
// (TakeoffProject.modelDrift) for the badge; this is the history the success
// metric is read from:
//
//   * drift events detected, and the share closed by a take-off re-save within
//     7 days                                   (openedAt, clearedAt, clearedBy)
//   * certificates issued while drift was open (certificatesWhileOpen)
//   * the false-alarm rate                     (clearedBy "dismissed")
//
// Same privacy rule as the project summary: counts only, and the model named
// only by its one-way modelRef.
import mongoose from "mongoose";

const ModelDriftEventSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "TakeoffProject", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Who ran the plugin that saw it (the owner or a full collaborator).
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    productKey: { type: String, trim: true, lowercase: true, default: "" },
    productVersion: { type: String, trim: true, default: "" },
    modelRef: { type: String, trim: true, default: "" },
    signature: { type: String, default: "" },

    openedAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, default: null },
    reports: { type: Number, default: 1, min: 0 },
    counts: {
      added: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
      changed: { type: Number, default: 0 },
      linesAffected: { type: Number, default: 0 },
    },

    clearedAt: { type: Date, default: null },
    clearedBy: { type: String, enum: ["", "takeoff-save", "clean-check", "dismissed"], default: "" },
    dismissedReason: { type: String, default: "" },
    certificatesWhileOpen: { type: Number, default: 0, min: 0 },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ModelDriftEventSchema.index({ productKey: 1, openedAt: -1 });

export const ModelDriftEvent =
  mongoose.models.ModelDriftEvent || mongoose.model("ModelDriftEvent", ModelDriftEventSchema);
