// server/routes/admin.learn.js
import express from "express";
import { requireAuth, requireAdminOrMiniAdmin } from "../middleware/auth.js";
import { FreeVideo, PaidCourseVideo } from "../models/Learn.js";

const router = express.Router();

// ✅ Admin + Mini-admin can access these routes
router.use(requireAuth, requireAdminOrMiniAdmin);

// small helper so async errors go to your global error handler (no silent crashes)
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- FREE VIDEOS ---------- */
router.get(
  "/free",
  asyncHandler(async (_req, res) => {
    const list = await FreeVideo.find({})
      .sort({ sort: -1, createdAt: -1 })
      .lean();
    res.json(list);
  }),
);

router.post(
  "/free",
  asyncHandler(async (req, res) => {
    const {
      title,
      youtubeId,
      thumbnailUrl,
      isPublished = true,
      sort = 0,
    } = req.body || {};

    if (!title || !youtubeId) {
      return res.status(400).json({ error: "title and youtubeId required" });
    }

    const doc = await FreeVideo.create({
      title: String(title).trim(),
      youtubeId: String(youtubeId).trim(),
      thumbnailUrl: thumbnailUrl ? String(thumbnailUrl).trim() : "",
      isPublished: !!isPublished,
      sort: Number(sort) || 0,
    });

    res.json({ ok: true, item: doc });
  }),
);

router.patch(
  "/free/:id",
  asyncHandler(async (req, res) => {
    const item = await FreeVideo.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const { title, youtubeId, thumbnailUrl, isPublished, sort } =
      req.body || {};

    if (title !== undefined) item.title = String(title).trim();
    if (youtubeId !== undefined) item.youtubeId = String(youtubeId).trim();
    if (thumbnailUrl !== undefined)
      item.thumbnailUrl = thumbnailUrl ? String(thumbnailUrl).trim() : "";
    if (isPublished !== undefined) item.isPublished = !!isPublished;
    if (sort !== undefined) item.sort = Number(sort) || 0;

    await item.save();
    res.json({ ok: true, item });
  }),
);

router.delete(
  "/free/:id",
  asyncHandler(async (req, res) => {
    await FreeVideo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }),
);

/* ---------- PAID COURSES ---------- */
router.get(
  "/courses",
  asyncHandler(async (_req, res) => {
    const list = await PaidCourseVideo.find({})
      .sort({ sort: -1, createdAt: -1 })
      .lean();
    res.json(list);
  }),
);

router.post(
  "/courses",
  asyncHandler(async (req, res) => {
    const {
      sku,
      title,
      previewUrl,
      bullets = [],
      description = "",
      isPublished = true,
      sort = 0,
    } = req.body || {};

    if (!sku || !title || !previewUrl) {
      return res.status(400).json({ error: "sku, title, previewUrl required" });
    }

    const skuNorm = String(sku).trim();
    const exists = await PaidCourseVideo.findOne({ sku: skuNorm }).lean();
    if (exists) return res.status(409).json({ error: "SKU already exists" });

    const doc = await PaidCourseVideo.create({
      sku: skuNorm,
      title: String(title).trim(),
      previewUrl: String(previewUrl).trim(),
      bullets: Array.isArray(bullets) ? bullets : [],
      description: String(description || ""),
      isPublished: !!isPublished,
      sort: Number(sort) || 0,
    });

    res.json({ ok: true, item: doc });
  }),
);

router.patch(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const item = await PaidCourseVideo.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const { sku, title, previewUrl, bullets, description, isPublished, sort } =
      req.body || {};

    if (sku !== undefined) item.sku = String(sku).trim();
    if (title !== undefined) item.title = String(title).trim();
    if (previewUrl !== undefined) item.previewUrl = String(previewUrl).trim();
    if (bullets !== undefined)
      item.bullets = Array.isArray(bullets) ? bullets : [];
    if (description !== undefined) item.description = String(description || "");
    if (isPublished !== undefined) item.isPublished = !!isPublished;
    if (sort !== undefined) item.sort = Number(sort) || 0;

    await item.save();
    res.json({ ok: true, item });
  }),
);

router.delete(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    await PaidCourseVideo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
