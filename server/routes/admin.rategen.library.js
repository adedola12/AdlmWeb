import express from "express";
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { allocateSn, bumpMeta } from "../models/RateGenMeta.js";
import { requireAdminKey } from "../middleware/requireAdminKey.js";

const router = express.Router();
router.use(requireAdminKey);

function normKey(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * POST /admin/rategen/materials
 * body: { sn?, key?, name, unit?, defaultUnitPrice?, enabled? }
 * - if sn not provided => allocate new sn
 */
router.post("/materials", async (req, res, next) => {
  try {
    const { sn, key, name, unit, defaultUnitPrice, enabled, tags } =
      req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const finalSn = Number.isFinite(sn) ? sn : await allocateSn("materials");
    const doc = await RateGenMaterial.findOneAndUpdate(
      { sn: finalSn },
      {
        sn: finalSn,
        key: key ? normKey(key) : normKey(name),
        name,
        unit: unit || "",
        defaultUnitPrice: Number(defaultUnitPrice || 0),
        enabled: enabled !== false,
        tags: Array.isArray(tags) ? tags : [],
      },
      { new: true, upsert: true }
    );

    await bumpMeta("materials", "admin", `upsert material sn=${finalSn}`);
    res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
});

router.post("/labour", async (req, res, next) => {
  try {
    const { sn, key, name, unit, defaultUnitPrice, enabled, tags } =
      req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const finalSn = Number.isFinite(sn) ? sn : await allocateSn("labour");
    const doc = await RateGenLabour.findOneAndUpdate(
      { sn: finalSn },
      {
        sn: finalSn,
        key: key ? normKey(key) : normKey(name),
        name,
        unit: unit || "",
        defaultUnitPrice: Number(defaultUnitPrice || 0),
        enabled: enabled !== false,
        tags: Array.isArray(tags) ? tags : [],
      },
      { new: true, upsert: true }
    );

    await bumpMeta("labour", "admin", `upsert labour sn=${finalSn}`);
    res.json({ ok: true, item: doc });
  } catch (err) {
    next(err);
  }
});

export default router;
