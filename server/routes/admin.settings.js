import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";

function requireAdminOrMiniAdmin(req, res, next) {
  const role = req.user?.role;
  if (role === "admin" || role === "mini_admin") return next();
  return res.status(403).json({ error: "Admin or Mini-Admin only" });
}

function requireAdminOnly(req, res, next) {
  const role = req.user?.role;
  if (role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdminOrMiniAdmin);

// GET current FX
router.get("/fx", async (_req, res) => {
  const s = await Setting.findOne({ key: "global" }).lean();
  res.json({ fxRateNGNUSD: s?.fxRateNGNUSD || 0.001 });
});

// POST set FX { fxRateNGNUSD }
router.post("/fx", async (req, res) => {
  const { fxRateNGNUSD } = req.body || {};
  if (!fxRateNGNUSD || fxRateNGNUSD <= 0)
    return res.status(400).json({ error: "fxRateNGNUSD must be > 0" });

  const s = await Setting.findOneAndUpdate(
    { key: "global" },
    { fxRateNGNUSD: Number(fxRateNGNUSD) },
    { upsert: true, new: true }
  );
  res.json({ ok: true, fxRateNGNUSD: s.fxRateNGNUSD });
});

// GET mobile app download URL
router.get("/mobile-app-url", async (_req, res) => {
  const s = await Setting.findOne({ key: "global" }).lean();
  res.json({ mobileAppUrl: s?.mobileAppUrl || "" });
});

// POST set mobile app download URL { mobileAppUrl }
router.post("/mobile-app-url", async (req, res) => {
  const { mobileAppUrl } = req.body || {};
  if (typeof mobileAppUrl !== "string")
    return res.status(400).json({ error: "mobileAppUrl must be a string" });

  const s = await Setting.findOneAndUpdate(
    { key: "global" },
    { mobileAppUrl: mobileAppUrl.trim() },
    { upsert: true, new: true }
  );
  res.json({ ok: true, mobileAppUrl: s.mobileAppUrl });
});

// GET installer hub settings
router.get("/installer-hub", async (_req, res) => {
  const s = await Setting.findOne({ key: "global" }).lean();
  res.json({
    installerHubUrl: s?.installerHubUrl || "",
    installerHubVideoUrl: s?.installerHubVideoUrl || "",
  });
});

// POST set installer hub settings { installerHubUrl?, installerHubVideoUrl? }
router.post("/installer-hub", async (req, res) => {
  const update = {};
  if (typeof req.body?.installerHubUrl === "string") {
    update.installerHubUrl = req.body.installerHubUrl.trim();
  }
  if (typeof req.body?.installerHubVideoUrl === "string") {
    update.installerHubVideoUrl = req.body.installerHubVideoUrl.trim();
  }
  if (!Object.keys(update).length) {
    return res.status(400).json({ error: "Provide installerHubUrl or installerHubVideoUrl" });
  }

  const s = await Setting.findOneAndUpdate(
    { key: "global" },
    update,
    { upsert: true, new: true },
  );
  res.json({
    ok: true,
    installerHubUrl: s.installerHubUrl,
    installerHubVideoUrl: s.installerHubVideoUrl,
  });
});

// GET force-reinstall broadcast state (admin/mini-admin)
router.get("/force-reinstall", async (_req, res) => {
  const s = await Setting.findOne({ key: "global" }).lean();
  res.json({
    active: !!s?.forceReinstallActive,
    message: s?.forceReinstallMessage || "",
    triggeredAt: s?.forceReinstallAt || null,
    installerHubUrl: s?.installerHubUrl || "",
    installerHubVideoUrl: s?.installerHubVideoUrl || "",
  });
});

const DEFAULT_REINSTALL_MESSAGE =
  "We've released a major update. Please (1) download the latest Installer Hub, " +
  "(2) watch the Installer Hub setup video, (3) reinstall the Hub on your device, " +
  "and (4) redownload all software updates. Your installed apps must be re-activated.";

// POST trigger global reinstall: revoke ALL active devices and set the broadcast message.
// Admin only — this signs out every active install fleet-wide.
router.post("/force-reinstall", requireAdminOnly, async (req, res) => {
  const customMessage =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const message = customMessage || DEFAULT_REINSTALL_MESSAGE;
  const triggeredAt = new Date();

  // Revoke all currently-active device bindings across all users.
  // We mark with revokedAt instead of deleting so we keep the audit trail.
  // Also bump refreshVersion so any in-flight access tokens are invalidated.
  const users = await User.find(
    { "entitlements.devices.0": { $exists: true } },
    { entitlements: 1, refreshVersion: 1 },
  );

  let usersTouched = 0;
  let devicesRevoked = 0;

  for (const u of users) {
    let touched = false;
    for (const ent of u.entitlements || []) {
      for (const dev of ent.devices || []) {
        if (!dev.revokedAt) {
          dev.revokedAt = triggeredAt;
          devicesRevoked += 1;
          touched = true;
        }
      }
    }
    if (touched) {
      u.refreshVersion = (u.refreshVersion || 0) + 1;
      await u.save();
      usersTouched += 1;
    }
  }

  await Setting.findOneAndUpdate(
    { key: "global" },
    {
      forceReinstallActive: true,
      forceReinstallMessage: message,
      forceReinstallAt: triggeredAt,
    },
    { upsert: true, new: true },
  );

  res.json({
    ok: true,
    message,
    triggeredAt,
    usersTouched,
    devicesRevoked,
  });
});

// POST clear the active reinstall broadcast (admin only). Does not re-bind any devices.
router.post("/force-reinstall/clear", requireAdminOnly, async (_req, res) => {
  const s = await Setting.findOneAndUpdate(
    { key: "global" },
    { forceReinstallActive: false },
    { upsert: true, new: true },
  );
  res.json({
    ok: true,
    active: !!s.forceReinstallActive,
    message: s.forceReinstallMessage || "",
  });
});

export default router;
