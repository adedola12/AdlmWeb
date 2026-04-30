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

// ── List ──
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.companyName) filter.companyName = String(req.query.companyName).trim();
    if (req.query.includeInactive !== "true") filter.isActive = true;

    const items = await Classroom.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ ok: true, items });
  }),
);

// ── Create ──
// Admin picks a user via the autocomplete (returns userId), then provides
// title + classroomCode/Url. We snapshot the user's email/name on the doc
// so the admin list still renders even if the user record changes later.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const userId = String(b.userId || "").trim();
    const title = String(b.title || "").trim();

    if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const u = await User.findById(userId, {
      email: 1,
      firstName: 1,
      lastName: 1,
      username: 1,
    }).lean();
    if (!u) return res.status(404).json({ error: "User not found" });

    const classroom = await Classroom.create({
      userId: u._id,
      userEmail: u.email || "",
      userName:
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "",
      title,
      description: String(b.description || "").trim(),
      classroomCode: String(b.classroomCode || "").trim(),
      classroomUrl: String(b.classroomUrl || "").trim(),
      companyName: String(b.companyName || "").trim(),
      createdBy: req.user?.email || "",
    });

    res.json({ ok: true, item: classroom });
  }),
);

// ── Update (mostly used to toggle isActive or fix code/url) ──
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const update = {};

    if (b.title !== undefined) update.title = String(b.title || "").trim();
    if (b.description !== undefined) update.description = String(b.description || "").trim();
    if (b.classroomCode !== undefined) update.classroomCode = String(b.classroomCode || "").trim();
    if (b.classroomUrl !== undefined) update.classroomUrl = String(b.classroomUrl || "").trim();
    if (b.companyName !== undefined) update.companyName = String(b.companyName || "").trim();
    if (b.isActive !== undefined) update.isActive = !!b.isActive;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: "no fields to update" });
    }

    const item = await Classroom.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, item });
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
