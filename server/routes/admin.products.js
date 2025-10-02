import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Product } from "../models/Product.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /admin/products
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
    billingInterval = "monthly",
    // flat fields from your current UI:
    priceMonthly, // legacy — keep for compat (NGN)
    priceYearly, // legacy — keep for compat (NGN)
    installFee, // legacy — NGN
    // new structure (preferred):
    price, // { monthlyNGN, yearlyNGN, installNGN, monthlyUSD?, yearlyUSD?, installUSD? }
    previewUrl,
    thumbnailUrl,
    isPublished = true,
    sort = 0,
  } = req.body || {};

  if (!key || !name)
    return res.status(400).json({ error: "key and name are required" });

  const exists = await Product.findOne({ key });
  if (exists) return res.status(409).json({ error: "key already exists" });

  const safePrice = price || {
    monthlyNGN: Number(priceMonthly || 0),
    yearlyNGN: Number(priceYearly || 0),
    installNGN: Number(installFee || 0),
  };

  const p = await Product.create({
    key,
    name,
    blurb,
    description,
    features,
    billingInterval,
    price: safePrice,
    previewUrl,
    thumbnailUrl,
    isPublished,
    sort,
  });
  res.json(p);
});

// PATCH /admin/products/:id
router.patch("/:id", async (req, res) => {
  const body = { ...req.body };
  if (body.key) delete body.key; // keep key stable

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
