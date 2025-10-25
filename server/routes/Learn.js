// server/routes/learn.js
import express from "express";
import { FreeVideo } from "../models/Learn.js";
import { PaidCourse } from "../models/PaidCourse.js";

const router = express.Router();

/**
 * GET /learn/free?page=1&pageSize=5
 * Returns published free videos (paginated).
 */
router.get("/free", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize || "5", 10), 1),
    12
  ); // clamp 1..12; default 5

  const q = { isPublished: true };
  const total = await FreeVideo.countDocuments(q);
  const items = await FreeVideo.find(q)
    .sort({ sort: -1, createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return res.json({
    page,
    pageSize,
    total,
    items,
  });
});

/**
 * GET /learn/courses
 * Returns all published paid courses.
 */
router.get("/courses", async (_req, res) => {
  const items = await PaidCourse.find({ isPublished: true })
    .sort({ sort: -1, createdAt: -1 })
    .lean();
  return res.json(items);
});

export default router;
