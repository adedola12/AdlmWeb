import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Classroom } from "../models/Classroom.js";

const router = express.Router();
router.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Return active classrooms granted to the current user. Matches on
// members.userId (cohort schema) and legacy top-level userId (pre-cohort
// rows). The dashboard merges these into its My Courses view.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await Classroom.find({
      isActive: true,
      $or: [
        { "members.userId": req.user._id },
        { userId: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    // Synthesize a "go to classroom" URL when only the code is set, and
    // strip the full member roster — the user only needs their own info.
    const out = items.map((c) => ({
      _id: c._id,
      title: c.title,
      description: c.description,
      classroomCode: c.classroomCode,
      classroomUrl: c.classroomUrl,
      companyName: c.companyName,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
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
