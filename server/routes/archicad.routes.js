// server/routes/archicad.routes.js
//
// QUIV for ArchiCAD — all /api/archicad/ endpoints per
// quiv-archicad/api-contract.md. Projects are TakeoffProject documents with
// productKey "archicad"; costed BoQ versions live in ArchicadBoqVersion (the
// isCurrent:true version IS the current BoQ — see models/ArchicadBoqVersion.js
// for the storage rationale). Extraction payloads are large; the global
// express.json limit in index.js is already 16mb, which covers these routes.

import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { ArchicadBoqVersion } from "../models/ArchicadBoqVersion.js";
import { User } from "../models/User.js";
import { resolveProjectAccess, entitlementIsActive } from "../util/projectAccess.js";
import { maskArchicadMoney } from "../util/archicadMask.js";
import { ownerAllowsMoney } from "../util/ownerMoney.js";
import { archicadMoneyBlocked } from "../util/archicadMoney.js";
import {
  loadRateCandidates,
  costBoqLines,
  computeChangedLineRefs,
  applyMarginToLine,
  buildCategories,
  buildTotals,
  DEFAULT_CURRENCY,
} from "../services/archicadCosting.js";
import {
  exportArchicadBoqXlsx,
  streamArchicadBoqPdf,
} from "../util/archicadBoqExporter.js";
import {
  archicadMoneyAccess,
  archicadMoneyBlocked,
  maskArchicadBoqDocument,
  maskArchicadLine,
} from "../util/archicadMoney.js";
import { readerMaySeeRates } from "../util/sharedMoney.js";

const router = express.Router();
router.use(requireAuth); // nothing on this surface is public

const PRODUCT_KEY = "archicad";

/* ─────────────────────────── helpers ─────────────────────────── */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

// Owner-or-collaborator read filter (mirrors projects.js accessFilter).
function accessFilter(id, userId) {
  return {
    _id: id,
    productKey: PRODUCT_KEY,
    $or: [{ userId }, { "collaborators.userId": userId }],
  };
}

function preparedByName(req) {
  const u = req.user || {};
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.username || u.email || "";
}

function publicShareUrl(token) {
  const base = (
    process.env.PUBLIC_WEB_URL ||
    process.env.CLIENT_URL ||
    "https://www.adlmstudio.net"
  ).replace(/\/$/, "");
  return `${base}/projects/shared/${token}`;
}

function shareInfo(project) {
  const enabled = !!project.publicShareEnabled && !!project.publicToken;
  return { enabled, url: enabled ? publicShareUrl(project.publicToken) : null };
}

// Contract BoQ document shape.
function buildBoqDocument(project, version) {
  return {
    projectId: String(project._id),
    slug: project.slug || "",
    projectName: project.name,
    versionId: String(version._id),
    versionNumber: version.versionNumber,
    extractedAt: version.extractedAt,
    modelVersion: version.modelVersion || "",
    currency: version.currency || DEFAULT_CURRENCY,
    lines: version.lines || [],
    categories: version.categories || [],
    totals: version.totals || {},
    issues: version.issues || [],
    changedLineRefs: version.changedLineRefs || [],
    targetBudget: toNum(project.projectManagement?.budgetOverride),
    share: shareInfo(project),
    // Read-only learning sample: the page shows the banner and no edit controls.
    isSample: !!project.isSample,
    sample: project.isSample ? project.sample || {} : null,
  };
}

