import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { User } from "../models/User.js";
import { deriveItemCategory, deriveItemTrade } from "../util/boqCategory.js";
import {
  applyLearnedCategoriesToItems,
  recordCategoryFeedback,
} from "../util/learnedCategory.js";
import {
  isR2Configured,
  uploadBufferToR2,
  deleteFromR2,
} from "../utils/r2Upload.js";

// Project-model upload limit: 100 MB. Big enough for most arch / struct / MEP
// IFC files; we can raise this per-tier later via an entitlement flag.
const IFC_MAX_BYTES = 100 * 1024 * 1024;
const DISCIPLINES = new Set(["architectural", "structural", "mep"]);

const uploadModelFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IFC_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".ifc") || name.endsWith(".ifczip") || name.endsWith(".frag")) {
      return cb(null, true);
    }
    cb(new Error("Only .ifc, .ifczip or .frag files are accepted."));
  },
});

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
  if (key === "planswift-materials") return "planswift";
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
const PS_MATERIAL_PRODUCT_KEY = "planswift-materials";
const VALUATION_TIME_ZONE =
  process.env.PROJECT_VALUATION_TIMEZONE || "Africa/Lagos";

function generateSlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "project";
}

async function uniqueSlug(userId, productKey, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let counter = 0;
  const query = { userId, productKey, slug };
  if (excludeId) query._id = { $ne: excludeId };
  while (await TakeoffProject.findOne(query).select("_id").lean()) {
    counter++;
    slug = `${baseSlug}-${counter}`;
    query.slug = slug;
  }
  return slug;
}

function generatePublicToken() {
  // 8 bytes = 16 hex chars — compact but collision-safe for per-user projects
  return crypto.randomBytes(8).toString("hex");
}

function forceMaterialsProductKey(req, _res, next) {
  req.productKeyOriginal = MATERIAL_PRODUCT_KEY;
  req.params.productKey = entitlementKeyFor(MATERIAL_PRODUCT_KEY);
  next();
}

function forcePsMaterialsProductKey(req, _res, next) {
  req.productKeyOriginal = PS_MATERIAL_PRODUCT_KEY;
  req.params.productKey = entitlementKeyFor(PS_MATERIAL_PRODUCT_KEY);
  next();
}

function isMaterialsProductKey(productKey) {
  const key = normalizeProductKey(productKey);
  return key === "revit-materials" || key === "revit-material"
      || key === "planswift-materials" || key === "planswift-material";
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

function parseOptionalNumber(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function optionalNumberEquals(a, b) {
  const left = parseOptionalNumber(a);
  const right = parseOptionalNumber(b);
  return left === right;
}

const DASHBOARD_CHART_MODES = new Set(["pie", "ribbon", "line"]);
const DEFAULT_VALUATION_SETTINGS = Object.freeze({
  showDailyLog: true,
  showValuationSettings: true,
  showActualColumns: false,
  dashboardChartMode: "pie",
  retentionPct: 5,
  vatPct: 7.5,
  withholdingPct: 2.5,
});

function clampPercentage(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, num));
}

function normalizeChartMode(value, fallback = DEFAULT_VALUATION_SETTINGS.dashboardChartMode) {
  const mode = String(value || "").trim().toLowerCase();
  return DASHBOARD_CHART_MODES.has(mode) ? mode : fallback;
}

function normalizeValuationSettings(settings, current = DEFAULT_VALUATION_SETTINGS) {
  const source = settings && typeof settings === "object" ? settings : {};
  const base = current && typeof current === "object"
    ? current
    : DEFAULT_VALUATION_SETTINGS;

  return {
    showDailyLog:
      typeof source.showDailyLog === "boolean"
        ? source.showDailyLog
        : Boolean(base.showDailyLog),
    showValuationSettings:
      typeof source.showValuationSettings === "boolean"
        ? source.showValuationSettings
        : Boolean(base.showValuationSettings),
    showActualColumns:
      typeof source.showActualColumns === "boolean"
        ? source.showActualColumns
        : Boolean(base.showActualColumns),
    dashboardChartMode: normalizeChartMode(
      source.dashboardChartMode,
      normalizeChartMode(base.dashboardChartMode),
    ),
    retentionPct: clampPercentage(
      source.retentionPct,
      safeNum(base.retentionPct),
    ),
    vatPct: clampPercentage(source.vatPct, safeNum(base.vatPct)),
    withholdingPct: clampPercentage(
      source.withholdingPct,
      safeNum(base.withholdingPct),
    ),
  };
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

function sanitizeItems(items, productKey = "") {
  if (!Array.isArray(items)) return [];

  const safe = [];
  for (let i = 0; i < items.length && safe.length < MAX_ITEMS; i += 1) {
    const item = items[i] || {};

    const elementIds = Array.isArray(item.elementIds)
      ? item.elementIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];

    // The Revit plugin's quantity takeoff sends the planned rate in actualRate
    // (its DTO has no rate field). Detect this: if rate is 0/missing but
    // actualRate has a value and no actualRecordedAt exists, promote
    // actualRate → rate and clear the actual fields.
    let parsedRate = Number.isFinite(Number(item.rate)) ? Number(item.rate) : 0;
    let parsedActualRate = parseOptionalNumber(item.actualRate);
    let parsedActualRecordedAt = parseOptionalDate(item.actualRecordedAt);
    let parsedActualUpdatedAt = parseOptionalDate(item.actualUpdatedAt);

    if (parsedRate === 0 && parsedActualRate != null && parsedActualRate > 0 && !parsedActualRecordedAt) {
      parsedRate = parsedActualRate;
      parsedActualRate = null;
      parsedActualUpdatedAt = null;
    }

    const baseItem = {
      sn: Number.isFinite(Number(item.sn)) ? Number(item.sn) : i + 1,
      qty: Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0,
      unit: item.unit != null ? String(item.unit) : "",
      rate: parsedRate,
      actualQty: parseOptionalNumber(item.actualQty),
      actualRate: parsedActualRate,
      actualRecordedAt: parsedActualRecordedAt,
      actualUpdatedAt: parsedActualUpdatedAt,
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
      category: item.category != null ? String(item.category) : "",
      trade: item.trade != null ? String(item.trade) : "",
    };

    // Auto-derive category if not explicitly set by the caller, so legacy items
    // (and Revit/Plugin uploads that don't know the category) get grouped on save.
    if (!baseItem.category) {
      baseItem.category = deriveItemCategory(baseItem, productKey);
    }
    // Same for trade — user overrides persist, otherwise fall back to the
    // rule-based classifier so the Trade-format BoQ and grouping view work.
    if (!baseItem.trade) {
      baseItem.trade = deriveItemTrade(baseItem, productKey);
    }

    safe.push(baseItem);
  }

  return safe;
}

