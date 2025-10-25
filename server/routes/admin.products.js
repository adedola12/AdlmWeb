import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";

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

// GET /admin/products/:id  (populated for editor)
router.get("/:id", async (req, res) => {
  // const p = await Product.findById(req.params.id)
  //   .populate("relatedFreeVideoIds")
  //   .lean();
  // if (!p) return res.status(404).json({ error: "Not found" });
  // res.json(p);

  const { id } = req.params;
  let doc = null;

  // Try ObjectId first
  if (mongoose.isValidObjectId(id)) {
    doc = await Product.findById(id).populate("relatedFreeVideoIds").lean();
  }
  // Fallback: treat as product key
  if (!doc) {
    doc = await Product.findOne({ key: id })
      .populate("relatedFreeVideoIds")
      .lean();
  }

  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// POST /admin/products
router.post("/", async (req, res) => {
  const {
    key,
    name,
    blurb,
    description,
    features = [],
    images = [],
    billingInterval = "monthly",

    // ✅ NEW — accept course flags
    isCourse = false,
    courseSku,

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
    relatedFreeVideoIds = [],
    relatedCourseSkus = [],
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
    images,
    billingInterval,
    // ✅ persist these
    isCourse: !!isCourse,
    courseSku: courseSku || undefined,

    price: safePrice,
    previewUrl,
    thumbnailUrl,
    isPublished,
    sort,
    relatedFreeVideoIds,
    relatedCourseSkus,
  });

  // If it's a Course product, ensure a PaidCourse doc exists & is basic-filled
  // if (courseFlag && sku) {
  //   const existsCourse = await PaidCourse.findOne({ sku }).lean();
  // If it's a Course product, ensure a PaidCourse doc exists
  if (isCourse && courseSku) {
    const existsCourse = await PaidCourse.findOne({ sku: courseSku }).lean();
    if (!existsCourse) {
      await PaidCourse.create({
        sku: courseSku,
        title: name,
        blurb: blurb || "",
        thumbnailUrl: thumbnailUrl || images?.[0] || "",
        onboardingVideoUrl: previewUrl || "",
        classroomJoinUrl: "",
        modules: [],
        isPublished: false,
        sort,
      });
    }
  }
  res.json(p);
});

// PATCH /admin/products/:id
router.patch("/:id", async (req, res) => {
  const body = { ...req.body };
  if (body.key) delete body.key; // keep key stable
  // sanitize arrays to avoid nulls/strings creeping in
  if (Array.isArray(body.features))
    body.features = body.features.filter(Boolean);
  if (Array.isArray(body.images)) body.images = body.images.filter(Boolean);
  if (Array.isArray(body.relatedFreeVideoIds))
    body.relatedFreeVideoIds = body.relatedFreeVideoIds.filter(Boolean);
  if (Array.isArray(body.relatedCourseSkus))
    body.relatedCourseSkus = body.relatedCourseSkus.filter(Boolean);

  const p = await Product.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!p) return res.status(404).json({ error: "Not found" });

  // keep a PaidCourse around if this product is a course
  if (p.isCourse && p.courseSku) {
    const c = await PaidCourse.findOne({ sku: p.courseSku });
    if (!c) {
      await PaidCourse.create({
        sku: p.courseSku,
        title: p.name,
        blurb: p.blurb || "",
        thumbnailUrl: p.thumbnailUrl || p.images?.[0] || "",
        onboardingVideoUrl: p.previewUrl || "",
        classroomJoinUrl: "",
        modules: [],
        isPublished: false,
        sort: p.sort || 0,
      });
    }
  }

  res.json(p);
});

// DELETE /admin/products/:id
router.delete("/:id", async (req, res) => {
  const out = await Product.findByIdAndDelete(req.params.id);
  if (!out) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
