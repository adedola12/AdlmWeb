import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import multer from "multer";
import bcrypt from "bcryptjs";

// Helper: a contract lock PIN must be exactly 4 digits (0000-9999). We
// normalize whatever the client sends — trims whitespace, accepts numbers
// or strings, rejects anything that's not 4 ASCII digits. Returns the
// normalized string or null if invalid.
function normalizeLockPin(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return /^\d{4}$/.test(str) ? str : null;
}

// Strip server-secret fields before serialising a project to the client.
// Today: the contract lock PIN hash. Returns a plain object — safe to
// JSON.stringify.
function projectForClient(project) {
  if (!project) return project;
  const obj = project?.toObject ? project.toObject() : { ...project };
  if (obj?.contract && obj.contract.lockPinHash !== undefined) {
    // Don't leak the hash; replace with a boolean flag the UI can use to
    // decide whether to prompt for a PIN on unlock.
    obj.contract = { ...obj.contract };
    obj.contract.hasLockPin = Boolean(obj.contract.lockPinHash);
    delete obj.contract.lockPinHash;
  }
  return obj;
}
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { User } from "../models/User.js";
import { deriveItemCategory, deriveItemTrade } from "../util/boqCategory.js";
import {
  applyLearnedCategoriesToItems,
  recordCategoryFeedback,
} from "../util/learnedCategory.js";
import { computeProjectMargin } from "../util/profitMargin.js";
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

// The unified save endpoint (§6) persists a Revit takeoff + its derived
// materials in one call. Entitlement is checked against the base "revit"
// product since that is what gates both halves.
function forceRevitFullProductKey(req, _res, next) {
  req.productKeyOriginal = "revit";
  req.params.productKey = entitlementKeyFor("revit");
  next();
}

function isMaterialsProductKey(productKey) {
  const key = normalizeProductKey(productKey);
  return key === "revit-materials" || key === "revit-material"
      || key === "planswift-materials" || key === "planswift-material";
}

