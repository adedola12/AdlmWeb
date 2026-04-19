// server/routes/projects.boq.js
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { exportElementalBoQ } from "../util/elementalBoqExporter.js";

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

function normalizeId(v) {
  if (!v) return "";
  if (typeof v === "object" && String(v._bsontype || "") === "ObjectId")
    return String(v);
  return String(v);
}

function userOwnsDoc(doc, userId) {
  if (!doc) return false;
  const uid = normalizeId(userId);

  const ownerFields = ["userId", "ownerId", "createdById", "user", "uid"];
  for (const f of ownerFields) {
    if (doc[f] != null) return normalizeId(doc[f]) === uid;
  }

  // If your schema does not store ownership fields, allow (unguessable ids).
  return true;
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

async function findProjectDoc({ tool, id, userId }) {
  const collections = await listAllCollections();

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
        const doc = await col.findOne(q);
        if (!looksLikeProjectDoc(doc)) continue;
        if (!toolMatchesIfPresent(doc, tool)) continue;
        if (!userOwnsDoc(doc, userId)) continue;

        doc.name = doc.name || doc.title || "Project";
        doc.items = Array.isArray(doc.items) ? doc.items : [];
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

    if (!tool || !id)
      return res.status(400).json({ error: "tool and id are required" });

    const buildingType = String(req.query.building || "bungalow")
      .trim()
      .toLowerCase();
    const foundationType = String(req.query.foundation || "")
      .trim()
      .toLowerCase();

    const project = await findProjectDoc({
      tool,
      id,
      userId: req.user?._id,
    });

    if (!project) {
      return res.status(404).json({
        error:
          "Project not found (or not owned by this user). Check your collection/model naming.",
      });
    }

    const out = await exportElementalBoQ({
      projectName: project.name || "Project",
      items: project.items,
      productKey: tool,
      buildingType,
      foundationType: foundationType || undefined,
      provisionalSums: project.provisionalSums || [],
    });

    const buf = Buffer.isBuffer(out.buffer)
      ? out.buffer
      : Buffer.from(out.buffer);

    // Quick sanity: XLSX is a ZIP => starts with "PK"
    if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return res.status(500).json({
        error:
          "BoQ exporter did not generate a valid XLSX (zip) file. Check template path and exporter logic.",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );

    return res.status(200).end(buf);
  }),
);

export default router;
