// src/utils/roles.js
// Permission-aware role helpers. The server serializes `isSuperAdmin` and a
// `permissions` array (admin area keys) onto the user; these helpers read those,
// with a fallback to the legacy `role` string for sessions whose token predates
// the permissions field (they re-sync on the next refresh).

// Does the user hold a given admin area? Super-admins hold everything. If the
// token predates RBAC (no `permissions` array), fall back to the legacy role
// rule so existing admin/mini-admin sessions aren't locked out during the brief
// window before their token refreshes with the new fields.
export const can = (u, area) => {
  if (!u) return false;
  if (u.isSuperAdmin || u.role === "admin") return true;
  if (Array.isArray(u.permissions)) return u.permissions.includes(area);
  return u.role === "mini_admin"; // legacy token fallback
};

// Full administrator (super-admin).
export const isAdmin = (u) => !!(u?.isSuperAdmin || u?.role === "admin");

export const isMiniAdmin = (u) => u?.role === "mini_admin";

// Holds ANY admin area — admin, mini-admin, or a custom role with permissions.
export const isStaff = (u) =>
  isAdmin(u) ||
  u?.role === "mini_admin" ||
  (Array.isArray(u?.permissions) && u.permissions.length > 0);
