// server/models/Role.js
// A role is a named bundle of admin-area permissions. Built-in roles (admin,
// mini_admin, user) are seeded with system:true and cannot be deleted. The
// admin role carries isSuperAdmin:true and implicitly grants every area.
import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    // Area keys (see server/config/permissions.js). Ignored when isSuperAdmin.
    permissions: { type: [String], default: [] },
    // Built-in role — cannot be deleted; key is immutable.
    system: { type: Boolean, default: false },
    // Superuser — implicitly has every area, immune to permission edits.
    isSuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Role = mongoose.models.Role || mongoose.model("Role", RoleSchema);
