// server/models/AuditLog.js
//
// Append-only audit trail. Primary purpose: accountability for the break-glass
// "God" support account — every God login and every mutating God request is
// recorded here so an admin can review exactly what was done, on which machine,
// and against which user. Also usable for general sensitive-action logging.
import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    // Who acted
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String, trim: true, lowercase: true, default: "", index: true },
    isGod: { type: Boolean, default: false, index: true },

    // What happened. `action` is a short machine key (e.g. "god.login.success",
    // "god.request"); `method`/`path` capture the HTTP request when relevant.
    action: { type: String, trim: true, default: "", index: true },
    method: { type: String, trim: true, default: "" },
    path: { type: String, trim: true, default: "" },
    status: { type: Number, default: null },

    // Context
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    targetEmail: { type: String, trim: true, lowercase: true, default: "" },
    productKey: { type: String, trim: true, lowercase: true, default: "" },

    // Anything else worth keeping (free-form).
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorEmail: 1, createdAt: -1 });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
