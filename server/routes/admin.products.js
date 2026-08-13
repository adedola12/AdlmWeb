import express from "express";
import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { PaidCourse } from "../models/PaidCourse.js";
import {
  findImplausibleUSD,
  describeImplausibleUSD,
} from "../util/priceSanity.js";

const router = express.Router();

// Gate on the "products" area like every other admin router, rather than the
// local role check this file used to carry. That check read req.user.role
// straight off the JWT, so it authorised against whatever role the token held
// when it was issued — an account promoted to admin mid-session kept getting
// "Admin only" until it signed out and back in. requirePermission re-reads the
// role from the database, so a reassignment takes effect immediately.
//
// Access is unchanged in practice: "products" is staffGrantable: false, so no
// staff role can hold it and only super-admins pass.
router.use(requireAuth, requirePermission("products"));

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
    discounts,
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

  // ✅ BUILD UPDATE OBJECT (so we can $unset discounts when cleared)
  const update = { ...body };

  // sanitize discounts (and allow clearing)
  if ("discounts" in body) {
    const safe = cleanDiscounts(body.discounts);

    if (!safe) {
      // user cleared discounts -> remove from doc
      update.$unset = { ...(update.$unset || {}), discounts: 1 };
      delete update.discounts;
    } else {
      update.discounts = safe;
    }
  }

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