// Lossy ItemSchema mapping of the costed lines onto the project so the
// existing PM / valuation / public-dashboard surfaces work for archicad
// projects. ItemSchema.elementIds is [Number] (Revit ids) so ArchiCAD GUIDs
// are NOT stored here — they live on the ArchicadBoqVersion lines.
function embedLinesOnProject(project, lines) {
  project.items = (lines || []).map((l, i) => ({
    sn: i + 1,
    qty: toNum(l.quantity),
    unit: l.unit || "",
    rate: toNum(l.unitRate),
    description: l.description || "",
    code: l.itemRef || "",
    category: l.categoryTitle || l.category || "",
    trade: l.categoryTitle || l.category || "",
    type: l.quivType || "",
    discipline: "architectural",
    netUnitCost: toNum(l.netUnitCost) || null,
    overheadPercent: toNum(l.overheadPercent) || null,
    profitPercent: toNum(l.profitPercent) || null,
  }));
  project.version = (Number(project.version) || 0) + 1;
}

function generateSlug(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "project"
  );
}

async function uniqueSlug(userId, baseSlug) {
  let slug = baseSlug;
  let counter = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await TakeoffProject.findOne({
      userId,
      productKey: PRODUCT_KEY,
      slug,
    })
      .select("_id")
      .lean();
    if (!clash) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

function generatePublicToken() {
  // 8 bytes = 16 hex chars — same posture as projects.js.
  return Array.from(
    { length: 16 },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
}

// A project is addressed by its id (the connector) or its slug (the web, so
// the database id never has to sit in an address bar). A slug is unique per
// owner, so for a slug the caller's own project wins over one shared with
// them, then the most recently updated.
async function findAccessibleProject(idOrSlug, userId, { ownerOnly = false, withSamples = false } = {}) {
  const key = String(idOrSlug || "").trim();
  if (!key) return null;
  const mine = [{ userId }, { "collaborators.userId": userId }];
  // Read-only learning samples are owner-less; only reads may see them.
  if (withSamples) mine.push({ isSample: true });
  const who = ownerOnly ? { userId } : { $or: mine };
  if (isValidObjectId(key)) {
    return TakeoffProject.findOne({ _id: key, productKey: PRODUCT_KEY, ...who });
  }
  const matches = await TakeoffProject.find({ slug: key, productKey: PRODUCT_KEY, ...who })
    .sort({ updatedAt: -1 })
    .limit(10);
  return matches.find((p) => String(p.userId) === String(userId)) || matches[0] || null;
}

// A sample is opened only by an active ArchiCAD subscriber (the same gate
// GET /projects/archicad/samples lists them behind). Sends the 403 itself.
const archicadEntitled = requireEntitlement(PRODUCT_KEY);
function checkSampleEntitlement(req, res) {
  return new Promise((resolve, reject) => {
    let passed = false;
    Promise.resolve(
      archicadEntitled(req, res, () => {
        passed = true;
        resolve(true);
      }),
    )
      .then(() => {
        if (!passed) resolve(false);
      })
      .catch(reject);
  });
}

// May this user change the project? The owner, or a collaborator the owner
// gave "full" access — the same line projects.js resolveProjectAccess draws
// (canEdit). A "view" collaborator reads, and nothing more.
function canEditProject(project, userId) {
  if (!project || !userId) return false;
  const uid = String(userId);
  if (project.userId != null && String(project.userId) === uid) return true;
  const collab = (project.collaborators || []).find(
    (c) => c?.userId != null && String(c.userId) === uid,
  );
  return collab?.accessLevel === "full";
}

function refuseViewOnly(res) {
  res.status(403).json({
    error: "View-only access cannot edit this project.",
    code: "VIEW_ONLY",
  });
}

async function findProjectForUser(req, res) {
  const userId = getUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid user id" });
    return null;
  }
  const id = String(req.params.projectId || "").trim();
  if (!id) {
    res.status(400).json({ error: "Invalid project id" });
    return null;
  }
  const isRead = req.method === "GET" || req.method === "HEAD";
  const project = await findAccessibleProject(id, userId, { withSamples: isRead });
  if (!project) {
    if (!isRead) {
      const sampleFilter = isValidObjectId(id) ? { _id: id } : { slug: id };
      const sample = await TakeoffProject.exists({ ...sampleFilter, productKey: PRODUCT_KEY, isSample: true });
      if (sample) {
        res.status(403).json({
          error: "Sample projects are read-only learning material.",
          code: "SAMPLE_READ_ONLY",
        });
        return null;
      }
    }
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (project.isSample && !(await checkSampleEntitlement(req, res))) return null;

  // Reaching the document is not permission to change it. Every route below
  // goes through here, so this is where the question gets asked — it was not
  // being asked anywhere on this surface, and the queries above match
  // collaborators, so a view-only reader could re-price the owner's bill.
  req.projectAccess = await archicadAccess(userId, project);
  return project;
}

// resolveProjectAccess, plus the owner's switch (R4b, util/ownerMoney.js):
// when the owner hid the money from this collaborator, no RateGen of theirs
// turns it back on. moneyHiddenBy says which rule hid it ("owner" |
// "rategen"), so the 403s and the page can say who to ask.
async function archicadAccess(userId, project) {
  const ownerOff = !!project && !project.isSample && !ownerAllowsMoney(project, userId);
  const access = await resolveProjectAccess(userId, project, {
    hasRateGen: async (uid) => {
      if (ownerOff) return false; // not worth the lookup
      const u = await User.findById(uid, { entitlements: 1 }).lean();
      return entitlementIsActive(u?.entitlements, "rategen");
    },
  });
  access.moneyHiddenBy = access.canSeeRates ? null : ownerOff ? "owner" : "rategen";
  return access;
}

// What the web page is told alongside a BoQ document, so it hides the
// controls the server would refuse (client features/archicad/sharedAccess.js).
// Display only: every route still asks requireProjectPower / requireMoney.
// Applied to an already-masked document; the plugin ignores these fields.
function present(req, doc) {
  const a = req.projectAccess || {};
  const out = {
    ...doc,
    canEdit: !!a.canEdit,
    canExport: !!a.canExport,
    isOwner: a.role === "owner",
  };
  if (a.role && a.role !== "none" && !a.canSeeRates) {
    out.moneyHidden = true;
    out.moneyHiddenBy = a.moneyHiddenBy || "rategen";
  }
  return out;
}

// For routes that exist only for the money (priced exports, margin, budget,
// re-pricing): a reader whose money is hidden is refused with 403
// MONEY_HIDDEN_BY_OWNER or RATEGEN_REQUIRED rather than handed a zeroed file
// or allowed to change figures they cannot see. Returns true to go on.
function requireMoney(req, res, what) {
  if (req.projectAccess?.canSeeRates) return true;
  res.status(403).json(archicadMoneyBlocked(req.projectAccess?.moneyHiddenBy, what));
  return false;
}

/** 403 unless the requester holds `power` on the project just loaded. */
function requireProjectPower(req, res, power, what) {
  if (req.projectAccess?.[power]) return true;
  res.status(403).json({
    error:
      req.projectAccess?.role === "sample"
        ? "Sample projects are read-only learning material."
        : `You have view-only access to this project, so you cannot ${what}.`,
    code: "PROJECT_ACCESS_DENIED",
  });
  // Every non-GET route here changes the bill (re-price, margin, budget).
  if (!isRead && !canEditProject(project, userId)) {
    refuseViewOnly(res);
    return null;
  }
  return project;
}

// A collaborator sees this project's money only when the owner left it on for
// them AND they hold an active RateGen (util/archicadMoney.js); the owner
// always does. Every route below that answers with money asks this first.
function moneyAccess(req, project) {
  return archicadMoneyAccess(project, getUserObjectId(req));
}

// Answers with the BoQ document, its money zeroed (same keys, plus
// moneyHidden) when the reader may not see it.
async function sendBoqDocument(req, res, project, version) {
  const doc = buildBoqDocument(project, version);
  const money = await moneyAccess(req, project);
  res.json(money.canSeeMoney ? doc : maskArchicadBoqDocument(doc, money.hiddenBy));
}

// For routes that exist only for the money (priced exports, margin, budget,
// re-pricing): refuses with 403 MONEY_HIDDEN_BY_OWNER / RATEGEN_REQUIRED.
// Returns true when the route may go on.
async function requireMoney(req, res, project, what) {
  const money = await moneyAccess(req, project);
  if (money.canSeeMoney) return true;
  res.status(403).json(archicadMoneyBlocked(money.hiddenBy, what));
  return false;
}

async function findCurrentVersion(projectId, res) {
  const version = await ArchicadBoqVersion.findOne({
    projectId,
    isCurrent: true,
  });
  if (!version) {
    res.status(404).json({ error: "No BoQ extracted for this project yet" });
    return null;
  }
  return version;
}

// Costs raw lines and writes a new current version snapshot.
//
// The bill is priced from the OWNER's RateGen library, whoever sends the
// quantities: a full-access collaborator updating the model must not reprice
// the owner's bill with their own rates (or wipe it to unpriced when they have
// none). `userId` is only who made the version (createdBy). A new project has
// no owner yet — the sender becomes it — so their library is the owner's.
async function createVersion({ project, rawLines, modelVersion, extractedAt, issues, userId }) {
  const priced = await loadRateCandidates(project.userId || userId);
  const { lines, categories, totals } = costBoqLines(rawLines, priced);

  const prevCurrent = await ArchicadBoqVersion.findOne({
    projectId: project._id,
    isCurrent: true,
  }).lean();
  const changedLineRefs = computeChangedLineRefs(lines, prevCurrent?.lines || []);

  const last = await ArchicadBoqVersion.findOne({ projectId: project._id })
    .sort({ versionNumber: -1 })
    .select("versionNumber")
    .lean();
  const versionNumber = (last?.versionNumber || 0) + 1;

  await ArchicadBoqVersion.updateMany(
    { projectId: project._id, isCurrent: true },
    { $set: { isCurrent: false } },
  );

  const version = await ArchicadBoqVersion.create({
    projectId: project._id,
    versionNumber,
    isCurrent: true,
    extractedAt: extractedAt ? new Date(extractedAt) : new Date(),
    modelVersion: String(modelVersion || ""),
    currency: priced.currency || DEFAULT_CURRENCY,
    lines,
    categories,
    totals,
    issues: Array.isArray(issues) ? issues : [],
    changedLineRefs,
    createdBy: userId,
  });

  embedLinesOnProject(project, lines);
  await project.save();

  return version;
}

/* ─────────────────────────── endpoints ─────────────────────────── */

// POST /api/archicad/boq/extract — cost an extraction; projectId null creates
// a new archicad TakeoffProject (name required).
router.post("/boq/extract", async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const { projectId, projectName, boqLines, modelVersion, extractedAt, issues } =
      req.body || {};
    if (!Array.isArray(boqLines) || boqLines.length === 0) {
      return res.status(400).json({ error: "boqLines array is required" });
    }

    let project;
    if (projectId) {
      if (!isValidObjectId(projectId)) {
        return res.status(400).json({ error: "Invalid project id" });
      }
      project = await TakeoffProject.findOne(accessFilter(projectId, userId));
      if (!project) return res.status(404).json({ error: "Project not found" });
      // Sending quantities replaces the bill: owner or full collaborator only.
      req.projectAccess = await archicadAccess(userId, project);
      if (!requireProjectPower(req, res, "canEdit", "update its quantities")) return;
      if (!canEditProject(project, userId)) return refuseViewOnly(res);
    } else {
      const name = String(projectName || "").trim();
      if (!name) {
        return res
          .status(400)
          .json({ error: "projectName is required when projectId is null" });
      }
      project = new TakeoffProject({
        userId,
        productKey: PRODUCT_KEY,
        name,
        slug: await uniqueSlug(userId, generateSlug(name)),
        items: [],
      });
    }

    const version = await createVersion({
      project,
      rawLines: boqLines,
      modelVersion,
      extractedAt,
      issues,
      userId,
    });

    // A new project is the sender's own; an existing one was resolved above,
    // so a full collaborator whose money is hidden gets the new bill masked
    // (their quantities, not the owner's prices) and the owner gets it whole.
    if (!req.projectAccess) req.projectAccess = await archicadAccess(userId, project);
    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] extract error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/projects — user's archicad projects.
router.get("/projects", async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const projects = await TakeoffProject.find({
      productKey: PRODUCT_KEY,
      $or: [{ userId }, { "collaborators.userId": userId }],
    })
      // userId, isSample and the collaborators' showMoney decide who sees the
      // money; none of them is sent.
      .select("name slug updatedAt userId isSample collaborators.userId collaborators.showMoney")
      // userId + collaborators are read only to decide who sees the money;
      // they are not sent.
      .select("name slug updatedAt userId collaborators.userId collaborators.showMoney")
      .sort({ updatedAt: -1 })
      .lean();

    const ids = projects.map((p) => p._id);
    const [counts, currents] = await Promise.all([
      ArchicadBoqVersion.aggregate([
        { $match: { projectId: { $in: ids } } },
        { $group: { _id: "$projectId", versionCount: { $sum: 1 } } },
      ]),
      ArchicadBoqVersion.find({ projectId: { $in: ids }, isCurrent: true })
        .select("projectId totals.grandTotal")
        .lean(),
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.versionCount]));
    const totalById = new Map(
      currents.map((v) => [String(v.projectId), toNum(v.totals?.grandTotal)]),
    );

    // The list matches collaborators too, so a reader without RateGen was
    // being handed every project's grand total here — the one figure the
    // mask exists to hide. One entitlement lookup for the whole list.
    // Skipped entirely when every project here is the caller's own, which
    // is the ordinary case.
    const shared = projects.some(
      (p) => !p.isSample && String(p.userId || "") !== String(userId),
    );
    let rateGen = false;
    if (shared) {
      const u = await User.findById(userId, { entitlements: 1 }).lean();
      rateGen = entitlementIsActive(u?.entitlements, "rategen");
    }

    res.json(
      projects.map((p) => {
        const owns = String(p.userId || "") === String(userId);
        // The owner's switch first (R4b): off for this reader means no money,
        // whatever they subscribe to.
        const ownerOff = !owns && !p.isSample && !ownerAllowsMoney(p, userId);
        const canSeeRates = owns || p.isSample || (!ownerOff && rateGen);
        const row = {
          id: String(p._id),
          slug: p.slug || "",
          name: p.name,
          updatedAt: p.updatedAt,
          versionCount: countById.get(String(p._id)) || 0,
          grandTotal: canSeeRates ? totalById.get(String(p._id)) || 0 : 0,
          ratesMasked: !canSeeRates,
        };
        if (!canSeeRates) {
          row.moneyHidden = true;
          row.moneyHiddenBy = ownerOff ? "owner" : "rategen";
        }
        return row;
      }),
    );
    // The reader's RateGen is looked up once, and only if a shared row asks.
    let rategen;
    const maySeeRates = async () => {
      if (rategen === undefined) rategen = await readerMaySeeRates(userId);
      return rategen;
    };

    const rows = [];
    for (const p of projects) {
      const money = await archicadMoneyAccess(p, userId, maySeeRates);
      const row = {
        id: String(p._id),
        slug: p.slug || "",
        name: p.name,
        updatedAt: p.updatedAt,
        versionCount: countById.get(String(p._id)) || 0,
        grandTotal: money.canSeeMoney ? totalById.get(String(p._id)) || 0 : 0,
      };
      if (!money.canSeeMoney) {
        row.moneyHidden = true;
        row.moneyHiddenBy = money.hiddenBy;
      }
      rows.push(row);
    }
    // Still a bare array with the same fields: the connector reads it as-is.
    res.json(rows);
  } catch (err) {
    console.error("[archicad] list projects error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/preferences — display-units preference (storage is metric).
router.get("/preferences", async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });
    const u = await User.findById(userId).select("archicadPreferences").lean();
    res.json({ units: u?.archicadPreferences?.units || "metric" });
  } catch (err) {
    console.error("[archicad] get preferences error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/archicad/preferences { units }
router.put("/preferences", async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });
    const units = String(req.body?.units || "").trim().toLowerCase();
    if (!["metric", "imperial"].includes(units)) {
      return res.status(400).json({ error: "units must be 'metric' or 'imperial'" });
    }
    await User.updateOne(
      { _id: userId },
      { $set: { "archicadPreferences.units": units } },
    );
    res.json({ units });
  } catch (err) {
    console.error("[archicad] put preferences error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/boq/:projectId — current costed BoQ document.
router.get("/boq/:projectId", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;
    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] get boq error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/boq/:projectId/versions
router.get("/boq/:projectId/versions", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    const versions = await ArchicadBoqVersion.find({ projectId: project._id })
      .select("versionNumber extractedAt totals.grandTotal lines")
      .sort({ versionNumber: -1 })
      .lean();
    const money = await moneyAccess(req, project);
    res.json(
      versions.map((v) => ({
        versionId: String(v._id),
        versionNumber: v.versionNumber,
        extractedAt: v.extractedAt,
        // Zeroed for a reader who may not see rates, like every other
        // money figure on this surface.
        grandTotal: req.projectAccess?.canSeeRates ? toNum(v.totals?.grandTotal) : 0,
        lineCount: Array.isArray(v.lines) ? v.lines.length : 0,
        ...(req.projectAccess?.canSeeRates
          ? {}
          : { moneyHidden: true, moneyHiddenBy: req.projectAccess?.moneyHiddenBy || "rategen" }),
      })),
      versions.map((v) => {
        const row = {
          versionId: String(v._id),
          versionNumber: v.versionNumber,
          extractedAt: v.extractedAt,
          grandTotal: money.canSeeMoney ? toNum(v.totals?.grandTotal) : 0,
          lineCount: Array.isArray(v.lines) ? v.lines.length : 0,
        };
        if (!money.canSeeMoney) {
          row.moneyHidden = true;
          row.moneyHiddenBy = money.hiddenBy;
        }
        return row;
      }),
    );
  } catch (err) {
    console.error("[archicad] list versions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/boq/:projectId/versions/:versionId
router.get("/boq/:projectId/versions/:versionId", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    const versionId = String(req.params.versionId || "").trim();
    if (!isValidObjectId(versionId)) {
      return res.status(400).json({ error: "Invalid version id" });
    }
    const version = await ArchicadBoqVersion.findOne({
      _id: versionId,
      projectId: project._id,
    }).lean();
    if (!version) return res.status(404).json({ error: "Version not found" });
    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] get version error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/archicad/boq/:projectId/reapply-rates — re-price the current
// quantities with current rates (new immutable version).
router.post("/boq/:projectId/reapply-rates", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    if (!requireProjectPower(req, res, "canEdit", "re-price this bill")) return;
    if (!requireMoney(req, res, "re-price this bill")) return;
    if (!(await requireMoney(req, res, project, "re-price this bill"))) return;
    const current = await findCurrentVersion(project._id, res);
    if (!current) return;

    // Rebuild the raw (uncosted) lines from the current snapshot; pricing
    // flags are stripped so the fresh costing pass re-derives them.
    const rawLines = (current.lines || []).map((l) => ({
      itemRef: l.itemRef,
      category: l.category,
      categoryTitle: l.categoryTitle,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      quivType: l.quivType,
      elementGuids: l.elementGuids,
      elementQuantities: l.elementQuantities,
      elementQuantitiesEstimated: l.elementQuantitiesEstimated,
      quantitiesBreakdown: l.quantitiesBreakdown,
      flags: (l.flags || []).filter((f) => f !== "unpriced"),
    }));

    const version = await createVersion({
      project,
      rawLines,
      modelVersion: current.modelVersion,
      extractedAt: new Date(),
      issues: current.issues,
      userId: getUserObjectId(req),
    });

    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] reapply-rates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/archicad/boq/:projectId/margin — margin edits mutate the CURRENT
// version only (no new snapshot).
router.patch("/boq/:projectId/margin", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    if (!requireProjectPower(req, res, "canEdit", "change its margin")) return;
    if (!requireMoney(req, res, "change this bill's margins")) return;
    if (!(await requireMoney(req, res, project, "change this bill's margins"))) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const { global: globalMargin, lines: lineEdits } = req.body || {};
    const hasGlobal = globalMargin !== undefined && globalMargin !== null;
    const edits = Array.isArray(lineEdits) ? lineEdits : [];
    if (!hasGlobal && !edits.length) {
      return res.status(400).json({ error: "Provide global or lines[]" });
    }
    if (hasGlobal && !Number.isFinite(Number(globalMargin))) {
      return res.status(400).json({ error: "global must be a number" });
    }

    const editByRef = new Map(
      edits
        .filter((e) => e && e.itemRef !== undefined && Number.isFinite(Number(e.marginPercent)))
        .map((e) => [String(e.itemRef), Number(e.marginPercent)]),
    );

    const lines = (version.lines || []).map((l) => {
      const line = { ...l };
      if (hasGlobal) return applyMarginToLine(line, Number(globalMargin));
      if (editByRef.has(String(line.itemRef))) {
        return applyMarginToLine(line, editByRef.get(String(line.itemRef)));
      }
      return line;
    });

    version.lines = lines;
    version.categories = buildCategories(lines);
    version.totals = buildTotals(lines);
    version.markModified("lines");
    version.markModified("categories");
    version.markModified("totals");
    await version.save();

    // Keep the embedded project bill in sync with the repriced rates.
    embedLinesOnProject(project, lines);
    await project.save();

    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] margin error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/archicad/boq/:projectId/budget { targetBudget } — stored on the
// project's PM budget override (existing field) for variance tracking.
router.patch("/boq/:projectId/budget", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    if (!requireProjectPower(req, res, "canEdit", "change its budget")) return;
    if (!requireMoney(req, res, "set this project's target budget")) return;
    if (!(await requireMoney(req, res, project, "set this project's target budget"))) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const target = Number(req.body?.targetBudget);
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ error: "targetBudget must be a non-negative number" });
    }
    project.projectManagement = project.projectManagement || {};
    project.projectManagement.budgetOverride = target;
    await project.save();

    res.json(present(req, maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates)));
    await sendBoqDocument(req, res, project, version);
  } catch (err) {
    console.error("[archicad] budget error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/boq/:projectId/export/excel
router.get("/boq/:projectId/export/excel", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    if (!requireProjectPower(req, res, "canExport", "export it")) return;
    if (!requireMoney(req, res, "export the priced bill")) return;
    if (!(await requireMoney(req, res, project, "export the priced bill"))) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const { buffer, filename } = await exportArchicadBoqXlsx({
      projectName: project.name,
      preparedBy: preparedByName(req),
      // A reader who may not see the money was refused above (requireMoney);
      // the mask stays as a second lock.
      boq: maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates),
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).end(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  } catch (err) {
    console.error("[archicad] export excel error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/boq/:projectId/export/pdf — summary only, pdfkit.
router.get("/boq/:projectId/export/pdf", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    if (!requireProjectPower(req, res, "canExport", "export it")) return;
    if (!requireMoney(req, res, "export the priced bill")) return;
    if (!(await requireMoney(req, res, project, "export the priced bill"))) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    streamArchicadBoqPdf(res, {
      projectName: project.name,
      clientName: "", // TakeoffProject carries no client-name field
      preparedBy: preparedByName(req),
      // A reader who may not see the money was refused above (requireMoney);
      // the mask stays as a second lock.
      boq: maskArchicadMoney(buildBoqDocument(project, version), req.projectAccess?.canSeeRates),
    });
  } catch (err) {
    console.error("[archicad] export pdf error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
});

// POST /api/archicad/boq/:projectId/share { enabled } — reuses the existing
// publicToken mechanism on TakeoffProject (served by GET /projects/public/:token,
// which is product-agnostic). Owner-only, matching projects.js toggleShare.
router.post("/boq/:projectId/share", async (req, res) => {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });
    const id = String(req.params.projectId || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid project id" });

    // Only the owner can change sharing.
    const project = await findAccessibleProject(id, userId, { ownerOnly: true });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const enabled = (req.body?.enabled ?? req.body?.enable) !== false;
    if (enabled && !project.publicToken) {
      project.publicToken = generatePublicToken();
    }
    project.publicShareEnabled = enabled;
    await project.save();

    res.json(shareInfo(project));
  } catch (err) {
    console.error("[archicad] share error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/archicad/element/:projectId/:guid — a single element's share of
// its BoQ line (line amounts × the element's fraction of the line quantity).
router.get("/element/:projectId/:guid", async (req, res) => {
  try {
    const project = await findProjectForUser(req, res);
    if (!project) return;
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const guid = String(req.params.guid || "").trim();
    const foundLine = (version.lines || []).find((l) =>
      (l.elementGuids || []).includes(guid),
    );
    if (!foundLine) return res.status(404).json({ error: "Element not found in current BoQ" });
    const money = await moneyAccess(req, project);
    const line = money.canSeeMoney ? foundLine : maskArchicadLine(foundLine);

    const eq = (line.elementQuantities || []).find((e) => e.guid === guid);
    const guidCount = (line.elementGuids || []).length || 1;
    const elementQty = eq
      ? toNum(eq.qty)
      : toNum(line.quantity) / guidCount;
    const fraction = toNum(line.quantity) > 0 ? elementQty / toNum(line.quantity) : 0;
    const r2 = (v) => Math.round(toNum(v) * 100) / 100;

    // Same mask as the BoQ reads: a reader without rates gets the
    // element quantities and where its rate came from, not the money.
    const payload = {
      guid,
      quivType: line.quivType || "",
      description: line.description || "",
      itemRef: line.itemRef || "",
      quantities: {
        unit: line.unit || "",
        lineQuantity: toNum(line.quantity),
        elementQuantity: elementQty,
        estimated: !!line.elementQuantitiesEstimated && !eq ? true : !!line.elementQuantitiesEstimated,
        breakdown: line.quantitiesBreakdown || {},
      },
      share: shareInfo(project),
      materialAmount: r2(toNum(line.materialAmount) * fraction),
      labourAmount: r2(toNum(line.labourAmount) * fraction),
      // Plant carried through at the same fraction as the rest of the line.
      // Lines costed before plant had a name of its own carry no plantAmount,
      // so this reads 0 for them — nothing already on a version changes.
      plantAmount: r2(toNum(line.plantAmount) * fraction),
      otherAmount: r2(toNum(line.otherAmount) * fraction),
      totalAmount: r2(toNum(line.totalAmount) * fraction),
      marginAmount: r2(toNum(line.marginAmount) * fraction),
      unitRate: toNum(line.unitRate),
      lineQuantityShare: fraction,
      rateProvenance: line.rateProvenance || null,
      labourProvenance: line.labourProvenance || null,
    };
    res.json(present(req, maskArchicadMoney(payload, req.projectAccess?.canSeeRates)));
      ...(money.canSeeMoney ? {} : { moneyHidden: true, moneyHiddenBy: money.hiddenBy }),
    });
  } catch (err) {
    console.error("[archicad] element error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
