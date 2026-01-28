import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const router = express.Router();

// all below need auth
router.use(requireAuth);

/** ---------------- Helpers ---------------- */
function normalizeProductKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function getUserObjectId(req) {
  const raw = req.user?._id || req.user?.id;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

/**
 * ✅ Entitlement mapping:
 * Store/filter by requested productKey,
 * but entitlement check may map to a base subscription.
 */
function entitlementKeyFor(productKeyOriginal) {
  const k = normalizeProductKey(productKeyOriginal);

  // Add more aliases as needed
  if (k === "revit-materials") return "revit";

  return k;
}

/**
 * Middleware: rewrite req.params.productKey for entitlement check only,
 * while preserving original requested key for storage/filtering.
 */
function mapEntitlementParam(req, _res, next) {
  const original = normalizeProductKey(req.params.productKey);
  req.productKeyOriginal = original;

  // what entitlement middleware will read
  req.params.productKey = entitlementKeyFor(original);
  next();
}

function requestedProductKey(req) {
  return normalizeProductKey(req.productKeyOriginal ?? req.params.productKey);
}

const MAX_ITEMS = Number(process.env.PROJECT_MAX_ITEMS || 8000);

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  const safe = [];

  for (let i = 0; i < items.length && safe.length < MAX_ITEMS; i++) {
    const it = items[i] || {};

    const elementIds = Array.isArray(it.elementIds)
      ? it.elementIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    safe.push({
      sn: Number.isFinite(Number(it.sn)) ? Number(it.sn) : i + 1,

      // classic
      description: it.description != null ? String(it.description) : "",

      // materials
      takeoffLine: it.takeoffLine != null ? String(it.takeoffLine) : "",
      materialName: it.materialName != null ? String(it.materialName) : "",

      qty: Number.isFinite(Number(it.qty)) ? Number(it.qty) : 0,
      unit: it.unit != null ? String(it.unit) : "",

      // ✅ NEW: persist rate
      rate: Number.isFinite(Number(it.rate)) ? Number(it.rate) : 0,

      elementIds,
      level: it.level != null ? String(it.level) : "",
      type: it.type != null ? String(it.type) : "",

      code: it.code != null ? String(it.code) : "",
    });
  }

  return safe;
}


function normalizeChecklistKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [
    ...new Set(
      keys
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
    ),
  ];
}

/** ---------------- ALIAS ROUTES (Materials) ----------------
 * Allows your client to call:
 *   /projects/revit/materials
 * while storing under:
 *   productKey = "revit-materials"
 */
const MATERIAL_PRODUCT_KEY = "revit-materials";

function forceMaterialsProductKey(req, _res, next) {
  req.productKeyOriginal = MATERIAL_PRODUCT_KEY;
  // for entitlement middleware only:
  req.params.productKey = entitlementKeyFor(MATERIAL_PRODUCT_KEY);
  next();
}

