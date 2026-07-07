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
import { TakeoffProject } from "../models/TakeoffProject.js";
import { ArchicadBoqVersion } from "../models/ArchicadBoqVersion.js";
import { User } from "../models/User.js";
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

async function findProjectForUser(req, res) {
  const userId = getUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid user id" });
    return null;
  }
  const id = String(req.params.projectId || "").trim();
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid project id" });
    return null;
  }
  const project = await TakeoffProject.findOne(accessFilter(id, userId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
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
async function createVersion({ project, rawLines, modelVersion, extractedAt, issues, userId }) {
  const priced = await loadRateCandidates(userId);
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

    res.json(buildBoqDocument(project, version));
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
      .select("name updatedAt")
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

    res.json(
      projects.map((p) => ({
        id: String(p._id),
        name: p.name,
        updatedAt: p.updatedAt,
        versionCount: countById.get(String(p._id)) || 0,
        grandTotal: totalById.get(String(p._id)) || 0,
      })),
    );
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
    res.json(buildBoqDocument(project, version));
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
    res.json(
      versions.map((v) => ({
        versionId: String(v._id),
        versionNumber: v.versionNumber,
        extractedAt: v.extractedAt,
        grandTotal: toNum(v.totals?.grandTotal),
        lineCount: Array.isArray(v.lines) ? v.lines.length : 0,
      })),
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
    res.json(buildBoqDocument(project, version));
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

    res.json(buildBoqDocument(project, version));
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

    res.json(buildBoqDocument(project, version));
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
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const target = Number(req.body?.targetBudget);
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ error: "targetBudget must be a non-negative number" });
    }
    project.projectManagement = project.projectManagement || {};
    project.projectManagement.budgetOverride = target;
    await project.save();

    res.json(buildBoqDocument(project, version));
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
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    const { buffer, filename } = await exportArchicadBoqXlsx({
      projectName: project.name,
      preparedBy: preparedByName(req),
      boq: buildBoqDocument(project, version),
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
    const version = await findCurrentVersion(project._id, res);
    if (!version) return;

    streamArchicadBoqPdf(res, {
      projectName: project.name,
      clientName: "", // TakeoffProject carries no client-name field
      preparedBy: preparedByName(req),
      boq: buildBoqDocument(project, version),
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
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid project id" });

    const project = await TakeoffProject.findOne({
      _id: id,
      userId,
      productKey: PRODUCT_KEY,
    });
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
    const line = (version.lines || []).find((l) =>
      (l.elementGuids || []).includes(guid),
    );
    if (!line) return res.status(404).json({ error: "Element not found in current BoQ" });

    const eq = (line.elementQuantities || []).find((e) => e.guid === guid);
    const guidCount = (line.elementGuids || []).length || 1;
    const elementQty = eq
      ? toNum(eq.qty)
      : toNum(line.quantity) / guidCount;
    const fraction = toNum(line.quantity) > 0 ? elementQty / toNum(line.quantity) : 0;
    const r2 = (v) => Math.round(toNum(v) * 100) / 100;

    res.json({
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
      totalAmount: r2(toNum(line.totalAmount) * fraction),
      marginAmount: r2(toNum(line.marginAmount) * fraction),
      unitRate: toNum(line.unitRate),
      lineQuantityShare: fraction,
      rateProvenance: line.rateProvenance || null,
      labourProvenance: line.labourProvenance || null,
    });
  } catch (err) {
    console.error("[archicad] element error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
