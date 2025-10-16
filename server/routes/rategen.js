// server/routes/rategen.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import {
  fetchMasterMaterials,
  fetchMasterLabour,
} from "../util/rategenMaster.js";
import { normalizeZone, ZONES } from "../util/zones.js";
import { ensureDb } from "../db.js";

const router = express.Router();

router.use(requireAuth, requireEntitlement("rategen"));

router.get("/zones", (_req, res) => res.json(ZONES));

router.get("/master", async (req, res) => {
  try {
    await ensureDb(); // ⬅️ safe guard

    const qZone = normalizeZone(req.query.zone);
    const zone = qZone || req.user.zone || null;

    const [materials, labour] = await Promise.all([
      fetchMasterMaterials(zone),
      fetchMasterLabour(zone),
    ]);

    res.json({ materials, labour, source: "mongo-master", zone });
  } catch (e) {
    console.error("[/rategen/master] error:", e);
    res
      .status(500)
      .json({ error: e?.message || "Failed to load master prices" });
  }
});

router.get("/library", async (req, res) => {
  await ensureDb();
  let lib = await RateGenLibrary.findOne({ userId: req.user._id });
  if (!lib) lib = await RateGenLibrary.create({ userId: req.user._id });
  res.json(lib);
});

router.put("/library", async (req, res) => {
  await ensureDb();
  const { materials, labour, baseVersion } = req.body || {};

  let lib = await RateGenLibrary.findOne({ userId: req.user._id });
  if (!lib) lib = await RateGenLibrary.create({ userId: req.user._id });

  if (
    Number.isFinite(baseVersion) &&
    baseVersion > 0 &&
    baseVersion !== lib.version
  ) {
    return res.status(409).json({ error: "Version conflict" });
  }

  // if (typeof baseVersion === "number" && baseVersion !== lib.version) {
  //   return res.status(409).json({ error: "Version conflict" });
  // }

  if (Array.isArray(materials)) lib.materials = materials;
  if (Array.isArray(labour)) lib.labour = labour;

  lib.version += 1;
  await lib.save();
  res.json(lib);
});

export default router;
