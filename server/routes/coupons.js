import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { validateAndComputeDiscount } from "../util/coupons.js";

const router = express.Router();

// POST /coupons/validate
router.post("/validate", requireAuth, async (req, res) => {
  const { code, currency = "NGN", subtotal = 0 } = req.body || {};
  const out = await validateAndComputeDiscount({
    code,
    currency: String(currency).toUpperCase(),
    subtotal: Number(subtotal || 0),
  });
  if (!out.ok) return res.status(400).json({ error: out.error });

  if (!out.coupon) return res.json({ ok: true, coupon: null, discount: 0 });

  return res.json({
    ok: true,
    coupon: {
      code: out.coupon.code,
      type: out.coupon.type,
      value: out.coupon.value,
      currency: out.coupon.currency,
      description: out.coupon.description || "",
    },
    discount: out.discount,
  });
});
// GET /coupons/banner  -> returns active banner coupon (if any)
router.get("/banner", async (_req, res) => {
  const now = dayjs();

  const c = await Coupon.findOne({ isActive: true, isBanner: true })
    .sort({ updatedAt: -1 })
    .lean();

  if (!c) return res.json({ ok: true, coupon: null });

  if (c.startsAt && now.isBefore(dayjs(c.startsAt)))
    return res.json({ ok: true, coupon: null });

  if (c.endsAt && now.isAfter(dayjs(c.endsAt)))
    return res.json({ ok: true, coupon: null });

  return res.json({
    ok: true,
    coupon: {
      _id: c._id,
      code: c.code,
      type: c.type,
      value: c.value,
      currency: c.currency,
      description: c.description || "",
      bannerText: c.bannerText || "",
      startsAt: c.startsAt || null,
      endsAt: c.endsAt || null,
    },
  });
});


export default router;
