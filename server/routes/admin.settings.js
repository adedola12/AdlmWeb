import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Setting } from "../models/Setting.js";

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

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

export default router;
