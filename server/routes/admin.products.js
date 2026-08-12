import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  findImplausibleUSD,
  describeImplausibleUSD,
} from "../util/priceSanity.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// --- helpers ---
function optNum(v) {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizePrice(price, fallback = {}) {
  const p = price || {};
  return {
    monthlyNGN: Number(p.monthlyNGN ?? fallback.monthlyNGN ?? 0) || 0,
    yearlyNGN: Number(p.yearlyNGN ?? fallback.yearlyNGN ?? 0) || 0,
    installNGN: Number(p.installNGN ?? fallback.installNGN ?? 0) || 0,
    monthlyUSD: optNum(p.monthlyUSD),
    yearlyUSD: optNum(p.yearlyUSD),
    installUSD: optNum(p.installUSD),

    // 6-month tier
    sixMonthNGN: Number(p.sixMonthNGN ?? 0) || 0,
    sixMonthUSD: optNum(p.sixMonthUSD),

    // Discounted (sale) prices
    discountedMonthlyNGN: optNum(p.discountedMonthlyNGN),
    discountedMonthlyUSD: optNum(p.discountedMonthlyUSD),
    discountedSixMonthNGN: optNum(p.discountedSixMonthNGN),
    discountedSixMonthUSD: optNum(p.discountedSixMonthUSD),
    discountedYearlyNGN: optNum(p.discountedYearlyNGN),
    discountedYearlyUSD: optNum(p.discountedYearlyUSD),
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
    previewUrl,
    thumbnailUrl,
    isPublished = true,
    isComingSoon = false,
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

  // A USD field holding a Naira figure is almost always a slip, so it is
  // refused rather than published — but `allowUnusualPrice` lets a deliberate
  // figure through, which is what the admin form sends once you confirm.
  const oddPrice = findImplausibleUSD(safePrice);
  if (oddPrice.length && !req.body?.allowUnusualPrice) {
    return res.status(400).json({
      error: describeImplausibleUSD(oddPrice),
      fields: oddPrice.map((f) => f.field),
    });
  }

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
    previewUrl,
    thumbnailUrl,
    isPublished: !!isPublished,
    isComingSoon: !!isComingSoon,
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

  // A confirmation flag, not a field on the product — strip it before it can
  // reach the update. (Mongoose would drop it as an unknown path, but leaving
  // it in the object makes that a matter of schema settings rather than intent.)
  const allowUnusualPrice = !!body.allowUnusualPrice;
  delete body.allowUnusualPrice;

  // sanitize arrays
  if (Array.isArray(body.features)) body.features = body.features.filter(Boolean);
  if (Array.isArray(body.images)) body.images = body.images.filter(Boolean);
  if (Array.isArray(body.relatedFreeVideoIds))
    body.relatedFreeVideoIds = body.relatedFreeVideoIds.filter(Boolean);
  if (Array.isArray(body.relatedCourseSkus))
    body.relatedCourseSkus = body.relatedCourseSkus.filter(Boolean);

  // ✅ choose filter depending on id type
  const filter = mongoose.isValidObjectId(id)
    ? { _id: id }
    : { $or: [{ key: id }, { courseSku: id }] };

  // Refuse a USD price that looks like a Naira figure. The stored price is
  // read first because a PATCH may send a USD field without its Naira
  // counterpart, and the check needs something to measure it against.
  if (body.price && !allowUnusualPrice) {
    const current = await Product.findOne(filter).select("price").lean();
    const oddPrice = findImplausibleUSD(body.price, current?.price || {});
    if (oddPrice.length) {
      return res.status(400).json({
        error: describeImplausibleUSD(oddPrice),
        fields: oddPrice.map((f) => f.field),
      });
    }
  }

  const update = { ...body };

  // Legacy bundle discounts are gone; sale prices live on price.discounted*.
  // Dropped explicitly so a cached older admin bundle cannot write the field
  // back — mongoose's strict mode would ignore it, but this says so out loud.
  delete update.discounts;

  const p = await Product.findOneAndUpdate(filter, update, {
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
