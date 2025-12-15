import express from "express";
import dayjs from "dayjs";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { Coupon } from "../models/Coupon.js";
import { Purchase } from "../models/Purchase.js";

const router = express.Router();

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

function parseDate(v) {
  if (!v) return undefined;
  const d = dayjs(v);
  return d.isValid() ? d.toDate() : undefined;
}

// GET /admin/coupons
router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const list = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  return res.json(list);
});

// POST /admin/coupons (create)
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const body = req.body || {};

  const code = normalizeCode(body.code);
  if (!code) return res.status(400).json({ error: "code required" });

  const doc = {
    code,
    description: String(body.description || ""),
    type: body.type,
    value: Number(body.value || 0),
    currency: body.currency || "NGN",
    minSubtotal: Number(body.minSubtotal || 0),
    maxRedemptions:
      body.maxRedemptions != null ? Number(body.maxRedemptions) : undefined,
    isActive: !!body.isActive,

    startsAt: parseDate(body.startsAt),
    endsAt: parseDate(body.endsAt),

    isBanner: !!body.isBanner,
    bannerText: String(body.bannerText || ""),

    appliesTo: {
      mode: body?.appliesTo?.mode || body?.appliesToMode || "all",
      productKeys: Array.isArray(body?.appliesTo?.productKeys)
        ? body.appliesTo.productKeys
        : Array.isArray(body?.appliesToProductKeys)
        ? body.appliesToProductKeys
        : [],
    },
  };

  if (!["percent", "fixed"].includes(doc.type))
    return res.status(400).json({ error: "type must be percent or fixed" });

  if (doc.value <= 0)
    return res.status(400).json({ error: "value must be > 0" });

  // prevent banner if inactive
  if (doc.isBanner && !doc.isActive)
    return res.status(400).json({ error: "Banner coupon must be active." });

  // ensure ONLY one banner at a time
  if (doc.isBanner) {
    await Coupon.updateMany({ isBanner: true }, { $set: { isBanner: false } });
  }

  const created = await Coupon.create(doc);
  return res.json({ ok: true, coupon: created });
});

// PATCH /admin/coupons/:id (edit)
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const c = await Coupon.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Coupon not found" });

  const body = req.body || {};

  if (body.code != null) c.code = normalizeCode(body.code);
  if (body.description != null) c.description = String(body.description || "");
  if (body.type != null) c.type = body.type;
  if (body.value != null) c.value = Number(body.value || 0);
  if (body.currency != null) c.currency = body.currency;
  if (body.minSubtotal != null) c.minSubtotal = Number(body.minSubtotal || 0);
  if (body.maxRedemptions !== undefined) {
    c.maxRedemptions =
      body.maxRedemptions === null || body.maxRedemptions === ""
        ? undefined
        : Number(body.maxRedemptions);
  }
  if (body.isActive != null) c.isActive = !!body.isActive;

  if (body.startsAt !== undefined) c.startsAt = parseDate(body.startsAt);
  if (body.endsAt !== undefined) c.endsAt = parseDate(body.endsAt);

  if (body.bannerText != null) c.bannerText = String(body.bannerText || "");

  // appliesTo (product-specific)
  if (body.appliesTo != null) {
    c.appliesTo = {
      mode: body.appliesTo.mode || "all",
      productKeys: Array.isArray(body.appliesTo.productKeys)
        ? body.appliesTo.productKeys
        : [],
    };
  }

  // banner rules
  if (body.isBanner != null) {
    const nextBanner = !!body.isBanner;

    if (nextBanner && !c.isActive)
      return res.status(400).json({ error: "Banner coupon must be active." });

    if (nextBanner) {
      await Coupon.updateMany(
        { isBanner: true },
        { $set: { isBanner: false } }
      );
      c.isBanner = true;
    } else {
      c.isBanner = false;
    }
  }

  await c.save();
  return res.json({ ok: true, coupon: c });
});

// POST /admin/coupons/:id/enable
router.post("/:id/enable", requireAuth, requireAdmin, async (req, res) => {
  await Coupon.updateOne({ _id: req.params.id }, { $set: { isActive: true } });
  return res.json({ ok: true });
});

// POST /admin/coupons/:id/disable
router.post("/:id/disable", requireAuth, requireAdmin, async (req, res) => {
  // also remove banner if disabling
  await Coupon.updateOne(
    { _id: req.params.id },
    { $set: { isActive: false, isBanner: false } }
  );
  return res.json({ ok: true });
});

// POST /admin/coupons/:id/banner  body: { isBanner: boolean }
router.post("/:id/banner", requireAuth, requireAdmin, async (req, res) => {
  const c = await Coupon.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Coupon not found" });

  const nextBanner = !!req.body?.isBanner;

  if (nextBanner && !c.isActive)
    return res.status(400).json({ error: "Banner coupon must be active." });

  if (nextBanner) {
    await Coupon.updateMany({ isBanner: true }, { $set: { isBanner: false } });
    c.isBanner = true;
  } else {
    c.isBanner = false;
  }

  await c.save();
  return res.json({ ok: true, coupon: c });
});

/**
 * GET /admin/coupons/stats
 * Simple analytics from Purchases:
 * - uses coupon.couponId inside Purchase
 */
router.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await Purchase.aggregate([
    { $match: { "coupon.couponId": { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$coupon.couponId",
        purchases: { $sum: 1 },
        totalDiscountGiven: { $sum: "$coupon.discountAmount" },
        lastUsedAt: { $max: "$createdAt" },
      },
    },
  ]);

  const statsById = {};
  rows.forEach((r) => {
    statsById[String(r._id)] = {
      purchases: r.purchases || 0,
      totalDiscountGiven: r.totalDiscountGiven || 0,
      lastUsedAt: r.lastUsedAt || null,
    };
  });

  return res.json({ ok: true, statsById });
});

export default router;
