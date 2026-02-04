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

// --- helpers ---
function cleanDiscount(d) {
  if (!d) return undefined;

  const type = String(d.type || "").toLowerCase();
  if (!["percent", "fixed"].includes(type)) return undefined;

  const valueNGN = Number(d.valueNGN || 0) || 0;
  const valueUSD =
    d.valueUSD == null || d.valueUSD === "" ? null : Number(d.valueUSD || 0);

  // require at least one positive value
  if (valueNGN <= 0 && (valueUSD == null || valueUSD <= 0)) return undefined;

  return { type, valueNGN, valueUSD };
}

function cleanDiscounts(discounts) {
  if (!discounts) return undefined;

  const next = {
    sixMonths: cleanDiscount(discounts.sixMonths),
    oneYear: cleanDiscount(discounts.oneYear),
  };

  if (!next.sixMonths && !next.oneYear) return undefined;
  return next;
}

function normalizePrice(price, fallback = {}) {
  const p = price || {};
  return {
    monthlyNGN: Number(p.monthlyNGN ?? fallback.monthlyNGN ?? 0) || 0,
    yearlyNGN: Number(p.yearlyNGN ?? fallback.yearlyNGN ?? 0) || 0,
    installNGN: Number(p.installNGN ?? fallback.installNGN ?? 0) || 0,
    monthlyUSD:
      p.monthlyUSD === "" || p.monthlyUSD == null
        ? undefined
        : Number(p.monthlyUSD),
    yearlyUSD:
      p.yearlyUSD === "" || p.yearlyUSD == null
        ? undefined
        : Number(p.yearlyUSD),
    installUSD:
      p.installUSD === "" || p.installUSD == null
        ? undefined
        : Number(p.installUSD),
  };
}

// GET /admin/products
router.get("/", async (_req, res) => {
  const items = await Product.find({}).sort({ sort: -1, createdAt: -1 }).lean();
  res.json(items);
});

// GET /admin/products/:id -> supports ObjectId, product.key, or product.courseSku
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  let doc = null;

  if (mongoose.isValidObjectId(id)) {
    doc = await Product.findById(id).populate("relatedFreeVideoIds").lean();
  }
  if (!doc) {
    doc = await Product.findOne({ key: id })
      .populate("relatedFreeVideoIds")
      .lean();
  }
  if (!doc) {
    doc = await Product.findOne({ courseSku: id })
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
    isCourse = false,
    courseSku,
    priceMonthly,
    priceYearly,
    installFee,
    price,
    discounts,
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

  const safePrice = normalizePrice(price, {
    monthlyNGN: Number(priceMonthly || 0) || 0,
    yearlyNGN: Number(priceYearly || 0) || 0,
    installNGN: Number(installFee || 0) || 0,
  });

  const safeDiscounts = cleanDiscounts(discounts);

  const p = await Product.create({
    key: String(key).trim(),
    name: String(name).trim(),
    blurb: blurb || "",
    description: description || "",
    features: Array.isArray(features) ? features.filter(Boolean) : [],
    images: Array.isArray(images) ? images.filter(Boolean) : [],
    billingInterval,
    isCourse: !!isCourse,
    courseSku: courseSku || undefined,
    price: safePrice,
    discounts: safeDiscounts,
    previewUrl,
    thumbnailUrl,
    isPublished: !!isPublished,
    sort: Number(sort || 0) || 0,
    relatedFreeVideoIds: Array.isArray(relatedFreeVideoIds)
      ? relatedFreeVideoIds.filter(Boolean)
      : [],
    relatedCourseSkus: Array.isArray(relatedCourseSkus)
      ? relatedCourseSkus.filter(Boolean)
      : [],
  });

  // Ensure PaidCourse exists if product is a course
  if (p.isCourse && p.courseSku) {
    const existsCourse = await PaidCourse.findOne({ sku: p.courseSku }).lean();
    if (!existsCourse) {
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

// PATCH /admin/products/:id -> supports ObjectId OR key OR courseSku
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  const body = { ...req.body };

  // never allow changing key via edit
  if ("key" in body) delete body.key;

  // sanitize arrays
  if (Array.isArray(body.features))
    body.features = body.features.filter(Boolean);
  if (Array.isArray(body.images)) body.images = body.images.filter(Boolean);
  if (Array.isArray(body.relatedFreeVideoIds))
    body.relatedFreeVideoIds = body.relatedFreeVideoIds.filter(Boolean);
  if (Array.isArray(body.relatedCourseSkus))
    body.relatedCourseSkus = body.relatedCourseSkus.filter(Boolean);

  // sanitize discounts
  if (body.discounts) {
    const safe = cleanDiscounts(body.discounts);
    if (!safe) delete body.discounts;
    else body.discounts = safe;
  }

  // ✅ choose filter depending on id type
  const filter = mongoose.isValidObjectId(id)
    ? { _id: id }
    : { $or: [{ key: id }, { courseSku: id }] };

  const p = await Product.findOneAndUpdate(filter, body, {
    new: true,
    runValidators: true,
  });

  if (!p) return res.status(404).json({ error: "Not found" });

  // Ensure PaidCourse exists if product is a course
  if (p.isCourse && p.courseSku) {
    const existsCourse = await PaidCourse.findOne({ sku: p.courseSku }).lean();
    if (!existsCourse) {
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

// DELETE /admin/products/:id -> supports ObjectId OR key OR courseSku
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const filter = mongoose.isValidObjectId(id)
    ? { _id: id }
    : { $or: [{ key: id }, { courseSku: id }] };

  const out = await Product.findOneAndDelete(filter);
  if (!out) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
});

export default router;