function sanitizeProvisionalSums(sums) {
  if (!Array.isArray(sums)) return [];
  const out = [];
  for (let i = 0; i < sums.length && out.length < 200; i += 1) {
    const s = sums[i] || {};
    const description = String(s.description || "").trim().slice(0, 500);
    const amount = Number.isFinite(Number(s.amount)) ? Number(s.amount) : 0;
    if (!description && amount === 0) continue;
    out.push({ description, amount });
  }
  return out;
}

// BESMM4-aligned default preliminary items. Surfaced to the client so new
// projects start with a sensible checklist instead of a blank slate.
const DEFAULT_PRELIMINARY_ITEMS = Object.freeze([
  "Setting Out",
  "Progress Photographs and Reports",
  "Foreman / Management supervision",
  "Other staff",
  "Insurances",
  "Site accommodation",
  "Office accommodation",
  "Site security",
  "Temporary fences",
  "Telephone",
  "Administration",
  "Material tests / Samples",
  "Removal of debris",
  "Water for the Works",
  "Power for the Works",
  "Notice board",
  "Temporary power/ lights",
  "Safety/ Health & Welfare",
  "Storage",
  "Small Plant/ Tools",
  "Plant Equipment/ scaffolding",
  "Additional Items (to be listed)",
]);

function sanitizePreliminaryItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length && out.length < 100; i += 1) {
    const it = items[i] || {};
    const name = String(it.name || "").trim().slice(0, 200);
    if (!name) continue;
    const allocation = clampPercentage(
      Number.isFinite(Number(it.allocation)) ? Number(it.allocation) : 0,
      0,
    );
    const completed = Boolean(it.completed);
    let completedAt = null;
    if (completed) {
      if (it.completedAt) {
        const d = new Date(it.completedAt);
        if (!Number.isNaN(d.getTime())) completedAt = d;
      }
      if (!completedAt) completedAt = new Date();
    }
    const notes = String(it.notes || "").trim().slice(0, 500);
    out.push({ name, allocation, completed, completedAt, notes });
  }
  return out;
}

