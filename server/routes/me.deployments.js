import express from "express";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Purchase } from "../models/Purchase.js";
import { ProductDeployment } from "../models/ProductDeployment.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function normalizeLegacyEntitlement(ent) {
  if (!ent) return ent;
  if (!ent.seats || ent.seats < 1) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];
  return ent;
}

function isEntExpiredAt(expiresAt) {
  if (!expiresAt) return false;
  const end = dayjs(expiresAt).endOf("day");
  return end.isValid() && end.isBefore(dayjs());
}

function collectPurchaseKeys(purchase) {
  if (Array.isArray(purchase?.lines) && purchase.lines.length > 0) {
    return purchase.lines
      .map((line) => String(line?.productKey || "").trim().toLowerCase())
      .filter(Boolean);
  }

  const key = String(purchase?.productKey || "").trim().toLowerCase();
  return key ? [key] : [];
}

// Bind the current device to an entitlement (called before first install)
router.post(
  "/bind-device",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { productKey, fingerprint, deviceName } = req.body || {};

    const key = String(productKey || "").trim().toLowerCase();
    const fp = String(fingerprint || "").trim();

    if (!key || !fp) {
      return res.status(400).json({ error: "productKey and fingerprint are required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ent = (user.entitlements || []).find(
      (e) => String(e.productKey || "").toLowerCase() === key,
    );

    if (!ent) {
      return res.status(404).json({ error: "Entitlement not found for this product" });
    }

    normalizeLegacyEntitlement(ent);

    const active = (ent.devices || []).filter((d) => !d.revokedAt);
    const maxSeats = Math.max(parseInt(ent.seats || 1, 10), 1);

    // Check if this device is already bound
    const existing = active.find(
      (d) => String(d.fingerprint || "").toLowerCase() === fp.toLowerCase(),
    );

    if (existing) {
      existing.lastSeenAt = new Date();
      existing.name = deviceName || existing.name || "";
      await user.save();
      return res.json({ ok: true, alreadyBound: true });
    }

    // Check seat limit
    if (active.length >= maxSeats) {
      return res.status(403).json({
        error: `This subscription is already bound to ${active.length} device(s) (max ${maxSeats}). Contact admin to revoke a device or increase seats.`,
      });
    }

    // Bind new device
    ent.devices.push({
      fingerprint: fp,
      name: String(deviceName || "").trim(),
      boundAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });

    // Also set legacy field for backward compat
    if (!ent.deviceFingerprint) {
      ent.deviceFingerprint = fp;
      ent.deviceBoundAt = new Date();
    }

    await user.save();
    return res.json({ ok: true, bound: true, devicesUsed: active.length + 1, maxSeats });
  }),
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id, { entitlements: 1 });
    if (!user) return res.status(404).json({ error: "User not found" });

    const allowedKeys = new Set();
    const lockedKeys = new Set();

    for (const ent of user.entitlements || []) {
      normalizeLegacyEntitlement(ent);

      const productKey = String(ent?.productKey || "").trim().toLowerCase();
      const status = String(ent?.status || "inactive").trim().toLowerCase();
      if (!productKey) continue;

      if (status === "active" && !isEntExpiredAt(ent.expiresAt)) {
        allowedKeys.add(productKey);
      }
    }

    const purchases = await Purchase.find(
      { userId: req.user._id, status: "approved" },
      { productKey: 1, lines: 1, installation: 1 },
    ).lean();

    for (const purchase of purchases || []) {
      const installStatus = String(purchase?.installation?.status || "none")
        .trim()
        .toLowerCase();

      for (const key of collectPurchaseKeys(purchase)) {
        if (installStatus === "pending" || installStatus === "complete") {
          allowedKeys.add(key);
        }
      }
    }

    if (allowedKeys.size === 0) {
      return res.json({ ok: true, items: [] });
    }

    const items = await ProductDeployment.find({
      productKey: { $in: [...allowedKeys] },
      enabled: true,
      packageUri: { $ne: "" },
    })
      .sort({ productKey: 1 })
      .lean();

    return res.json({ ok: true, items });
  }),
);

export default router;

