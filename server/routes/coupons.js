import express from "express";
import dayjs from "dayjs";
import { Coupon } from "../models/Coupon.js";
import { validateAndComputeDiscount } from "../util/coupons.js";

const router = express.Router();

/**
 * GET /coupons/banner
 * Returns the current active banner coupon (if any).
 */
router.get("/banner", async (_req, res) => {
  const now = dayjs();

  const c = await Coupon.findOne({ isActive: true, isBanner: true })
    .sort({ updatedAt: -1 })
    .lean();

  if (!c) return res.json({ ok: true, banner: null });

  if (c.startsAt && now.isBefore(dayjs(c.startsAt)))
    return res.json({ ok: true, banner: null });

  if (c.endsAt && now.isAfter(dayjs(c.endsAt)))
    return res.json({ ok: true, banner: null });

  return res.json({
    ok: true,
    banner: {
      code: c.code,
      bannerText: c.bannerText || "",
      type: c.type,
      value: c.value,
      currency: c.currency,
      startsAt: c.startsAt || null,
      endsAt: c.endsAt || null,
      appliesTo: c.appliesTo || { mode: "all", productKeys: [] },
    },
  });
});

/**
 * POST /coupons/validate
 * body: { code, currency, subtotal, productKeys? }
 */
router.post("/validate", async (req, res) => {
  try {
    const { code, currency, subtotal, productKeys } = req.body || {};

    const out = await validateAndComputeDiscount({
      code,
      currency,
      subtotal,
      productKeys: Array.isArray(productKeys) ? productKeys : [],
    });

    if (!out.ok) return res.status(400).json({ error: out.error });

    return res.json({
      ok: true,
      coupon: out.coupon
        ? {
            _id: out.coupon._id,
            code: out.coupon.code,
            type: out.coupon.type,
            value: out.coupon.value,
            currency: out.coupon.currency,
            startsAt: out.coupon.startsAt || null,
            endsAt: out.coupon.endsAt || null,
            appliesTo: out.coupon.appliesTo || { mode: "all", productKeys: [] },
            bannerText: out.coupon.bannerText || "",
            isBanner: !!out.coupon.isBanner,
            isActive: !!out.coupon.isActive,
          }
        : null,
      discount: out.discount || 0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Validate failed" });
  }
});


// GET /coupons/active
router.get("/active", async (_req, res) => {
  const now = dayjs();

  const list = await Coupon.find({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();

  const active = list.filter((c) => {
    if (c.startsAt && now.isBefore(dayjs(c.startsAt))) return false;
    if (c.endsAt && now.isAfter(dayjs(c.endsAt))) return false;
    if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) return false;
    return true;
  });

  // send only what frontend needs
  res.json({
    ok: true,
    items: active.map((c) => ({
      code: c.code,
      type: c.type,
      value: c.value,
      currency: c.currency || "NGN",
      minSubtotal: c.minSubtotal || 0,
      startsAt: c.startsAt || null,
      endsAt: c.endsAt || null,
      appliesTo: c.appliesTo || { mode: "all", productKeys: [] },
    })),
  });
});


export default router;
