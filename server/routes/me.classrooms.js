import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Classroom } from "../models/Classroom.js";

const router = express.Router();
router.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Return active classrooms granted to the current user. The dashboard
// merges these into its My Courses view, alongside paid course enrollments.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await Classroom.find({
      userId: req.user._id,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Synthesize a "go to classroom" URL when only the code is set.
    const out = items.map((c) => ({
      ...c,
      effectiveJoinUrl:
        c.classroomUrl ||
        (c.classroomCode
          ? `https://classroom.google.com/c/${encodeURIComponent(c.classroomCode)}`
          : ""),
    }));

    res.json({ ok: true, items: out });
  }),
);

export default router;
