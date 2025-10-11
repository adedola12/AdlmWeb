import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";

const router = express.Router();
router.use(requireAuth, requireEntitlement("rategen"));

/** Ensure a doc exists and return it */
async function getOrCreate(userId) {
  let lib = await RateGenLibrary.findOne({ userId });
  if (!lib)
    lib = await RateGenLibrary.create({ userId, materials: [], labour: [] });
  return lib;
}

/** GET /rategen/library */
router.get("/library", async (req, res) => {
  const lib = await getOrCreate(req.user._id);
  res.json(lib);
});

/** PUT /rategen/library  { materials?, labour?, baseVersion } */
router.put("/library", async (req, res) => {
  const { materials, labour, baseVersion } = req.body || {};
  const lib = await getOrCreate(req.user._id);
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
