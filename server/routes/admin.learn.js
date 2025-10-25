// server/routes/admin.learn.js
import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { FreeVideo, PaidCourseVideo } from "../models/Learn.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

/* ---------- FREE VIDEOS ---------- */
router.get("/free", async (_req, res) => {
  const list = await FreeVideo.find({})
    .sort({ sort: -1, createdAt: -1 })
    .lean();
  res.json(list);
});

router.post("/free", async (req, res) => {
  const {
    title,
    youtubeId,
    thumbnailUrl,
    isPublished = true,
    sort = 0,
  } = req.body || {};
  if (!title || !youtubeId)
    return res.status(400).json({ error: "title and youtubeId required" });

  const doc = await FreeVideo.create({
    title,
    youtubeId,
    thumbnailUrl,
    isPublished,
    sort,
  });
  res.json({ ok: true, item: doc });
});

router.patch("/free/:id", async (req, res) => {
  const item = await FreeVideo.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const { title, youtubeId, thumbnailUrl, isPublished, sort } = req.body || {};
  if (title !== undefined) item.title = title;
  if (youtubeId !== undefined) item.youtubeId = youtubeId;
  if (thumbnailUrl !== undefined) item.thumbnailUrl = thumbnailUrl;
  if (isPublished !== undefined) item.isPublished = !!isPublished;
  if (sort !== undefined) item.sort = Number(sort) || 0;

  await item.save();
  res.json({ ok: true, item });
});

router.delete("/free/:id", async (req, res) => {
  await FreeVideo.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* ---------- PAID COURSES ---------- */
router.get("/courses", async (_req, res) => {
  const list = await PaidCourseVideo.find({})
    .sort({ sort: -1, createdAt: -1 })
    .lean();
  res.json(list);
});

router.post("/courses", async (req, res) => {
  const {
    sku,
    title,
    previewUrl,
    bullets = [],
    description = "",
    isPublished = true,
    sort = 0,
  } = req.body || {};
  if (!sku || !title || !previewUrl)
    return res.status(400).json({ error: "sku, title, previewUrl required" });

  const exists = await PaidCourseVideo.findOne({ sku });
  if (exists) return res.status(409).json({ error: "SKU already exists" });

  const doc = await PaidCourseVideo.create({
    sku,
    title,
    previewUrl,
    bullets,
    description,
    isPublished,
    sort,
  });
  res.json({ ok: true, item: doc });
});

router.patch("/courses/:id", async (req, res) => {
  const item = await PaidCourseVideo.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const { sku, title, previewUrl, bullets, description, isPublished, sort } =
    req.body || {};
  if (sku !== undefined) item.sku = sku;
  if (title !== undefined) item.title = title;
  if (previewUrl !== undefined) item.previewUrl = previewUrl;
  if (bullets !== undefined)
    item.bullets = Array.isArray(bullets) ? bullets : [];
  if (description !== undefined) item.description = description;
  if (isPublished !== undefined) item.isPublished = !!isPublished;
  if (sort !== undefined) item.sort = Number(sort) || 0;

  await item.save();
  res.json({ ok: true, item });
});

router.delete("/courses/:id", async (req, res) => {
  await PaidCourseVideo.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
