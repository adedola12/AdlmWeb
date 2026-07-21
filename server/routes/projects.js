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

// Zero/null every rate & money field on a (plain-object) project payload.
// Honours the RateGen rule: a collaborator WITHOUT an active rategen
// subscription may see quantities / descriptions / progress but NOT pricing.
// Quantities, units, %complete, categories, dates, flags and percentages are
// intentionally preserved — only currency amounts are stripped.
function maskRates(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const blankItem = (it) => {
    if (!it || typeof it !== "object") return;
    it.rate = 0;
    it.actualRate = null;
    it.netUnitCost = null;
    it.overheadPercent = null;
    it.profitPercent = null;
  };
  (obj.items || []).forEach(blankItem);
  (obj.materialItems || []).forEach(blankItem);

  (obj.budgetItems || []).forEach((b) => {
    if (!b || typeof b !== "object") return;
    b.rate = 0;
    b.netUnitCost = 0;
    b.overheadPercent = 0;
    b.profitPercent = 0;
    b.budgetRate = 0;
  });

  (obj.provisionalSums || []).forEach((p) => {
    if (p && typeof p === "object") p.amount = 0;
  });
  (obj.preliminaryItems || []).forEach((p) => {
    if (p && typeof p === "object") p.actualAmount = 0;
  });
  (obj.variations || []).forEach((v) => {
    if (v && typeof v === "object") v.rate = 0;
  });

  const CERT_MONEY = [
    "cumulativeValue", "lessPrevious", "thisCertificate", "retentionAmount",
    "retentionReleased", "vatAmount", "whtAmount", "netPayable",
  ];
  (obj.certificates || []).forEach((c) => {
    if (!c || typeof c !== "object") return;
    CERT_MONEY.forEach((k) => {
      if (c[k] !== undefined) c[k] = 0;
    });
  });

  // FinalAccount: every numeric field on it is a money figure.
  if (obj.finalAccount && typeof obj.finalAccount === "object") {
    Object.keys(obj.finalAccount).forEach((k) => {
      if (typeof obj.finalAccount[k] === "number") obj.finalAccount[k] = 0;
    });
  }

  if (obj.contract && typeof obj.contract === "object") {
    [
      "contractSum", "measuredAtLock", "provisionalAtLock", "preliminaryAtLock",
      "contingencyAtLock", "taxAtLock",
    ].forEach((k) => {
      if (obj.contract[k] !== undefined) obj.contract[k] = 0;
    });
    (obj.contract.baseItems || []).forEach((bi) => {
      if (bi && typeof bi === "object") bi.rate = 0;
    });
  }

  (obj.valuationEvents || []).forEach((e) => {
    if (!e || typeof e !== "object") return;
    if (e.rate !== undefined) e.rate = 0;
    if (e.amount !== undefined) e.amount = 0;
  });

  // PM costs are derived from BoQ rates — strip them too.
  if (obj.projectManagement && typeof obj.projectManagement === "object") {
    obj.projectManagement.budgetOverride = 0;
    (obj.projectManagement.tasks || []).forEach((t) => {
      if (!t || typeof t !== "object") return;
      t.baselineCost = 0;
      t.actualCost = 0;
    });
  }

  return obj;
}

// Mask the money fields on a single certificate / final-account object before
// returning it from a mutation handler to a collaborator without RateGen. (The
// full GET payload is masked by maskRates(); these partial write responses
// compute fresh money that bypasses it, so they need the same treatment.)
function maskCertForClient(cert) {
  const c = cert?.toObject ? cert.toObject() : { ...(cert || {}) };
  [
    "cumulativeValue", "lessPrevious", "thisCertificate", "retentionAmount",
    "retentionReleased", "vatAmount", "whtAmount", "netPayable",
  ].forEach((k) => {
    if (c[k] !== undefined) c[k] = 0;
  });
  return c;
}
function maskFinalAccountForClient(fa) {
  const f = fa?.toObject ? fa.toObject() : { ...(fa || {}) };
  Object.keys(f).forEach((k) => {
    if (typeof f[k] === "number") f[k] = 0;
  });
  return f;
}

// Strip server-secret fields before serialising a project to the client and
// apply collaborator-aware visibility. `access` comes from
// resolveProjectAccess(); when omitted we default to full owner visibility
// (the historical behaviour — only ever used for owner-served data).
//   • contract lock PIN hash → boolean flag (never leak the hash)
//   • shareCodes / collaborators → owner-only (shaped, no hashes)
//   • rate/amount fields → masked unless access.canSeeRates
//   • attaches `_access` so the client can gate edit/export/manage + rates
function projectForClient(project, access) {
  if (!project) return project;
  const obj = project?.toObject ? project.toObject() : { ...project };
  if (obj?.contract && obj.contract.lockPinHash !== undefined) {
    // Don't leak the hash; replace with a boolean flag the UI can use to
    // decide whether to prompt for a PIN on unlock.
    obj.contract = { ...obj.contract };
    obj.contract.hasLockPin = Boolean(obj.contract.lockPinHash);
    delete obj.contract.lockPinHash;
  }

  const canManage = access ? !!access.canManage : true;
  const canSeeRates = access ? !!access.canSeeRates : true;

  if (canManage) {
    // Owner view: expose share codes (plaintext for re-copy, never the hash)
    // and the collaborator roster.
    if (Array.isArray(obj.shareCodes)) {
      obj.shareCodes = obj.shareCodes
        .filter((c) => c && !c.revoked)
        .map((c) => ({
          id: String(c._id),
          codePlain: c.codePlain || "",
          codeLast4: c.codeLast4 || "",
          accessLevel: c.accessLevel,
          label: c.label || "",
          allowedEmails: c.allowedEmails || [],
          maxUses: c.maxUses || 0,
          uses: c.uses || 0,
          createdAt: c.createdAt,
        }));
    }
    if (Array.isArray(obj.collaborators)) {
      obj.collaborators = obj.collaborators.map((c) => ({
        userId: String(c.userId),
        email: c.email || "",
        accessLevel: c.accessLevel,
        addedAt: c.addedAt,
      }));
    }
  } else {
    // Collaborators never receive the code/roster internals.
    delete obj.shareCodes;
    delete obj.collaborators;
  }

  // Raw cross-project links carry ObjectIds + snapshot money the client never
  // needs — the client-facing shape is `linkedSummaries` (added by getProject,
  // already rate-masked). Always strip the raw array.
  delete obj.linkedProjects;

  if (!canSeeRates) {
    maskRates(obj);
    obj._ratesMasked = true;
  }

  obj._access = access
    ? {
        role: access.role,
        accessLevel: access.accessLevel || null,
        canEdit: !!access.canEdit,
        canExport: !!access.canExport,
        canManage: !!access.canManage,
        canSeeRates: !!access.canSeeRates,
      }
    : {
        role: "owner",
        accessLevel: null,
        canEdit: true,
        canExport: true,
        canManage: true,
        canSeeRates: true,
      };
  return obj;
}
import { requireAuth, requireStepUp } from "../middleware/auth.js";
import {
  requireEntitlementParam,
  requireEntitlement,
} from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { recordActivity, ACT } from "../util/activityLog.js";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import {
  deriveItemCategory,
  deriveItemTrade,
  deriveItemDiscipline,
} from "../util/boqCategory.js";
import {
  applyLearnedCategoriesToItems,
  recordCategoryFeedback,
} from "../util/learnedCategory.js";
import { computeProjectMargin } from "../util/profitMargin.js";
import {
  isR2Configured,
  uploadBufferToR2,
  deleteFromR2,
  getR2ObjectStream,
} from "../utils/r2Upload.js";
import {
  buildBillQtyChanges,
  cascadeBillQtyToMaterials,
} from "../util/billBudgetCascade.js";
import { backfillBudgetLinks } from "../util/budgetBillLink.js";
import { deriveBillRatesFromBudget } from "../util/deriveBillRates.js";
import { ensureBillItemCoverage } from "../util/budgetCoverage.js";
import {
  parseBoqWorkbook,
  buildBoqTemplateWorkbook,
} from "../util/boqExcelImport.js";
import { priceServiceItems, mapServiceType } from "../util/serviceResolve.js";

// Project-model upload limit: 100 MB. Big enough for most arch / struct / MEP
// IFC files; we can raise this per-tier later via an entitlement flag.
const IFC_MAX_BYTES = 100 * 1024 * 1024;
const DISCIPLINES = new Set(["architectural", "structural", "mep"]);

const uploadModelFile = multer({
  storage: multer.memoryStorage(),
  // fileSize caps the IFC; fieldSize is raised well above busboy's 1 MB
  // default so the `presentElementIds` JSON field (Element IDs the client
  // parsed from the IFC) is never silently truncated on large models.
  limits: { fileSize: IFC_MAX_BYTES, fieldSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".ifc") || name.endsWith(".ifczip") || name.endsWith(".frag")) {
      return cb(null, true);
    }
    cb(new Error("Only .ifc, .ifczip or .frag files are accepted."));
  },
});

// ── Admin-granted BoQ Import (Quiv) ─────────────────────────────────────────
// Users holding the quiv-boq-import entitlement (granted only by an admin via
// the UAC entitlement panel) can create revit projects from an Excel BoQ.
// Imported projects are ordinary revit projects (origin "boq-import"): they
// appear on the main projects page, count toward the storage/project limit and
// ride the full budget/valuation/variation pipeline. Only the 3D-model and
// project-linking surfaces are withheld (no model exists to view or link by
// element).
const BOQ_IMPORT_ORIGIN = "boq-import";
const BOQ_IMPORT_ENTITLEMENT = "quiv-boq-import";
const BOQ_IMPORT_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const boqImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BOQ_IMPORT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return cb(null, true);
    cb(new Error("Only Excel .xlsx workbooks are accepted."));
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
  if (key === "mep-materials") return "mep";
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

// ── Collaborator access resolution ───────────────────────────────────────
// True when `userId` holds an active, unexpired entitlement for `key`. Mirrors
// requireEntitlement() — used for the RateGen rate-mask decision and the
// claim-time plugin gate.
async function userHasActiveEntitlement(userId, key) {
  if (!userId || !key) return false;
  const u = await User.findById(userId, { entitlements: 1 }).lean();
  if (!u) return false;
  const e = (u.entitlements || []).find(
    (x) => x.productKey === key && x.status === "active",
  );
  if (!e) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < Date.now()) return false;
  return true;
}

// Mongo filter matching a project the requester may READ: they own it OR are a
// collaborator on it. Write/export/manage powers are refined by
// resolveProjectAccess() once the document is loaded.
function accessFilter(id, userId, productKey) {
  return {
    _id: id,
    productKey,
    $or: [{ userId }, { "collaborators.userId": userId }],
  };
}

