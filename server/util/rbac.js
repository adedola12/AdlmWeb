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
  return setRoleCache(await Role.find({}).lean());
}

// Build the cache from role rows already in hand (lean or hydrated).
function setRoleCache(roles) {
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

// ensureRolesSeeded() once per process. On Lambda the seed starts while the
// app is still importing (lambda.js startDatabaseEarly) and bootstrap() then
// awaits the same run instead of repeating its two Atlas round trips. A failed
// run is forgotten, so the next caller tries again.
let _seedOnce = null;
export function ensureRolesSeededOnce() {
  if (!_seedOnce) {
    _seedOnce = ensureRolesSeeded().catch((err) => {
      _seedOnce = null;
      throw err;
    });
  }
  return _seedOnce;
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
    // Release approver (docs/RELEASE_GATE.md) — the release sign-off desk and
    // nothing else. Being in this role opens the screen and the staff preview;
    // the right to approve comes from being the named approver in
    // ReleaseGateConfig, not from the role.
    {
      key: "release_approver",
      name: "Release Approver",
      system: true,
      isSuperAdmin: false,
      permissions: ["releases"],
    },
    // Tech support — can sign in to the staff preview site and nothing else.
    // Other areas can be ticked on it later in Roles & Access; the seed only
    // makes sure "preview" stays on.
    {
      key: "tech_support",
      name: "Tech Support",
      system: true,
      isSuperAdmin: false,
      permissions: ["preview"],
    },
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

  // ONE query for everything. This runs on every Lambda cold start, where
  // each round trip to Atlas costs ~400-600ms. It used to be two: the built-in
  // roles (to repair them) and then every role again (for the cache). Reading
  // every role once serves both, since the built-ins are a subset and the
  // collection is a handful of rows. The seed is idempotent and almost always
  // finds everything present, so on all but the first-ever run this is the
  // only database work it does.
  const allRoles = await Role.find({});
  const byKey = new Map(allRoles.map((r) => [r.key, r]));
  let created = false;

  for (const d of defaults) {
    const existing = byKey.get(d.key);
    if (!existing) {
      await Role.create(d);
      created = true;
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
    if (d.key === "release_approver" && !(existing.permissions || []).includes("releases")) {
      existing.permissions = [...(existing.permissions || []), "releases"];
      changed = true;
    }
    if (d.key === "tech_support" && !(existing.permissions || []).includes("preview")) {
      existing.permissions = [...(existing.permissions || []), "preview"];
      changed = true;
    }
    if (d.key === "design" && !existing.designAccess) {
      existing.designAccess = true;
      changed = true;
    }
    if (changed) await existing.save();
  }

  // Repairs were made on these same documents, so they are already current.
  // Only a newly created role is missing from them; re-read in that case
  // (the first-ever boot, or a new built-in role being added).
  if (created) await loadRoleCache();
  else setRoleCache(allRoles);
}
