import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { Classroom } from "../models/Classroom.js";
import { User } from "../models/User.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── User autocomplete for the "create classroom" modal ──
// Reuses the same suggestion shape as admin.invoices.js so the client picker
// component can be shared.
router.get(
  "/users-suggest",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ users: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");

    const users = await User.find(
      {
        $or: [
          { email: rx },
          { firstName: rx },
          { lastName: rx },
          { username: rx },
        ],
      },
      { email: 1, firstName: 1, lastName: 1, username: 1 },
    )
      .limit(10)
      .lean();

    res.json({
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        name:
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.username ||
          "",
      })),
    });
  }),
);

// Helper: load a list of users by id and produce member sub-docs with
// snapshotted email/name. Skips invalid ids and missing users silently.
async function buildMembersFromUserIds(userIds) {
  const ids = (Array.isArray(userIds) ? userIds : [])
    .map((v) => String(v || "").trim())
    .filter((v) => /^[0-9a-fA-F]{24}$/.test(v));
  if (!ids.length) return [];

  const users = await User.find(
    { _id: { $in: ids } },
    { email: 1, firstName: 1, lastName: 1, username: 1 },
  ).lean();

  return users.map((u) => ({
    userId: u._id,
    userEmail: u.email || "",
    userName:
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
    addedAt: new Date(),
  }));
}

// Normalize a classroom doc for response: ensure members[] is populated
// even for legacy single-user rows.
function withMembers(c) {
  if (!c) return c;
  const members = Array.isArray(c.members) && c.members.length
    ? c.members
    : c.userId
      ? [
          {
            userId: c.userId,
            userEmail: c.userEmail || "",
            userName: c.userName || "",
            addedAt: c.createdAt || null,
          },
        ]
      : [];
  return { ...c, members };
}

// ── List ──
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.userId) {
      // Match on either modern members.userId or legacy top-level userId.
      filter.$or = [
        { "members.userId": req.query.userId },
        { userId: req.query.userId },
      ];
    }
    if (req.query.companyName) filter.companyName = String(req.query.companyName).trim();
    if (req.query.includeInactive !== "true") filter.isActive = true;

    const items = await Classroom.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ ok: true, items: items.map(withMembers) });
  }),
);

// ── Create ──
// Accepts either `userIds: [id, id, ...]` (preferred, multi-user) or a
// single `userId` (kept for backwards compatibility with v1 callers).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const title = String(b.title || "").trim();
    if (!title) return res.status(400).json({ error: "title is required" });

    // Combine userIds[] and singular userId into one set.
    const idSet = new Set();
    if (Array.isArray(b.userIds)) {
      for (const id of b.userIds) idSet.add(String(id || "").trim());
    }
    if (b.userId) idSet.add(String(b.userId).trim());

    const members = await buildMembersFromUserIds([...idSet]);
    if (!members.length) {
      return res.status(400).json({ error: "At least one valid user is required" });
    }

    const classroom = await Classroom.create({
      members,
      // Backfill the legacy fields with the first member so older readers
      // still see something coherent. Future writes don't rely on these.
      userId: members[0].userId,
      userEmail: members[0].userEmail,
      userName: members[0].userName,
      title,
      description: String(b.description || "").trim(),
      classroomCode: String(b.classroomCode || "").trim(),
      classroomUrl: String(b.classroomUrl || "").trim(),
      companyName: String(b.companyName || "").trim(),
      createdBy: req.user?.email || "",
    });

    res.json({ ok: true, item: withMembers(classroom.toObject()) });
  }),
);

// ── Update ──
// Updates classroom-level fields (title/code/url/etc) and supports member
// add/remove via:
//   addUserIds:    [id, id, ...]      // add new members (skips duplicates)
//   removeUserIds: [id, id, ...]      // remove existing members
//   replaceUserIds:[id, id, ...]      // replace whole roster
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) return res.status(404).json({ error: "Not found" });

    if (b.title !== undefined) classroom.title = String(b.title || "").trim();
    if (b.description !== undefined) classroom.description = String(b.description || "").trim();
    if (b.classroomCode !== undefined) classroom.classroomCode = String(b.classroomCode || "").trim();
    if (b.classroomUrl !== undefined) classroom.classroomUrl = String(b.classroomUrl || "").trim();
    if (b.companyName !== undefined) classroom.companyName = String(b.companyName || "").trim();
    if (b.isActive !== undefined) classroom.isActive = !!b.isActive;

    // Resolve current members, falling back to legacy single-user shape.
    let members = Array.isArray(classroom.members) && classroom.members.length
      ? classroom.members.map((m) => ({
          userId: m.userId,
          userEmail: m.userEmail,
          userName: m.userName,
          addedAt: m.addedAt,
        }))
      : classroom.userId
        ? [
            {
              userId: classroom.userId,
              userEmail: classroom.userEmail || "",
              userName: classroom.userName || "",
              addedAt: classroom.createdAt || new Date(),
            },
          ]
        : [];

    if (Array.isArray(b.replaceUserIds)) {
      members = await buildMembersFromUserIds(b.replaceUserIds);
    } else {
      if (Array.isArray(b.removeUserIds) && b.removeUserIds.length) {
        const drop = new Set(b.removeUserIds.map((x) => String(x)));
        members = members.filter((m) => !drop.has(String(m.userId)));
      }
      if (Array.isArray(b.addUserIds) && b.addUserIds.length) {
        const existingIds = new Set(members.map((m) => String(m.userId)));
        const toAdd = b.addUserIds
          .map((x) => String(x))
          .filter((x) => !existingIds.has(x));
        const newMembers = await buildMembersFromUserIds(toAdd);
        members = [...members, ...newMembers];
      }
    }

    if (!members.length) {
      return res.status(400).json({
        error: "A classroom must have at least one member. Revoke the classroom instead.",
      });
    }

    classroom.members = members;
    // Keep the legacy first-member fields in sync for any external readers.
    classroom.userId = members[0].userId;
    classroom.userEmail = members[0].userEmail;
    classroom.userName = members[0].userName;

    await classroom.save();
    res.json({ ok: true, item: withMembers(classroom.toObject()) });
  }),
);

// ── Revoke (hard delete) ──
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const out = await Classroom.findByIdAndDelete(req.params.id);
    if (!out) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }),
);

export default router;