// Resolve what the requester may do with an already-loaded project document.
//   role:        owner | full | view | none
//   canEdit:     owner or full  (mutations)
//   canExport:   owner or full  (xlsx / model download)
//   canManage:   owner only     (codes, collaborators, delete project)
//   canSeeRates: owner always; collaborator only with active rategen
async function resolveProjectAccess(req, project) {
  const uid = getUserObjectId(req);
  const out = {
    role: "none",
    accessLevel: null,
    canEdit: false,
    canExport: false,
    canManage: false,
    canSeeRates: false,
  };
  if (!project || !uid) return out;

  if (project.userId && uid.equals(project.userId)) {
    out.role = "owner";
    out.canEdit = out.canExport = out.canManage = out.canSeeRates = true;
    return out;
  }

  const collab = (project.collaborators || []).find(
    (c) => c.userId && uid.equals(c.userId),
  );
  if (!collab) return out; // not owner, not collaborator → no access

  out.role = collab.accessLevel === "full" ? "full" : "view";
  out.accessLevel = out.role;
  out.canEdit = out.canExport = out.role === "full";
  out.canSeeRates = await userHasActiveEntitlement(uid, "rategen");
  return out;
}

// ── Cross-project linking (e.g. MEP services → architectural bill) ─────────
// The "general bill" roll-up of a project for linking into another project.
// Mirrors the gross works-cost view: measured work + provisional sums +
// variations. `contractSum`/`locked` are surfaced for reference, but `total`
// stays a pure works-cost figure (it excludes the linked project's own
// contingency/VAT, which belong to that project — not the parent bill line).
function computeProjectRollup(project) {
  const items = Array.isArray(project?.items) ? project.items : [];
  let measured = 0;
  for (const it of items) measured += safeNum(it?.qty) * safeNum(it?.rate);
  let provisional = 0;
  for (const p of project?.provisionalSums || []) provisional += safeNum(p?.amount);
  let variations = 0;
  for (const v of project?.variations || []) variations += safeNum(v?.qty) * safeNum(v?.rate);
  return {
    measured,
    provisional,
    variations,
    total: measured + provisional + variations,
    contractSum: safeNum(project?.contract?.contractSum),
    locked: !!project?.contract?.locked,
    version: Number(project?.version) || 0,
  };
}

// Resolve a parent project's linkedProjects into client-facing summaries:
// live total (auto-updating pull model) + the frozen snapshot + drift. Only
// links the requester can READ are resolved; money is zeroed when the
// requester can't see rates (same RateGen rule maskRates() enforces).
async function resolveLinkedSummaries(parent, userId, access) {
  const links = Array.isArray(parent?.linkedProjects) ? parent.linkedProjects : [];
  if (!links.length) return [];
  const canSeeRates = access ? !!access.canSeeRates : true;
  const ids = links.map((l) => l.projectId).filter(Boolean);
  // Owner-scoped: only the requester's OWN linked projects resolve live. A
  // collaborator viewing the parent never queries another user's project — they
  // see the frozen snapshot stored on the parent instead.
  const linked = ids.length
    ? await TakeoffProject.find({
        _id: { $in: ids },
        userId,
      })
        .select(
          "name productKey version items provisionalSums variations contract.contractSum contract.locked",
        )
        .lean()
    : [];
  const byId = new Map(linked.map((p) => [String(p._id), p]));
  const zero = { total: 0, measured: 0, provisional: 0, variations: 0, contractSum: 0 };

  return links.map((l) => {
    const lp = byId.get(String(l.projectId));
    const snap = l.snapshot || {};
    const live = lp ? computeProjectRollup(lp) : null;
    const summary = {
      id: String(l._id),
      projectId: String(l.projectId),
      productKey: l.productKey || lp?.productKey || "",
      label: l.label || lp?.name || "Linked project",
      name: lp?.name || "",
      linkType: l.linkType || "sum",
      accessible: !!lp,
      addedAt: l.addedAt || null,
      snapshot: {
        total: safeNum(snap.total),
        measured: safeNum(snap.measured),
        provisional: safeNum(snap.provisional),
        variations: safeNum(snap.variations),
        contractSum: safeNum(snap.contractSum),
        locked: !!snap.locked,
        version: Number(snap.version) || 0,
        takenAt: snap.takenAt || null,
      },
      live: live
        ? {
            total: live.total,
            measured: live.measured,
            provisional: live.provisional,
            variations: live.variations,
            contractSum: live.contractSum,
            locked: live.locked,
            version: live.version,
          }
        : null,
      drift: live ? safeNum(live.total) - safeNum(snap.total) : 0,
    };
    if (!canSeeRates) {
      summary.snapshot = { ...summary.snapshot, ...zero };
      if (summary.live) summary.live = { ...summary.live, ...zero };
      summary.drift = 0;
    }
    return summary;
  });
}

const MAX_ITEMS = Number(process.env.PROJECT_MAX_ITEMS || 8000);
const MATERIAL_PRODUCT_KEY = "revit-materials";
const PS_MATERIAL_PRODUCT_KEY = "planswift-materials";
const MEP_MATERIAL_PRODUCT_KEY = "mep-materials";

// The materials/budget sibling productKey for a takeoff/bill productKey, or
// null when the key is not a bill key (e.g. it is already a *-materials
// project). Used by the Bill → Budget cascade to find the paired project.
function materialsSiblingKey(pk) {
  const k = normalizeProductKey(pk);
  if (!k || k.endsWith("-materials")) return null;
  if (k === "revit") return MATERIAL_PRODUCT_KEY;
  if (k === "planswift") return PS_MATERIAL_PRODUCT_KEY;
  if (k === "mep") return MEP_MATERIAL_PRODUCT_KEY;
  return null;
}
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

// PlanSwift unified save (§6, HERON plugin): persists the PlanSwift takeoff (bill) + its
// derived materials (budget) in one call, linked by clientProjectKey + modelFingerprint.
// Entitlement is gated on the base "planswift" product, which covers both halves.
function forcePsFullProductKey(req, _res, next) {
  req.productKeyOriginal = "planswift";
  req.params.productKey = entitlementKeyFor("planswift");
  next();
}

// MEP (building services) unified save: persists the services takeoff (bill) +
// its derived material/labour build-up (budget) in one call, exactly like
// revit/full & planswift/full. Entitlement is gated on the base "mep" product.
function forceMepFullProductKey(req, _res, next) {
  req.productKeyOriginal = "mep";
  req.params.productKey = entitlementKeyFor("mep");
  next();
}

function forceMepMaterialsProductKey(req, _res, next) {
  req.productKeyOriginal = MEP_MATERIAL_PRODUCT_KEY;
  req.params.productKey = entitlementKeyFor(MEP_MATERIAL_PRODUCT_KEY);
  next();
}

function isMaterialsProductKey(productKey) {
  const key = normalizeProductKey(productKey);
  return key === "revit-materials" || key === "revit-material"
      || key === "planswift-materials" || key === "planswift-material"
      || key === "mep-materials" || key === "mep-material";
}

