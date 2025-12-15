import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Coupon } from "../models/Coupon.js";
import { normalizeCode } from "../util/coupons.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /admin/coupons
router.get("/", async (_req, res) => {
  const items = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  res.json(items);
});

// POST /admin/coupons
router.post("/", async (req, res) => {
  const {
    code,
    description = "",
    type,
    value,
    currency = "NGN",
    minSubtotal = 0,
    isActive = true,
    startsAt,
    endsAt,
    maxRedemptions,
  } = req.body || {};

  const ccode = normalizeCode(code);
  if (!ccode) return res.status(400).json({ error: "code required" });
  if (!["percent", "fixed"].includes(type))
    return res.status(400).json({ error: "type must be percent or fixed" });

  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0)
    return res.status(400).json({ error: "value must be > 0" });

  if (type === "percent" && (v <= 0 || v > 100))
    return res.status(400).json({ error: "percent must be 1..100" });

  const exists = await Coupon.findOne({ code: ccode }).lean();
  if (exists) return res.status(409).json({ error: "code already exists" });

  const doc = await Coupon.create({
    code: ccode,
    description,
    type,
    value: v,
    currency: String(currency).toUpperCase(),
    minSubtotal: Number(minSubtotal || 0),
    isActive: !!isActive,
    startsAt: startsAt ? new Date(startsAt) : undefined,
    endsAt: endsAt ? new Date(endsAt) : undefined,
    maxRedemptions: maxRedemptions != null ? Number(maxRedemptions) : undefined,
  });

  res.json(doc);
});

// PATCH /admin/coupons/:id
router.patch("/:id", async (req, res) => {
  const body = { ...req.body };
  if (body.code) delete body.code; // don't allow changing code

  if (body.currency) body.currency = String(body.currency).toUpperCase();
  if (body.value != null) body.value = Number(body.value);
  if (body.minSubtotal != null) body.minSubtotal = Number(body.minSubtotal);
  if (body.maxRedemptions != null)
    body.maxRedemptions = Number(body.maxRedemptions);

  const doc = await Coupon.findByIdAndUpdate(req.params.id, body, {
    new: true,
  });
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// POST /admin/coupons/:id/disable
router.post("/:id/disable", async (req, res) => {
  const doc = await Coupon.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// POST /admin/coupons/:id/enable
router.post("/:id/enable", async (req, res) => {
  const doc = await Coupon.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// POST /admin/coupons/:id/banner  body: { isBanner: true|false }
router.post("/:id/banner", requireAuth, requireAdmin, async (req, res) => {
  const isBanner = !!req.body?.isBanner;

  const c = await Coupon.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Coupon not found" });

  if (isBanner) {
    // ensure only one banner coupon at a time
    await Coupon.updateMany(
      { _id: { $ne: c._id } },
      { $set: { isBanner: false } }
    );
  }

  c.isBanner = isBanner;
  await c.save();

  return res.json({ ok: true, coupon: c });
});


export default router;
