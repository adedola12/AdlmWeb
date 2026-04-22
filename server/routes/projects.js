import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { User } from "../models/User.js";
import { deriveItemCategory, deriveItemTrade } from "../util/boqCategory.js";
import {
  applyLearnedCategoriesToItems,
  recordCategoryFeedback,
} from "../util/learnedCategory.js";

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
      provisionalTotal,
      variationsTotal,
      costPercent: Math.round(costPercent * 10) / 10,
      costVsProgressDelta: Math.round(delta * 10) / 10,
      status, // "starting" | "on-track" | "watch" | "over-budget"
      upcoming,
      upcomingTotal,
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



