import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Setting } from "../models/Setting.js";

function requireAdminOrMiniAdmin(req, res, next) {
  const role = req.user?.role;
  if (role === "admin" || role === "mini_admin") return next();
  return res.status(403).json({ error: "Admin or Mini-Admin only" });
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

export default router;
