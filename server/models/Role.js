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
    // Demo role — sees every admin area, but strictly read-only and every
    // response is rewritten with placeholder data. For designers and other
    // external collaborators who need the screens, not the business.
    // Enforced by server/middleware/demoMode.js.
    demoMode: { type: Boolean, default: false },
  },
  // demoTenancy:false — infrastructure, never split per tenant. The auth and
  // permission layers read this on every request, so scoping it to a demo
  // tenant would make a demo session resolve nothing and lock itself out.
  // See server/models/demoTenancy.js.
  { timestamps: true, demoTenancy: false },
);

export const Role = mongoose.models.Role || mongoose.model("Role", RoleSchema);
