// routes/entitlements.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = express.Router();

function isExpired(expiresAt) {
  return expiresAt && new Date(expiresAt).getTime() < Date.now();
}

// ✅ legacy -> devices[] migration for a single entitlement object
function normalizeLegacyEntitlement(ent) {
  if (!ent) return ent;

  if ((!ent.seats || ent.seats < 1) && ent.seats !== 0) ent.seats = 1;
  if (!Array.isArray(ent.devices)) ent.devices = [];

  // If old fields exist but devices[] empty, migrate into devices[]
  if (ent.devices.length === 0 && ent.deviceFingerprint) {
    ent.devices.push({
      fingerprint: ent.deviceFingerprint,
      name: "",
      boundAt: ent.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }

  return ent;
}

function activeDevices(ent) {
  return (ent.devices || []).filter((d) => !d.revokedAt);
}

// List entitlements + seat usage
router.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });

  // normalize all entitlements before returning
  user.entitlements = (user.entitlements || []).map((e) =>
    normalizeLegacyEntitlement(e),
  );

  await user.save();

  const out = (user.entitlements || []).map((e) => {
    const act = activeDevices(e);
    return {
      productKey: e.productKey,
      status: e.status,
      expiresAt: e.expiresAt,
      seats: e.seats || 1,
      seatsUsed: act.length,
      devices: act.map((d) => ({
        fingerprint: d.fingerprint,
        name: d.name,
        boundAt: d.boundAt,
        lastSeenAt: d.lastSeenAt,
      })),
    };
  });

  return res.json({ ok: true, entitlements: out });
});

// Activate a device for a product (enforces seats)
router.post("/activate", requireAuth, async (req, res) => {
  const productKey = String(req.body?.productKey || "").trim();
  const fingerprint = String(req.body?.deviceFingerprint || "").trim();
  const deviceName = String(req.body?.deviceName || "").trim();

  if (!productKey)
    return res.status(400).json({ error: "productKey required" });
  if (!fingerprint)
    return res.status(400).json({ error: "deviceFingerprint required" });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const ent = user.entitlements?.find((e) => e.productKey === productKey);
  if (!ent)
    return res.status(403).json({ error: "No entitlement for product" });

  normalizeLegacyEntitlement(ent);

  if (ent.status !== "active")
    return res.status(403).json({ error: "Entitlement not active" });

  if (isExpired(ent.expiresAt))
    return res.status(403).json({ error: "Entitlement expired" });

  const act = activeDevices(ent);

  // already activated on this device?
  const existing = act.find((d) => d.fingerprint === fingerprint);
  if (existing) {
    existing.lastSeenAt = new Date();
    if (deviceName) existing.name = deviceName;
    await user.save();

    return res.json({
      ok: true,
      message: "Device already activated",
      seats: ent.seats || 1,
      seatsUsed: activeDevices(ent).length,
    });
  }

  const seatLimit = Math.max(parseInt(ent.seats || 1, 10), 1);
  if (act.length >= seatLimit) {
    return res.status(409).json({
      error: "Seat limit reached. Deactivate a device to continue.",
      seats: seatLimit,
      seatsUsed: act.length,
      devices: act.map((d) => ({
        fingerprint: d.fingerprint,
        name: d.name,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  }

  ent.devices.push({
    fingerprint,
    name: deviceName,
    boundAt: new Date(),
    lastSeenAt: new Date(),
    revokedAt: null,
  });

  // keep legacy fields populated (helps older clients/tools)
  if (!ent.deviceFingerprint) ent.deviceFingerprint = fingerprint;
  if (!ent.deviceBoundAt) ent.deviceBoundAt = new Date();

  await user.save();

  return res.json({
    ok: true,
    message: "Device activated",
    seats: seatLimit,
    seatsUsed: activeDevices(ent).length,
  });
});

// Deactivate a device to free a seat
router.post("/deactivate", requireAuth, async (req, res) => {
  const productKey = String(req.body?.productKey || "").trim();
  const fingerprint = String(req.body?.deviceFingerprint || "").trim();

  if (!productKey)
    return res.status(400).json({ error: "productKey required" });
  if (!fingerprint)
    return res.status(400).json({ error: "deviceFingerprint required" });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const ent = user.entitlements?.find((e) => e.productKey === productKey);
  if (!ent) return res.status(404).json({ error: "Entitlement not found" });

  normalizeLegacyEntitlement(ent);

  const dev = (ent.devices || []).find(
    (d) => d.fingerprint === fingerprint && !d.revokedAt,
  );
  if (!dev) return res.status(404).json({ error: "Device not active" });

  dev.revokedAt = new Date();
  await user.save();

  return res.json({
    ok: true,
    message: "Device deactivated",
    seats: ent.seats || 1,
    seatsUsed: activeDevices(ent).length,
  });
});

export default router;
