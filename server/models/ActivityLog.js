// server/models/ActivityLog.js
//
// Per-project activity trail surfaced to the project OWNER in their profile
// (and printable as a report). Records lifecycle events across a project —
// creation, contract lock, variations, rate/budget edits, collaborator
// access, model uploads, certificates, PM changes — with who did it.
//
// Distinct from AuditLog (which is the admin/break-glass God trail). This one
// is owner-scoped and product-facing. Append-only; writes are best-effort and
// must never block or fail a mutation (see util/activityLog.js).
import mongoose from "mongoose";

const ActivityLogSchema = new mongoose.Schema(
  {
    // The project owner — activities surface to this user. All owner-scoped
    // reads filter on this.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // Who performed the action (owner or a collaborator; may equal ownerId).
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, trim: true, default: "" },
    actorEmail: { type: String, trim: true, lowercase: true, default: "" },
    // True when the actor is a collaborator, not the owner.
    byCollaborator: { type: Boolean, default: false },

    // Project context (denormalised so the log survives project rename/delete).
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TakeoffProject",
      default: null,
      index: true,
    },
    projectName: { type: String, trim: true, default: "" },
    productKey: { type: String, trim: true, lowercase: true, default: "" },

    // Event. `action` is a machine key (e.g. "contract.locked", "variation.added").
    // `category` groups actions for filtering (project|commercial|contract|
    // collaboration|model|pm|valuation). `summary` is a human one-liner.
    action: { type: String, trim: true, default: "", index: true },
    category: { type: String, trim: true, default: "", index: true },
    summary: { type: String, trim: true, default: "" },

    // Structured extras (amounts, counts, names) for richer display.
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// Owner timeline (default view) and filtered-by-category / -project variants.
ActivityLogSchema.index({ ownerId: 1, createdAt: -1 });
ActivityLogSchema.index({ ownerId: 1, category: 1, createdAt: -1 });
ActivityLogSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 });
ActivityLogSchema.index({ actorId: 1, createdAt: -1 });

export const ActivityLog =
  mongoose.models.ActivityLog || mongoose.model("ActivityLog", ActivityLogSchema);
