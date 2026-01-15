import express from "express";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";

const router = express.Router();

function requireAdminKey(req, res, next) {
  const k = req.header("x-admin-key");
  if (!k || k !== process.env.ADMIN_API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// Create / Update compute item (upsert)
router.put("/compute-items", requireAdminKey, async (req, res) => {
  const body = req.body || {};
  const section = String(body.section || "").trim();
  const name = String(body.name || "").trim();
  if (!section || !name)
    return res.status(400).json({ error: "section and name are required" });

  const doc = await RateGenComputeItem.findOneAndUpdate(
    { section, name },
    {
      section,
      name,
      outputUnit: body.outputUnit || "m2",
      poPercent: Number(body.poPercent || 0),
      enabled: body.enabled !== false,
      lines: Array.isArray(body.lines) ? body.lines : [],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // TODO: bump your existing catalog version here (same one manifest uses)

  res.json({ ok: true, item: doc });
});

router.get("/compute-items", requireAdminKey, async (_req, res) => {
  const items = await RateGenComputeItem.find()
    .sort({ section: 1, name: 1 })
    .lean();
  res.json({ ok: true, items });
});

export default router;
