import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const router = express.Router();

router.use(requireAuth);

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

function entitlementKeyFor(productKeyOriginal) {
  const key = normalizeProductKey(productKeyOriginal);
  if (key === "revit-materials") return "revit";
  return key;
}

function mapEntitlementParam(req, _res, next) {
  const original = normalizeProductKey(req.params.productKey);
  req.productKeyOriginal = original;
  req.params.productKey = entitlementKeyFor(original);
  next();
}

function requestedProductKey(req) {
  return normalizeProductKey(req.productKeyOriginal ?? req.params.productKey);
}

const MAX_ITEMS = Number(process.env.PROJECT_MAX_ITEMS || 8000);
const MATERIAL_PRODUCT_KEY = "revit-materials";
const VALUATION_TIME_ZONE =
  process.env.PROJECT_VALUATION_TIMEZONE || "Africa/Lagos";

function forceMaterialsProductKey(req, _res, next) {
  req.productKeyOriginal = MATERIAL_PRODUCT_KEY;
  req.params.productKey = entitlementKeyFor(MATERIAL_PRODUCT_KEY);
  next();
}

function isMaterialsProductKey(productKey) {
  const key = normalizeProductKey(productKey);
  return key === "revit-materials" || key === "revit-material";
}

function statusFieldForProductKey(productKey) {
  return isMaterialsProductKey(productKey) ? "purchased" : "completed";
}

function statusDateFieldForProductKey(productKey) {
  return isMaterialsProductKey(productKey) ? "purchasedAt" : "completedAt";
}

function statusLabelForProductKey(productKey) {
  return isMaterialsProductKey(productKey) ? "Purchased" : "Completed";
}

function parseOptionalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date) {
  const safe = parseOptionalDate(date);
  if (!safe) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: VALUATION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(safe);

    const values = {};
    for (const part of parts) {
      if (
        part.type === "year" ||
        part.type === "month" ||
        part.type === "day"
      ) {
        values[part.type] = part.value;
      }
    }

    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    // Fall back to UTC day if timezone formatting is unavailable.
  }

  return safe.toISOString().slice(0, 10);
}

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function itemIdentity(item, index) {
  const sn = safeNum(item?.sn) || index + 1;
  const parts = [
    sn,
    String(item?.code || "").trim().toLowerCase(),
    String(item?.description || "").trim().toLowerCase(),
    String(item?.takeoffLine || "").trim().toLowerCase(),
    String(item?.materialName || "").trim().toLowerCase(),
    String(item?.unit || "").trim().toLowerCase(),
  ];
  return parts.join("::");
}

function displayItemDescription(item, productKey) {
  if (isMaterialsProductKey(productKey)) {
    const parts = [item?.takeoffLine, item?.materialName]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" - ");
  }
  return String(item?.description || "").trim();
}

function normalizeChecklistKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [
    ...new Set(
      keys
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];

  const safe = [];
  for (let i = 0; i < items.length && safe.length < MAX_ITEMS; i += 1) {
    const item = items[i] || {};

    const elementIds = Array.isArray(item.elementIds)
      ? item.elementIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];

    safe.push({
      sn: Number.isFinite(Number(item.sn)) ? Number(item.sn) : i + 1,
      qty: Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0,
      unit: item.unit != null ? String(item.unit) : "",
      rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : 0,
      purchased: Boolean(item.purchased),
      purchasedAt: parseOptionalDate(item.purchasedAt),
      completed: Boolean(item.completed),
      completedAt: parseOptionalDate(item.completedAt),
      statusUpdatedAt: parseOptionalDate(item.statusUpdatedAt),
      description: item.description != null ? String(item.description) : "",
      takeoffLine: item.takeoffLine != null ? String(item.takeoffLine) : "",
      materialName: item.materialName != null ? String(item.materialName) : "",
      elementIds,
      level: item.level != null ? String(item.level) : "",
      type: item.type != null ? String(item.type) : "",
      code: item.code != null ? String(item.code) : "",
    });
  }

  return safe;
}

