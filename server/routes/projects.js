import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const router = express.Router();

// All below need auth; entitlement is per :productKey
router.use(requireAuth);

/** POST /projects/:productKey  { name, items:[{sn,description,qty,unit}] } */
router.post("/:productKey", requireEntitlementParam, async (req, res) => {
  const { productKey } = req.params;
  const { name, items, clientProjectKey, fingerprint, mergeSameTypeLevel } =
    req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const proj = await TakeoffProject.create({
    userId: req.user._id,
    productKey,
    name,
    items: Array.isArray(items) ? items : [],
    clientProjectKey,
    fingerprint,
    mergeSameTypeLevel,
  });

  res.json(proj);
});

/** GET /projects/:productKey  (mine, lightweight) */
router.get("/:productKey", requireEntitlementParam, async (req, res) => {
  const { productKey } = req.params;
  const list = await TakeoffProject.find({ userId: req.user._id, productKey })
    .sort({ updatedAt: -1 })
    .select("_id name items updatedAt version");
  res.json(
    list.map((p) => ({
      _id: p._id,
      name: p.name,
      itemCount: p.items.length,
      updatedAt: p.updatedAt,
      version: p.version,
    }))
  );
});

/** GET /projects/:productKey/:id */
router.get("/:productKey/:id", requireEntitlementParam, async (req, res) => {
  const { productKey, id } = req.params;
  const p = await TakeoffProject.findOne({
    _id: id,
    userId: req.user._id,
    productKey,
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

/** PUT /projects/:productKey/:id  { name?, items, baseVersion } */
router.put("/:productKey/:id", requireEntitlementParam, async (req, res) => {
  const { productKey, id } = req.params;
  const { name, items, baseVersion } = req.body || {};
  const p = await TakeoffProject.findOne({
    _id: id,
    userId: req.user._id,
    productKey,
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  if (typeof baseVersion === "number" && baseVersion !== p.version) {
    return res.status(409).json({ error: "Version conflict" });
  }
  if (name !== undefined) p.name = name;
  if (Array.isArray(items)) p.items = items;
  p.version += 1;
  await p.save();
  res.json(p);
});

export default router;
