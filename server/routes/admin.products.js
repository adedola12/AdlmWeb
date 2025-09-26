// server/routes/admin.products.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

import { Product } from "../models/Product.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /admin/products (all, incl. unpublished)
router.get("/", async (_req, res) => {
  const items = await Product.find({}).sort({ sort: -1, createdAt: -1 }).lean();
  res.json(items);
});

// POST /admin/products
router.post("/", async (req, res) => {
  const {
    key,
    name,
    blurb,
    description,
    features = [],
    priceMonthly,
    previewUrl,
    thumbnailUrl,
    isPublished = true,
    sort = 0,
  } = req.body || {};

  if (!key || !name)
    return res.status(400).json({ error: "key and name are required" });

  const exists = await Product.findOne({ key });
  if (exists) return res.status(409).json({ error: "key already exists" });

  const p = await Product.create({
    key,
    name,
    blurb,
    description,
    features,
    priceMonthly,
    previewUrl,
    thumbnailUrl,
    isPublished,
    sort,
  });
  res.json(p);
});

// PATCH /admin/products/:id
router.patch("/:id", async (req, res) => {
  const body = req.body || {};
  // Do NOT allow changing key silently if you want it stable:
  if (body.key) delete body.key;

  const p = await Product.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// DELETE /admin/products/:id
router.delete("/:id", async (req, res) => {
  const out = await Product.findByIdAndDelete(req.params.id);
  if (!out) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