function bucketPreviousItems(items) {
  const buckets = new Map();
  (items || []).forEach((item, index) => {
    const key = itemIdentity(item, index);
    const bucket = buckets.get(key) || [];
    bucket.push({ item, index });
    buckets.set(key, bucket);
  });
  return buckets;
}

function applyValuationTracking({ productKey, previousItems = [], nextItems = [], previousEvents = [] }) {
  const statusField = statusFieldForProductKey(productKey);
  const statusDateField = statusDateFieldForProductKey(productKey);
  const otherStatusField = statusField === "purchased" ? "completed" : "purchased";
  const otherStatusDateField = statusDateField === "purchasedAt" ? "completedAt" : "purchasedAt";
  const now = new Date();
  const previousBuckets = bucketPreviousItems(previousItems);
  const valuationEvents = Array.isArray(previousEvents) ? [...previousEvents] : [];

  const items = nextItems.map((item, index) => {
    const key = itemIdentity(item, index);
    const bucket = previousBuckets.get(key) || [];
    const previousMatch = bucket.length ? bucket.shift() : null;
    if (bucket.length) previousBuckets.set(key, bucket);
    else previousBuckets.delete(key);

    const previousItem = previousMatch?.item || {};
    const previousStatus = Boolean(previousItem?.[statusField]);
    const nextStatus = Boolean(item?.[statusField]);
    const previousStatusAt = parseOptionalDate(previousItem?.[statusDateField]);
    const previousOtherAt = parseOptionalDate(previousItem?.[otherStatusDateField]);
    const previousUpdatedAt = parseOptionalDate(previousItem?.statusUpdatedAt);

    const nextItem = {
      ...item,
      purchased: Boolean(item?.purchased),
      completed: Boolean(item?.completed),
      [otherStatusDateField]: previousOtherAt,
      [statusDateField]: nextStatus
        ? previousStatus && previousStatusAt
          ? previousStatusAt
          : now
        : null,
      statusUpdatedAt: previousStatus !== nextStatus ? now : previousUpdatedAt,
    };

    if (previousStatus !== nextStatus) {
      valuationEvents.push({
        itemKey: key,
        itemSn: safeNum(item?.sn) || index + 1,
        description: String(item?.description || ""),
        takeoffLine: String(item?.takeoffLine || ""),
        materialName: String(item?.materialName || ""),
        qty: safeNum(item?.qty),
        unit: String(item?.unit || ""),
        rate: safeNum(item?.rate),
        amount: safeNum(item?.qty) * safeNum(item?.rate),
        statusField,
        markedValue: nextStatus,
        markedAt: now,
        markedDay: isoDay(now),
      });
    }

    return nextItem;
  });

  return { items, valuationEvents };
}