// Map a takeoff product key to its sibling derived-materials product key, so a
// takeoff project can find the materials saved alongside it (linked by
// clientProjectKey + modelFingerprint). Returns null for keys with no sibling.
function materialsProductKeyFor(productKey) {
  const key = normalizeProductKey(productKey);
  if (key === "revit") return MATERIAL_PRODUCT_KEY;
  if (key === "planswift") return PS_MATERIAL_PRODUCT_KEY;
  if (key === "mep") return MEP_MATERIAL_PRODUCT_KEY;
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

// ── Project limits (cloud-storage management) ──────────────────────────────
// Personal licences: 30 projects per product. Organization licences: 50 per
// product. Extra slots can be purchased and stored on the entitlement's
// extraProjectSlots field. Caps are env-overridable.
const PERSONAL_PROJECT_LIMIT = Number(process.env.PERSONAL_PROJECT_LIMIT || 30);
const ORG_PROJECT_LIMIT = Number(process.env.ORG_PROJECT_LIMIT || 50);

async function projectLimitForProduct(userId, productKey) {
  const u = await User.findById(userId, { entitlements: 1 }).lean();
  const ents = u?.entitlements || [];
  const isOrg = ents.some(
    (e) => e?.licenseType === "organization" && e?.status === "active",
  );
  const baseLimit = isOrg ? ORG_PROJECT_LIMIT : PERSONAL_PROJECT_LIMIT;
  // Add any extra slots purchased for this specific product
  const ent = ents.find(
    (e) => e?.productKey === productKey && e?.status === "active",
  );
  const extra = Number(ent?.extraProjectSlots || 0);
  return baseLimit + extra;
}

// Throw a typed 403 when creating a NEW project would exceed the per-product
// licence cap. Auto-created *-materials siblings are never counted or blocked.
// Existing projects are never blocked on re-save (plugins can always sync).
async function assertWithinProjectLimit(userId, productKey) {
  if (isMaterialsProductKey(productKey)) return;
  const limit = await projectLimitForProduct(userId, productKey);
  // PM-tracker projects live in their own bucket with a separate cap, so they
  // must not consume takeoff slots (would double-count against the 30 limit).
  const count = await TakeoffProject.countDocuments({
    userId,
    productKey,
    pmTrackerOnly: { $ne: true },
  });
  if (count >= limit) {
    const err = new Error(
      `Project limit reached (${limit}). Delete a project or upgrade your plan to add more.`,
    );
    err.statusCode = 403;
    err.code = "PROJECT_LIMIT";
    err.storageLimit = { used: count, limit, productKey };
    throw err;
  }
}

// Return per-product usage and limit for the requesting user.
async function getProjectStorageInfo(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });
    if (isMaterialsProductKey(productKey)) {
      return res.json({ used: 0, limit: null, productKey, isMaterials: true });
    }
    const limit = await projectLimitForProduct(userId, productKey);
    // Match the takeoffs list + create-limit: PM-tracker projects are counted
    // in their own bucket, not here.
    const used = await TakeoffProject.countDocuments({
      userId,
      productKey,
      pmTrackerOnly: { $ne: true },
    });
    return res.json({ used, limit, productKey, isMaterials: false });
  } catch (err) {
    console.error("GET storage-info error:", err);
    res.status(500).json({ error: "Server error" });
  }
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
  basis: "boq",
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
    basis:
      source.basis === "budget" || source.basis === "boq"
        ? source.basis
        : base.basis === "budget"
          ? "budget"
          : "boq",
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

    // Per-element quantity split: [{ id, qty }] — one entry per element on the
    // line so the web viewer can show a single element's share. Drop malformed
    // entries; keep unknown extras out.
    const elementQuantities = Array.isArray(item.elementQuantities)
      ? item.elementQuantities
          .map((e) => ({ id: Number(e && e.id), qty: Number(e && e.qty) }))
          .filter(
            (e) => Number.isFinite(e.id) && e.id > 0 && Number.isFinite(e.qty),
          )
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
      // RateGen library description that priced this line (plugin provenance).
      appliedRateKey: item.appliedRateKey != null ? String(item.appliedRateKey) : "",
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
      elementQuantities,
      elementQuantitiesEstimated: Boolean(item.elementQuantitiesEstimated),
      level: item.level != null ? String(item.level) : "",
      type: item.type != null ? String(item.type) : "",
      code: item.code != null ? String(item.code) : "",
      category: item.category != null ? String(item.category) : "",
      trade: item.trade != null ? String(item.trade) : "",
      discipline: item.discipline != null ? String(item.discipline) : "",

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
    // Same for discipline — drives the per-discipline IFC validation gate.
    // Reuses the (now-derived) category so grouping and validation agree.
    if (!baseItem.discipline) {
      baseItem.discipline = deriveItemDiscipline(baseItem, productKey);
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

// Budget items — the internal cost plan persisted on the project. Mirrors
// sanitizeProvisionalSums: drops empty rows, coerces numbers, clamps the
// procurement percent and normalises the procured / target dates.
function sanitizeBudgetItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  for (let i = 0; i < items.length && out.length < 5000; i += 1) {
    const b = items[i] || {};
    // Accept either a budget-shaped row or a raw material/labour item from a
    // plugin save: sourceTakeoffCode -> billIdentity, materialName -> name.
    const billIdentity = String(b.billIdentity || b.sourceTakeoffCode || "")
      .trim()
      .slice(0, 200);
    const materialName = String(b.materialName || "").trim().slice(0, 1000);
    const description = String(b.description || materialName || "")
      .trim()
      .slice(0, 1000);
    if (!description && !billIdentity) continue;
    // Procurement mark: budget rows use procured*, material rows use purchased*.
    const procured = Boolean(b.procured != null ? b.procured : b.purchased);
    let procuredAt = null;
    const procuredAtSrc = b.procuredAt || b.purchasedAt;
    if (procured) {
      if (procuredAtSrc) {
        const d = new Date(procuredAtSrc);
        if (!Number.isNaN(d.getTime())) procuredAt = d;
      }
      if (!procuredAt) procuredAt = new Date();
    }
    let targetDate = null;
    if (b.targetDate) {
      const d = new Date(b.targetDate);
      if (!Number.isNaN(d.getTime())) targetDate = d;
    }
    const rate = num(b.rate);
    const netUnitCost = num(b.netUnitCost);
    const procuredPercentSrc =
      b.procuredPercent != null ? b.procuredPercent : b.percentComplete;
    // Element IDs carried from the source material/labour line — used by the
    // budget↔bill linker to match by element overlap when a code is missing.
    const elementIds = Array.isArray(b.elementIds)
      ? b.elementIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
          .slice(0, 5000)
      : [];
    // Per-element quantity split copied/scaled from the source line — lets the
    // web viewer show a single element's share of this budget line.
    const elementQuantities = Array.isArray(b.elementQuantities)
      ? b.elementQuantities
          .map((e) => ({ id: Number(e && e.id), qty: Number(e && e.qty) }))
          .filter(
            (e) => Number.isFinite(e.id) && e.id > 0 && Number.isFinite(e.qty),
          )
          .slice(0, 5000)
      : [];
    out.push({
      billIdentity,
      sn: num(b.sn),
      description,
      materialName,
      takeoffLine: String(b.takeoffLine || "").trim().slice(0, 1000),
      componentKind: String(b.componentKind || "").trim().slice(0, 40),
      category: String(b.category || "").trim().slice(0, 200),
      trade: String(b.trade || "").trim().slice(0, 200),
      unit: String(b.unit || "").trim().slice(0, 50),
      qty: num(b.qty),
      rate,
      netUnitCost,
      overheadPercent: num(b.overheadPercent),
      profitPercent: num(b.profitPercent),
      budgetRate: num(b.budgetRate) || netUnitCost || rate,
      procured,
      procuredAt,
      procuredPercent: Math.max(0, Math.min(100, num(procuredPercentSrc))),
      targetDate,
      supplier: String(b.supplier || "").trim().slice(0, 300),
      notes: String(b.notes || "").trim().slice(0, 1000),
      elementIds,
      elementQuantities,
      elementQuantitiesEstimated: Boolean(b.elementQuantitiesEstimated),
    });
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
  const statusDateField = statusDateFieldForProductKey(productKey);
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

  // ── Reconstruct MEASURED entries from item state ─────────────────
  //
  // The event trail (applyValuationTracking) is the finest-grained source,
  // but it can be empty for items marked before events existed, or if the
  // events were ever lost on a re-sync. The source of truth for "what is
  // ticked complete and when" is the item itself (completed/percentComplete +
  // completedAt). So for any completed / in-progress measured line NOT already
  // represented by a real event, synthesise an entry on its completion day —
  // mirroring how prelims / PC sums / variations are handled below. This makes
  // the Daily valuation log reflect actual progress even with no event trail.
  const loggedKeys = new Set();
  for (const byItem of logsByDay.values()) {
    for (const k of byItem.keys()) loggedKeys.add(k);
  }
  for (let i = 0; i < projectItems.length; i += 1) {
    const it = projectItems[i];
    const ident = itemIdentity(it, i);
    if (loggedKeys.has(ident)) continue; // already covered by an event

    const ratified = Boolean(it?.[statusField]);
    const pct = ratified
      ? 100
      : Math.max(0, Math.min(100, safeNum(it?.percentComplete)));
    if (!ratified && pct <= 0) continue; // nothing earned on this line

    const amount = safeNum(it?.qty) * safeNum(it?.rate) * (pct / 100);
    if (amount <= 0) continue;

    const when =
      parseOptionalDate(ratified ? it?.[statusDateField] : it?.percentCompleteUpdatedAt) ||
      parseOptionalDate(it?.statusUpdatedAt) ||
      parseOptionalDate(it?.actualUpdatedAt) ||
      parseOptionalDate(project?.updatedAt) ||
      new Date();
    const day = isoDay(when);
    if (!day) continue;

    const byItem = logsByDay.get(day) || new Map();
    byItem.set(ident, {
      itemKey: ident,
      sn: safeNum(it?.sn) || i + 1,
      description: String(
        it?.description || it?.materialName || it?.takeoffLine || "",
      ),
      qty: safeNum(it?.qty),
      unit: String(it?.unit || ""),
      rate: safeNum(it?.rate),
      amount,
      previousPercent: 0,
      nextPercent: pct,
      eventType: ratified ? "binary" : "partial",
      markedValue: ratified,
      markedAt: when.toISOString(),
    });
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

// Contract-lock enforcement — the SINGLE source of truth shared by the website edit path
// (updateProject) and the plugin / unified-save path (upsertTakeoffLikeProject), so a HERON
// re-save can never overwrite a locked contract. When the project's contract is locked:
// structural edits are frozen to the locked baseline — a changed qty/rate is diverted to
// actualQty/actualRate (the contract value snaps back), brand-new lines become variations, and
// omitted base items are re-inserted (delete-protection). Returns { lockedItems, extraVariations };
// a no-op (returns the input, no variations) when not locked. Mutates the incoming items in place.
function enforceContractLock({ project, sanitizedNext }) {
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
  return { lockedItems, extraVariations };
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
  // Enforce the cloud-storage cap only when this save would INSERT a new
  // project (re-saves of existing work are never blocked).
  if (created) await assertWithinProjectLimit(userId, productKey);
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

  // Contract-lock enforcement (integrity): when the matched project's contract is locked, freeze
  // qty/rate to the baseline and divert post-lock changes to actualQty/actualRate, push brand-new
  // lines to variations, and re-insert omitted base items — so a plugin (HERON) re-save via the
  // unified /full or per-key POST can never overwrite a locked contract. No-op when unlocked/new.
  const sanitizedNext = sanitizeItems(items, productKey);
  const { lockedItems, extraVariations } = enforceContractLock({ project, sanitizedNext });

  const tracked = applyValuationTracking({
    productKey,
    previousItems: created ? [] : Array.isArray(project.items) ? project.items : [],
    nextItems: lockedItems,
    previousEvents:
      created || !Array.isArray(project.valuationEvents)
        ? []
        : project.valuationEvents,
  });
  project.items = tracked.items;
  project.valuationEvents = tracked.valuationEvents;
  if (extraVariations.length) {
    project.variations = sanitizeVariations([
      ...(Array.isArray(project.variations) ? project.variations : []),
      ...extraVariations,
    ]);
  }

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
      materialItems,
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

    await assertWithinProjectLimit(userId, productKey);

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
      // Embedded budget — one revit project holds both bill + budget.
      materialItems: Array.isArray(materialItems)
        ? sanitizeItems(materialItems, "revit-materials")
        : [],
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

    recordActivity(req, project, ACT.PROJECT_CREATED, "Created the project", {
      itemCount: (project.items || []).length,
    });
    res.json(projectForClient(project));
  } catch (err) {
    if (err?.code === "PROJECT_LIMIT") {
      return res.status(403).json({
        error: err.message,
        code: "PROJECT_LIMIT",
        storageLimit: err.storageLimit || null,
      });
    }
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

    // The takeoff product key is set by the route middleware (revit/full → "revit",
    // planswift/full → "planswift") and the materials sibling key follows from it, so this
    // one unified save serves both Revit and PlanSwift (HERON).
    const takeoffKey = requestedProductKey(req);
    const materialsKey = materialsProductKeyFor(takeoffKey) || MATERIAL_PRODUCT_KEY;

    // 1) Takeoff project.
    const takeoffRes = await upsertTakeoffLikeProject({
      userId,
      productKey: takeoffKey,
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
        productKey: materialsKey,
        payload: {
          ...sharedMeta,
          items: mats,
          origin: "takeoff-derived",
        },
      });
    }

    // 2b) Consolidate the material/labour breakdown onto the takeoff project
    // so bill + budget live on ONE document (budgetItems[], keyed by
    // sourceTakeoffCode -> billIdentity). Guarded and run AFTER the critical
    // takeoff/materials saves, so a mapping issue can never break the save.
    // The separate materials project is still written above during the
    // transition; budgetItems[] is the canonical source for the Budget tab.
    if (mats.length) {
      try {
        const budget = sanitizeBudgetItems(
          materialsRes ? materialsRes.project.items : mats,
        );
        // Link each budget line to its bill line (code → elementIds → title)
        // so material + labour bundle under the right line, then derive the
        // bill rates from the priced build-up before reconciling progress.
        backfillBudgetLinks(takeoffRes.project.items, budget);
        takeoffRes.project.budgetItems = ensureBillItemCoverage(
          takeoffRes.project.items,
          budget,
        );
        deriveBillRatesFromBudget(takeoffRes.project);
        reconcileItemsFromBudget(takeoffRes.project);
        await takeoffRes.project.save();
      } catch (e) {
        console.error("[full] budget consolidation failed:", e?.message || e);
      }
    }

    // Log the creation of a genuinely NEW project only — a re-sync of existing
    // work upserts (created=false) and must not spam the activity feed.
    if (takeoffRes.created) {
      recordActivity(req, takeoffRes.project, ACT.PROJECT_CREATED, "Created the project", {
        itemCount: (takeoffRes.project.items || []).length,
        via: "plugin",
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
    if (err?.code === "PROJECT_LIMIT") {
      return res.status(403).json({
        error: err.message,
        code: "PROJECT_LIMIT",
        storageLimit: err.storageLimit || null,
      });
    }
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
      // Owner's own projects OR projects shared with this user. Exclude
      // PM-tracker-only projects: they carry no bill of quantities and are
      // managed on the dedicated PM Tracker page, so they must not clutter
      // the takeoffs file-explorer (they'd show as 0-item folders here).
      {
        $match: {
          productKey,
          pmTrackerOnly: { $ne: true },
          $or: [{ userId }, { "collaborators.userId": userId }],
        },
      },
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
          // Ownership badge: true when this row was shared with the requester.
          shared: { $ne: ["$userId", userId] },
          accessLevel: {
            $let: {
              vars: {
                mine: {
                  $first: {
                    $filter: {
                      input: { $ifNull: ["$collaborators", []] },
                      as: "c",
                      cond: { $eq: ["$$c.userId", userId] },
                    },
                  },
                },
              },
              in: { $ifNull: ["$$mine.accessLevel", null] },
            },
          },
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    // Lazy slug generation for existing projects without slugs. Scope
    // uniqueness to the OWNER's namespace (project.userId), not the requester —
    // a collaborator opening the project must not reslug it under their own id.
    if (!project.slug) {
      const baseSlug = generateSlug(project.name);
      project.slug = await uniqueSlug(
        project.userId,
        productKey,
        baseSlug,
        project._id,
      );
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

    // Lazy budget heal. Opening a project re-derives the Budget from the
    // authoritative materialItems so material + labour bundle correctly under
    // each bill line — and any earlier mis-link (a material dumped onto the
    // wrong line by the old loose matcher) is recovered. User edits
    // (procurement + pricing) are preserved by a stable key, and we only write
    // when the linkage/shape actually changed (idempotent — no churn on opens).
    try {
      const currentBudget = Array.isArray(project.budgetItems)
        ? project.budgetItems
        : [];
      const hasMaterials =
        Array.isArray(project.materialItems) && project.materialItems.length;

      const editKey = (b) =>
        [
          Number(b?.sn) || 0,
          String(b?.materialName || b?.description || "").trim().toLowerCase(),
          String(b?.unit || "").trim().toLowerCase(),
          String(b?.componentKind || "").trim().toLowerCase(),
        ].join("|");
      const linkSig = (list) =>
        (list || [])
          .map(
            (b) =>
              `${b.sn}:${String(b.billIdentity || "").toLowerCase()}:${String(
                b.materialName || "",
              )
                .trim()
                .toLowerCase()}`,
          )
          .join("|");

      if (hasMaterials) {
        const edits = new Map();
        for (const b of currentBudget) edits.set(editKey(b), b);

        let fresh = sanitizeBudgetItems(project.materialItems);
        backfillBudgetLinks(project.items, fresh);
        // Every bill line must carry a Labour line (qty = item qty) and a
        // Material line — synthesise the gaps so each card is complete.
        fresh = ensureBillItemCoverage(project.items, fresh);
        // Re-apply user edits (procurement + pricing) onto the rebuilt list,
        // including the synthetic placeholders.
        for (const b of fresh) {
          const prev = edits.get(editKey(b));
          if (!prev) continue;
          if (prev.procured) {
            b.procured = true;
            b.procuredAt = prev.procuredAt || b.procuredAt;
          }
          if (Number(prev.procuredPercent)) b.procuredPercent = prev.procuredPercent;
          if (Number(prev.rate)) b.rate = prev.rate;
          if (Number(prev.overheadPercent)) b.overheadPercent = prev.overheadPercent;
          if (Number(prev.profitPercent)) b.profitPercent = prev.profitPercent;
        }

        const changed =
          currentBudget.length !== fresh.length ||
          linkSig(currentBudget) !== linkSig(fresh);
        project.budgetItems = fresh;
        const { updated } = deriveBillRatesFromBudget(project);
        if (changed || updated > 0) {
          project.markModified("budgetItems");
          project.markModified("items");
          await project.save();
        }
      } else {
        const { linked } = backfillBudgetLinks(project.items, project.budgetItems);
        const covered = ensureBillItemCoverage(project.items, project.budgetItems);
        const grew = covered.length !== currentBudget.length;
        project.budgetItems = covered;
        const { updated } = deriveBillRatesFromBudget(project);
        if (linked > 0 || grew || updated > 0) {
          project.markModified("budgetItems");
          project.markModified("items");
          await project.save();
        }
      }
    } catch (e) {
      console.error("[get] budget heal failed:", e?.message || e);
    }

    const access = await resolveProjectAccess(req, project);
    const out = projectForClient(project, access);
    out.linkedSummaries = await resolveLinkedSummaries(project, userId, access);
    res.json(out);
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
      budgetItems,
      materialItems,
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    // Authorisation: owner or full-access collaborator may edit; view-only is
    // rejected before any mutation. Contract-lock handling below is unchanged,
    // so a full collaborator's edits respect locks exactly like the owner's.
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    // Activity snapshot: variation count before mutation, so we can tell
    // whether this save added or removed variations.
    const prevVarCount = (project.variations || []).length;
    const bodyTouchesRates =
      req.body?.items !== undefined ||
      req.body?.budgetItems !== undefined ||
      req.body?.materialItems !== undefined;

    // Snapshot bill quantities (by code) BEFORE any mutation — used by the
    // Bill → Budget cascade after save to compute which lines changed.
    const prevBillSnapshot = (project.items || []).map((it) => ({
      code: String(it?.code || ""),
      qty: safeNum(it?.qty),
    }));

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
      // Contract-lock enforcement — shared with the plugin / unified-save path so both freeze a
      // locked contract identically (see enforceContractLock above).
      const { lockedItems, extraVariations } = enforceContractLock({ project, sanitizedNext });

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

    // User-defined bill categories — additive to the canonical per-product
    // list. De-duped, trimmed, capped. Surfaced to the Bill + Budget pickers.
    if (Array.isArray(req.body?.customCategories)) {
      const seen = new Set();
      project.customCategories = req.body.customCategories
        .map((c) => String(c || "").trim().slice(0, 200))
        .filter((c) => {
          const k = c.toLowerCase();
          if (!c || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 200);
    }

    if (Array.isArray(req.body?.excludedCategories)) {
      const seen = new Set();
      project.excludedCategories = req.body.excludedCategories
        .map((c) => String(c || "").trim().slice(0, 200))
        .filter((c) => {
          const k = c.toLowerCase();
          if (!c || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 200);
    }

    if (Array.isArray(budgetItems)) {
      const budget = sanitizeBudgetItems(budgetItems);
      backfillBudgetLinks(project.items, budget);
      project.budgetItems = ensureBillItemCoverage(project.items, budget);
    }

    // Embedded budget (derived material/labour) — one revit project holds both
    // bill + budget. Partial-update safe: only replaced when sent.
    if (Array.isArray(materialItems)) {
      project.materialItems = sanitizeItems(materialItems, "revit-materials");
      // Canonicalise the breakdown into budgetItems[] too (QUIV embeds the
      // material/labour via this PUT), so the Budget tab + procurement
      // marking have one source of truth on the bill project. Link each line
      // to its bill line so material + labour bundle together. Guarded so a
      // mapping issue can never break the save.
      try {
        const budget = sanitizeBudgetItems(materialItems);
        backfillBudgetLinks(project.items, budget);
        project.budgetItems = ensureBillItemCoverage(project.items, budget);
      } catch (e) {
        console.error("[update] budget consolidation failed:", e?.message || e);
      }
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

    // Bill Rate = Material + Labour + O&P: where a bill line has a priced
    // material/labour build-up, derive its rate from the budget (no-op when
    // nothing is priced). Then derive bill % from the breakdown so valuation
    // follows procurement (no-op when basis=boq).
    deriveBillRatesFromBudget(project);
    reconcileItemsFromBudget(project);

    project.version += 1;
    await project.save();

    // ── Bill → Budget cascade (one-way) ───────────────────────────────
    // When a bill line's qty changed, scale the sibling budget (materials)
    // project's linked lines proportionally (newQty/oldQty). Rates and
    // per-unit factors stay; amount follows. Never blocks the bill save.
    let budgetCascade = null;
    try {
      const matKey = materialsSiblingKey(productKey);
      if (matKey && (project.clientProjectKey || project.modelFingerprint)) {
        const { changes, skippedZeroQty } = buildBillQtyChanges(
          prevBillSnapshot,
          project.items,
        );
        if (changes.size > 0) {
          const matProject = await TakeoffProject.findOne({
            userId,
            productKey: matKey,
            ...(project.clientProjectKey
              ? { clientProjectKey: project.clientProjectKey }
              : {}),
            ...(project.modelFingerprint
              ? { modelFingerprint: project.modelFingerprint }
              : {}),
          });
          if (matProject && Array.isArray(matProject.items) && matProject.items.length) {
            const { items: scaled, updatedLines } = cascadeBillQtyToMaterials(
              changes,
              matProject.items,
            );
            if (updatedLines > 0) {
              matProject.items = scaled;
              matProject.markModified("items");
              matProject.version += 1;
              await matProject.save();
              budgetCascade = {
                materialsProjectId: String(matProject._id),
                updatedLines,
                changedBillLines: changes.size,
                skippedZeroQty: skippedZeroQty.length,
              };
            }
          }
        }
      }
    } catch (cascadeErr) {
      console.warn("Bill→Budget cascade skipped:", cascadeErr?.message || cascadeErr);
    }

    // Activity: report variation add/remove (by count delta) and rate edits.
    const nextVarCount = (project.variations || []).length;
    if (nextVarCount > prevVarCount) {
      recordActivity(
        req,
        project,
        ACT.VARIATION_ADDED,
        `Added ${nextVarCount - prevVarCount} variation(s)`,
        { added: nextVarCount - prevVarCount, total: nextVarCount },
      );
    } else if (nextVarCount < prevVarCount) {
      recordActivity(
        req,
        project,
        ACT.VARIATION_REMOVED,
        `Removed ${prevVarCount - nextVarCount} variation(s)`,
        { removed: prevVarCount - nextVarCount, total: nextVarCount },
      );
    }
    if (bodyTouchesRates) {
      recordActivity(req, project, ACT.RATES_UPDATED, "Updated rates & valuation");
    }

    res.json({ ...projectForClient(project, access), budgetCascade });
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

    recordActivity(req, deleted, ACT.PROJECT_DELETED, "Deleted the project");
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    ).lean();
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);

    // The daily log and margins carry money. Gate on canSeeRates (owner always;
    // collaborator only with rategen). Sibling materials are resolved against
    // the OWNER's account so a collaborator's margin still reflects real cost.
    const margins = access.canSeeRates
      ? await computeMarginForProject(project, project.userId, productKey)
      : null;

    res.json({
      projectId: String(project._id),
      projectName: project.name || "Project",
      productKey,
      statusField: statusFieldForProductKey(productKey),
      statusLabel: statusLabelForProductKey(productKey),
      logs: access.canSeeRates ? buildValuationLogs(project, productKey) : [],
      margins,
      _ratesMasked: !access.canSeeRates,
      _access: {
        role: access.role,
        canEdit: access.canEdit,
        canExport: access.canExport,
        canManage: access.canManage,
        canSeeRates: access.canSeeRates,
      },
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

    const project = await TakeoffProject.findOne({
      slug,
      productKey,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    res.json(projectForClient(project, access));
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

    recordActivity(
      req,
      project,
      ACT.SHARE_TOGGLED,
      enable ? "Enabled the public dashboard link" : "Disabled the public dashboard link",
      { enabled: enable },
    );
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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
    // A 4-digit PIN is required UNLESS the request passed email step-up
    // verification — in that case the OTP is the gate and the contract locks
    // with no PIN (unlock will require the OTP again).
    if (!lockPin && !req.stepUpVerified) {
      return res.status(400).json({
        error: "A 4-digit lock PIN is required. You'll need the same PIN to unlock the contract.",
        code: "LOCK_PIN_REQUIRED",
      });
    }
    const lockPinHash = lockPin ? await bcrypt.hash(lockPin, 10) : "";

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
    recordActivity(req, project, ACT.CONTRACT_LOCKED, "Locked the contract", {
      contractSum,
    });
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    // PIN check. If the contract has a stored hash, the caller must supply
    // the matching 4-digit PIN. Contracts locked before this feature
    // shipped have an empty lockPinHash and unlock without verification —
    // back-compat for existing data, future locks will all carry a PIN.
    const storedHash = String(project.contract?.lockPinHash || "");
    // Email step-up substitutes for the PIN: a verified OTP proves identity,
    // so a PIN-protected contract can be unlocked without re-entering the PIN.
    if (storedHash && !req.stepUpVerified) {
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
    recordActivity(req, project, ACT.CONTRACT_UNLOCKED, "Unlocked the contract");
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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

    recordActivity(
      req,
      project,
      ACT.CERTIFICATE_ISSUED,
      `Issued payment certificate #${cert.number}`,
      { number: cert.number, netPayable: cert.netPayable },
    );
    res.json({
      ok: true,
      certificate: access.canSeeRates ? cert : maskCertForClient(cert),
      version: project.version,
    });
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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

    recordActivity(
      req,
      project,
      ACT.CERTIFICATE_UPDATED,
      `Updated payment certificate #${number}`,
      { number, status: cert.status },
    );
    res.json({
      ok: true,
      certificate: access.canSeeRates ? cert : maskCertForClient(cert),
      version: project.version,
    });
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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

    recordActivity(
      req,
      project,
      ACT.CERTIFICATE_DELETED,
      `Deleted payment certificate #${number}`,
      { number },
    );
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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

    recordActivity(
      req,
      project,
      ACT.FINAL_ACCOUNT_FINALIZED,
      "Finalized the final account",
      { finalContractValue, savings },
    );
    res.json({
      ok: true,
      finalAccount: access.canSeeRates
        ? project.finalAccount
        : maskFinalAccountForClient(project.finalAccount),
      version: project.version,
    });
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canExport) {
      return res.status(403).json({
        error: "View-only access cannot export this project.",
        code: "VIEW_ONLY",
      });
    }
    // Priced documents (certificate / final-account workbooks) carry rates —
    // a collaborator without an active RateGen subscription may not export them.
    if (!access.canSeeRates) {
      return res.status(403).json({
        error: "A RateGen subscription is required to export priced documents.",
        code: "RATEGEN_REQUIRED",
      });
    }

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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canExport) {
      return res.status(403).json({
        error: "View-only access cannot export this project.",
        code: "VIEW_ONLY",
      });
    }
    // Priced documents (certificate / final-account workbooks) carry rates —
    // a collaborator without an active RateGen subscription may not export them.
    if (!access.canSeeRates) {
      return res.status(403).json({
        error: "A RateGen subscription is required to export priced documents.",
        code: "RATEGEN_REQUIRED",
      });
    }

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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    // BoQ-imported projects have no BIM model behind them — the 3D-model
    // surface is withheld for this project type (the client hides the tab;
    // this is the server-side boundary).
    if (project.origin === BOQ_IMPORT_ORIGIN) {
      return res.status(403).json({
        error: "3D models are not available on BoQ-imported projects.",
        code: "BOQ_IMPORT_NO_MODEL",
      });
    }

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ── Element-ID validation gate ──────────────────────────────────────
    // The quantities for this discipline were measured from specific Revit
    // elements (item.elementIds). The uploaded model must contain every one
    // of those Element IDs, matched on the Revit Element ID written into each
    // IFC element's `Tag`. The client parses the IFC in-browser and sends the
    // Element IDs it found that belong to this project (presentElementIds);
    // we do the authoritative subset check here. Strict 100%: any missing
    // required ID ⇒ the model is wrong/stale ⇒ reject. We run this BEFORE
    // deleting/uploading so a rejected upload never disturbs an existing
    // valid model.
    const isFragUpload = String(file.originalname || "")
      .toLowerCase()
      .endsWith(".frag");

    // Element IDs the quantities for THIS discipline depend on. Derived live
    // (deriveItemDiscipline honors a persisted/explicit item.discipline, else
    // classifies) so legacy projects validate without a re-save.
    const requiredIds = new Set();
    for (const item of project.items || []) {
      if (deriveItemDiscipline(item, productKey) !== discipline) continue;
      for (const raw of item.elementIds || []) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) requiredIds.add(n);
      }
    }

    // Element IDs the client found in the IFC (pre-filtered client-side to this
    // project's element universe to keep the payload small).
    const presentSet = new Set();
    let presentParsed = null;
    try {
      presentParsed = JSON.parse(req.body?.presentElementIds || "[]");
    } catch {
      presentParsed = null;
    }
    if (Array.isArray(presentParsed)) {
      for (const raw of presentParsed) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) presentSet.add(n);
      }
    }
    const ifcElementCount = Number(req.body?.ifcElementCount) || 0;

    let validation;
    if (isFragUpload) {
      // Pre-converted fragments carry no STEP Tags — can't run the ID gate.
      validation = {
        status: "unchecked",
        requiredCount: requiredIds.size,
        matchedCount: 0,
        missingCount: 0,
        ifcElementCount,
        sampleMissingIds: [],
        checkedAt: new Date(),
      };
    } else if (requiredIds.size === 0) {
      // Nothing measured for this discipline — nothing to gate against.
      validation = {
        status: "no-quantities",
        requiredCount: 0,
        matchedCount: 0,
        missingCount: 0,
        ifcElementCount,
        sampleMissingIds: [],
        checkedAt: new Date(),
      };
    } else {
      const missing = [];
      for (const id of requiredIds) {
        if (!presentSet.has(id)) missing.push(id);
      }
      const matchedCount = requiredIds.size - missing.length;
      if (missing.length > 0) {
        // Wrong or stale model — reject. Existing model (if any) untouched.
        return res.status(422).json({
          error:
            `This ${discipline} model is missing ${missing.length} of ${requiredIds.size} ` +
            `element(s) the ${discipline} quantities were measured from. It looks like the ` +
            `wrong or an outdated model — re-export the IFC from the same Revit model (with ` +
            `Element IDs) and try again.`,
          code: "MODEL_ELEMENT_MISMATCH",
          discipline,
          requiredCount: requiredIds.size,
          matchedCount,
          missingCount: missing.length,
          ifcElementCount,
          sampleMissing: missing.slice(0, 50),
        });
      }
      validation = {
        status: "valid",
        requiredCount: requiredIds.size,
        matchedCount,
        missingCount: 0,
        ifcElementCount,
        sampleMissingIds: [],
        checkedAt: new Date(),
      };
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
      validation,
    };

    if (!project.models) project.models = {};
    project.models[discipline] = modelEntry;
    project.markModified(`models.${discipline}`);
    project.version += 1;
    await project.save();

    recordActivity(
      req,
      project,
      ACT.MODEL_UPLOADED,
      `Uploaded the ${discipline} model (${safeOriginal})`,
      { discipline, sourceFile: safeOriginal, validation: validation?.status },
    );
    res.json({
      ok: true,
      discipline,
      model: modelEntry,
      validation,
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

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

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

    recordActivity(
      req,
      project,
      ACT.MODEL_DELETED,
      `Removed the ${discipline} model`,
      { discipline },
    );
    res.json({ ok: true, version: project.version });
  } catch (err) {
    console.error("DELETE model error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Same-origin model proxy ──────────────────────────────────────────
// Streams the attached IFC/.frag back through the API so the in-browser 3D
// viewer can fetch it WITHOUT hitting R2 cross-origin (the public r2.dev URLs
// don't send CORS headers, which surfaced as "Failed to fetch" in the viewer).
async function streamProjectModel(req, res) {
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

    // Any collaborator (view or full) may STREAM the model for the in-browser
    // 3D viewer — seeing the model is core view access. The "no download"
    // restriction for view-only is enforced on the explicit xlsx export
    // endpoints, not on the viewer stream (which would break the 3D tab).
    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const model = project.models?.[discipline];
    if (!model?.key) return res.status(404).json({ error: "No model attached" });

    const { stream, contentType, contentLength } = await getR2ObjectStream(model.key);
    res.setHeader(
      "Content-Type",
      contentType ||
        (model.format === "fragments"
          ? "application/octet-stream"
          : "application/x-step"),
    );
    if (contentLength) res.setHeader("Content-Length", String(contentLength));
    res.setHeader("Cache-Control", "private, max-age=300");

    stream.on("error", (e) => {
      console.error("R2 stream error:", e?.message || e);
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    console.error("GET model file error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
}

async function reopenFinalAccount(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    if (!project.finalAccount) project.finalAccount = {};
    project.finalAccount.finalized = false;
    project.finalAccount.finalizedAt = null;
    project.version += 1;
    await project.save();

    recordActivity(req, project, ACT.FINAL_ACCOUNT_REOPENED, "Reopened the final account");
    res.json({
      ok: true,
      finalAccount: access.canSeeRates
        ? project.finalAccount
        : maskFinalAccountForClient(project.finalAccount),
      version: project.version,
    });
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

// When valuation basis = "budget", derive each bill line's % complete from
// its material/labour breakdown (budgetItems linked by billIdentity = code)
// and write it onto the BoQ item, so the existing valuation engine,
// certificates and EVM all read one consistent source. No-op (and existing
// behaviour preserved) when basis = "boq". Fully guarded.
function reconcileItemsFromBudget(project) {
  try {
    if (!project || project?.valuationSettings?.basis !== "budget") return;
    const budget = Array.isArray(project.budgetItems)
      ? project.budgetItems
      : [];
    if (!budget.length) return;
    const byCode = new Map();
    for (const b of budget) {
      const code = String(b.billIdentity || "").trim().toLowerCase();
      if (!code) continue;
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(b);
    }
    for (const it of project.items || []) {
      const code = String(it.code || "").trim().toLowerCase();
      const comps = code ? byCode.get(code) : null;
      if (!comps || !comps.length) continue;
      let totalVal = 0;
      let doneVal = 0;
      for (const c of comps) {
        const unit = Number(c.netUnitCost) || Number(c.rate) || 0;
        const val = (Number(c.qty) || 0) * unit;
        const f = c.procured
          ? 1
          : Math.max(0, Math.min(100, Number(c.procuredPercent) || 0)) / 100;
        totalVal += val;
        doneVal += val * f;
      }
      let pct;
      if (totalVal > 0) {
        pct = (doneVal / totalVal) * 100;
      } else {
        // Cost-less components (e.g. labour with no rate): fall back to a
        // simple count of procured lines so the line still progresses.
        const done = comps.filter(
          (c) => c.procured || (Number(c.procuredPercent) || 0) >= 100,
        ).length;
        pct = comps.length ? (done / comps.length) * 100 : 0;
      }
      it.percentComplete = Math.round(pct * 100) / 100;
      it.completed = pct >= 99.999;
      if (it.completed && !it.completedAt) it.completedAt = new Date();
      if (!it.completed) it.completedAt = null;
    }
    project.markModified("items");
  } catch (e) {
    console.error("reconcileItemsFromBudget failed:", e?.message || e);
  }
}

// Persist procurement marking on the budget breakdown. When basis = "budget"
// it also derives the bill lines' % from the breakdown (reconcile) so the
// valuation figures follow procurement. Bumps the version.
async function markBudget(req, res) {
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
    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, productKey),
    );
    if (!project) return res.status(404).json({ error: "Not found" });

    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    const body = req.body || {};
    if (!Array.isArray(body.budgetItems)) {
      return res.status(400).json({ error: "budgetItems array required" });
    }
    if (
      body.baseVersion !== undefined &&
      Number(body.baseVersion) !== Number(project.version)
    ) {
      return res
        .status(409)
        .json({ error: "Version conflict", version: project.version });
    }

    const budget = sanitizeBudgetItems(body.budgetItems);
    backfillBudgetLinks(project.items, budget);
    project.budgetItems = ensureBillItemCoverage(project.items, budget);
    // Pricing edits on the Budget tab flow up: derive the bill rates from the
    // build-up, then reconcile progress.
    deriveBillRatesFromBudget(project);
    reconcileItemsFromBudget(project);
    project.version = (Number(project.version) || 0) + 1;
    await project.save();
    recordActivity(req, project, ACT.BUDGET_UPDATED, "Updated the budget & procurement", {
      lineCount: budget.length,
    });
    return res.json(projectForClient(project, access));
  } catch (err) {
    console.error("markBudget error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ── BoQ Import (Quiv) handlers ───────────────────────────────────────────

// Imported actuals must carry provenance dates, otherwise sanitizeItems'
// plugin quirk-detection (rate 0 + actualRate set + no actualRecordedAt →
// promote actualRate to rate) would eat genuine actual-vs-planned data.
function stampImportedActuals(items) {
  const now = new Date();
  for (const it of items) {
    if (it.actualQty != null || it.actualRate != null) {
      it.actualRecordedAt = now;
      it.actualUpdatedAt = now;
    }
  }
}

// Link the imported Material & Labour schedule to the bill, guarantee every
// bill line has budget coverage (the coverage engine auto-generates rows when
// the workbook came without a schedule), then derive live bill rates from the
// build-up and reconcile progress — the same pipeline plugin saves run.
function runBoqImportBudgetPipeline(project, budget) {
  backfillBudgetLinks(project.items, budget);
  project.budgetItems = ensureBillItemCoverage(project.items, budget);
  deriveBillRatesFromBudget(project);
  reconcileItemsFromBudget(project);
}

async function importBoqCreate(req, res) {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }
    if (!req.file?.buffer) {
      return res
        .status(400)
        .json({ error: "Excel file required (multipart field: file)" });
    }

    const parsed = await parseBoqWorkbook(req.file.buffer);
    const fallbackName = String(req.file.originalname || "")
      .replace(/\.[^.]+$/, "")
      .trim();
    const name =
      String(req.body?.name || "").trim() || fallbackName || "Imported BoQ";

    const productKey = "revit";
    await assertWithinProjectLimit(userId, productKey);

    stampImportedActuals(parsed.items);
    const tracked = applyValuationTracking({
      productKey,
      previousItems: [],
      nextItems: sanitizeItems(parsed.items, productKey),
      previousEvents: [],
    });

    const baseSlug = generateSlug(name);
    const slug = await uniqueSlug(userId, productKey, baseSlug);

    const project = await TakeoffProject.create({
      userId,
      productKey,
      name,
      slug,
      origin: BOQ_IMPORT_ORIGIN,
      items: tracked.items,
      valuationEvents: tracked.valuationEvents,
      customCategories: parsed.categories,
    });

    runBoqImportBudgetPipeline(project, sanitizeBudgetItems(parsed.budgetItems));
    await project.save();

    recordActivity(
      req,
      project,
      ACT.PROJECT_CREATED,
      "Created the project from an Excel BoQ import",
      {
        itemCount: (project.items || []).length,
        budgetLineCount: (project.budgetItems || []).length,
        source: BOQ_IMPORT_ORIGIN,
      },
    );

    return res.json({
      ...projectForClient(project),
      _importWarnings: parsed.warnings || [],
    });
  } catch (err) {
    if (err?.code === "PROJECT_LIMIT") {
      return res.status(403).json({
        error: err.message,
        code: "PROJECT_LIMIT",
        storageLimit: err.storageLimit || null,
      });
    }
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error("importBoqCreate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Re-import: refresh a BoQ-imported project from a newer copy of the workbook
// (updated actual columns, added lines/categories). The bill is replaced
// through applyValuationTracking so completion/actual history and the daily
// valuation log stay coherent; procurement marks on matching budget rows are
// preserved.
async function importBoqUpdate(req, res) {
  try {
    const userId = getUserObjectId(req);
    if (!userId) {
      return res.status(401).json({ error: "Invalid user id in token" });
    }
    const id = String(req.params.id || "").trim();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (!req.file?.buffer) {
      return res
        .status(400)
        .json({ error: "Excel file required (multipart field: file)" });
    }

    const project = await TakeoffProject.findOne(
      accessFilter(id, userId, "revit"),
    );
    if (!project) return res.status(404).json({ error: "Not found" });
    if (project.origin !== BOQ_IMPORT_ORIGIN) {
      return res.status(400).json({
        error: "Only BoQ-imported projects can be updated from Excel.",
        code: "NOT_BOQ_IMPORT",
      });
    }
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({
        error: "View-only access cannot edit this project.",
        code: "VIEW_ONLY",
      });
    }

    const parsed = await parseBoqWorkbook(req.file.buffer);
    stampImportedActuals(parsed.items);

    const tracked = applyValuationTracking({
      productKey: "revit",
      previousItems: project.items,
      nextItems: sanitizeItems(parsed.items, "revit"),
      previousEvents: project.valuationEvents,
    });
    project.items = tracked.items;
    project.valuationEvents = tracked.valuationEvents;

    // Merge any newly-named categories into the project's custom list.
    const haveCategories = new Set(
      (project.customCategories || []).map((c) => String(c).toLowerCase()),
    );
    for (const c of parsed.categories || []) {
      if (!haveCategories.has(c.toLowerCase())) {
        project.customCategories.push(c);
        haveCategories.add(c.toLowerCase());
      }
    }

    let budget;
    if ((parsed.budgetItems || []).length) {
      budget = sanitizeBudgetItems(parsed.budgetItems);
      // Carry procurement state over from the existing plan so a re-import
      // never un-buys material the QS already marked procured.
      const budgetKey = (b) =>
        [b.billIdentity, b.description, b.componentKind, b.unit]
          .map((v) => String(v || "").trim().toLowerCase())
          .join("|");
      const prevByKey = new Map(
        (project.budgetItems || []).map((b) => [budgetKey(b), b]),
      );
      for (const b of budget) {
        const prev = prevByKey.get(budgetKey(b));
        if (!prev) continue;
        b.procured = prev.procured;
        b.procuredAt = prev.procuredAt;
        b.procuredPercent = prev.procuredPercent;
        b.targetDate = prev.targetDate;
        b.supplier = prev.supplier;
        if (!b.notes) b.notes = prev.notes;
      }
    } else {
      // Workbook came without a Material & Labour sheet — keep the current
      // budget plan and just re-link/heal it against the refreshed bill.
      budget = project.budgetItems;
    }

    runBoqImportBudgetPipeline(project, budget);
    project.version = (Number(project.version) || 0) + 1;
    await project.save();

    recordActivity(
      req,
      project,
      ACT.BOQ_REIMPORTED,
      "Updated the project from an Excel BoQ re-import",
      {
        itemCount: (project.items || []).length,
        budgetLineCount: (project.budgetItems || []).length,
        source: BOQ_IMPORT_ORIGIN,
      },
    );

    return res.json({
      ...projectForClient(project, access),
      _importWarnings: parsed.warnings || [],
    });
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error("importBoqUpdate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function downloadBoqImportTemplate(_req, res) {
  try {
    const wb = buildBoqTemplateWorkbook();
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="adlm-boq-import-template.xlsx"',
    );
    return res.send(Buffer.from(buf));
  } catch (err) {
    console.error("downloadBoqImportTemplate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ── Collaborator share codes ─────────────────────────────────────────────
// Crockford-ish alphabet (no I/L/O/0/1/U) — readable + typeable. The code is
// shown grouped (XXXXX-XXXXX); the stored hash is over the normalized form
// (uppercased, separators stripped) so casing/spacing on entry never matters.
const SHARE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function generateShareCode() {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

function normalizeShareCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseAllowedEmails(input) {
  const arr = Array.isArray(input)
    ? input
    : String(input || "").split(/[,\s;]+/);
  return [...new Set(arr.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
}

// Owner-only guard shared by the collab-management handlers. Loads the project
// via accessFilter (so a stray collaborator 404s the same as a stranger) and
// rejects anyone who is not the owner.
async function loadOwnedProject(req, res) {
  const productKey = requestedProductKey(req);
  const id = String(req.params.id || "").trim();
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const userId = getUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid user id" });
    return null;
  }
  const project = await TakeoffProject.findOne(
    accessFilter(id, userId, productKey),
  );
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  const access = await resolveProjectAccess(req, project);
  if (!access.canManage) {
    res.status(403).json({
      error: "Only the project owner can manage sharing.",
      code: "OWNER_ONLY",
    });
    return null;
  }
  return { project, userId };
}

// POST /:productKey/:id/collab/codes — owner generates a share code.
async function createShareCode(req, res) {
  try {
    const owned = await loadOwnedProject(req, res);
    if (!owned) return;
    const { project, userId } = owned;

    const accessLevel =
      String(req.body?.accessLevel || "view").toLowerCase() === "full"
        ? "full"
        : "view";
    const label = String(req.body?.label || "").trim().slice(0, 80);
    const maxUses = Math.max(parseInt(req.body?.maxUses, 10) || 0, 0);
    const allowedEmails = parseAllowedEmails(req.body?.allowedEmails);

    const code = generateShareCode();
    const norm = normalizeShareCode(code);
    project.shareCodes.push({
      codeHash: sha256Hex(norm),
      codeLast4: norm.slice(-4),
      codePlain: code,
      accessLevel,
      label,
      allowedEmails,
      maxUses,
      uses: 0,
      revoked: false,
      createdBy: userId,
    });
    await project.save();

    recordActivity(req, project, ACT.SHARE_TOGGLED, `Created a ${accessLevel} share code`, {
      accessLevel,
      label,
    });
    const created = project.shareCodes[project.shareCodes.length - 1];
    return res.json({
      ok: true,
      code, // shown once; also re-copyable via listCollab (codePlain)
      codeId: String(created._id),
      accessLevel,
      label,
      allowedEmails,
      maxUses,
    });
  } catch (err) {
    console.error("create share code error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// GET /:productKey/:id/collab — owner lists collaborators + active codes.
async function listCollab(req, res) {
  try {
    const owned = await loadOwnedProject(req, res);
    if (!owned) return;
    const { project } = owned;

    const collaborators = (project.collaborators || []).map((c) => ({
      userId: String(c.userId),
      email: c.email || "",
      accessLevel: c.accessLevel,
      addedAt: c.addedAt,
    }));
    const codes = (project.shareCodes || [])
      .filter((c) => !c.revoked)
      .map((c) => ({
        id: String(c._id),
        codePlain: c.codePlain || "",
        codeLast4: c.codeLast4 || "",
        accessLevel: c.accessLevel,
        label: c.label || "",
        allowedEmails: c.allowedEmails || [],
        maxUses: c.maxUses || 0,
        uses: c.uses || 0,
        createdAt: c.createdAt,
      }));
    return res.json({ ok: true, collaborators, codes });
  } catch (err) {
    console.error("list collab error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// PATCH /:productKey/:id/collab/:userId — owner changes a collaborator's level.
async function updateCollabLevel(req, res) {
  try {
    const targetUserId = String(req.params.userId || "").trim();
    if (!isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const owned = await loadOwnedProject(req, res);
    if (!owned) return;
    const { project } = owned;

    const accessLevel =
      String(req.body?.accessLevel || "").toLowerCase() === "full"
        ? "full"
        : "view";
    const collab = (project.collaborators || []).find(
      (c) => String(c.userId) === targetUserId,
    );
    if (!collab) return res.status(404).json({ error: "Collaborator not found" });
    collab.accessLevel = accessLevel;
    await project.save();
    recordActivity(
      req,
      project,
      ACT.COLLABORATOR_ADDED,
      `Changed ${collab.email || "a collaborator"}'s access to ${accessLevel}`,
      { email: collab.email || "", accessLevel },
    );
    return res.json({ ok: true, userId: targetUserId, accessLevel });
  } catch (err) {
    console.error("update collab level error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// DELETE /:productKey/:id/collab/:userId — owner removes a collaborator.
async function removeCollab(req, res) {
  try {
    const targetUserId = String(req.params.userId || "").trim();
    if (!isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const owned = await loadOwnedProject(req, res);
    if (!owned) return;
    const { project } = owned;

    const before = (project.collaborators || []).length;
    const removed = (project.collaborators || []).find(
      (c) => String(c.userId) === targetUserId,
    );
    project.collaborators = (project.collaborators || []).filter(
      (c) => String(c.userId) !== targetUserId,
    );
    if (project.collaborators.length === before) {
      return res.status(404).json({ error: "Collaborator not found" });
    }
    await project.save();
    recordActivity(
      req,
      project,
      ACT.COLLABORATOR_REMOVED,
      `Removed ${removed?.email || "a collaborator"} from the project`,
      { email: removed?.email || "" },
    );
    return res.json({ ok: true, userId: targetUserId });
  } catch (err) {
    console.error("remove collab error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// DELETE /:productKey/:id/collab/codes/:codeId — owner revokes a share code.
// Revoke (not delete) so existing collaborators who joined via it are
// unaffected and the row stays for audit.
async function revokeCode(req, res) {
  try {
    const codeId = String(req.params.codeId || "").trim();
    if (!isValidObjectId(codeId)) {
      return res.status(400).json({ error: "Invalid code id" });
    }
    const owned = await loadOwnedProject(req, res);
    if (!owned) return;
    const { project } = owned;

    const sc = (project.shareCodes || []).find((c) => String(c._id) === codeId);
    if (!sc) return res.status(404).json({ error: "Code not found" });
    sc.revoked = true;
    await project.save();
    return res.json({ ok: true, codeId });
  } catch (err) {
    console.error("revoke code error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// POST /claim — a colleague redeems a share code to join a project. NOT
// productKey-scoped (we look the project up by code), so it carries no
// entitlement middleware — the plugin gate is enforced inline (block-with-
// upsell) before the collaborator is added.
async function claimProject(req, res) {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const norm = normalizeShareCode(req.body?.code);
    if (!norm) return res.status(400).json({ error: "Share code required" });
    const codeHash = sha256Hex(norm);

    const project = await TakeoffProject.findOne({
      "shareCodes.codeHash": codeHash,
    });
    if (!project) return res.status(404).json({ error: "Invalid or expired code" });

    const sc = (project.shareCodes || []).find(
      (c) => c.codeHash === codeHash && !c.revoked,
    );
    if (!sc) {
      return res.status(403).json({ error: "This share code has been revoked." });
    }
    if (sc.maxUses > 0 && sc.uses >= sc.maxUses) {
      return res
        .status(403)
        .json({ error: "This share code has reached its use limit." });
    }

    const myEmail = String(req.user?.email || "").trim().toLowerCase();
    if (
      Array.isArray(sc.allowedEmails) &&
      sc.allowedEmails.length &&
      !sc.allowedEmails.includes(myEmail)
    ) {
      return res.status(403).json({
        error: "This share code is restricted to specific email addresses.",
      });
    }

    // Owner can't claim their own project.
    if (project.userId && userId.equals(project.userId)) {
      return res.status(400).json({ error: "You already own this project." });
    }

    const level = sc.accessLevel === "full" ? "full" : "view";

    // Already a collaborator → idempotent success (don't add twice).
    const existing = (project.collaborators || []).find(
      (c) => c.userId && userId.equals(c.userId),
    );
    if (existing) {
      return res.json({
        ok: true,
        alreadyMember: true,
        projectId: String(project._id),
        productKey: project.productKey,
        slug: project.slug || null,
        accessLevel: existing.accessLevel,
      });
    }

    // PLUGIN GATE (block-with-upsell): the colleague must hold an active
    // entitlement for the project's own product before they can open it.
    const reqKey = entitlementKeyFor(project.productKey);
    const hasIt = await userHasActiveEntitlement(userId, reqKey);
    if (!hasIt) {
      let productName = reqKey;
      try {
        const prod = await Product.findOne({ key: reqKey }).select("name").lean();
        if (prod?.name) productName = prod.name;
      } catch {
        /* fall back to the key */
      }
      return res.status(403).json({
        error: `You need an active ${productName} subscription to open this shared project.`,
        code: "ENTITLEMENT_REQUIRED",
        requiredProductKey: reqKey,
        productName,
      });
    }

    project.collaborators.push({
      userId,
      email: myEmail,
      accessLevel: level,
      addedViaCode: sc._id,
    });
    sc.uses = (sc.uses || 0) + 1;
    await project.save();

    // Actor = the joining colleague; owner = project.userId. Surfaces on the
    // owner's feed as "<email> joined … (full/view)".
    recordActivity(
      req,
      project,
      ACT.COLLABORATOR_CLAIMED,
      `${myEmail || "A collaborator"} joined the project (${level} access)`,
      { email: myEmail || "", accessLevel: level },
    );
    return res.json({
      ok: true,
      projectId: String(project._id),
      productKey: project.productKey,
      slug: project.slug || null,
      accessLevel: level,
    });
  } catch (err) {
    console.error("claim project error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// §6 unified save — must precede the generic "/:productKey" routes so
// "/revit/full" isn't swallowed by a single-segment match.
// Price every bill line of a (services) project from RateGen: resolve material
// + labour rates, run the shared services build-up, write the result as
// budgetItems, then derive each bill line's rate from that build-up. Makes the
// MEP total real (and the P1 linked total show money) with no plugin release.
async function priceServicesProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const userId = getUserObjectId(req);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });

    const project = await TakeoffProject.findOne(accessFilter(id, userId, productKey));
    if (!project) return res.status(404).json({ error: "Not found" });
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit) {
      return res.status(403).json({ error: "You do not have edit access to this project" });
    }

    const items = Array.isArray(project.items) ? project.items : [];
    if (!items.length) return res.status(400).json({ error: "No items to price" });

    const defOverhead = safeNum(req.body?.overheadPercent);
    const defProfit = safeNum(req.body?.profitPercent);

    // Map each bill line to a service-compute input (resolve rates by its
    // description; infer the service type for the bundle/connector constants).
    const inputs = items.map((it) => ({
      type: mapServiceType(it),
      description: it.description || it.takeoffLine || "",
      qty: safeNum(it.qty),
      unit: it.unit || "",
      materialName: it.materialName || it.description || it.takeoffLine || "",
      labourName: it.description || it.takeoffLine || "",
      overheadPercent: safeNum(it.overheadPercent) || defOverhead,
      profitPercent: safeNum(it.profitPercent) || defProfit,
    }));

    const { items: priced } = await priceServiceItems(userId, inputs);

    // Build budgetItems from the per-item build-up lines, keyed to the bill line
    // by code (billIdentity). deriveBillRatesFromBudget then sets each line's
    // rate from the priced build-up.
    const budgetItems = [];
    let pricedLines = 0;
    items.forEach((it, i) => {
      const p = priced[i];
      const lines = p?.buildup?.lines || [];
      if (!lines.length) return;
      const billIdentity = String(it.code || "").trim();
      if (!billIdentity) return; // can't link without a stable code
      const oh = safeNum(it.overheadPercent) || defOverhead;
      const pr = safeNum(it.profitPercent) || defProfit;
      for (const line of lines) {
        budgetItems.push({
          billIdentity,
          sn: safeNum(it.sn),
          description: line.description || "",
          materialName: line.componentKind === "Material" ? line.description || "" : "",
          componentKind: line.componentKind,
          unit: line.unit || "",
          qty: safeNum(line.qty),
          rate: safeNum(line.rate),
          overheadPercent: oh,
          profitPercent: pr,
        });
        pricedLines += 1;
      }
    });

    project.budgetItems = budgetItems;
    const { updated } = deriveBillRatesFromBudget(project);
    reconcileItemsFromBudget(project);
    project.markModified("budgetItems");
    project.markModified("items");
    await project.save();

    const out = projectForClient(project, access);
    out.linkedSummaries = await resolveLinkedSummaries(project, userId, access);
    out._servicesPriced = { budgetLines: pricedLines, billLinesUpdated: updated };
    res.json(out);
  } catch (err) {
    console.error("priceServicesProject error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── Cross-project link handlers (MEP services → architectural bill) ────────
async function addLinkedProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const userId = getUserObjectId(req);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });
    // Only QUIV/HERON (architectural) projects can have services linked in.
    if (!["revit", "planswift"].includes(productKey)) {
      return res
        .status(400)
        .json({ error: "Linking is only available on QUIV/HERON projects" });
    }

    const targetId = String(req.body?.targetProjectId || "").trim();
    if (!isValidObjectId(targetId))
      return res.status(400).json({ error: "targetProjectId required" });
    if (targetId === id)
      return res.status(400).json({ error: "A project cannot be linked to itself" });

    const project = await TakeoffProject.findOne(accessFilter(id, userId, productKey));
    if (!project) return res.status(404).json({ error: "Not found" });
    // Linking merges by model elements — meaningless for BoQ-imported
    // projects, which have no model behind them. Feature is withheld.
    if (project.origin === BOQ_IMPORT_ORIGIN) {
      return res.status(403).json({
        error: "Project linking is not available on BoQ-imported projects.",
        code: "BOQ_IMPORT_NO_LINKING",
      });
    }
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit)
      return res.status(403).json({ error: "You do not have edit access to this project" });

    // Only the user's OWN MEP project may be linked — never another user's, and
    // only MEP (services) projects can be merged into a QUIV/HERON bill.
    const target = await TakeoffProject.findOne({
      _id: targetId,
      userId,
      productKey: "mep",
    });
    if (!target)
      return res
        .status(404)
        .json({ error: "You can only link an MEP project that you own" });

    project.linkedProjects = Array.isArray(project.linkedProjects)
      ? project.linkedProjects
      : [];
    if (project.linkedProjects.some((l) => String(l.projectId) === targetId))
      return res.status(409).json({ error: "That project is already linked" });

    project.linkedProjects.push({
      projectId: target._id,
      productKey: target.productKey || "",
      label: String(req.body?.label || target.name || "").trim(),
      linkType: "sum",
      snapshot: { ...computeProjectRollup(target), takenAt: new Date() },
      addedAt: new Date(),
      addedBy: userId,
    });
    project.markModified("linkedProjects");
    await project.save();

    const out = projectForClient(project, access);
    out.linkedSummaries = await resolveLinkedSummaries(project, userId, access);
    res.json(out);
  } catch (err) {
    console.error("addLinkedProject error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function removeLinkedProject(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const linkId = String(req.params.linkId || "").trim();
    const userId = getUserObjectId(req);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });

    const project = await TakeoffProject.findOne(accessFilter(id, userId, productKey));
    if (!project) return res.status(404).json({ error: "Not found" });
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit)
      return res.status(403).json({ error: "You do not have edit access to this project" });

    const before = (project.linkedProjects || []).length;
    project.linkedProjects = (project.linkedProjects || []).filter(
      (l) => String(l._id) !== linkId && String(l.projectId) !== linkId,
    );
    if (project.linkedProjects.length === before)
      return res.status(404).json({ error: "Link not found" });
    project.markModified("linkedProjects");
    await project.save();

    const out = projectForClient(project, access);
    out.linkedSummaries = await resolveLinkedSummaries(project, userId, access);
    res.json(out);
  } catch (err) {
    console.error("removeLinkedProject error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function refreshLinkedProjectSnapshot(req, res) {
  try {
    const productKey = requestedProductKey(req);
    const id = String(req.params.id || "").trim();
    const linkId = String(req.params.linkId || "").trim();
    const userId = getUserObjectId(req);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });

    const project = await TakeoffProject.findOne(accessFilter(id, userId, productKey));
    if (!project) return res.status(404).json({ error: "Not found" });
    const access = await resolveProjectAccess(req, project);
    if (!access.canEdit)
      return res.status(403).json({ error: "You do not have edit access to this project" });

    const link = (project.linkedProjects || []).find((l) => String(l._id) === linkId);
    if (!link) return res.status(404).json({ error: "Link not found" });

    const target = await TakeoffProject.findOne({
      _id: link.projectId,
      userId,
      productKey: "mep",
    });
    if (!target)
      return res.status(404).json({ error: "Linked project not accessible" });

    link.snapshot = { ...computeProjectRollup(target), takenAt: new Date() };
    project.markModified("linkedProjects");
    await project.save();

    const out = projectForClient(project, access);
    out.linkedSummaries = await resolveLinkedSummaries(project, userId, access);
    res.json(out);
  } catch (err) {
    console.error("refreshLinkedProjectSnapshot error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// Candidates to link INTO a QUIV/HERON project: the requester's OWN MEP
// projects only (never another user's), newest first, excluding this project.
async function listLinkCandidates(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id in token" });

    const docs = await TakeoffProject.find({ userId, productKey: "mep" })
      .select(
        "name productKey updatedAt items provisionalSums variations contract.contractSum contract.locked version",
      )
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    const candidates = docs
      .filter((d) => String(d._id) !== id)
      .map((d) => ({
        projectId: String(d._id),
        name: d.name || "",
        productKey: d.productKey || "",
        total: computeProjectRollup(d).total,
        updatedAt: d.updatedAt || null,
      }));
    res.json({ ok: true, candidates });
  } catch (err) {
    console.error("listLinkCandidates error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── BoQ Import (Quiv) routes ──
// Gated on the admin-granted quiv-boq-import entitlement (NOT the revit
// licence) — the grant IS the feature. Registered before the generic
// /:productKey routes so "import-boq" is never captured as an :id.
router.get(
  "/revit/import-boq/template",
  requireEntitlement(BOQ_IMPORT_ENTITLEMENT),
  downloadBoqImportTemplate,
);

router.post(
  "/revit/import-boq",
  requireEntitlement(BOQ_IMPORT_ENTITLEMENT),
  boqImportUpload.single("file"),
  importBoqCreate,
);

router.put(
  "/revit/:id/import-boq",
  requireEntitlement(BOQ_IMPORT_ENTITLEMENT),
  boqImportUpload.single("file"),
  importBoqUpdate,
);

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

// PlanSwift unified save (HERON): one call persists the bill + budget, linked.
// Must precede the generic "/:productKey" routes so it isn't swallowed.
router.post(
  "/planswift/full",
  forcePsFullProductKey,
  requireEntitlementParam,
  saveProjectFull,
);

router.put(
  "/planswift/full",
  forcePsFullProductKey,
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
  requireStepUp,
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
  requireStepUp,
  deleteProject,
);

/* ── MEP (building services) routes ── */
// Unified save — mirrors revit/full & planswift/full. Backward-compatible: an
// in-the-wild MEP plugin still sending rate:0 with no materialItems simply
// saves a bill with no budget (deriveBillRates leaves unpriced lines untouched),
// so existing MEP users never break.
router.post(
  "/mep/full",
  forceMepFullProductKey,
  requireEntitlementParam,
  saveProjectFull,
);

router.put(
  "/mep/full",
  forceMepFullProductKey,
  requireEntitlementParam,
  saveProjectFull,
);

router.post(
  "/mep/materials",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  createProject,
);

router.get(
  "/mep/materials",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  listProjects,
);

router.get(
  "/mep/materials/:id/valuations",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  getProjectValuations,
);

router.get(
  "/mep/materials/:id",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  getProject,
);

router.put(
  "/mep/materials/:id",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  updateProject,
);

router.delete(
  "/mep/materials/:id",
  forceMepMaterialsProductKey,
  requireEntitlementParam,
  requireStepUp,
  deleteProject,
);

// Claim a shared project by code. MUST precede "/:productKey" so "claim" is
// not captured as a product key. Auth-only (router.use(requireAuth)); the
// plugin entitlement is enforced inside claimProject (block-with-upsell).
router.post("/claim", claimProject);

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

// ── Collaborator management (owner only; each handler re-checks canManage) ──
// More-specific "/collab/codes/:codeId" is registered before "/collab/:userId"
// so "codes" is never captured as a :userId.
router.post(
  "/:productKey/:id/collab/codes",
  mapEntitlementParam,
  requireEntitlementParam,
  createShareCode,
);

router.get(
  "/:productKey/:id/collab",
  mapEntitlementParam,
  requireEntitlementParam,
  listCollab,
);

router.delete(
  "/:productKey/:id/collab/codes/:codeId",
  mapEntitlementParam,
  requireEntitlementParam,
  revokeCode,
);

router.patch(
  "/:productKey/:id/collab/:userId",
  mapEntitlementParam,
  requireEntitlementParam,
  updateCollabLevel,
);

router.delete(
  "/:productKey/:id/collab/:userId",
  mapEntitlementParam,
  requireEntitlementParam,
  removeCollab,
);

router.put(
  "/:productKey/:id/budget",
  mapEntitlementParam,
  requireEntitlementParam,
  markBudget,
);

// Price all services bill lines from RateGen (MEP web Budget view).
router.post(
  "/:productKey/:id/services/price",
  mapEntitlementParam,
  requireEntitlementParam,
  priceServicesProject,
);

// ── Cross-project links (MEP services → architectural bill) ──
router.get(
  "/:productKey/:id/linked-candidates",
  mapEntitlementParam,
  requireEntitlementParam,
  listLinkCandidates,
);

router.post(
  "/:productKey/:id/linked-projects",
  mapEntitlementParam,
  requireEntitlementParam,
  addLinkedProject,
);

router.post(
  "/:productKey/:id/linked-projects/:linkId/refresh",
  mapEntitlementParam,
  requireEntitlementParam,
  refreshLinkedProjectSnapshot,
);

router.delete(
  "/:productKey/:id/linked-projects/:linkId",
  mapEntitlementParam,
  requireEntitlementParam,
  removeLinkedProject,
);

router.post(
  "/:productKey/:id/contract/lock",
  mapEntitlementParam,
  requireEntitlementParam,
  requireStepUp,
  lockContract,
);

router.post(
  "/:productKey/:id/contract/unlock",
  mapEntitlementParam,
  requireEntitlementParam,
  requireStepUp,
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

// Same-origin proxy so the 3D viewer can fetch the IFC without R2 CORS issues.
router.get(
  "/:productKey/:id/models/:discipline/file",
  mapEntitlementParam,
  requireEntitlementParam,
  streamProjectModel,
);

// Storage info for a product — must be before /:productKey/:id so "storage"
// is not captured as an :id.
router.get(
  "/:productKey/storage",
  mapEntitlementParam,
  requireEntitlementParam,
  getProjectStorageInfo,
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
  requireStepUp,
  deleteProject,
);

export default router;



