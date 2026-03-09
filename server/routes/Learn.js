// server/routes/learn.js
import express from "express";
import { FreeVideo, PaidCourseVideo } from "../models/Learn.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { Product } from "../models/Product.js";

const router = express.Router();

function normalizeSku(v) {
  return String(v || "").trim().toLowerCase();
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function firstList(...lists) {
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

/**
 * GET /learn/free?page=1&pageSize=5
 * Returns published free videos (paginated).
 */
router.get("/free", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize || "5", 10), 1),
    12,
  );

  const q = { isPublished: true };
  const total = await FreeVideo.countDocuments(q);
  const items = await FreeVideo.find(q)
    .sort({ sort: -1, createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return res.json({ page, pageSize, total, items });
});

/**
 * GET /learn/courses
 * Returns the public paid-learning catalog by merging:
 * - marketing/preview cards (PaidCourseVideo)
 * - actual course content (PaidCourse)
 * - sellable product records (Product.isCourse)
 */
router.get("/courses", async (_req, res, next) => {
  try {
    const [catalog, courses, products] = await Promise.all([
      PaidCourseVideo.find({ isPublished: true })
        .sort({ sort: -1, createdAt: -1 })
        .lean(),
      PaidCourse.find({ isPublished: true })
        .sort({ sort: -1, createdAt: -1 })
        .lean(),
      Product.find({ isPublished: true, isCourse: true })
        .sort({ sort: -1, createdAt: -1 })
        .lean(),
    ]);

    const cardBySku = new Map(
      (catalog || []).map((item) => [normalizeSku(item?.sku), item]),
    );
    const courseBySku = new Map(
      (courses || []).map((item) => [normalizeSku(item?.sku), item]),
    );
    const productBySku = new Map(
      (products || [])
        .filter((item) => normalizeSku(item?.courseSku))
        .map((item) => [normalizeSku(item.courseSku), item]),
    );

    const allSkus = Array.from(
      new Set([
        ...cardBySku.keys(),
        ...courseBySku.keys(),
        ...productBySku.keys(),
      ].filter(Boolean)),
    );

    const items = allSkus
      .map((skuKey) => {
        const card = cardBySku.get(skuKey) || null;
        const course = courseBySku.get(skuKey) || null;
        const product = productBySku.get(skuKey) || null;

        const sku = firstString(card?.sku, course?.sku, product?.courseSku, skuKey);
        const title = firstString(card?.title, course?.title, product?.name, sku);
        const previewUrl = firstString(
          card?.previewUrl,
          product?.previewUrl,
          course?.onboardingVideoUrl,
        );
        const thumbnailUrl = firstString(
          card?.thumbnailUrl,
          product?.thumbnailUrl,
          course?.thumbnailUrl,
          product?.images?.[0],
        );

        if (!sku || !title) return null;

        return {
          _id: String(card?._id || course?._id || product?._id || sku),
          sku,
          productKey: firstString(product?.key),
          title,
          previewUrl,
          thumbnailUrl,
          bullets: firstList(card?.bullets, product?.features),
          description: firstString(card?.description, course?.description, product?.description),
          blurb: firstString(course?.blurb, product?.blurb),
          sort: Number(card?.sort ?? course?.sort ?? product?.sort ?? 0),
          createdAt: card?.createdAt || course?.createdAt || product?.createdAt || null,
          hasCatalogCard: !!card,
          hasCourseContent: !!course,
          hasProduct: !!product,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.sort !== a.sort) return b.sort - a.sort;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

    return res.json(items);
  } catch (err) {
    return next(err);
  }
});

export default router;
