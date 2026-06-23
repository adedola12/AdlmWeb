// server/models/RoleAudit.js
// Lightweight append-only audit of role changes (assign / revoke). Written by
// admin.roles.js whenever a user's role is changed, so the super-admin can see
// who changed whom. Intentionally minimal — no PII beyond the email already
// visible in the UAC screen.
import mongoose from "mongoose";

const RoleAuditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String, default: "" },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetEmail: { type: String, default: "" },
    fromRole: { type: String, default: "" },
    toRole: { type: String, default: "" },
    action: { type: String, default: "assign" }, // "assign" | "revoke"
  },
  { timestamps: true },
);

export const RoleAudit =
  mongoose.models.RoleAudit || mongoose.model("RoleAudit", RoleAuditSchema);

export default RoleAudit;