// Map a takeoff product key to its sibling derived-materials product key, so a
// takeoff project can find the materials saved alongside it (linked by
// clientProjectKey + modelFingerprint). Returns null for keys with no sibling.
function materialsProductKeyFor(productKey) {
  const key = normalizeProductKey(productKey);
  if (key === "revit") return MATERIAL_PRODUCT_KEY;
  if (key === "planswift") return PS_MATERIAL_PRODUCT_KEY;
  return null;
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

    // Partial-completion percentage: clamp 0-100 and back-fill from the
    // legacy completed/purchased flag so existing projects open at 100%
    // for items already ticked off.
    let parsedPercent = Number.isFinite(Number(item.percentComplete))
      ? Math.max(0, Math.min(100, Number(item.percentComplete)))
      : 0;
    const wasBinaryDone = Boolean(item.completed) || Boolean(item.purchased);
    if (wasBinaryDone && parsedPercent < 100) parsedPercent = 100;

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
      percentComplete: parsedPercent,
      percentCompleteUpdatedAt: parseOptionalDate(item.percentCompleteUpdatedAt),
      description: item.description != null ? String(item.description) : "",
      takeoffLine: item.takeoffLine != null ? String(item.takeoffLine) : "",
      materialName: item.materialName != null ? String(item.materialName) : "",
      elementIds,
      level: item.level != null ? String(item.level) : "",
      type: item.type != null ? String(item.type) : "",
      code: item.code != null ? String(item.code) : "",
      category: item.category != null ? String(item.category) : "",
      trade: item.trade != null ? String(item.trade) : "",

      // ── Takeoff → Materials linkage + margin inputs (QUIV upgrade) ──
      // Persist and echo these so derived material/labour lines stay linked
      // to their parent takeoff line and the BoQ can compute proposed-vs-actual
      // margin. parseOptionalNumber keeps them null when absent, so takeoff
      // lines (which don't send them) are unaffected.
      sourceTakeoffCode:
        item.sourceTakeoffCode != null ? String(item.sourceTakeoffCode) : "",
      componentKind: item.componentKind != null ? String(item.componentKind) : "",
      derived: Boolean(item.derived),
      netUnitCost: parseOptionalNumber(item.netUnitCost),
      overheadPercent: parseOptionalNumber(item.overheadPercent),
      profitPercent: parseOptionalNumber(item.profitPercent),
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
    const completed = Boolean(s.completed);
    let completedAt = null;
    if (completed) {
      if (s.completedAt) {
        const d = new Date(s.completedAt);
        if (!Number.isNaN(d.getTime())) completedAt = d;
      }
      if (!completedAt) completedAt = new Date();
    }
    out.push({ description, amount, completed, completedAt });
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
    // actualAmount — QS-recorded spend on this prelim item. Coerce to
    // non-negative number; missing field becomes 0.
    const actualAmount = Number.isFinite(Number(it.actualAmount))
      ? Math.max(0, Number(it.actualAmount))
      : 0;
    out.push({ name, allocation, completed, completedAt, notes, actualAmount });
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
    const completed = Boolean(v.completed);
    let completedAt = null;
    if (completed) {
      if (v.completedAt) {
        const d = new Date(v.completedAt);
        if (!Number.isNaN(d.getTime())) completedAt = d;
      }
      if (!completedAt) completedAt = new Date();
    }
    if (!description && qty === 0 && rate === 0) continue;
    out.push({
      description, qty, unit, rate, reference, issuedAt, source,
      completed, completedAt,
    });
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

    // Partial-completion: keep the percentage from the incoming payload but
    // enforce the invariant "binary status === 100%". When the user flips
    // the checkbox on, lift percentComplete to 100. When they flip it off,
    // drop percentComplete to 0 unless the payload explicitly overrides.
    const previousPct = Math.max(
      0,
      Math.min(100, Number(previousItem?.percentComplete) || 0),
    );
    const rawNextPct = Math.max(
      0,
      Math.min(100, Number(item?.percentComplete) || 0),
    );
    let nextPct = rawNextPct;
    if (nextStatus) nextPct = 100;
    else if (previousStatus && !nextStatus && rawNextPct === previousPct) {
      // Status toggled off without an explicit percent override → reset.
      nextPct = 0;
    }
    const previousPctAt = parseOptionalDate(previousItem?.percentCompleteUpdatedAt);

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
      percentComplete: nextPct,
      percentCompleteUpdatedAt:
        nextPct !== previousPct ? now : previousPctAt,
      [otherStatusField]: Boolean(item?.[otherStatusField]),
      [otherStatusDateField]: previousOtherAt,
      [statusDateField]: nextStatus
        ? previousStatus && previousStatusAt
          ? previousStatusAt
          : now
        : null,
      statusUpdatedAt: previousStatus !== nextStatus ? now : previousUpdatedAt,
    };

    // Emit a valuation event whenever the line's "earned" position changes
    // — either a binary status flip OR a percent-complete movement. The
    // event captures the SIGNED value delta so summing positive amounts
    // gives a daily "value of work done" rollup.
    const previousFactor = previousStatus ? 1 : previousPct / 100;
    const nextFactor = nextStatus ? 1 : nextPct / 100;
    const factorDelta = nextFactor - previousFactor;
    // Guard against floating-point noise where pct didn't actually change.
    const PCT_EPSILON = 0.001;
    const pctChanged = Math.abs(nextPct - previousPct) > PCT_EPSILON;
    const statusChanged = previousStatus !== nextStatus;

    if (pctChanged || statusChanged) {
      const lineAmount = safeNum(item?.qty) * safeNum(item?.rate);
      // For pure binary flips with no percent change recorded, fall back to
      // the historical behaviour (amount = full line value when ratified,
      // signed negative when un-ratified) so old reports stay readable.
      const isPureBinary =
        statusChanged && !pctChanged && previousPct === 0 && nextPct === 0;
      const deltaAmount = isPureBinary
        ? lineAmount * (nextStatus ? 1 : -1)
        : lineAmount * factorDelta;

      valuationEvents.push({
        itemKey: key,
        itemSn: safeNum(item?.sn) || index + 1,
        description: String(item?.description || ""),
        takeoffLine: String(item?.takeoffLine || ""),
        materialName: String(item?.materialName || ""),
        qty: safeNum(item?.qty),
        unit: String(item?.unit || ""),
        rate: safeNum(item?.rate),
        amount: deltaAmount,
        statusField,
        markedValue: nextStatus || nextFactor > previousFactor,
        previousPercent: previousPct,
        nextPercent: nextPct,
        eventType: pctChanged && !isPureBinary ? "partial" : "binary",
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

  // Build maps of CURRENT item state so we can filter out stale events for
  // lines that have since been reverted. Binary events show only if the
  // item is still ratified; partial events show if the item has any
  // progress (percentComplete > 0 OR ratified). This avoids old "30 → 50%"
  // entries lingering after the user has zeroed the line.
  const currentlyMarked = new Set();
  const currentlyInProgress = new Set();
  const projectItems = Array.isArray(project?.items) ? project.items : [];
  for (let i = 0; i < projectItems.length; i++) {
    const ident = itemIdentity(projectItems[i], i);
    const ratified = Boolean(projectItems[i]?.[statusField]);
    const pct = safeNum(projectItems[i]?.percentComplete);
    if (ratified) currentlyMarked.add(ident);
    if (ratified || pct > 0) currentlyInProgress.add(ident);
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
    const eventType = event?.eventType === "partial" ? "partial" : "binary";

    // Staleness filter — different rule per event type:
    //   • binary: drop unless the item is still ratified
    //   • partial: drop unless the item still has progress (any %)
    if (eventKey) {
      if (eventType === "binary" && !currentlyMarked.has(eventKey)) continue;
      if (eventType === "partial" && !currentlyInProgress.has(eventKey)) continue;
    }

    const byItem = logsByDay.get(day) || new Map();
    const fallbackKey = `${event?.itemSn || 0}::${event?.description || ""}::${event?.materialName || ""}`;
    const key = eventKey || fallbackKey;
    const eventAmount = safeNum(event?.amount);
    const eventPrevPct = safeNum(event?.previousPercent);
    const eventNextPct = safeNum(event?.nextPercent);
    const eventMarked = Boolean(event?.markedValue);
    const eventMarkedAtIso =
      parseOptionalDate(event?.markedAt)?.toISOString() || null;

    const existing = byItem.get(key);
    if (existing) {
      // Multiple updates to the same line in one day: aggregate the value
      // delta and span the full % range across the day.
      existing.amount += eventAmount;
      existing.previousPercent = Math.min(existing.previousPercent, eventPrevPct);
      existing.nextPercent = Math.max(existing.nextPercent, eventNextPct);
      // Latest-event-wins for the markedAt timestamp; if any event in the
      // day ratified the item, the row's eventType escalates to 'binary'
      // so the UI shows the ratified badge.
      existing.markedAt = eventMarkedAtIso;
      existing.markedValue = existing.markedValue || eventMarked;
      if (eventType === "binary" || eventMarked || eventNextPct >= 100) {
        existing.eventType = "binary";
      }
    } else {
      // First time this item appears in this day's log. Escalate the
      // display type to "binary" when the move lands at 100% (ratified)
      // so the UI shows a single 'Completed' badge instead of "0 → 100%".
      const displayType =
        eventType === "binary" || eventMarked || eventNextPct >= 100
          ? "binary"
          : "partial";
      byItem.set(key, {
        itemKey: key,
        sn: safeNum(event?.itemSn),
        description: displayItemDescription(event, productKey),
        qty: safeNum(event?.qty),
        unit: String(event?.unit || ""),
        rate: safeNum(event?.rate),
        amount: eventAmount,
        previousPercent: eventPrevPct,
        nextPercent: eventNextPct,
        eventType: displayType,
        markedValue: eventMarked,
        markedAt: eventMarkedAtIso,
      });
    }
    logsByDay.set(day, byItem);
  }

  // ── Synthesise non-measured valuation entries ────────────────────
  //
  // Preliminary items, PC sums, and variations don't currently emit
  // ValuationEvent records when ticked complete (the events table only
  // captures measured-item changes via applyValuationTracking). That
  // meant the Daily valuation log was blind to prelim / PC / variation
  // completions — the QS would mark "Setting Out" done on the prelim
  // checklist but see "no valuation entries" on the cert tab.
  //
  // We synthesise virtual entries here using each row's completedAt
  // date as the valuation day. This is read-only (no rows added to
  // the events collection) so the log automatically reflects the
  // current state of the flags — uncheck a prelim and it disappears
  // from the log on next refresh.

  // Preliminary done items — pro-rate the pool by allocation.
  const prelimItems = Array.isArray(project?.preliminaryItems)
    ? project.preliminaryItems
    : [];
  const prelimTotalAlloc = prelimItems.reduce(
    (acc, p) => acc + safeNum(p?.allocation),
    0,
  );
  const prelimAllocBase = prelimTotalAlloc > 0 ? prelimTotalAlloc : 100;
  const measuredTotalForPool = (Array.isArray(project?.items) ? project.items : [])
    .reduce((acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate), 0);
  const provTotalForPool = (Array.isArray(project?.provisionalSums) ? project.provisionalSums : [])
    .reduce((acc, s) => acc + safeNum(s?.amount), 0);
  const prelimPool =
    ((measuredTotalForPool + provTotalForPool) *
      safeNum(project?.contract?.preliminaryPercent)) /
    100;

  for (let i = 0; i < prelimItems.length; i += 1) {
    const p = prelimItems[i];
    if (!p?.completed) continue;
    const completedAt = parseOptionalDate(p?.completedAt) || new Date();
    const day = isoDay(completedAt);
    if (!day) continue;
    const amount =
      (prelimPool * safeNum(p?.allocation)) / prelimAllocBase;
    if (amount <= 0) continue;
    const byItem = logsByDay.get(day) || new Map();
    byItem.set(`prelim::${i}`, {
      itemKey: `prelim::${i}`,
      sn: i + 1,
      description: `Preliminary — ${p?.name || `item #${i + 1}`}`,
      kind: "preliminary",
      qty: safeNum(p?.allocation),
      unit: "%",
      rate: prelimAllocBase > 0 ? prelimPool / prelimAllocBase : 0,
      amount,
      previousPercent: 0,
      nextPercent: 100,
      eventType: "binary",
      markedValue: true,
      markedAt: completedAt.toISOString(),
    });
    logsByDay.set(day, byItem);
  }

  // PC sums — declared amount counts as earned when completed=true.
  const provSums = Array.isArray(project?.provisionalSums)
    ? project.provisionalSums
    : [];
  for (let i = 0; i < provSums.length; i += 1) {
    const s = provSums[i];
    if (!s?.completed) continue;
    const amount = safeNum(s?.amount);
    if (amount <= 0) continue;
    const completedAt = parseOptionalDate(s?.completedAt) || new Date();
    const day = isoDay(completedAt);
    if (!day) continue;
    const byItem = logsByDay.get(day) || new Map();
    byItem.set(`pc::${i}`, {
      itemKey: `pc::${i}`,
      sn: i + 1,
      description: `PC sum — ${s?.description || `item #${i + 1}`}`,
      kind: "provisional",
      qty: 1,
      unit: "sum",
      rate: amount,
      amount,
      previousPercent: 0,
      nextPercent: 100,
      eventType: "binary",
      markedValue: true,
      markedAt: completedAt.toISOString(),
    });
    logsByDay.set(day, byItem);
  }

  // Variations — qty × rate counts as earned when completed=true.
  const projectVariations = Array.isArray(project?.variations)
    ? project.variations
    : [];
  for (let i = 0; i < projectVariations.length; i += 1) {
    const v = projectVariations[i];
    if (!v?.completed) continue;
    const amount = safeNum(v?.qty) * safeNum(v?.rate);
    if (amount <= 0) continue;
    // Use completedAt if present, else fall back to issuedAt, else today.
    const completedAt =
      parseOptionalDate(v?.completedAt) ||
      parseOptionalDate(v?.issuedAt) ||
      new Date();
    const day = isoDay(completedAt);
    if (!day) continue;
    const byItem = logsByDay.get(day) || new Map();
    byItem.set(`var::${i}`, {
      itemKey: `var::${i}`,
      sn: i + 1,
      description: `Variation — ${v?.description || `item #${i + 1}`}`,
      kind: "variation",
      qty: safeNum(v?.qty),
      unit: String(v?.unit || ""),
      rate: safeNum(v?.rate),
      amount,
      previousPercent: 0,
      nextPercent: 100,
      eventType: "binary",
      markedValue: true,
      markedAt: completedAt.toISOString(),
    });
    logsByDay.set(day, byItem);
  }

  return [...logsByDay.entries()]
    .map(([date, byItem]) => {
      // Only show entries where net value was earned that day (positive
      // delta). Reversals (negative deltas) still appear in the raw event
      // log but don't clutter the per-day rollup.
      const items = [...byItem.values()]
        .filter((item) => safeNum(item.amount) > 0)
        .sort((a, b) => safeNum(a.sn) - safeNum(b.sn));
      const totalAmount = items.reduce((sum, item) => sum + safeNum(item.amount), 0);
      const partialCount = items.filter(
        (item) => item.eventType === "partial",
      ).length;
      const binaryCount = items.length - partialCount;
      return {
        date,
        title: `Valuation for ${date}`,
        itemCount: items.length,
        partialCount,
        binaryCount,
        totalAmount,
        items,
      };
    })
    .filter((entry) => entry.itemCount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Find-or-create a takeoff-like project keyed on the model it came from.
// When clientProjectKey + modelFingerprint are both present we match an
// existing project for this user+productKey and update it in place, so
// re-saves upsert instead of duplicating (QUIV spec §3a/§4). Falls back to
// creating a fresh project. Returns { project, created }.
async function upsertTakeoffLikeProject({ userId, productKey, payload = {} }) {
  const {
    name,
    items,
    clientProjectKey,
    fingerprint,
    modelFingerprint,
    modelTitle,
    modelPath,
    origin,
    mergeSameTypeLevel,
    mergeSameLine,
    checklistCompositeKeys,
    valuationSettings,
  } = payload;

  const key = String(clientProjectKey || "").trim();
  const fp = String(modelFingerprint || "").trim();

  let project = null;
  if (key && fp) {
    project = await TakeoffProject.findOne({
      userId,
      productKey,
      clientProjectKey: key,
      modelFingerprint: fp,
    });
  }

  const created = !project;
  if (!project) {
    const trimmedName = String(name || "Project").trim() || "Project";
    const baseSlug = generateSlug(trimmedName);
    const slug = await uniqueSlug(userId, productKey, baseSlug);
    project = new TakeoffProject({
      userId,
      productKey,
      name: trimmedName,
      slug,
      clientProjectKey: key,
      fingerprint: fingerprint || "",
      modelFingerprint: fp,
    });
  }

  const tracked = applyValuationTracking({
    productKey,
    previousItems: created ? [] : Array.isArray(project.items) ? project.items : [],
    nextItems: sanitizeItems(items, productKey),
    previousEvents:
      created || !Array.isArray(project.valuationEvents)
        ? []
        : project.valuationEvents,
  });
  project.items = tracked.items;
  project.valuationEvents = tracked.valuationEvents;

  if (name !== undefined && String(name).trim()) project.name = String(name).trim();
  if (fingerprint !== undefined) project.fingerprint = fingerprint || "";
  if (modelFingerprint !== undefined && fp) project.modelFingerprint = fp;
  if (modelTitle !== undefined) project.modelTitle = modelTitle || "";
  if (modelPath !== undefined) project.modelPath = modelPath || "";
  if (origin !== undefined) project.origin = origin || project.origin || "";
  if (clientProjectKey !== undefined && key) project.clientProjectKey = key;

  if (typeof mergeSameTypeLevel === "boolean") {
    project.mergeSameTypeLevel = mergeSameTypeLevel;
  } else if (typeof mergeSameLine === "boolean") {
    project.mergeSameTypeLevel = mergeSameLine;
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

  if (!created) project.version += 1;
  await project.save();
  return { project, created };
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
      modelTitle,
      modelPath,
      origin,
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

    // QUIV spec §3a/§4: derived-materials saves should upsert (match by
    // clientProjectKey + modelFingerprint) rather than duplicate on every
    // re-save. Scoped to materials projects so takeoff-save behaviour is
    // unchanged. Requires both keys; otherwise we fall through to create.
    if (
      isMaterialsProductKey(productKey) &&
      String(clientProjectKey || "").trim() &&
      String(modelFingerprint || "").trim()
    ) {
      const { project } = await upsertTakeoffLikeProject({
        userId,
        productKey,
        payload: req.body || {},
      });
      return res.json(projectForClient(project));
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
      modelTitle: modelTitle || "",
      modelPath: modelPath || "",
      origin: origin || "",
      mergeSameTypeLevel:
        typeof mergeSameTypeLevel === "boolean"
          ? mergeSameTypeLevel
          : typeof mergeSameLine === "boolean"
            ? mergeSameLine
            : true,
      checklistCompositeKeys: normalizeChecklistKeys(checklistCompositeKeys),
      valuationSettings: normalizeValuationSettings(valuationSettings),
    });

    res.json(projectForClient(project));
  } catch (err) {
    console.error("POST project error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── §6 Unified save: takeoff + derived materials in one call ──
// POST/PUT /projects/revit/full. Upserts both the takeoff project (productKey
// "revit") and its derived-materials sibling (productKey "revit-materials"),
// both keyed on clientProjectKey + modelFingerprint so re-saves update in
// place. Returns both project ids plus a proposed-vs-actual margin summary
// (§5). Sequential (not transactional) — the codebase does not use Mongo
// transactions; the materials write is skipped when no material items are sent.
async function saveProjectFull(req, res) {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }

    const body = req.body || {};
    const {
      name,
      clientProjectKey,
      modelFingerprint,
      modelTitle,
      modelPath,
      fingerprint,
      origin,
      takeoffItems,
      materialItems,
      mergeSameTypeLevel,
      mergeSameLine,
      checklistCompositeKeys,
      valuationSettings,
    } = body;

    if (!String(name || "").trim()) {
      return res.status(400).json({ error: "name required" });
    }

    const sharedMeta = {
      name,
      clientProjectKey,
      modelFingerprint,
      modelTitle,
      modelPath,
      fingerprint,
      mergeSameTypeLevel,
      mergeSameLine,
      checklistCompositeKeys,
      valuationSettings,
    };

    // 1) Takeoff project.
    const takeoffRes = await upsertTakeoffLikeProject({
      userId,
      productKey: "revit",
      payload: {
        ...sharedMeta,
        items: Array.isArray(takeoffItems) ? takeoffItems : [],
        origin: origin || "",
      },
    });

    // 2) Derived-materials project (only when material lines are supplied).
    let materialsRes = null;
    const mats = Array.isArray(materialItems) ? materialItems : [];
    if (mats.length) {
      materialsRes = await upsertTakeoffLikeProject({
        userId,
        productKey: MATERIAL_PRODUCT_KEY,
        payload: {
          ...sharedMeta,
          items: mats,
          origin: "takeoff-derived",
        },
      });
    }

    // 3) Proposed-vs-actual margin across the saved pair (§5).
    const margins = computeProjectMargin({
      takeoffItems: takeoffRes.project.items,
      materialItems: materialsRes ? materialsRes.project.items : [],
    });

    res.json({
      ok: true,
      takeoffProjectId: String(takeoffRes.project._id),
      materialsProjectId: materialsRes ? String(materialsRes.project._id) : null,
      created: {
        takeoff: takeoffRes.created,
        materials: materialsRes ? materialsRes.created : false,
      },
      takeoff: projectForClient(takeoffRes.project),
      materials: materialsRes ? projectForClient(materialsRes.project) : null,
      margins,
    });
  } catch (err) {
    console.error("POST/PUT project full save error:", err);
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
    // Valuation factor: 1 when item is ratified (completed/purchased),
    // else percentComplete / 100. Matches the JS valuationFactor() helper.
    const valuationFactorExpression = {
      $cond: [
        { $eq: [{ $ifNull: [markedPath, false] }, true] },
        1,
        {
          $divide: [
            {
              $max: [
                0,
                {
                  $min: [
                    100,
                    {
                      $convert: {
                        input: "$$item.percentComplete",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              ],
            },
            100,
          ],
        },
      ],
    };
    const valuedLineExpression = {
      $multiply: [lineAmountExpression, valuationFactorExpression],
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
                in: valuedLineExpression,
              },
            },
          },
          // Total progress share = sum of valuationFactor across items.
          // Lets the explorer-grid card show a smooth progress % when
          // partial completion is tracked.
          progressShare: {
            $sum: {
              $map: {
                input: "$safeItems",
                as: "item",
                in: valuationFactorExpression,
              },
            },
          },
          partialCount: {
            $size: {
              $filter: {
                input: "$safeItems",
                as: "item",
                cond: {
                  $and: [
                    { $eq: [{ $ifNull: [markedPath, false] }, false] },
                    {
                      $gt: [
                        {
                          $convert: {
                            input: "$$item.percentComplete",
                            to: "double",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        0,
                      ],
                    },
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
              { $multiply: [{ $divide: ["$progressShare", "$itemCount"] }, 100] },
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

    res.json(projectForClient(project));
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
      modelTitle,
      modelPath,
      origin,
      mergeSameTypeLevel,
      mergeSameLine,
      checklistCompositeKeys,
      clientProjectKey,
      valuationSettings,
      provisionalSums,
      variations,
      preliminaryPercent,
      preliminaryItems,
      // Contingency + tax (VAT) percentages — see ContractSchema for
      // formula context. Default to 5% and 7.5% respectively when the
      // user hasn't touched them.
      contingencyPercent,
      taxPercent,
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
          // Rate-lock: if the rate changed since lock, push the new rate
          // into actualRate (so post-lock re-pricing surfaces as a
          // claimable variance without losing the contract baseline)
          // and snap rate back to the baseline. Mirrors the qty-lock
          // pattern above. Client-side the input is disabled, but
          // server-side enforcement is the source of truth — a
          // misbehaving / older client can't quietly drift the
          // contract rate.
          const newRate = safeNum(it?.rate);
          const baseRate = safeNum(base.rate);
          if (newRate !== baseRate) {
            const userActualRate = parseOptionalNumber(it?.actualRate);
            if (userActualRate == null) {
              it.actualRate = newRate;
              it.actualUpdatedAt = new Date();
              if (!it.actualRecordedAt) it.actualRecordedAt = new Date();
            }
            it.rate = baseRate;
          }
          return true;
        });

        // Delete-protection. The lock guard above filters incoming
        // items against baseItems, but if the client OMITS a base item
        // (e.g. the user deleted a row in their local state and the
        // disabled button was bypassed somehow), we'd silently drop it
        // from project.items. That would shrink the contract sum.
        //
        // Walk baseItems and re-insert any that don't appear in the
        // already-filtered lockedItems. The restored items preserve
        // the QS's previous valuation state (percentComplete, actuals)
        // by reading from project.items, not baseItems, when present.
        const incomingIdents = new Set(
          lockedItems.map((it, idx) => itemIdentity(it, idx)),
        );
        const restoredItems = [];
        for (const base of contract.baseItems || []) {
          const baseId = String(base.identity || "");
          if (!baseId || incomingIdents.has(baseId)) continue;
          // Try to find the previous DB version (carries actuals /
          // percent / status that the client may have lost). Fall
          // back to the contract baseline values.
          const prev = previousByIdent.get(baseId);
          const restore = prev ? (prev.toObject ? prev.toObject() : { ...prev }) : null;
          restoredItems.push(
            restore || {
              sn: base.sn,
              code: base.code || "",
              description: base.description || "",
              takeoffLine: base.takeoffLine || "",
              materialName: base.materialName || "",
              unit: base.unit || "",
              qty: safeNum(base.qty),
              rate: safeNum(base.rate),
            },
          );
        }
        if (restoredItems.length) {
          lockedItems = lockedItems.concat(restoredItems);
        }
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
    if (modelTitle !== undefined) project.modelTitle = modelTitle || "";
    if (modelPath !== undefined) project.modelPath = modelPath || "";
    if (origin !== undefined) project.origin = origin || "";

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

    if (contingencyPercent !== undefined) {
      const n = Number(contingencyPercent);
      if (Number.isFinite(n)) {
        if (!project.contract) project.contract = {};
        project.contract.contingencyPercent = clampPercentage(
          n,
          safeNum(project.contract?.contingencyPercent),
        );
      }
    }

    if (taxPercent !== undefined) {
      const n = Number(taxPercent);
      if (Number.isFinite(n)) {
        if (!project.contract) project.contract = {};
        project.contract.taxPercent = clampPercentage(
          n,
          safeNum(project.contract?.taxPercent),
        );
      }
    }

    project.version += 1;
    await project.save();

    res.json(projectForClient(project));
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

    // Proposed-vs-actual profit margin (spec §5). For a takeoff project we pull
    // in the sibling derived-materials project (linked by clientProjectKey +
    // modelFingerprint) so the cost side is built from the attached material /
    // labour lines. For a materials project there is no sell rate, so we just
    // surface its own lines as the cost basis.
    const margins = await computeMarginForProject(project, userId, productKey);

    res.json({
      projectId: String(project._id),
      projectName: project.name || "Project",
      productKey,
      statusField: statusFieldForProductKey(productKey),
      statusLabel: statusLabelForProductKey(productKey),
      logs: buildValuationLogs(project, productKey),
      margins,
    });
  } catch (err) {
    console.error("GET project valuations error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// Build a proposed-vs-actual margin summary for a single loaded project,
// resolving its sibling materials/takeoff project when needed (spec §5).
async function computeMarginForProject(project, userId, productKey) {
  try {
    const items = Array.isArray(project.items) ? project.items : [];

    if (isMaterialsProductKey(productKey)) {
      // A materials project alone has no sell rate; report cost-side only.
      return computeProjectMargin({ takeoffItems: [], materialItems: items });
    }

    let materialItems = [];
    const matKey = materialsProductKeyFor(productKey);
    const key = String(project.clientProjectKey || "").trim();
    const fp = String(project.modelFingerprint || "").trim();
    if (matKey && key && fp) {
      const sibling = await TakeoffProject.findOne({
        userId,
        productKey: matKey,
        clientProjectKey: key,
        modelFingerprint: fp,
      })
        .select("items")
        .lean();
      if (sibling && Array.isArray(sibling.items)) materialItems = sibling.items;
    }

    return computeProjectMargin({ takeoffItems: items, materialItems });
  } catch (err) {
    console.error("computeMarginForProject error:", err);
    return null;
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

    res.json(projectForClient(project));
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

    // 4-digit lock PIN. Required for new locks (this version onwards).
    // We hash with bcrypt cost 10 — overkill for a 4-digit secret in raw
    // brute-force terms, but consistent with how passwords are stored on
    // this server, and gives us future room to grow PIN length without
    // changing the verification path.
    const lockPin = normalizeLockPin(req.body?.lockPin);
    if (!lockPin) {
      return res.status(400).json({
        error: "A 4-digit lock PIN is required. You'll need the same PIN to unlock the contract.",
        code: "LOCK_PIN_REQUIRED",
      });
    }
    const lockPinHash = await bcrypt.hash(lockPin, 10);

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
    // Contingency + tax applied AFTER prelim. Mirrors the QS standard
    // grand-summary cascade (Sub-total → +Contingency → +VAT → Final).
    const subtotal = measured + provisional + prelim;
    const contingencyPercent = clampPercentage(
      Number(req.body?.contingencyPercent),
      safeNum(project.contract?.contingencyPercent) || 5,
    );
    const taxPercent = clampPercentage(
      Number(req.body?.taxPercent),
      safeNum(project.contract?.taxPercent) || 7.5,
    );
    const contingency = (subtotal * contingencyPercent) / 100;
    const tax = ((subtotal + contingency) * taxPercent) / 100;
    const contractSum = subtotal + contingency + tax;

    project.contract = {
      ...(project.contract?.toObject ? project.contract.toObject() : project.contract || {}),
      locked: true,
      lockedAt: new Date(),
      lockedBy: userId,
      approvedAt,
      preliminaryPercent,
      contingencyPercent,
      taxPercent,
      notes,
      baseItems,
      measuredAtLock: measured,
      provisionalAtLock: provisional,
      preliminaryAtLock: prelim,
      contingencyAtLock: contingency,
      taxAtLock: tax,
      contractSum,
      lockPinHash,
    };
    project.version += 1;
    await project.save();

    // Never echo the PIN hash back to the client.
    const contractOut = project.contract?.toObject
      ? project.contract.toObject()
      : { ...project.contract };
    delete contractOut.lockPinHash;
    res.json({ ok: true, contract: contractOut, version: project.version });
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

    // PIN check. If the contract has a stored hash, the caller must supply
    // the matching 4-digit PIN. Contracts locked before this feature
    // shipped have an empty lockPinHash and unlock without verification —
    // back-compat for existing data, future locks will all carry a PIN.
    const storedHash = String(project.contract?.lockPinHash || "");
    if (storedHash) {
      const suppliedPin = normalizeLockPin(req.body?.lockPin);
      if (!suppliedPin) {
        return res.status(400).json({
          error: "Enter the 4-digit PIN used to lock this contract.",
          code: "LOCK_PIN_REQUIRED",
        });
      }
      const ok = await bcrypt.compare(suppliedPin, storedHash);
      if (!ok) {
        return res.status(401).json({
          error: "Incorrect PIN. The contract stays locked.",
          code: "LOCK_PIN_INVALID",
        });
      }
    }

    if (!project.contract) project.contract = {};
    project.contract.locked = false;
    project.contract.lockedAt = null;
    project.contract.lockedBy = null;
    // Clear the PIN — locking again sets a new one, ensuring the old PIN
    // can't be reused after unlock without the user explicitly choosing it.
    project.contract.lockPinHash = "";
    // Keep baseItems and contractSum so history is preserved; re-locking
    // overwrites them cleanly.
    project.version += 1;
    await project.save();

    const contractOut = project.contract?.toObject
      ? project.contract.toObject()
      : { ...project.contract };
    delete contractOut.lockPinHash;
    res.json({ ok: true, contract: contractOut, version: project.version });
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
// Returns 1.0 when the item is fully signed off (completed/purchased=true),
// otherwise percentComplete / 100. This is the multiplier applied to
// qty × rate to derive value-of-work-done for valuation. Lets partial
// progress flow into certificates without flipping the binary flag.
function valuationFactor(item, statusField) {
  if (Boolean(item?.[statusField])) return 1;
  const pct = Number(item?.percentComplete);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct)) / 100;
}

function computeValueToDate(project) {
  const items = Array.isArray(project.items) ? project.items : [];
  const isMaterials = isMaterialsProductKey(project.productKey);
  const statusField = isMaterials ? "purchased" : "completed";

  let measured = 0;
  for (const it of items) {
    const factor = valuationFactor(it, statusField);
    if (factor <= 0) continue;
    const q = safeNum(it?.actualQty != null ? it.actualQty : it.qty);
    const r = safeNum(it?.actualRate != null ? it.actualRate : it.rate);
    measured += q * r * factor;
  }

  // Variations and PC sums each carry a `completed` flag. Both contribute
  // to the BAC (project total) regardless, but only contribute to earned
  // value (cumulativeValue) once flagged as executed. This matches how
  // preliminary items already work.
  const variationsTotal = (project.variations || []).reduce(
    (acc, v) => acc + safeNum(v?.qty) * safeNum(v?.rate),
    0,
  );
  const variationsEarned = (project.variations || []).reduce(
    (acc, v) =>
      v?.completed
        ? acc + safeNum(v?.qty) * safeNum(v?.rate)
        : acc,
    0,
  );
  const provisionalTotal = (project.provisionalSums || []).reduce(
    (acc, s) => acc + safeNum(s?.amount),
    0,
  );
  const provisionalEarned = (project.provisionalSums || []).reduce(
    (acc, s) => (s?.completed ? acc + safeNum(s?.amount) : acc),
    0,
  );
  // Back-compat aliases — these were the old "treat as fully claimed" sums.
  // Code below still references them; for cumulative-value math we now use
  // the *Earned variants above.
  const variationsAmount = variationsEarned;
  const provisionalAmount = provisionalEarned;

  // Preliminary pool: derived from contract percent on (measured + ALL
  // declared provisional). Uses the declared total — not just the completed
  // portion — because the pool size is set by contract scope, not by what's
  // been ticked off.
  const preliminaryPercent = safeNum(project.contract?.preliminaryPercent);
  const measuredTotal = items.reduce(
    (acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate),
    0,
  );
  const preliminaryTotal =
    ((measuredTotal + provisionalTotal) * preliminaryPercent) / 100;
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
    let partialCount = 0;
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
      const pct = Math.max(0, Math.min(100, Number(it.percentComplete) || 0));
      const factor = marked ? 1 : pct / 100;
      // Earn the proportional value: full when ratified, scaled otherwise.
      valuedAmount += amount * factor;
      if (marked) progressCount++;
      else if (factor > 0) partialCount++;

      if (!marked && factor < 1 && amount > 0) {
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

    // Physical progress counts items at 100% as "done"; partials add a
    // proportional share so the public dashboard reflects both.
    const partialProgressShare = items.reduce((acc, it) => {
      const marked = Boolean(it[statusField]);
      if (marked) return acc + 1;
      const pct = Math.max(0, Math.min(100, Number(it.percentComplete) || 0));
      return acc + pct / 100;
    }, 0);
    const progressPercent = progressTotal > 0 ? (partialProgressShare / progressTotal) * 100 : 0;

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
    // Contingency + tax cascade — same formula as the lock flow.
    // QS standard: Sub-total → +Contingency → +VAT → Final.
    const contingencyPercent = Number(contract?.contingencyPercent || 0);
    const taxPercent = Number(contract?.taxPercent || 0);
    const subtotalForContract =
      measuredForContract + provisionalForContract + preliminaryForContract;
    const contingencyForContract = contract?.locked
      ? Number(contract.contingencyAtLock || 0)
      : (subtotalForContract * contingencyPercent) / 100;
    const taxForContract = contract?.locked
      ? Number(contract.taxAtLock || 0)
      : ((subtotalForContract + contingencyForContract) * taxPercent) / 100;
    const contractSum = contract?.locked
      ? Number(contract.contractSum || 0)
      : subtotalForContract + contingencyForContract + taxForContract;

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

    // Variations + PC sums "earned" (executed) totals — only count
    // when the QS has ticked the `completed` flag, mirroring the
    // partial-aware semantics measured items use. Pre-fix this added
    // the FULL provisionalTotal regardless of whether anything was
    // drawn, which misled the public dashboard into showing a
    // "₦2,100,000 actual cost" on projects with PC sums declared but
    // nothing drawn.
    const variationsEarned = (project.variations || []).reduce(
      (acc, v) =>
        v?.completed
          ? acc + (Number(v?.qty) || 0) * (Number(v?.rate) || 0)
          : acc,
      0,
    );
    const provisionalEarned = (project.provisionalSums || []).reduce(
      (acc, p) => (p?.completed ? acc + (Number(p?.amount) || 0) : acc),
      0,
    );

    // Actual project cost = earned-only across every stream:
    //   • measured items × completion factor (already partial-aware)
    //   • completed preliminaries (preliminaryDone above)
    //   • executed PC sums
    //   • executed variations
    // This makes the public "Actual project cost" tile match the QS
    // dashboard's AC figure, which is what the client expects to see
    // on their side of the share link.
    const actualProjectCost =
      valuedAmount + preliminaryDone + variationsEarned + provisionalEarned;
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
      partialCount,
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
      contingencyPercent,
      contingencyAmount: contingencyForContract,
      taxPercent,
      taxAmount: taxForContract,
      provisionalTotal,
      variationsTotal,
      // Contract breakdown — the four numbers that add up to the
      // Planned Contract Sum the user sees on the public dashboard.
      // When locked these are the SIGNED values (frozen at lock
      // time); when unlocked they're the live BoQ values. Either way
      // the invariant holds:
      //   measured + provisional + preliminaries = contractSum
      //   contractSum + variations = current contract value
      contractBreakdown: {
        measured: measuredForContract,
        provisional: provisionalForContract,
        preliminaries: preliminaryForContract,
        contingency: contingencyForContract,
        tax: taxForContract,
        contingencyPercent,
        taxPercent,
        variations: variationsTotal,
        // Pre-summed for the client so it doesn't have to recompute.
        // Equals contractSum when locked.
        plannedSum:
          measuredForContract + provisionalForContract + preliminaryForContract +
          contingencyForContract + taxForContract,
        currentValue:
          measuredForContract + provisionalForContract + preliminaryForContract +
          contingencyForContract + taxForContract + variationsTotal,
      },
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

// §6 unified save — must precede the generic "/:productKey" routes so
// "/revit/full" isn't swallowed by a single-segment match.
router.post(
  "/revit/full",
  forceRevitFullProductKey,
  requireEntitlementParam,
  saveProjectFull,
);

router.put(
  "/revit/full",
  forceRevitFullProductKey,
  requireEntitlementParam,
  saveProjectFull,
);

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