function buildValuationLogs(project, productKey) {
  const statusField = statusFieldForProductKey(productKey);
  const logsByDay = new Map();
  const events = Array.isArray(project?.valuationEvents) ? [...project.valuationEvents] : [];

  events.sort((a, b) => {
    const ax = parseOptionalDate(a?.markedAt)?.getTime() || 0;
    const bx = parseOptionalDate(b?.markedAt)?.getTime() || 0;
    return ax - bx;
  });

  for (const event of events) {
    if (String(event?.statusField || "") !== statusField) continue;
    const day = String(event?.markedDay || isoDay(event?.markedAt) || "").trim();
    if (!day) continue;

    const byItem = logsByDay.get(day) || new Map();
    const fallbackKey = `${event?.itemSn || 0}::${event?.description || ""}::${event?.materialName || ""}`;
    byItem.set(String(event?.itemKey || fallbackKey), {
      itemKey: String(event?.itemKey || fallbackKey),
      sn: safeNum(event?.itemSn),
      description: displayItemDescription(event, productKey),
      qty: safeNum(event?.qty),
      unit: String(event?.unit || ""),
      rate: safeNum(event?.rate),
      amount: safeNum(event?.amount),
      markedValue: Boolean(event?.markedValue),
      markedAt: parseOptionalDate(event?.markedAt)?.toISOString() || null,
    });
    logsByDay.set(day, byItem);
  }

  return [...logsByDay.entries()]
    .map(([date, byItem]) => {
      const items = [...byItem.values()]
        .filter((item) => item.markedValue)
        .sort((a, b) => safeNum(a.sn) - safeNum(b.sn));
      const totalAmount = items.reduce((sum, item) => sum + safeNum(item.amount), 0);
      return {
        date,
        title: `Valuation for ${date}`,
        itemCount: items.length,
        totalAmount,
        items,
      };
    })
    .filter((entry) => entry.itemCount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function createProject(req, res) {
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
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const tracked = applyValuationTracking({
      productKey,
      previousItems: [],
      nextItems: sanitizeItems(items),
      previousEvents: [],
    });

    const project = await TakeoffProject.create({
      userId,
      productKey,
      name: String(name).trim(),
      items: tracked.items,
      valuationEvents: tracked.valuationEvents,
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

    res.json(project);
  } catch (err) {
    console.error("POST project error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function listProjects(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

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
    console.error("GET projects error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function getProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    res.json(project);
  } catch (err) {
    console.error("GET project error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function updateProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

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
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (typeof baseVersion === "number" && baseVersion !== project.version) {
      return res.status(409).json({ error: "Version conflict" });
    }

    if (name !== undefined) project.name = String(name).trim();

    if (Array.isArray(items)) {
      const tracked = applyValuationTracking({
        productKey,
        previousItems: Array.isArray(project.items) ? project.items : [],
        nextItems: sanitizeItems(items),
        previousEvents: Array.isArray(project.valuationEvents)
          ? project.valuationEvents
          : [],
      });
      project.items = tracked.items;
      project.valuationEvents = tracked.valuationEvents;
    }

    if (fingerprint !== undefined) project.fingerprint = fingerprint || "";
    if (modelFingerprint !== undefined) {
      project.modelFingerprint = modelFingerprint || "";
    }

    if (typeof mergeSameTypeLevel === "boolean") {
      project.mergeSameTypeLevel = mergeSameTypeLevel;
    } else if (typeof mergeSameLine === "boolean") {
      project.mergeSameTypeLevel = mergeSameLine;
    }

    if (clientProjectKey !== undefined) {
      project.clientProjectKey = clientProjectKey || "";
    }

    if (Array.isArray(checklistCompositeKeys)) {
      project.checklistCompositeKeys = normalizeChecklistKeys(checklistCompositeKeys);
    }

    project.version += 1;
    await project.save();

    res.json(project);
  } catch (err) {
    console.error("PUT project error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const deleted = await TakeoffProject.findOneAndDelete({
      _id: id,
      userId,
      productKey,
    });

    if (!deleted) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE project error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function getProjectValuations(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey }).lean();
    if (!project) return res.status(404).json({ error: "Not found" });

    res.json({
      projectId: String(project._id),
      projectName: project.name || "Project",
      productKey,
      statusField: statusFieldForProductKey(productKey),
      statusLabel: statusLabelForProductKey(productKey),
      logs: buildValuationLogs(project, productKey),
    });
  } catch (err) {
    console.error("GET project valuations error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

router.post(
  "/revit/materials",
  forceMaterialsProductKey,
  requireEntitlementParam,
  createProject,
);

router.get(
  "/revit/materials",
  forceMaterialsProductKey,
  requireEntitlementParam,
  listProjects,
);

router.get(
  "/revit/materials/:id/valuations",
  forceMaterialsProductKey,
  requireEntitlementParam,
  getProjectValuations,
);

router.get(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  getProject,
);

router.put(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  updateProject,
);

router.delete(
  "/revit/materials/:id",
  forceMaterialsProductKey,
  requireEntitlementParam,
  deleteProject,
);

router.post(
  "/:productKey",
  mapEntitlementParam,
  requireEntitlementParam,
  createProject,
);

router.get(
  "/:productKey",
  mapEntitlementParam,
  requireEntitlementParam,
  listProjects,
);

router.get(
  "/:productKey/:id/valuations",
  mapEntitlementParam,
  requireEntitlementParam,
  getProjectValuations,
);

router.get(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  getProject,
);

router.put(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  updateProject,
);

router.delete(
  "/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  deleteProject,
);

export default router;