/** POST /projects/revit/materials */
router.post(
  "/revit/materials",
  forceMaterialsProductKey,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);

      const {
        name,
        items,
        clientProjectKey,
        fingerprint,
        modelFingerprint,
        mergeSameTypeLevel,
        mergeSameLine,
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
        items: sanitizeItems(items),

        clientProjectKey: clientProjectKey || "",
        fingerprint: fingerprint || "",
        modelFingerprint: modelFingerprint || "",

        mergeSameTypeLevel:
          typeof mergeSameTypeLevel === "boolean"
            ? mergeSameTypeLevel
            : typeof mergeSameLine === "boolean"
            ? mergeSameLine
            : true,

        checklistCompositeKeys: normalizeChecklistKeys(checklistCompositeKeys),
      });

      res.json(proj);
    } catch (err) {
      console.error("POST /projects/revit/materials error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/** GET /projects/revit/materials */
router.get(
  "/revit/materials",
  forceMaterialsProductKey,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);

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
            itemCount: { $size: { $ifNull: ["$items", []] } },
          },
        },
      ]);

      res.json(list);
    } catch (err) {
      console.error("GET /projects/revit/materials error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/** GET /projects/revit/materials/:id */
router.get(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const p = await TakeoffProject.findOne({ _id: id, userId, productKey });
      if (!p) return res.status(404).json({ error: "Not found" });

      res.json(p);
    } catch (err) {
      console.error("GET /projects/revit/materials/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/** PUT /projects/revit/materials/:id */
router.put(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const {
        name,
        items,
        baseVersion,
        fingerprint,
        modelFingerprint,
        mergeSameTypeLevel,
        mergeSameLine,
        checklistCompositeKeys,
        clientProjectKey,
      } = req.body || {};

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const p = await TakeoffProject.findOne({ _id: id, userId, productKey });
      if (!p) return res.status(404).json({ error: "Not found" });

      if (typeof baseVersion === "number" && baseVersion !== p.version) {
        return res.status(409).json({ error: "Version conflict" });
      }

      if (name !== undefined) p.name = String(name).trim();
      if (Array.isArray(items)) p.items = sanitizeItems(items);

      if (fingerprint !== undefined) p.fingerprint = fingerprint || "";
      if (modelFingerprint !== undefined)
        p.modelFingerprint = modelFingerprint || "";

      if (typeof mergeSameTypeLevel === "boolean")
        p.mergeSameTypeLevel = mergeSameTypeLevel;
      else if (typeof mergeSameLine === "boolean")
        p.mergeSameTypeLevel = mergeSameLine;

      if (clientProjectKey !== undefined)
        p.clientProjectKey = clientProjectKey || "";

      if (Array.isArray(checklistCompositeKeys)) {
        p.checklistCompositeKeys = normalizeChecklistKeys(
          checklistCompositeKeys
        );
      }

      p.version += 1;
      await p.save();

      res.json(p);
    } catch (err) {
      console.error("PUT /projects/revit/materials/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/** DELETE /projects/revit/materials/:id */
router.delete(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const deleted = await TakeoffProject.findOneAndDelete({
        _id: id,
        userId,
        productKey,
      });

      if (!deleted) return res.status(404).json({ error: "Not found" });

      return res.json({ ok: true, id });
    } catch (err) {
      console.error("DELETE /projects/revit/materials/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);


/** ---------------- GENERIC ROUTES ----------------
 * /projects/:productKey
 * /projects/:productKey/:id
 */
router.post(
  "/:productKey",
  mapEntitlementParam,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);

      const {
        name,
        items,
        clientProjectKey,
        fingerprint,
        modelFingerprint,
        mergeSameTypeLevel,
        mergeSameLine,
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

        items: sanitizeItems(items),

        clientProjectKey: clientProjectKey || "",
        fingerprint: fingerprint || "",
        modelFingerprint: modelFingerprint || "",

        mergeSameTypeLevel:
          typeof mergeSameTypeLevel === "boolean"
            ? mergeSameTypeLevel
            : typeof mergeSameLine === "boolean"
            ? mergeSameLine
            : true,

        checklistCompositeKeys: normalizeChecklistKeys(checklistCompositeKeys),
      });

      res.json(proj);
    } catch (err) {
      console.error("POST /projects/:productKey error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/:productKey",
  mapEntitlementParam,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);

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
            itemCount: { $size: { $ifNull: ["$items", []] } },
          },
        },
      ]);

      res.json(list);
    } catch (err) {
      console.error("GET /projects/:productKey error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const p = await TakeoffProject.findOne({ _id: id, userId, productKey });
      if (!p) return res.status(404).json({ error: "Not found" });

      res.json(p);
    } catch (err) {
      console.error("GET /projects/:productKey/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.put(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const {
        name,
        items,
        baseVersion,
        fingerprint,
        modelFingerprint,
        mergeSameTypeLevel,
        mergeSameLine,
        checklistCompositeKeys,
        clientProjectKey,
      } = req.body || {};

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const p = await TakeoffProject.findOne({ _id: id, userId, productKey });
      if (!p) return res.status(404).json({ error: "Not found" });

      if (typeof baseVersion === "number" && baseVersion !== p.version) {
        return res.status(409).json({ error: "Version conflict" });
      }

      if (name !== undefined) p.name = String(name).trim();
      if (Array.isArray(items)) p.items = sanitizeItems(items);

      if (fingerprint !== undefined) p.fingerprint = fingerprint || "";
      if (modelFingerprint !== undefined)
        p.modelFingerprint = modelFingerprint || "";

      if (typeof mergeSameTypeLevel === "boolean")
        p.mergeSameTypeLevel = mergeSameTypeLevel;
      else if (typeof mergeSameLine === "boolean")
        p.mergeSameTypeLevel = mergeSameLine;

      if (clientProjectKey !== undefined)
        p.clientProjectKey = clientProjectKey || "";

      if (Array.isArray(checklistCompositeKeys)) {
        p.checklistCompositeKeys = normalizeChecklistKeys(
          checklistCompositeKeys
        );
      }

      p.version += 1;
      await p.save();

      res.json(p);
    } catch (err) {
      console.error("PUT /projects/:productKey/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/** DELETE /projects/:productKey/:id */
router.delete(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  async (req, res) => {
    try {
      const productKey = requestedProductKey(req);
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id))
        return res.status(400).json({ error: "Invalid id" });

      const userId = getUserObjectId(req);
      if (!userId)
        return res.status(401).json({ error: "Invalid user id in token" });

      const deleted = await TakeoffProject.findOneAndDelete({
        _id: id,
        userId,
        productKey,
      });

      if (!deleted) return res.status(404).json({ error: "Not found" });

      return res.json({ ok: true, id });
    } catch (err) {
      console.error("DELETE /projects/:productKey/:id error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);




export default router;
