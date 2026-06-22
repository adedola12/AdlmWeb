// server/util/rbac.js
// In-memory role/permission resolution. The Role collection is tiny (a handful
// of rows) so we cache it all and refresh on every mutation. Enforcement
// middleware (requirePermission) and client serialization both resolve through
// here. The pure decideAccess() is exported for unit testing without a DB.
import { Role } from "../models/Role.js";
import { STAFF_GRANTABLE_KEYS } from "../config/permissions.js";

// roleKey -> { isSuperAdmin: boolean, perms: Set<string> }
let roleCache = new Map();

export async function loadRoleCache() {
  const roles = await Role.find({}).lean();
  const next = new Map();
  for (const r of roles) {
    next.set(r.key, {
      isSuperAdmin: !!r.isSuperAdmin,
      perms: new Set(r.permissions || []),
    });
  }
  roleCache = next;
  return roleCache;
}

export const refreshRoleCache = loadRoleCache;

export function getRoleAccess(roleKey) {
  return roleCache.get(String(roleKey || "")) || null;
}

// Pure decision: does this access record grant the area? Super-admin → always.
export function decideAccess(access, area) {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  return access.perms.has(area);
}

export function roleHasArea(roleKey, area) {
  return decideAccess(getRoleAccess(roleKey), area);
}

export function isSuperAdminRole(roleKey) {
  return !!getRoleAccess(roleKey)?.isSuperAdmin;
}

// The full list of area keys a role can see — used to serialize the user's
// permissions to the client. Super-admin expands to every known area.
export function rolePermissionList(roleKey, allAreaKeys) {
  const a = getRoleAccess(roleKey);
  if (!a) return [];
  if (a.isSuperAdmin) return [...allAreaKeys];
  return [...a.perms];
}

// Idempotent seed of the built-in roles. Creates missing rows; for existing
// rows only repairs the system/superadmin flags — never clobbers an admin's
// edits to mini_admin's (or any) permissions.
export async function ensureRolesSeeded() {
  const defaults = [
    { key: "admin", name: "Administrator", system: true, isSuperAdmin: true, permissions: [] },
    {
      key: "mini_admin",
      name: "Mini Admin",
      system: true,
      isSuperAdmin: false,
      permissions: [...STAFF_GRANTABLE_KEYS],
    },
    { key: "user", name: "User", system: true, isSuperAdmin: false, permissions: [] },
  ];

  for (const d of defaults) {
    const existing = await Role.findOne({ key: d.key });
    if (!existing) {
      await Role.create(d);
      continue;
    }
    let changed = false;
    if (existing.system !== true) {
      existing.system = true;
      changed = true;
    }
    if (d.key === "admin" && !existing.isSuperAdmin) {
      existing.isSuperAdmin = true;
      changed = true;
    }
    if (changed) await existing.save();
  }

  await loadRoleCache();
}
