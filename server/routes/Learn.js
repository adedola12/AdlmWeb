// server/routes/learn.js
import express from "express";
import mongoose from "mongoose";
import { FreeVideo, PaidCourseVideo } from "../models/Learn.js";
import {
  FREE_VIDEO_SECTIONS,
  groupBySection,
  recommendedFor,
  sectionOf,
} from "../util/freeVideoSections.js";
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
 * GET /learn/free?page=1&pageSize=5[&section=quiv]
 * Returns published free videos (paginated).
 *
 * The cap is generous now: the library is the whole YouTube channel, and the
 * lesson player and the sectioned Learn page both want it in one call rather
 * than paging through a hundred videos twelve at a time.
 */
router.get("/free", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize || "5", 10), 1),
    200,
  );

  const q = { isPublished: true };
  const section = String(req.query.section || "").trim();
  if (section) q.section = section;

  const total = await FreeVideo.countDocuments(q);
  const items = await FreeVideo.find(q)
    .sort({ sort: -1, publishedAt: -1, createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return res.json({ page, pageSize, total, items });
});

/**
 * GET /learn/free/section-list
 * The shelves themselves, in order — for the admin editors' section picker
 * and for anything that wants to label a section without a video in hand.
 */
router.get("/free/section-list", (_req, res) => {
  res.json({ sections: FREE_VIDEO_SECTIONS });
});

/**
 * GET /learn/free/sections
 * The whole published library grouped by shelf, in shelf order. Empty shelves
 * are left out; anything unfiled comes last as "More lessons".
 */
router.get("/free/sections", async (_req, res, next) => {
  try {
    const items = await FreeVideo.find({ isPublished: true }).lean();
    const sections = groupBySection(items);
    res.json({ total: items.length, sections });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /learn/free/recommended?product=revit&limit=6
 * The short strip a product page shows: videos flagged `recommended` on the
 * shelf that belongs to that product, then the shared getting-started ones.
 */
router.get("/free/recommended", async (req, res, next) => {
  try {
    const product = String(req.query.product || "").trim();
    if (!product) return res.json({ product, items: [] });
    const limit = Math.min(Math.max(parseInt(req.query.limit || "6", 10), 1), 24);
    const items = await FreeVideo.find({ isPublished: true, recommended: true }).lean();
    res.json({ product, items: recommendedFor(items, product, limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /learn/free/:id
 * One published video, with its shelf resolved so the player can label it and
 * link back to the right part of the library.
 */
router.get("/free/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "Not found" });
    const item = await FreeVideo.findOne({ _id: id, isPublished: true }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    const section = sectionOf(item.section);
    res.json({ item: { ...item, sectionInfo: section || null } });
  } catch (err) {
    next(err);
  }
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
