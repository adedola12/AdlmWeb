// server/routes/projects.boq.js
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { exportElementalBoQ } from "../util/elementalBoqExporter.js";
import { exportBillAndBudget } from "../util/billBudgetExporter.js";
import { resolveMergedProject } from "../services/projectMerge.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import {
  canExportProject,
  requestUserId,
  userOwnsDoc,
} from "../util/exportAccess.js";

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* -------------------- helpers -------------------- */

function isLikelyProjectsCollection(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.includes("project") ||
    n.includes("takeoff") ||
    n.includes("revit") ||
    n.includes("planswift") ||
    n.includes("material")
  );
}

function scoreCollectionName(name, tool) {
  const n = String(name || "").toLowerCase();
  const t = String(tool || "").toLowerCase();

  let s = 0;
  if (n.includes("project")) s += 5;
  if (n.includes("takeoff")) s += 4;
  if (n.includes("revit")) s += 3;
  if (n.includes("planswift")) s += 3;
  if (n.includes("material")) s += 2;

  // tool-specific boost
  if (t && n.includes(t)) s += 8;

  // aliases
  if (t === "revit-materials" || t === "revit-material") {
    if (n.includes("material")) s += 8;
    if (n.includes("revit")) s += 3;
  }

  return s;
}

function toIdCandidates(id) {
  const raw = String(id || "").trim();
  const out = [];
  if (mongoose.Types.ObjectId.isValid(raw))
    out.push(new mongoose.Types.ObjectId(raw));
  out.push(raw);
  return out;
}

async function listAllCollections() {
  const db = mongoose.connection?.db;
  if (!db)
    throw new Error("DB not ready. Ensure connectDB runs before routes.");
  const cols = await db.listCollections().toArray();
  return cols.map((c) => c.name).filter(Boolean);
}

function looksLikeProjectDoc(doc) {
  if (!doc) return false;
  const hasItems = Array.isArray(doc.items);
  const hasName = typeof doc.name === "string" || typeof doc.title === "string";
  return hasItems || hasName;
}

function toolMatchesIfPresent(doc, tool) {
  const t = String(tool || "").toLowerCase();
  if (!t) return true;

  // If your docs store tool/type keys, enforce them when present
  const candidates = ["tool", "type", "projectType", "source"];
  for (const k of candidates) {
    if (doc?.[k] != null) {
      const dv = String(doc[k] || "").toLowerCase();
      // allow partial matches (e.g. "revit" inside "revit_takeoffs")
      if (!dv.includes(t)) return false;
      return true;
    }
  }
  return true; // field not present => don't block
}

// A merge container holds NO items of its own — its bill lives on the linked
// source projects and is resolved on read. Without this the export produced a
// workbook with an empty bill and a zero General Summary, silently, because
// doc.items is legitimately [].
async function normalizeProjectDoc(doc) {
  doc.name = doc.name || doc.title || "Project";
  doc.items = Array.isArray(doc.items) ? doc.items : [];
  if (!doc.mergeContainer) return doc;
  const merged = await resolveMergedProject(doc, doc.userId);
  merged.name = doc.name;
  return merged;
}

// Every project this API exports lives in TakeoffProject. Going straight there
// is one indexed query on _id instead of up to 180 unindexed probes across
// every collection whose name happens to contain "project" / "material", which
// is slow enough on a real database to time a serverless request out.
//
// productKey is deliberately NOT part of the filter: the :tool in the URL is a
// family alias (planswift covers planswift-materials, revit covers
// revit-materials) and the id is an unguessable ObjectId that access is checked
// against anyway, so filtering on it only ever produced false "not found"s.
async function findInTakeoffProjects(id, userId) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  const doc = await TakeoffProject.findOne({
    _id: new mongoose.Types.ObjectId(String(id)),
    $or: [{ userId }, { "collaborators.userId": userId }],
  }).lean();
  return doc || null;
}

// Legacy fallback for deployments whose projects were never migrated into
// TakeoffProject. Each probe is isolated: one unreadable collection (a view, a
// collection outside the connection user's grants) must not turn the whole
// export into a 500.
async function scanCollectionsForProject({ tool, id, userId }) {
  let collections;
  try {
    collections = await listAllCollections();
  } catch {
    return null;
  }

  const candidates = collections
    .filter(isLikelyProjectsCollection)
    .sort((a, b) => scoreCollectionName(b, tool) - scoreCollectionName(a, tool))
    .slice(0, 30);

  const ids = toIdCandidates(id);

  for (const colName of candidates) {
    const col = mongoose.connection.db.collection(colName);

    for (const _id of ids) {
      const attempts = [{ _id }, { id: _id }, { projectId: _id }];

      for (const q of attempts) {
        let doc;
        try {
          doc = await col.findOne(q);
        } catch {
          continue;
        }
        if (!looksLikeProjectDoc(doc)) continue;
        if (!toolMatchesIfPresent(doc, tool)) continue;
        if (!userOwnsDoc(doc, userId)) continue;
        return doc;
      }
    }
  }

  return null;
}

async function findProjectDoc({ tool, id, userId }) {
  if (!userId) return null;

  const direct = await findInTakeoffProjects(id, userId);
  if (direct) {
    // Found and access-filtered by the query. A view-only collaborator can read
    // the project but must not export it.
    if (!canExportProject(direct, userId)) {
      const err = new Error("View-only access cannot export this project.");
      err.statusCode = 403;
      err.code = "VIEW_ONLY";
      throw err;
    }
    return normalizeProjectDoc(direct);
  }

  const scanned = await scanCollectionsForProject({ tool, id, userId });
  return scanned ? normalizeProjectDoc(scanned) : null;
}

/* -------------------- routes -------------------- */

