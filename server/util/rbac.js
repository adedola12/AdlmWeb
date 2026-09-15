// server/util/rbac.js
// In-memory role/permission resolution. The Role collection is tiny (a handful
// of rows) so we cache it all and refresh on every mutation. Enforcement
// middleware (requirePermission) and client serialization both resolve through
// here. The pure decideAccess() is exported for unit testing without a DB.
import { Role } from "../models/Role.js";
import { STAFF_GRANTABLE_KEYS } from "../config/permissions.js";

// roleKey -> { isSuperAdmin: boolean, designAccess: boolean, perms: Set<string> }
let roleCache = new Map();

export async function loadRoleCache() {
  const roles = await Role.find({}).lean();
  const next = new Map();
  for (const r of roles) {
    next.set(r.key, {
      isSuperAdmin: !!r.isSuperAdmin,
      designAccess: !!r.designAccess && !r.isSuperAdmin,
      demoMode: !!r.demoMode,
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
// Both view-only roles see every area — each is meant to walk the whole admin
// UI — and in both cases the breadth costs nothing because the response has
// already been masked: designMode.js for one, demoModeGuard for the other.
// Visibility here is visibility of the SCREEN, never of the data or the
// ability to change it.
export function decideAccess(access, area) {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  if (access.designAccess) return true;
  if (access.demoMode) return true;
  return access.perms.has(area);
}

export function roleHasArea(roleKey, area) {
  return decideAccess(getRoleAccess(roleKey), area);
}

export function isSuperAdminRole(roleKey) {
  return !!getRoleAccess(roleKey)?.isSuperAdmin;
}

// Does this role browse the admin UI in placeholder-data mode? Two roles do,
// by two different routes, and each middleware asks about its own.
export function isDesignRole(roleKey) {
  return !!getRoleAccess(roleKey)?.designAccess;
}

export function isDemoRole(roleKey) {
  return !!getRoleAccess(roleKey)?.demoMode;
}

// The full list of area keys a role can see — used to serialize the user's
// permissions to the client. Super-admin expands to every known area.
export function rolePermissionList(roleKey, allAreaKeys) {
  const a = getRoleAccess(roleKey);
  if (!a) return [];
  if (a.isSuperAdmin || a.designAccess || a.demoMode) return [...allAreaKeys];
  return [...a.perms];
}

// Idempotent seed of the built-in roles. Creates missing rows; for existing
// rows only repairs the system/superadmin flags — never clobbers an admin's
// edits to mini_admin's (or any) permissions.
export async function ensureRolesSeeded() {
  const defaults = [
    { key: "admin", name: "Administrator", system: true, isSuperAdmin: true, permissions: [] },
    {
      key: "design",
      name: "Design Access",
      system: true,
      isSuperAdmin: false,
      designAccess: true,
      permissions: [],
    },
    {
      key: "mini_admin",
      name: "Mini Admin",
      system: true,
      isSuperAdmin: false,
      permissions: [...STAFF_GRANTABLE_KEYS],
    },
    { key: "user", name: "User", system: true, isSuperAdmin: false, permissions: [] },
    // Designer — sees every admin screen, read-only, with all identities and
    // figures replaced by placeholders. `permissions` stays empty on purpose:
    // access comes from the demoMode flag (see decideAccess above), so nobody
    // can widen or narrow it by editing a permission matrix.
    {
      key: "designer",
      name: "Designer (demo data)",
      system: true,
      isSuperAdmin: false,
      demoMode: true,
      permissions: [],
    },
  ];

  // One query for all three, not one each. This runs on every Lambda cold
  // start, where each round trip to Atlas costs ~400-600ms — measured at ~1.9s
  // for the whole function against a ~4s cold request. The seeding is
  // idempotent and almost always finds everything already present, so the
  // sequential findOne()s were pure latency on all but the first-ever run.
  const existingRoles = await Role.find({ key: { $in: defaults.map((d) => d.key) } });
  const byKey = new Map(existingRoles.map((r) => [r.key, r]));

  for (const d of defaults) {
    const existing = byKey.get(d.key);
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
    // Repair either view-only flag the same way as the superadmin flag: a
    // built-in role that lost it would silently start serving real data.
    if (d.demoMode && !existing.demoMode) {
      existing.demoMode = true;
      changed = true;
    }
    if (d.key === "design" && !existing.designAccess) {
      existing.designAccess = true;
      changed = true;
    }
    if (changed) await existing.save();
  }

  await loadRoleCache();
}