function sanitizeVariations(variations) {
  if (!Array.isArray(variations)) return [];
  const out = [];
  for (let i = 0; i < variations.length && out.length < 500; i += 1) {
    const v = variations[i] || {};
    const description = String(v.description || "").trim().slice(0, 500);
    const qty = Number.isFinite(Number(v.qty)) ? Number(v.qty) : 0;
    const unit = String(v.unit || "").trim().slice(0, 40);
    const rate = Number.isFinite(Number(v.rate)) ? Number(v.rate) : 0;
    const reference = String(v.reference || "").trim().slice(0, 120);
    let issuedAt = null;
    if (v.issuedAt) {
      const d = new Date(v.issuedAt);
      if (!Number.isNaN(d.getTime())) issuedAt = d;
    }
    const source =
      v.source === "post-lock-new-item" ? "post-lock-new-item" : "manual";
    if (!description && qty === 0 && rate === 0) continue;
    out.push({ description, qty, unit, rate, reference, issuedAt, source });
  }
  return out;
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
    const previousActualQty = parseOptionalNumber(previousItem?.actualQty);
    const previousActualRate = parseOptionalNumber(previousItem?.actualRate);
    const nextActualQty = parseOptionalNumber(item?.actualQty);
    const nextActualRate = parseOptionalNumber(item?.actualRate);
    const previousActualRecordedAt = parseOptionalDate(previousItem?.actualRecordedAt);
    const previousActualUpdatedAt = parseOptionalDate(previousItem?.actualUpdatedAt);
    const previousHasActual = previousActualQty != null || previousActualRate != null;
    const nextHasActual = nextActualQty != null || nextActualRate != null;
    const actualChanged =
      !optionalNumberEquals(previousActualQty, nextActualQty) ||
      !optionalNumberEquals(previousActualRate, nextActualRate);

    const nextItem = {
      ...item,
      actualQty: nextActualQty,
      actualRate: nextActualRate,
      actualRecordedAt: nextHasActual
        ? previousHasActual && previousActualRecordedAt
          ? previousActualRecordedAt
          : now
        : null,
      actualUpdatedAt: nextHasActual
        ? actualChanged
          ? now
          : previousActualUpdatedAt || previousActualRecordedAt || now
        : null,
      purchased: Boolean(item?.purchased),
      completed: Boolean(item?.completed),
      [otherStatusField]: Boolean(item?.[otherStatusField]),
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

  // Build a Set of itemKeys that are CURRENTLY marked, so the valuation
  // only reflects the current state — not stale historical events.
  const currentlyMarked = new Set();
  const projectItems = Array.isArray(project?.items) ? project.items : [];
  for (let i = 0; i < projectItems.length; i++) {
    if (Boolean(projectItems[i]?.[statusField])) {
      currentlyMarked.add(itemIdentity(projectItems[i], i));
    }
  }

  events.sort((a, b) => {
    const ax = parseOptionalDate(a?.markedAt)?.getTime() || 0;
    const bx = parseOptionalDate(b?.markedAt)?.getTime() || 0;
    return ax - bx;
  });

  for (const event of events) {
    if (String(event?.statusField || "") !== statusField) continue;
    const day = String(event?.markedDay || isoDay(event?.markedAt) || "").trim();
    if (!day) continue;

    const eventKey = String(event?.itemKey || "");

    // Skip events for items that are NOT currently marked
    if (eventKey && !currentlyMarked.has(eventKey)) continue;

    const byItem = logsByDay.get(day) || new Map();
    const fallbackKey = `${event?.itemSn || 0}::${event?.description || ""}::${event?.materialName || ""}`;
    byItem.set(eventKey || fallbackKey, {
      itemKey: eventKey || fallbackKey,
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
    let productKey = requestedProductKey(req);

    const {
      name,
      items,
      isMaterials: bodyIsMaterials,
      clientProjectKey,
      fingerprint,
      modelFingerprint,
      mergeSameTypeLevel,
      mergeSameLine,
      checklistCompositeKeys,
      valuationSettings,
    } = req.body || {};

    // Auto-detect material projects from base product keys.
    // If the request body says isMaterials:true OR items have materialName
    // fields, upgrade the productKey to the materials variant.
    if (!isMaterialsProductKey(productKey)) {
      const hasMaterialItems =
        bodyIsMaterials ||
        (Array.isArray(items) &&
          items.length > 0 &&
          items.some((it) => String(it?.materialName || "").trim()));

      if (hasMaterialItems) {
        // e.g. "planswift" → "planswift-materials", "revit" → "revit-materials"
        productKey = productKey + "-materials";
      }
    }

    if (!name) return res.status(400).json({ error: "name required" });

    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const tracked = applyValuationTracking({
      productKey,
      previousItems: [],
      nextItems: sanitizeItems(items, productKey),
      previousEvents: [],
    });

    const trimmedName = String(name).trim();
    const baseSlug = generateSlug(trimmedName);
    const slug = await uniqueSlug(userId, productKey, baseSlug);

    const project = await TakeoffProject.create({
      userId,
      productKey,
      name: trimmedName,
      slug,
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
      valuationSettings: normalizeValuationSettings(valuationSettings),
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

    const statusField = statusFieldForProductKey(productKey);
    const markedPath = `$$item.${statusField}`;
    const lineAmountExpression = {
      $multiply: [
        {
          $convert: {
            input: "$$item.qty",
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
        {
          $convert: {
            input: "$$item.rate",
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
      ],
    };

    const list = await TakeoffProject.aggregate([
      { $match: { userId, productKey } },
      {
        $addFields: {
          safeItems: { $ifNull: ["$items", []] },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          slug: 1,
          publicShareEnabled: 1,
          updatedAt: 1,
          version: 1,
          itemCount: { $size: "$safeItems" },
          markedCount: {
            $size: {
              $filter: {
                input: "$safeItems",
                as: "item",
                cond: { $eq: [{ $ifNull: [markedPath, false] }, true] },
              },
            },
          },
          totalCost: {
            $sum: {
              $map: {
                input: "$safeItems",
                as: "item",
                in: lineAmountExpression,
              },
            },
          },
          valuedAmount: {
            $sum: {
              $map: {
                input: "$safeItems",
                as: "item",
                in: {
                  $cond: [
                    { $eq: [{ $ifNull: [markedPath, false] }, true] },
                    lineAmountExpression,
                    0,
                  ],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          remainingAmount: { $subtract: ["$totalCost", "$valuedAmount"] },
          progressPercent: {
            $cond: [
              { $gt: ["$itemCount", 0] },
              { $multiply: [{ $divide: ["$markedCount", "$itemCount"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { updatedAt: -1 } },
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

    // Lazy slug generation for existing projects without slugs
    if (!project.slug) {
      const baseSlug = generateSlug(project.name);
      project.slug = await uniqueSlug(userId, productKey, baseSlug, project._id);
      await project.save();
    }

    // Lazy seed: preliminary items default to the BESMM4 checklist with an
    // even allocation so new projects have something to tick off right away.
    if (
      !Array.isArray(project.preliminaryItems) ||
      project.preliminaryItems.length === 0
    ) {
      const n = DEFAULT_PRELIMINARY_ITEMS.length;
      const even = Number((100 / n).toFixed(2));
      project.preliminaryItems = DEFAULT_PRELIMINARY_ITEMS.map((name) => ({
        name,
        allocation: even,
        completed: false,
        completedAt: null,
        notes: "",
      }));
      await project.save();
    }

    // Lazy backfill of category for legacy items so the BoQ section can group on first open.
    let categoryDirty = false;
    if (Array.isArray(project.items)) {
      project.items.forEach((it) => {
        if (!it?.category) {
          const next = deriveItemCategory(it, productKey);
          if (next) {
            it.category = next;
            categoryDirty = true;
          }
        }
      });
      if (categoryDirty) await project.save();
    }

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
      valuationSettings,
      provisionalSums,
      variations,
      preliminaryPercent,
      preliminaryItems,
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

    if (project.finalAccount?.finalized) {
      return res.status(423).json({
        error:
          "Final account is finalized. Reopen it from the Contract tab before editing.",
      });
    }

    if (name !== undefined) project.name = String(name).trim();

    if (Array.isArray(items)) {
      // Self-learning category model — augment items missing an explicit
      // category with the user's learned mapping before sanitizing. This
      // only affects items the client didn't supply a category for.
      const itemsWithoutExplicit = new Set();
      items.forEach((it, i) => {
        if (!String(it?.category || "").trim()) itemsWithoutExplicit.add(i);
      });
      const learned = await applyLearnedCategoriesToItems({
        userId,
        productKey,
        items,
        itemsWithoutExplicitCategory: itemsWithoutExplicit,
        kind: "category",
      });
      const itemsWithLearned = items.map((it, i) =>
        learned.has(i) ? { ...it, category: learned.get(i) } : it,
      );

      // Same pass for trade — apply learned trade to items without one yet.
      const itemsWithoutExplicitTrade = new Set();
      items.forEach((it, i) => {
        if (!String(it?.trade || "").trim()) itemsWithoutExplicitTrade.add(i);
      });
      const learnedTrades = await applyLearnedCategoriesToItems({
        userId,
        productKey,
        items,
        itemsWithoutExplicitCategory: itemsWithoutExplicitTrade,
        kind: "trade",
      });
      const itemsWithBothLearned = itemsWithLearned.map((it, i) =>
        learnedTrades.has(i) ? { ...it, trade: learnedTrades.get(i) } : it,
      );

      const sanitizedNext = sanitizeItems(itemsWithBothLearned, productKey);

      // Detect explicit user category overrides (changed from previous DB state).
      // Record them as feedback so future items get the same category by default.
      const previousByKey = new Map();
      const previousTradeByKey = new Map();
      (project.items || []).forEach((it, idx) => {
        previousByKey.set(itemIdentity(it, idx), String(it?.category || ""));
        previousTradeByKey.set(itemIdentity(it, idx), String(it?.trade || ""));
      });
      const feedbackPromises = [];
      sanitizedNext.forEach((it, idx) => {
        const key = itemIdentity(it, idx);

        const prev = previousByKey.get(key);
        const next = String(it?.category || "");
        if (
          prev !== undefined &&
          prev !== next &&
          next &&
          next !== "Uncategorized" &&
          !learned.has(idx)
        ) {
          feedbackPromises.push(
            recordCategoryFeedback({
              userId,
              productKey,
              item: it,
              category: next,
              kind: "category",
            }),
          );
        }

        // Record trade overrides the same way, using the same feedback model
        // but tagged with kind: "trade".
        const prevTrade = previousTradeByKey.get(key);
        const nextTrade = String(it?.trade || "");
        if (
          prevTrade !== undefined &&
          prevTrade !== nextTrade &&
          nextTrade &&
          nextTrade !== "Other" &&
          !learnedTrades.has(idx)
        ) {
          feedbackPromises.push(
            recordCategoryFeedback({
              userId,
              productKey,
              item: it,
              category: nextTrade,
              kind: "trade",
            }),
          );
        }
      });
      if (feedbackPromises.length) {
        // Fire-and-forget: don't slow down the save on learning writes.
        Promise.allSettled(feedbackPromises);
      }

      // ── Contract-lock enforcement ────────────────────────────────
      // Once a contract is locked we don't let users edit the structural
      // fields that define the priced scope. We do allow:
      //   • rate (so unit rates can still be negotiated / sync'd)
      //   • actualQty / actualRate (to track on-site progress)
      //   • category / trade (classification-only)
      //   • completed / purchased toggles
      //   • auto-populated actualQty for items whose qty changed since lock
      //
      // If a line's qty has changed since lock we don't overwrite the
      // contract qty — instead we put the NEW qty into actualQty so the
      // variation surfaces as a re-measurement without losing the baseline.
      // Brand-new items that didn't exist at lock are rejected from the
      // measured work list and pushed onto the variations array so the
      // contract sum stays stable.
      const contract = project.contract || {};
      const extraVariations = [];
      let lockedItems = sanitizedNext;
      if (contract?.locked) {
        const baseByIdentity = new Map(
          (contract.baseItems || []).map((b) => [String(b.identity || ""), b]),
        );
        const previousByIdent = new Map();
        (project.items || []).forEach((it, idx) => {
          previousByIdent.set(itemIdentity(it, idx), it);
        });
        lockedItems = sanitizedNext.filter((it, idx) => {
          const ident = itemIdentity(it, idx);
          const base = baseByIdentity.get(ident);
          if (!base) {
            // Item didn't exist at lock — push to variations and drop from
            // measured work.
            if (safeNum(it?.qty) > 0 || safeNum(it?.rate) > 0) {
              extraVariations.push({
                description: String(it?.description || it?.takeoffLine || "New scope (post-lock)"),
                qty: safeNum(it?.qty),
                unit: String(it?.unit || ""),
                rate: safeNum(it?.rate),
                reference: "AUTO",
                issuedAt: new Date(),
                source: "post-lock-new-item",
              });
            }
            return false;
          }
          // Re-measurement: qty changed since lock → push new qty into
          // actualQty unless the user has already set one. Keep contract qty.
          const newQty = safeNum(it?.qty);
          const baseQty = safeNum(base.qty);
          if (newQty !== baseQty) {
            const userActualQty = parseOptionalNumber(it?.actualQty);
            if (userActualQty == null) {
              it.actualQty = newQty;
              it.actualUpdatedAt = new Date();
              if (!it.actualRecordedAt) it.actualRecordedAt = new Date();
            }
            // Revert qty to contract baseline so contract sum stays locked.
            it.qty = baseQty;
            it.description = base.description || it.description;
            it.unit = base.unit || it.unit;
          }
          return true;
        });
      }

      const tracked = applyValuationTracking({
        productKey,
        previousItems: Array.isArray(project.items) ? project.items : [],
        nextItems: lockedItems,
        previousEvents: Array.isArray(project.valuationEvents)
          ? project.valuationEvents
          : [],
      });
      project.items = tracked.items;
      project.valuationEvents = tracked.valuationEvents;

      if (extraVariations.length) {
        const merged = [...(project.variations || []), ...extraVariations];
        project.variations = sanitizeVariations(merged);
      }
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

    if (valuationSettings !== undefined) {
      project.valuationSettings = normalizeValuationSettings(
        valuationSettings,
        project.valuationSettings || DEFAULT_VALUATION_SETTINGS,
      );
    }

    if (Array.isArray(provisionalSums)) {
      project.provisionalSums = sanitizeProvisionalSums(provisionalSums);
    }

    if (Array.isArray(variations)) {
      project.variations = sanitizeVariations(variations);
    }

    if (Array.isArray(preliminaryItems)) {
      project.preliminaryItems = sanitizePreliminaryItems(preliminaryItems);
    }

    if (preliminaryPercent !== undefined) {
      const n = Number(preliminaryPercent);
      if (Number.isFinite(n)) {
        if (!project.contract) project.contract = {};
        project.contract.preliminaryPercent = clampPercentage(
          n,
          safeNum(project.contract?.preliminaryPercent) || 7.5,
        );
      }
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

// ── Get project by slug ──
async function getProjectBySlug(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ slug, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    res.json(project);
  } catch (err) {
    console.error("GET project by slug error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Toggle public sharing ──
async function toggleShare(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const enable = req.body?.enable !== false;
    if (enable && !project.publicToken) {
      project.publicToken = generatePublicToken();
    }
    project.publicShareEnabled = enable;
    await project.save();

    res.json({
      ok: true,
      publicShareEnabled: project.publicShareEnabled,
      publicToken: project.publicShareEnabled ? project.publicToken : null,
      slug: project.slug || null,
    });
  } catch (err) {
    console.error("POST share error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Contract lock / unlock ──
// Locking freezes the priced scope: items, qty, descriptions. Post-lock
// edits flow through the PUT handler which auto-routes new items to
// variations and re-measured items to actualQty.
async function lockContract(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const approvedAt = req.body?.approvedAt
      ? new Date(req.body.approvedAt)
      : new Date();
    const preliminaryPercent = Number.isFinite(Number(req.body?.preliminaryPercent))
      ? clampPercentage(
          Number(req.body.preliminaryPercent),
          safeNum(project.contract?.preliminaryPercent) || 7.5,
        )
      : safeNum(project.contract?.preliminaryPercent) || 7.5;
    const notes = String(req.body?.notes || "").trim().slice(0, 1000);

    // Snapshot current scope. Use itemIdentity as the stable key so later
    // edits can be matched back to the baseline.
    const baseItems = (project.items || []).map((it, idx) => ({
      identity: itemIdentity(it, idx),
      description: String(it.description || ""),
      qty: safeNum(it.qty),
      unit: String(it.unit || ""),
      rate: safeNum(it.rate),
    }));

    const measured = baseItems.reduce(
      (acc, b) => acc + safeNum(b.qty) * safeNum(b.rate),
      0,
    );
    const provisional = (project.provisionalSums || []).reduce(
      (acc, p) => acc + safeNum(p.amount),
      0,
    );
    const prelim = ((measured + provisional) * preliminaryPercent) / 100;
    const contractSum = measured + provisional + prelim;

    project.contract = {
      ...(project.contract?.toObject ? project.contract.toObject() : project.contract || {}),
      locked: true,
      lockedAt: new Date(),
      lockedBy: userId,
      approvedAt,
      preliminaryPercent,
      notes,
      baseItems,
      measuredAtLock: measured,
      provisionalAtLock: provisional,
      preliminaryAtLock: prelim,
      contractSum,
    };
    project.version += 1;
    await project.save();

    res.json({ ok: true, contract: project.contract, version: project.version });
  } catch (err) {
    console.error("POST lock error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function unlockContract(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (!project.contract) project.contract = {};
    project.contract.locked = false;
    project.contract.lockedAt = null;
    project.contract.lockedBy = null;
    // Keep baseItems and contractSum so history is preserved; re-locking
    // overwrites them cleanly.
    project.version += 1;
    await project.save();

    res.json({ ok: true, contract: project.contract, version: project.version });
  } catch (err) {
    console.error("POST unlock error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Interim Certificate helpers ──
// Roll up the current "value of work done to date" for a project:
//   • completed measured items at their valued amount
//   • approved variations at their qty × rate
//   • provisional sums at their declared amount (client-agreed releases
//     still have to be claimed explicitly via a variation if released partial)
// This is what cumulativeValue on each new cert should snap to at issue time.
function computeValueToDate(project) {
  const items = Array.isArray(project.items) ? project.items : [];
  const isMaterials = isMaterialsProductKey(project.productKey);
  const statusField = isMaterials ? "purchased" : "completed";

  let measured = 0;
  for (const it of items) {
    const marked = Boolean(it?.[statusField]);
    if (!marked) continue;
    const q = safeNum(it?.actualQty != null ? it.actualQty : it.qty);
    const r = safeNum(it?.actualRate != null ? it.actualRate : it.rate);
    measured += q * r;
  }

  const variationsAmount = (project.variations || []).reduce(
    (acc, v) => acc + safeNum(v?.qty) * safeNum(v?.rate),
    0,
  );
  const provisionalAmount = (project.provisionalSums || []).reduce(
    (acc, s) => acc + safeNum(s?.amount),
    0,
  );

  // Preliminary pool: total preliminary amount (derived from contract
  // percent on measured+provisional) and the portion already "earned" by
  // completed preliminary items.
  const preliminaryPercent = safeNum(project.contract?.preliminaryPercent);
  const measuredTotal = items.reduce(
    (acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate),
    0,
  );
  const preliminaryTotal =
    ((measuredTotal + provisionalAmount) * preliminaryPercent) / 100;
  const preliminaryItems = Array.isArray(project.preliminaryItems)
    ? project.preliminaryItems
    : [];
  const completedAllocation = preliminaryItems.reduce(
    (acc, p) => (p?.completed ? acc + safeNum(p?.allocation) : acc),
    0,
  );
  const totalAllocation = preliminaryItems.reduce(
    (acc, p) => acc + safeNum(p?.allocation),
    0,
  );
  // If allocations don't sum to 100, scale so a completed share still means
  // "its allocation as % of the allocations-in-use" times the total pool.
  const allocationBase = totalAllocation > 0 ? totalAllocation : 100;
  const preliminaryDone =
    (preliminaryTotal * completedAllocation) / allocationBase;

  const totalItems = items.length;
  const markedItems = items.filter((it) => Boolean(it?.[statusField])).length;

  return {
    cumulativeValue:
      measured + variationsAmount + provisionalAmount + preliminaryDone,
    measured,
    variationsAmount,
    provisionalAmount,
    preliminaryTotal,
    preliminaryDone,
    preliminaryOutstanding: Math.max(0, preliminaryTotal - preliminaryDone),
    totalItems,
    markedItems,
  };
}

async function issueCertificate(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (project.finalAccount?.finalized) {
      return res.status(400).json({
        error: "Final account is finalized. Reopen it before issuing new certificates.",
      });
    }

    const rollup = computeValueToDate(project);

    const previousCerts = (project.certificates || []).filter(
      (c) => c.status !== "draft" || Number.isFinite(Number(c.thisCertificate)),
    );
    const lessPrevious = previousCerts.reduce(
      (acc, c) => acc + safeNum(c.thisCertificate),
      0,
    );

    const cumulativeValue = safeNum(req.body?.cumulativeValue ?? rollup.cumulativeValue);
    const thisCertificate = Math.max(0, cumulativeValue - lessPrevious);

    // Rates default to the project's valuation settings.
    const valSettings = project.valuationSettings || {};
    const retentionPct = Number.isFinite(Number(req.body?.retentionPct))
      ? clampPercentage(Number(req.body.retentionPct), safeNum(valSettings.retentionPct) || 5)
      : safeNum(valSettings.retentionPct) || 5;
    const vatPct = Number.isFinite(Number(req.body?.vatPct))
      ? clampPercentage(Number(req.body.vatPct), safeNum(valSettings.vatPct) || 7.5)
      : safeNum(valSettings.vatPct) || 7.5;
    const whtPct = Number.isFinite(Number(req.body?.whtPct))
      ? clampPercentage(Number(req.body.whtPct), safeNum(valSettings.withholdingPct) || 2.5)
      : safeNum(valSettings.withholdingPct) || 2.5;
    const retentionReleased = safeNum(req.body?.retentionReleased);

    const retentionAmount = (thisCertificate * retentionPct) / 100;
    const netBeforeTax = thisCertificate - retentionAmount + retentionReleased;
    const vatAmount = (netBeforeTax * vatPct) / 100;
    const whtAmount = (netBeforeTax * whtPct) / 100;
    const netPayable = netBeforeTax + vatAmount - whtAmount;

    const number =
      (project.certificates || []).reduce((acc, c) => Math.max(acc, Number(c.number) || 0), 0) + 1;

    const notes = String(req.body?.notes || "").trim().slice(0, 2000);
    const certDate = req.body?.date ? new Date(req.body.date) : new Date();
    const periodStart = req.body?.periodStart ? new Date(req.body.periodStart) : null;
    const periodEnd = req.body?.periodEnd ? new Date(req.body.periodEnd) : null;
    const status =
      req.body?.status === "approved" || req.body?.status === "paid"
        ? req.body.status
        : "draft";

    const cert = {
      number,
      date: certDate,
      periodStart,
      periodEnd,
      cumulativeValue,
      lessPrevious,
      thisCertificate,
      retentionPct,
      retentionAmount,
      retentionReleased,
      vatPct,
      vatAmount,
      whtPct,
      whtAmount,
      netPayable,
      status,
      notes,
      snapshotCompletedCount: rollup.markedItems,
      snapshotTotalCount: rollup.totalItems,
    };

    project.certificates = [...(project.certificates || []), cert];
    project.version += 1;
    await project.save();

    res.json({ ok: true, certificate: cert, version: project.version });
  } catch (err) {
    console.error("POST certificate error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function updateCertificate(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const number = Number(req.params.number);
    if (!isValidObjectId(id) || !Number.isFinite(number)) {
      return res.status(400).json({ error: "Invalid id or cert number" });
    }

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const idx = (project.certificates || []).findIndex(
      (c) => Number(c.number) === number,
    );
    if (idx < 0) return res.status(404).json({ error: "Certificate not found" });

    const cert = project.certificates[idx];
    const allowed = ["status", "notes", "date", "periodStart", "periodEnd"];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        if (k === "date" || k === "periodStart" || k === "periodEnd") {
          const d = req.body[k] ? new Date(req.body[k]) : null;
          if (d == null || !Number.isNaN(d?.getTime())) cert[k] = d;
        } else if (k === "status") {
          if (["draft", "approved", "paid"].includes(req.body.status)) {
            cert.status = req.body.status;
          }
        } else {
          cert[k] = String(req.body[k]);
        }
      }
    }
    project.certificates[idx] = cert;
    project.version += 1;
    await project.save();

    res.json({ ok: true, certificate: cert, version: project.version });
  } catch (err) {
    console.error("PUT certificate error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteCertificate(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const number = Number(req.params.number);
    if (!isValidObjectId(id) || !Number.isFinite(number)) {
      return res.status(400).json({ error: "Invalid id or cert number" });
    }

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const certs = project.certificates || [];
    const idx = certs.findIndex((c) => Number(c.number) === number);
    if (idx < 0) return res.status(404).json({ error: "Certificate not found" });

    // Only the latest cert can be deleted — otherwise less-previous math breaks.
    const maxNumber = certs.reduce((acc, c) => Math.max(acc, Number(c.number) || 0), 0);
    if (number !== maxNumber) {
      return res.status(400).json({
        error: "Only the most recent certificate can be deleted to preserve cumulative math.",
      });
    }

    project.certificates = certs.filter((c) => Number(c.number) !== number);
    project.version += 1;
    await project.save();

    res.json({ ok: true, version: project.version });
  } catch (err) {
    console.error("DELETE certificate error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Final Account ──
// Finalizing snapshots the actual project settlement and freezes edits.
async function finalizeAccount(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const rollup = computeValueToDate(project);
    const provisionalFinal = (project.provisionalSums || []).reduce(
      (acc, s) => acc + safeNum(s?.amount),
      0,
    );
    const variationsFinal = (project.variations || []).reduce(
      (acc, v) => acc + safeNum(v?.qty) * safeNum(v?.rate),
      0,
    );
    const measuredWorkFinal = rollup.measured;
    // Preliminary final = the full preliminary pool (done portion already
    // certified; outstanding portion still due at closeout).
    const preliminaryFinal = rollup.preliminaryTotal;
    const retentionReleased = (project.certificates || []).reduce(
      (acc, c) => acc + safeNum(c.retentionReleased),
      0,
    );
    const totalCertifiedToDate = (project.certificates || []).reduce(
      (acc, c) => acc + safeNum(c.thisCertificate),
      0,
    );

    const finalContractValue =
      measuredWorkFinal + provisionalFinal + preliminaryFinal + variationsFinal;
    const agreedContractSum = safeNum(project.contract?.contractSum);
    const savings = agreedContractSum - finalContractValue;

    project.finalAccount = {
      finalized: true,
      finalizedAt: new Date(),
      finalizedBy: userId,
      measuredWorkFinal,
      provisionalFinal,
      preliminaryFinal,
      variationsFinal,
      retentionReleased,
      totalCertifiedToDate,
      agreedContractSum,
      finalContractValue,
      savings,
      notes: String(req.body?.notes || "").trim().slice(0, 2000),
    };
    project.version += 1;
    await project.save();

    res.json({ ok: true, finalAccount: project.finalAccount, version: project.version });
  } catch (err) {
    console.error("POST finalize error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// Streaming helper for xlsx downloads.
function sendXlsx(res, { buffer, filename }) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).end(buffer);
}

async function exportCertificateXlsx(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const number = Number(req.params.number);
    if (!isValidObjectId(id) || !Number.isFinite(number)) {
      return res.status(400).json({ error: "Invalid id or cert number" });
    }
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const certs = project.certificates || [];
    const cert = certs.find((c) => Number(c.number) === number);
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    const previous = certs.filter((c) => Number(c.number) < number);
    const { exportCertificate } = await import("../util/certificateExporter.js");

    // Rebuild the value-to-date breakdown so the cert workbook can show it.
    const rollup = computeValueToDate(project);

    const out = await exportCertificate({
      projectName: project.name || "Project",
      certificate: cert.toObject ? cert.toObject() : cert,
      previousCerts: previous.map((c) => (c.toObject ? c.toObject() : c)),
      breakdown: {
        measured: rollup.measured,
        variations: rollup.variationsAmount,
        provisional: rollup.provisionalAmount,
        preliminaryDone: rollup.preliminaryDone,
      },
    });
    return sendXlsx(res, out);
  } catch (err) {
    console.error("GET certificate xlsx error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function exportFinalAccountXlsx(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (!project.finalAccount?.finalized) {
      return res
        .status(400)
        .json({ error: "Finalize the account first before exporting." });
    }

    const { exportFinalAccount } = await import("../util/certificateExporter.js");
    const out = await exportFinalAccount({
      projectName: project.name || "Project",
      finalAccount: project.finalAccount.toObject
        ? project.finalAccount.toObject()
        : project.finalAccount,
      certificates: (project.certificates || []).map((c) =>
        c.toObject ? c.toObject() : c,
      ),
    });
    return sendXlsx(res, out);
  } catch (err) {
    console.error("GET final account xlsx error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── IFC / BIM model upload (Cloudflare R2) ──
async function uploadProjectModel(req, res) {
  try {
    if (!isR2Configured()) {
      return res.status(503).json({ error: "R2 storage is not configured on this server." });
    }
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const discipline = String(req.params.discipline || "").toLowerCase();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!DISCIPLINES.has(discipline)) {
      return res.status(400).json({
        error: "discipline must be one of: architectural, structural, mep",
      });
    }

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Delete any existing model in this discipline — one per slot.
    const existing = project.models?.[discipline];
    if (existing?.key) {
      try {
        await deleteFromR2(existing.key);
      } catch (e) {
        console.warn("R2 delete failed (continuing):", e?.message || e);
      }
    }

    const safeOriginal = String(file.originalname || "model.ifc").replace(/[^\w.\-]/g, "_");
    const key = `projects/${id}/models/${discipline}/${Date.now()}-${safeOriginal}`;
    const lowerName = safeOriginal.toLowerCase();
    const format = lowerName.endsWith(".frag") ? "fragments" : "ifc";

    const uploaded = await uploadBufferToR2(file.buffer, {
      key,
      contentType:
        format === "fragments"
          ? "application/octet-stream"
          : "application/x-step", // IFC is STEP-format plain text
      cacheControl: "public, max-age=86400",
    });

    const modelEntry = {
      sourceFile: safeOriginal,
      key: uploaded.public_id,
      url: uploaded.secure_url,
      sizeBytes: file.buffer.length,
      format,
      uploadedAt: new Date(),
      uploadedBy: userId,
    };

    if (!project.models) project.models = {};
    project.models[discipline] = modelEntry;
    project.markModified(`models.${discipline}`);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      discipline,
      model: modelEntry,
      version: project.version,
    });
  } catch (err) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: `File too large. Maximum upload is ${Math.round(IFC_MAX_BYTES / 1024 / 1024)} MB.`,
      });
    }
    console.error("POST model upload error:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
}

async function deleteProjectModel(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const discipline = String(req.params.discipline || "").toLowerCase();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!DISCIPLINES.has(discipline)) {
      return res.status(400).json({ error: "Invalid discipline" });
    }

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    const existing = project.models?.[discipline];
    if (existing?.key) {
      try {
        await deleteFromR2(existing.key);
      } catch (e) {
        console.warn("R2 delete failed:", e?.message || e);
      }
    }

    if (!project.models) project.models = {};
    project.models[discipline] = {};
    project.markModified(`models.${discipline}`);
    project.version += 1;
    await project.save();

    res.json({ ok: true, version: project.version });
  } catch (err) {
    console.error("DELETE model error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function reopenFinalAccount(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
    if (!project) return res.status(404).json({ error: "Not found" });

    if (!project.finalAccount) project.finalAccount = {};
    project.finalAccount.finalized = false;
    project.finalAccount.finalizedAt = null;
    project.version += 1;
    await project.save();

    res.json({ ok: true, finalAccount: project.finalAccount, version: project.version });
  } catch (err) {
    console.error("POST reopen error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Public dashboard (NO AUTH) ──
async function getPublicDashboard(req, res) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const project = await TakeoffProject.findOne({
      publicToken: token,
      publicShareEnabled: true,
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    // Look up the project owner's display name
    let sharedBy = "";
    if (project.userId) {
      const owner = await User.findById(project.userId).select("username firstName lastName").lean();
      if (owner) {
        const full = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
        sharedBy = full || owner.username || "";
      }
    }

    const items = project.items || [];
    const isMaterials = isMaterialsProductKey(project.productKey);
    const statusField = isMaterials ? "purchased" : "completed";

    const progressTotal = items.length;
    let progressCount = 0;
    let grossAmount = 0;
    let valuedAmount = 0;
    let actualTrackedAmount = 0;
    let actualTrackedCount = 0;

    // Forecast-next-spend: top N unfinished priced items (biggest tickets
    // first). Gives the client a realistic view of what's coming up.
    const upcomingCandidates = [];

    const comparisonRows = [];

    for (const it of items) {
      const qty = Number(it.qty || 0);
      const rate = Number(it.rate || 0);
      const amount = qty * rate;
      grossAmount += amount;

      const marked = Boolean(it[statusField]);
      if (marked) {
        progressCount++;
        valuedAmount += amount;
      } else if (amount > 0) {
        upcomingCandidates.push({
          description: it.description || "",
          unit: it.unit || "",
          qty,
          rate,
          amount,
        });
      }

      const aQty = it.actualQty != null ? Number(it.actualQty) : null;
      const aRate = it.actualRate != null ? Number(it.actualRate) : null;
      const hasActual = aQty != null || aRate != null;

      if (hasActual) {
        const effectiveQty = aQty != null ? aQty : qty;
        const effectiveRate = aRate != null ? aRate : rate;
        const actualAmount = effectiveQty * effectiveRate;
        actualTrackedAmount += actualAmount;
        actualTrackedCount++;

        comparisonRows.push({
          description: it.description || "",
          unit: it.unit || "",
          plannedAmount: amount,
          actualAmount,
          variance: actualAmount - amount,
        });
      }
    }

    const progressPercent = progressTotal > 0 ? (progressCount / progressTotal) * 100 : 0;

    // Contract, provisional, variations, preliminary — these together form
    // the total planned contract sum the client is working against.
    const contract = project.contract?.toObject
      ? project.contract.toObject()
      : project.contract || {};
    const provisionalTotal = (project.provisionalSums || []).reduce(
      (acc, p) => acc + (Number(p?.amount) || 0),
      0,
    );
    const variationsTotal = (project.variations || []).reduce(
      (acc, v) =>
        acc + (Number(v?.qty) || 0) * (Number(v?.rate) || 0),
      0,
    );
    const preliminaryPercent = Number(contract?.preliminaryPercent || 0);
    // If we have a locked contract we use the baked-in figures so the
    // contract sum the client sees matches what was signed, not whatever
    // the live totals say today. Otherwise compute on the fly.
    const measuredForContract = contract?.locked
      ? Number(contract.measuredAtLock || 0)
      : grossAmount;
    const provisionalForContract = contract?.locked
      ? Number(contract.provisionalAtLock || 0)
      : provisionalTotal;
    const preliminaryForContract = contract?.locked
      ? Number(contract.preliminaryAtLock || 0)
      : ((measuredForContract + provisionalForContract) * preliminaryPercent) / 100;
    const contractSum = contract?.locked
      ? Number(contract.contractSum || 0)
      : measuredForContract + provisionalForContract + preliminaryForContract;

    // Preliminary progress — how much of the preliminary pool has been earned.
    const preliminaryItems = Array.isArray(project.preliminaryItems)
      ? project.preliminaryItems
      : [];
    const prelimTotalAlloc = preliminaryItems.reduce(
      (acc, p) => acc + Number(p?.allocation || 0),
      0,
    );
    const prelimCompletedAlloc = preliminaryItems.reduce(
      (acc, p) => (p?.completed ? acc + Number(p?.allocation || 0) : acc),
      0,
    );
    const prelimBase = prelimTotalAlloc > 0 ? prelimTotalAlloc : 100;
    const preliminaryDone =
      (preliminaryForContract * prelimCompletedAlloc) / prelimBase;
    const preliminaryOutstanding = Math.max(
      0,
      preliminaryForContract - preliminaryDone,
    );
    const preliminaryCompletedCount = preliminaryItems.filter(
      (p) => p?.completed,
    ).length;

    const remainingAmount = grossAmount - valuedAmount;

    // Actual project cost = completed work + actual variance on tracked items + variations + provisional
    // For the purposes of the public dashboard we keep the simpler: valued + variations + provisional.
    const actualProjectCost = valuedAmount + variationsTotal + provisionalTotal;
    const actualVarianceAmount = actualTrackedAmount - grossAmount;
    const actualVariancePercent = grossAmount > 0
      ? ((actualTrackedAmount - grossAmount) / grossAmount) * 100
      : 0;

    // On-track status — compares cost progress (% of contract committed) to
    // physical progress (% of lines completed). If cost is running ahead of
    // physical work, the project is overspending.
    const costPercent = contractSum > 0
      ? ((valuedAmount + variationsTotal) / contractSum) * 100
      : 0;
    const delta = costPercent - progressPercent;
    let status;
    if (progressPercent < 1) status = "starting";
    else if (delta <= 5) status = "on-track";
    else if (delta <= 15) status = "watch";
    else status = "over-budget";

    // Top upcoming items (biggest value first) — represents likely next spend.
    upcomingCandidates.sort((a, b) => b.amount - a.amount);
    const upcoming = upcomingCandidates.slice(0, 5);
    const upcomingTotal = upcoming.reduce((acc, r) => acc + r.amount, 0);

    // ── EVM (Earned Value Management) metrics ─────────────────────
    // BAC = Budget at Completion (locked contract sum; falls back to live
    // total when unlocked)
    // BCWP / EV = earned value = what completed work is worth at plan rates
    //   → we use valuedAmount (completed × plan rate)
    // ACWP / AC = actual cost of work performed
    //   → valuedAmount adjusted by the actual-variance on tracked items
    // CPI = BCWP / ACWP; EAC = BAC / CPI; VAC = BAC - EAC
    const BAC =
      contractSum > 0
        ? contractSum
        : grossAmount + provisionalTotal + preliminaryForContract + variationsTotal;
    // Earned value = completed measured work + preliminary portion earned by
    // ticking off prelim items. Variations and provisional release are
    // additive but treated separately (variations flow into claims directly).
    const BCWP = valuedAmount + preliminaryDone;
    // Portion of actual cost on the items we *have* progress on. If no actual
    // data is tracked, assume ACWP == BCWP (no known variance).
    const ACWP =
      actualTrackedCount > 0
        ? BCWP + actualVarianceAmount
        : BCWP;
    const CPI = ACWP > 0 ? BCWP / ACWP : 1;
    const EAC = CPI > 0 ? BAC / CPI : BAC;
    const VAC = BAC - EAC;

    // Certificate summary
    const certs = Array.isArray(project.certificates) ? project.certificates : [];
    const totalCertified = certs.reduce(
      (acc, c) => acc + Number(c?.thisCertificate || 0),
      0,
    );
    const totalRetained = certs.reduce(
      (acc, c) => acc + Number(c?.retentionAmount || 0) - Number(c?.retentionReleased || 0),
      0,
    );
    const lastCert = certs.length
      ? certs.reduce((a, b) =>
          Number(a.number || 0) > Number(b.number || 0) ? a : b,
        )
      : null;

    // Public summary of attached models (URLs are already public-read)
    const models = project.models || {};
    const publicModels = {
      architectural: models.architectural?.url
        ? {
            url: models.architectural.url,
            sourceFile: models.architectural.sourceFile,
            sizeBytes: models.architectural.sizeBytes,
            format: models.architectural.format,
          }
        : null,
      structural: models.structural?.url
        ? {
            url: models.structural.url,
            sourceFile: models.structural.sourceFile,
            sizeBytes: models.structural.sizeBytes,
            format: models.structural.format,
          }
        : null,
      mep: models.mep?.url
        ? {
            url: models.mep.url,
            sourceFile: models.mep.sourceFile,
            sizeBytes: models.mep.sizeBytes,
            format: models.mep.format,
          }
        : null,
    };

    // Final account state — just enough for the client to show the "Closed" badge.
    const finalAccount = project.finalAccount?.finalized
      ? {
          finalized: true,
          finalizedAt: project.finalAccount.finalizedAt,
          finalContractValue: project.finalAccount.finalContractValue,
          savings: project.finalAccount.savings,
        }
      : { finalized: false };

    res.json({
      ok: true,
      name: project.name,
      sharedBy,
      productKey: project.productKey,
      statusLabel: isMaterials ? "Purchased" : "Completed",
      progressTotal,
      progressCount,
      progressPercent: Math.round(progressPercent * 10) / 10,
      grossAmount,
      valuedAmount,
      remainingAmount,
      actualTrackedAmount,
      actualTrackedCount,
      actualProjectCost,
      actualVarianceAmount,
      actualVariancePercent: Math.round(actualVariancePercent * 10) / 10,
      comparisonRows,
      // Contract view
      contractLocked: Boolean(contract?.locked),
      contractLockedAt: contract?.lockedAt || null,
      contractApprovedAt: contract?.approvedAt || null,
      contractSum,
      preliminaryPercent,
      preliminaryAmount: preliminaryForContract,
      preliminaryDone,
      preliminaryOutstanding,
      preliminaryCompletedCount,
      preliminaryItemsCount: preliminaryItems.length,
      provisionalTotal,
      variationsTotal,
      costPercent: Math.round(costPercent * 10) / 10,
      costVsProgressDelta: Math.round(delta * 10) / 10,
      status, // "starting" | "on-track" | "watch" | "over-budget"
      upcoming,
      upcomingTotal,
      // EVM
      evm: {
        BAC: Math.round(BAC * 100) / 100,
        BCWP: Math.round(BCWP * 100) / 100,
        ACWP: Math.round(ACWP * 100) / 100,
        CPI: Math.round(CPI * 1000) / 1000,
        EAC: Math.round(EAC * 100) / 100,
        VAC: Math.round(VAC * 100) / 100,
      },
      // Certificate rollup
      certificates: {
        total: certs.length,
        totalCertified,
        totalRetained,
        latestNumber: lastCert ? Number(lastCert.number) : 0,
        latestDate: lastCert?.date || null,
      },
      finalAccount,
      models: publicModels,
      updatedAt: project.updatedAt,
    });
  } catch (err) {
    console.error("GET public dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── PUBLIC route (no auth) — must be before requireAuth ──
// This is exported separately and mounted in index.js
export { getPublicDashboard };

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

/* ── PlanSwift Materials routes ── */
router.post(
  "/planswift/materials",
  forcePsMaterialsProductKey,
  requireEntitlementParam,
  createProject,
);

router.get(
  "/planswift/materials",
  forcePsMaterialsProductKey,
  requireEntitlementParam,
  listProjects,
);

router.get(
  "/planswift/materials/:id/valuations",
  forcePsMaterialsProductKey,
  requireEntitlementParam,
  getProjectValuations,
);

router.get(
  "/planswift/materials/:id",
  forcePsMaterialsProductKey,
  requireEntitlementParam,
  getProject,
);

router.put(
  "/planswift/materials/:id",
  forcePsMaterialsProductKey,
  requireEntitlementParam,
  updateProject,
);

router.delete(
  "/planswift/materials/:id",
  forcePsMaterialsProductKey,
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
  "/:productKey/by-slug/:slug",
  mapEntitlementParam,
  requireEntitlementParam,
  getProjectBySlug,
);

router.post(
  "/:productKey/:id/share",
  mapEntitlementParam,
  requireEntitlementParam,
  toggleShare,
);

router.post(
  "/:productKey/:id/contract/lock",
  mapEntitlementParam,
  requireEntitlementParam,
  lockContract,
);

router.post(
  "/:productKey/:id/contract/unlock",
  mapEntitlementParam,
  requireEntitlementParam,
  unlockContract,
);

router.post(
  "/:productKey/:id/certificates",
  mapEntitlementParam,
  requireEntitlementParam,
  issueCertificate,
);

router.put(
  "/:productKey/:id/certificates/:number",
  mapEntitlementParam,
  requireEntitlementParam,
  updateCertificate,
);

router.delete(
  "/:productKey/:id/certificates/:number",
  mapEntitlementParam,
  requireEntitlementParam,
  deleteCertificate,
);

router.post(
  "/:productKey/:id/final-account/finalize",
  mapEntitlementParam,
  requireEntitlementParam,
  finalizeAccount,
);

router.post(
  "/:productKey/:id/final-account/reopen",
  mapEntitlementParam,
  requireEntitlementParam,
  reopenFinalAccount,
);

router.get(
  "/:productKey/:id/certificates/:number/export",
  mapEntitlementParam,
  requireEntitlementParam,
  exportCertificateXlsx,
);

router.get(
  "/:productKey/:id/final-account/export",
  mapEntitlementParam,
  requireEntitlementParam,
  exportFinalAccountXlsx,
);

router.post(
  "/:productKey/:id/models/:discipline",
  mapEntitlementParam,
  requireEntitlementParam,
  uploadModelFile.single("file"),
  uploadProjectModel,
);

router.delete(
  "/:productKey/:id/models/:discipline",
  mapEntitlementParam,
  requireEntitlementParam,
  deleteProjectModel,
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



