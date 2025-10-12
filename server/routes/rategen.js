import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
} from "../util/rategenMaster.js";

const router = express.Router();

// all rategen endpoints require a valid user + rategen entitlement
router.use(requireAuth, requireEntitlement("rategen"));

/** MASTER prices pulled from ADLMRateDB (Mongo) */
router.get("/master", async (_req, res) => {
  try {
    const [materials, labour] = await Promise.all([
      fetchMasterMaterials(),
      fetchMasterLabour(),
    ]);
    res.json({ materials, labour, source: "mongo-master" });
  } catch (e) {
    console.error("[/rategen/master] error:", e);
    res
      .status(500)
      .json({ error: e?.message || "Failed to load master prices" });
  }
});


/** Your per-user library (kept for overrides) */
router.get("/library", async (req, res) => {
  let lib = await RateGenLibrary.findOne({ userId: req.user._id });
  if (!lib) lib = await RateGenLibrary.create({ userId: req.user._id });
  res.json(lib);
});

router.put("/library", async (req, res) => {
  const { materials, labour, baseVersion } = req.body || {};
  let lib = await RateGenLibrary.findOne({ userId: req.user._id });
  if (!lib) lib = await RateGenLibrary.create({ userId: req.user._id });

  if (typeof baseVersion === "number" && baseVersion !== lib.version) {
    return res.status(409).json({ error: "Version conflict" });
  }
  if (Array.isArray(materials)) lib.materials = materials;
  if (Array.isArray(labour)) lib.labour = labour;
  lib.version += 1;
  await lib.save();
  res.json(lib);
});

export default router;
