// server/routes/admin.roles.js
// UAC / role management. Mounted at /admin/roles. Gated by the "roles" area,
// which is admin-exclusive — so only the super-admin can manage roles.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { RoleAudit } from "../models/RoleAudit.js";
import { ADMIN_AREAS, ALL_AREA_KEYS, sanitizePermissions } from "../config/permissions.js";
import { refreshRoleCache } from "../util/rbac.js";

const router = express.Router();

router.use(requireAuth, requirePermission("roles"));

const RESERVED_KEYS = new Set(["admin", "mini_admin", "user"]);

function slugifyKey(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function serializeRole(r) {
  return {
    key: r.key,
    name: r.name,
    permissions: r.isSuperAdmin ? [...ALL_AREA_KEYS] : r.permissions || [],
    system: !!r.system,
    isSuperAdmin: !!r.isSuperAdmin,
  };
}

// Catalog of admin areas (drives the matrix UI).
router.get("/catalog", (_req, res) => {
  res.json({ areas: ADMIN_AREAS });
});

// All roles + how many users hold each.
router.get("/", async (_req, res) => {
  try {
    const roles = await Role.find({}).sort({ system: -1, createdAt: 1 }).lean();
    const counts = await User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      roles: roles.map((r) => ({ ...serializeRole(r), userCount: countMap.get(r.key) || 0 })),
    });
  } catch (e) {
    console.error("[admin.roles] list error:", e);
    res.status(500).json({ error: "Failed to load roles" });
  }
});

// Create a custom role.
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Role name is required" });

    const key = slugifyKey(name);
    if (!key) return res.status(400).json({ error: "Invalid role name" });
    if (RESERVED_KEYS.has(key)) {
      return res.status(409).json({ error: "That name is reserved." });
    }
    if (await Role.findOne({ key })) {
      return res.status(409).json({ error: "A role with a similar name already exists." });
    }

    const permissions = sanitizePermissions(req.body?.permissions);
    const role = await Role.create({
      key,
      name,
      permissions,
      system: false,
      isSuperAdmin: false,
    });
    await refreshRoleCache();
    res.status(201).json({ role: { ...serializeRole(role), userCount: 0 } });
  } catch (e) {
    console.error("[admin.roles] create error:", e);
    res.status(500).json({ error: "Failed to create role" });
  }
});

// Edit a role's name / permissions. The super-admin role is locked; system
// roles keep their name (key is always immutable). Only staff-grantable areas
// can be assigned (sanitizePermissions enforces this).
router.patch("/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const role = await Role.findOne({ key });
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.isSuperAdmin) {
      return res
        .status(400)
        .json({ error: "The Administrator role can't be edited — it always has full access." });
    }

    if (!role.system && typeof req.body?.name === "string" && req.body.name.trim()) {
      role.name = req.body.name.trim();
    }
    if (Array.isArray(req.body?.permissions)) {
      role.permissions = sanitizePermissions(req.body.permissions);
    }
    await role.save();
    await refreshRoleCache();
    res.json({ role: serializeRole(role) });
  } catch (e) {
    console.error("[admin.roles] update error:", e);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// Delete a custom role (built-ins protected; blocked while users hold it).
router.delete("/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const role = await Role.findOne({ key });
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.system) return res.status(400).json({ error: "Built-in roles can't be deleted." });

    const inUse = await User.countDocuments({ role: key });
    if (inUse > 0) {
      return res
        .status(409)
        .json({ error: `${inUse} user(s) still have this role. Reassign them first.` });
    }
    await Role.deleteOne({ key });
    await refreshRoleCache();
    res.json({ ok: true });
  } catch (e) {
    console.error("[admin.roles] delete error:", e);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

// Search users for role assignment.
router.get("/users", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = q
      ? {
          $or: [
            { email: { $regex: q, $options: "i" } },
            { username: { $regex: q, $options: "i" } },
            { firstName: { $regex: q, $options: "i" } },
            { lastName: { $regex: q, $options: "i" } },
          ],
        }
      : {};
    const users = await User.find(filter)
      .select("email username firstName lastName role")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json({ users });
  } catch (e) {
    console.error("[admin.roles] users error:", e);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// Recent role-change audit (newest first). Defined before "/:key/members" so the
// literal "/audit" path is never captured as a role key.
router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const entries = await RoleAudit.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ entries });
  } catch (e) {
    console.error("[admin.roles] audit error:", e);
    res.status(500).json({ error: "Failed to load audit" });
  }
});

// List the users who currently hold a given role (capped — the default "user"
// role can be large). Drives the per-role member list in the UAC screen.
router.get("/:key/members", async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const role = await Role.findOne({ key }).lean();
    if (!role) return res.status(404).json({ error: "Role not found" });

    const LIMIT = 200;
    const total = await User.countDocuments({ role: key });
    const members = await User.find({ role: key })
      .select("email username firstName lastName createdAt")
      .sort({ updatedAt: -1 })
      .limit(LIMIT)
      .lean();
    res.json({ members, total, capped: total > LIMIT });
  } catch (e) {
    console.error("[admin.roles] members error:", e);
    res.status(500).json({ error: "Failed to load members" });
  }
});

// Assign a role to a user. Guards: target role must exist; can't strip the last
// admin or demote yourself out of admin. Enforcement is DB-backed so the change
// is live immediately; the user's UI catches up on its next token refresh.
router.patch("/users/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const newRole = String(req.body?.role || "").toLowerCase().trim();
    if (!newRole) return res.status(400).json({ error: "role is required" });
    if (!(await Role.findOne({ key: newRole }))) {
      return res.status(400).json({ error: "Unknown role" });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    const actingId = String(req.user?._id || req.user?.id || req.user?.sub || "");
    if (target.role === "admin" && newRole !== "admin") {
      if (String(target._id) === actingId) {
        return res.status(400).json({ error: "You can't change your own admin role." });
      }
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ error: "You can't remove the last administrator." });
      }
    }

    const fromRole = target.role;
    target.role = newRole;
    await target.save();

    // Best-effort audit — never block the role change on a logging failure.
    try {
      await RoleAudit.create({
        actorId: actingId || undefined,
        actorEmail: req.user?.email || "",
        targetId: target._id,
        targetEmail: target.email || target.username || "",
        fromRole,
        toRole: newRole,
        action: newRole === "user" ? "revoke" : "assign",
      });
    } catch (logErr) {
      console.error("[admin.roles] audit write failed:", logErr?.message || logErr);
    }

    res.json({ ok: true, user: { _id: target._id, role: target.role } });
  } catch (e) {
    console.error("[admin.roles] assign error:", e);
    res.status(500).json({ error: "Failed to assign role" });
  }
});

export default router;
