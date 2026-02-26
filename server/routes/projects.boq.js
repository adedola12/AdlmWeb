import express from "express";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";
import { exportBoqFromTemplate } from "../util/boqExporter.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Put template here: server/assets/boq/boq-template.xlsx
const DEFAULT_TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "boq",
  "boq-template.xlsx",
);

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
  if (n.includes("materials")) s += 3;
  if (n.includes("revit")) s += 3;
  if (n.includes("planswift")) s += 3;

  // tool-specific boost
  if (t && n.includes(t)) s += 6;

  // common aliases
  if (t === "revit-materials" || t === "revit-material") {
    if (n.includes("material")) s += 6;
    if (n.includes("revit")) s += 3;
  }

  return s;
}

function toIdCandidates(id) {
  const raw = String(id || "").trim();
  const out = [];

  // Mongo ObjectId
  if (mongoose.Types.ObjectId.isValid(raw)) {
    out.push(new mongoose.Types.ObjectId(raw));
  }

  // string id fallback (some schemas store string ids)
  out.push(raw);

  return out;
}

function normalizeId(v) {
  if (!v) return "";
  // ObjectId -> string
  if (typeof v === "object" && String(v._bsontype || "") === "ObjectId")
    return String(v);
  return String(v);
}

function userOwnsDoc(doc, userId) {
  if (!doc) return false;
  const uid = normalizeId(userId);

  // If doc has any of these fields, enforce ownership strictly
  const ownerFields = ["userId", "ownerId", "createdById", "user", "uid"];
  for (const f of ownerFields) {
    if (doc[f] != null) {
      return normalizeId(doc[f]) === uid;
    }
  }

  // If none of those fields exist, we can’t strictly verify.
  // We allow it (your ids are unguessable), but this keeps it compatible.
  return true;
}

async function listAllCollections() {
  const db = mongoose.connection?.db;
  if (!db)
    throw new Error("DB not ready. Ensure connectDB runs before routes.");
  const cols = await db.listCollections().toArray();
  return cols.map((c) => c.name).filter(Boolean);
}

async function findProjectDoc({ tool, id, userId }) {
  const collections = await listAllCollections();

  // Limit to likely collections first, then sort by score
  const likely = collections
    .filter(isLikelyProjectsCollection)
    .sort((a, b) => scoreCollectionName(b, tool) - scoreCollectionName(a, tool))
    .slice(0, 30); // keep it bounded

  // If no likely collections, fallback to all (still bounded)
  const candidates = likely.length ? likely : collections.slice(0, 30);

  const ids = toIdCandidates(id);

  for (const colName of candidates) {
    const col = mongoose.connection.collection(colName);

    for (const _id of ids) {
      // Try common patterns
      const attempts = [{ _id }, { id: _id }, { projectId: _id }];

      for (const q of attempts) {
        const doc = await col.findOne(q);
        if (!doc) continue;

        // must look like your saved project shape
        const hasItems = Array.isArray(doc.items) && doc.items.length >= 0;
        const hasName =
          typeof doc.name === "string" || typeof doc.title === "string";
        if (!hasItems && !hasName) continue;

        if (!userOwnsDoc(doc, userId)) continue;

        // normalize name/title
        doc.name = doc.name || doc.title || "Project";
        return doc;
      }
    }
  }

  return null;
}

/* -------------------- route -------------------- */
/**
 * GET /projectsboq/:tool/:id/export/boq
 */
router.get(
  "/:tool/:id/export/boq",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tool = String(req.params.tool || "")
      .trim()
      .toLowerCase();
    const id = String(req.params.id || "").trim();

    if (!tool || !id) {
      return res.status(400).json({ error: "tool and id are required" });
    }

    const tpl = String(process.env.BOQ_TEMPLATE_PATH || "").trim();
    const templatePath = tpl || DEFAULT_TEMPLATE_PATH;

    const project = await findProjectDoc({
      tool,
      id,
      userId: req.user?._id,
    });

    if (!project) {
      return res.status(404).json({
        error:
          "Project not found (or not owned by this user). Also check your collection/model naming.",
      });
    }

    const out = await exportBoqFromTemplate({
      templatePath,
      projectName: project.name || "Project",
      items: Array.isArray(project.items) ? project.items : [],
      options: {
        matchThreshold: Number(req.query.threshold || 0.28),
      },
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );

    return res.send(out.buffer);
  }),
);

export default router;
