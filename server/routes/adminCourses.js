import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { PaidCourse } from "../models/PaidCourse.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// List
router.get("/", async (_req, res) => {
  const items = await PaidCourse.find({})
    .sort({ sort: -1, createdAt: -1 })
    .lean();
  res.json(items);
});

// Get one
router.get("/:sku", async (req, res) => {
  const sku = req.params.sku;
  const c = await PaidCourse.findOne({ sku }).lean();
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

// Create
router.post("/", async (req, res) => {
  const {
    sku,
    title,
    blurb,
    thumbnailUrl,
    onboardingVideoUrl,
    classroomJoinUrl,
    modules = [],
    certificateTemplateUrl,
    isPublished = true,
    sort = 0,
  } = req.body || {};
  if (!sku || !title)
    return res.status(400).json({ error: "sku and title required" });
  const exists = await PaidCourse.findOne({ sku });
  if (exists) return res.status(409).json({ error: "sku exists" });

  const doc = await PaidCourse.create({
    sku,
    title,
    blurb,
    thumbnailUrl,
    onboardingVideoUrl,
    classroomJoinUrl,
    modules,
    certificateTemplateUrl,
    isPublished,
    sort,
  });
  res.json(doc);
});

// Update
router.patch("/:sku", async (req, res) => {
  const c = await PaidCourse.findOneAndUpdate(
    { sku: req.params.sku },
    req.body,
    { new: true }
  );
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

// Delete
router.delete("/:sku", async (req, res) => {
  const out = await PaidCourse.findOneAndDelete({ sku: req.params.sku });
  if (!out) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
