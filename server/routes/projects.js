import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const router = express.Router();

// All below need auth; entitlement is per :productKey
router.use(requireAuth);

/** Helpers */
function normalizeProductKey(v) {
  return String(v || "").trim();
}

function getUserObjectId(req) {
  const raw = req.user?._id || req.user?.id;

  // If it's already an ObjectId, keep it
  if (raw instanceof mongoose.Types.ObjectId) return raw;

  // If it's a string, validate + cast for aggregation
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;

  return new mongoose.Types.ObjectId(String(raw));
}

/** POST /projects/:productKey  { name, items:[{sn,description,qty,unit}] } */
router.post("/:productKey", requireEntitlementParam, async (req, res) => {
  try {
    const productKey = normalizeProductKey(req.params.productKey);

    const {
      name,
      items,
      clientProjectKey,
      fingerprint,
      modelFingerprint,
      mergeSameTypeLevel,
      checklistCompositeKeys,
    } = req.body || {};

    if (!name) return res.status(400).json({ error: "name required" });

    const userId = getUserObjectId(req);
    if (!userId)
      return res.status(401).json({ error: "Invalid user id in token" });

    const proj = await TakeoffProject.create({
      userId,
      productKey,
      name: String(name).trim(),

      items: Array.isArray(items) ? items : [],

      clientProjectKey: clientProjectKey || "",
      fingerprint: fingerprint || "",
      modelFingerprint: modelFingerprint || "",

      mergeSameTypeLevel:
        typeof mergeSameTypeLevel === "boolean" ? mergeSameTypeLevel : true,

      checklistCompositeKeys: Array.isArray(checklistCompositeKeys)
        ? [
            ...new Set(
              checklistCompositeKeys
                .filter(Boolean)
                .map((s) => String(s).trim())
            ),
          ]
        : [],
    });

    res.json(proj);
  } catch (err) {
    console.error("POST /projects/:productKey error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** GET /projects/:productKey  (mine, lightweight) */
router.get("/:productKey", requireEntitlementParam, async (req, res) => {
  try {
    const productKey = normalizeProductKey(req.params.productKey);

    // ✅ Cast user id for aggregation match
    const userId = getUserObjectId(req);
    if (!userId)
      return res.status(401).json({ error: "Invalid user id in token" });

    const list = await TakeoffProject.aggregate([
      { $match: { userId, productKey } },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          updatedAt: 1,
          version: 1,
          itemCount: { $size: "$items" },
        },
      },
    ]);

    res.json(list);
  } catch (err) {
    console.error("GET /projects/:productKey error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** GET /projects/:productKey/:id */
router.get("/:productKey/:id", requireEntitlementParam, async (req, res) => {
  try {
    const productKey = normalizeProductKey(req.params.productKey);
    const id = String(req.params.id || "").trim();

    const userId = getUserObjectId(req);
    if (!userId)
      return res.status(401).json({ error: "Invalid user id in token" });

    const p = await TakeoffProject.findOne({
      _id: id,
      userId,
      productKey,
    });

    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (err) {
    console.error("GET /projects/:productKey/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** PUT /projects/:productKey/:id  { name?, items, baseVersion } */
router.put("/:productKey/:id", requireEntitlementParam, async (req, res) => {
  try {
    const productKey = normalizeProductKey(req.params.productKey);
    const id = String(req.params.id || "").trim();

    const {
      name,
      items,
      baseVersion,

      fingerprint,
      modelFingerprint,
      mergeSameTypeLevel,
      checklistCompositeKeys,
      clientProjectKey,
    } = req.body || {};

    const userId = getUserObjectId(req);
    if (!userId)
      return res.status(401).json({ error: "Invalid user id in token" });

    const p = await TakeoffProject.findOne({
      _id: id,
      userId,
      productKey,
    });

    if (!p) return res.status(404).json({ error: "Not found" });

    if (typeof baseVersion === "number" && baseVersion !== p.version) {
      return res.status(409).json({ error: "Version conflict" });
    }

    if (name !== undefined) p.name = String(name).trim();
    if (Array.isArray(items)) p.items = items;

    if (fingerprint !== undefined) p.fingerprint = fingerprint || "";
    if (modelFingerprint !== undefined)
      p.modelFingerprint = modelFingerprint || "";
    if (typeof mergeSameTypeLevel === "boolean")
      p.mergeSameTypeLevel = mergeSameTypeLevel;
    if (clientProjectKey !== undefined)
      p.clientProjectKey = clientProjectKey || "";

    if (Array.isArray(checklistCompositeKeys)) {
      p.checklistCompositeKeys = [
        ...new Set(
          checklistCompositeKeys.filter(Boolean).map((s) => String(s).trim())
        ),
      ];
    }

    p.version += 1;
    await p.save();

    res.json(p);
  } catch (err) {
    console.error("PUT /projects/:productKey/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
