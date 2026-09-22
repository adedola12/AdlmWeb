// server/models/ReleaseCandidate.js
//
// A release that has been submitted but has not reached customers yet.
//
// Every plugin release (a PUT to /admin/deployments/:productKey that changes
// what the Installer Hub would download) lands here first. It only becomes the
// live ProductDeployment when the release approver signs it off, or when a
// super-admin forces it through as an emergency, which is recorded, emailed to
// the approver, and stays flagged until the approver reviews it.
// See util/releaseGate.js and docs/RELEASE_GATE.md.
import mongoose from "mongoose";

const ReleaseCandidateSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    displayName: { type: String, trim: true, default: "" },
    fromVersion: { type: String, trim: true, default: "" },
    toVersion: { type: String, trim: true, default: "" },

    // The normalized deployment exactly as it will be written on approval.
    // Stored whole so what the approver tested is byte-for-byte what ships.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    // Extras the release notifier reads (releaseNotes, notifySubscribers).
    notifyBody: { type: mongoose.Schema.Types.Mixed, default: null },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "superseded", "emergency"],
      default: "pending",
      index: true,
    },

    submittedBy: { type: String, trim: true, lowercase: true, default: "" },
    submittedAt: { type: Date, default: Date.now },

    decidedBy: { type: String, trim: true, lowercase: true, default: "" },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, default: "" },

    // Emergency path only.
    emergencyReason: { type: String, trim: true, default: "" },
    reviewDueAt: { type: Date, default: null },
    reviewedBy: { type: String, trim: true, lowercase: true, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewVerdict: { type: String, enum: ["", "upheld", "objected"], default: "" },
  },
  { timestamps: true, minimize: false, demoTenancy: false },
);

export const ReleaseCandidate =
  mongoose.models.ReleaseCandidate || mongoose.model("ReleaseCandidate", ReleaseCandidateSchema);