// Shared by both export routes: resolve the project, or answer with a reason.
// Every failure here answers with a message that says what to do about it — a
// bare 500 "Server error" on an export is the one thing a user cannot act on.
async function loadProjectForExport(req, res) {
  const tool = String(req.params.tool || "")
    .trim()
    .toLowerCase();
  const id = String(req.params.id || "").trim();

  if (!tool || !id) {
    res.status(400).json({ error: "tool and id are required" });
    return null;
  }

  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized", code: "NO_USER" });
    return null;
  }

  if (mongoose.connection?.readyState !== 1 || !mongoose.connection?.db) {
    res.status(503).json({
      error: "The database is not reachable right now. Try the export again in a moment.",
      code: "DB_NOT_READY",
    });
    return null;
  }

  let project;
  try {
    project = await findProjectDoc({ tool, id, userId });
  } catch (err) {
    if (err?.statusCode) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }

  if (!project) {
    res.status(404).json({
      error: "Project not found, or you do not have access to it.",
      code: "PROJECT_NOT_FOUND",
    });
    return null;
  }
  return { project, tool };
}

// Turn an exporter crash into something diagnosable. The stack goes to the
// server log with the project it happened on; the caller gets a message that
// names the export rather than the generic 500 the app-wide handler emits.
function exportFailed(res, err, { label, tool, id }) {
  console.error(`[boq-export] ${label} failed for ${tool}/${id}:`, err);
  return res.status(500).json({
    error: `Could not build the ${label}. ${err?.message || "Unexpected error"}`,
    code: "EXPORT_FAILED",
  });
}

// XLSX is a ZIP, so a valid workbook starts with "PK". Catches an exporter that
// silently produced HTML or JSON before the browser saves it as .xlsx.
function sendWorkbook(res, out) {
  const buf = Buffer.isBuffer(out.buffer) ? out.buffer : Buffer.from(out.buffer);
  if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return res.status(500).json({
      error: "Exporter did not generate a valid XLSX (zip) file.",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
  return res.status(200).end(buf);
}

/**
 * GET /projectsboq/:tool/:id/export/bill-budget
 *
 * The bill AS MEASURED plus its budget: the project's own sections, preamble
 * subtitles, order and totals, with the material / labour / plant build-up on
 * separate schedules, a schedule of current material prices and a material
 * summary. Unlike /export/boq this does not re-cut the bill against the
 * elemental or trade mapping, which is what an imported bill needs — its
 * descriptions are a QS's, not a plugin's, so mapping them dropped the whole
 * bill into "Other items".
 */
router.get(
  "/:tool/:id/export/bill-budget",
  requireAuth,
  asyncHandler(async (req, res) => {
    const loaded = await loadProjectForExport(req, res);
    if (!loaded) return undefined;
    const { project } = loaded;

    const groupBy = ["trade", "work-section"].includes(
      String(req.query.groupBy || "").trim().toLowerCase(),
    )
      ? "trade"
      : "category";

    let out;
    try {
      out = await exportBillAndBudget({
        projectName: project.name || "Project",
        clientName: project.clientName || project.contract?.clientName || "",
        items: project.items || [],
        budgetItems: project.budgetItems || [],
        materialItems: project.materialItems || [],
        provisionalSums: project.provisionalSums || [],
        variations: project.variations || [],
        preliminaryItems: project.preliminaryItems || [],
        preliminaryPercent: Number(project.contract?.preliminaryPercent) || 0,
        groupBy,
      });
    } catch (err) {
      return exportFailed(res, err, {
        label: "bill & budget workbook",
        tool: req.params.tool,
        id: req.params.id,
      });
    }

    return sendWorkbook(res, out);
  }),
);


/**
 * GET /projectsboq/:tool/:id/export/boq
 */
router.get(
  "/:tool/:id/export/boq",
  requireAuth,
  asyncHandler(async (req, res) => {
    const loaded = await loadProjectForExport(req, res);
    if (!loaded) return undefined;
    const { project, tool } = loaded;

    const buildingType = String(req.query.building || "bungalow")
      .trim()
      .toLowerCase();
    const foundationType = String(req.query.foundation || "")
      .trim()
      .toLowerCase();
    const format = String(req.query.format || "elemental")
      .trim()
      .toLowerCase();
    // Milestone / WBS sheets ship with every export; ?wbs=0 leaves them out
    // for anyone who wants the bill on its own.
    const includeWbs = !["0", "false", "no"].includes(
      String(req.query.wbs ?? "").trim().toLowerCase(),
    );

    let out;
    try {
      out = await exportElementalBoQ({
        projectName: project.name || "Project",
        clientName: project.clientName || "",
        items: project.items,
        budgetItems: project.budgetItems || [],
        productKey: tool,
        buildingType,
        foundationType: foundationType || undefined,
        provisionalSums: project.provisionalSums || [],
        variations: project.variations || [],
        preliminaryItems: project.preliminaryItems || [],
        preliminaryPercent: Number(project.contract?.preliminaryPercent) || 0,
        // A BUILDING merge becomes one sheet per structure. A discipline merge
        // stays a single combined bill: architectural and structural are two
        // views of the SAME structure, so splitting them into separate sheets
        // would misrepresent the job as two buildings.
        parts:
          project.mergePartType === "building" && project.merge?.parts?.length
            ? project.merge.parts.map((part) => ({
                name: part.name,
                items: (project.items || []).filter(
                  (it) => String(it.sourceProjectId || "") === String(part.projectId),
                ),
              }))
            : [],
        includeWbs,
        format,
      });
    } catch (err) {
      return exportFailed(res, err, {
        label: `${format} BoQ`,
        tool: req.params.tool,
        id: req.params.id,
      });
    }

    return sendWorkbook(res, out);
  }),
);

export default router;
