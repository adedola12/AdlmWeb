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
  if (u.designAccess) return true; // sees every section, all of it placeholder
  if (Array.isArray(u.permissions)) return u.permissions.includes(area);
  return u.role === "mini_admin"; // legacy token fallback
};

// TWO SEPARATE VIEW-ONLY ROLES, MERGED RATHER THAN RECONCILED
//
// Both branches grew the same idea independently and gave it different names
// and different flags: `designAccess` here, `demoMode` on main. They are kept
// side by side because each has live callers and its own server middleware
// (designMode.js and demoMode.js), and collapsing them inside a merge would
// silently change who can see what. Consolidating them is a decision for
// whoever owns the admin, not for the merge that brought them together.

// "Design Access" — opens every admin screen, but the server replaces every
// /admin response with placeholder data and simulates every write. Meant for a
// designer rebuilding the admin UI without exposing real customers or revenue.
export const isDesignAccess = (u) => !!u?.designAccess;

// Read-only demo session (designer / external collaborator). Sees every admin
// screen with placeholder data; the server refuses any write it attempts.
export const isDemo = (u) => !!u?.demoMode;

// Full administrator (super-admin).
//
// The asymmetry below is deliberate and is each side's own rule, preserved:
// Design Access counts as admin so the admin-only chrome renders for a
// designer (the data behind it is fake and nothing they submit reaches the
// database), while a demo session is NOT folded in — main's note is explicit
// that it must never be treated as having authority, only visibility.
export const isAdmin = (u) => !!(u?.isSuperAdmin || u?.role === "admin" || u?.designAccess);

export const isMiniAdmin = (u) => u?.role === "mini_admin";

// Holds ANY admin area — admin, mini-admin, or a custom role with permissions.
export const isStaff = (u) =>
  isAdmin(u) || // covers Design Access too
  u?.role === "mini_admin" ||
  (Array.isArray(u?.permissions) && u.permissions.length > 0);
