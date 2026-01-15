// server/routes/rategen.library.js
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { ensureDb } from "../db.js";

import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { ensureMeta } from "../models/RateGenMeta.js";

const router = express.Router();

// Public to entitled users (not admin-key)
router.use(requireAuth, requireEntitlement("rategen"));

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildCursor(updatedAt, id) {
  return `${new Date(updatedAt).toISOString()}|${String(id)}`;
}

function parseCursor(cursor) {
  if (!cursor) return null;
  const [tsRaw, idRaw] = String(cursor).split("|");
  const ts = new Date(tsRaw);
  if (!tsRaw || Number.isNaN(ts.getTime())) return null;

  if (idRaw && mongoose.isValidObjectId(idRaw)) {
    return { ts, id: new mongoose.Types.ObjectId(idRaw) };
  }
  return { ts, id: null };
}

function toComputeItemDefinition(x) {
  const oh = Number(x.overheadPercentDefault ?? 10);
  const pf = Number(x.profitPercentDefault ?? 25);

  return {
    id: String(x._id),
    section: x.section,
    name: x.name,
    outputUnit: x.outputUnit || "m2",

    // new (recommended)
    overheadPercentDefault: oh,
    profitPercentDefault: pf,

    // legacy (if desktop expects a single P/O percent)
    poPercent: oh + pf,

    enabled: x.enabled !== false,
    notes: x.notes || "",
    updatedAt: x.updatedAt,

    lines: (x.lines || []).map((l) => ({
      kind: l.kind,
      refSn: l.refSn ?? null,
      refKey: l.refKey ?? null,
      refName: l.refName ?? null,
      description: l.description || "",
      unit: l.unit || "",
      unitPriceAtBuild: l.unitPriceAtBuild ?? null,
      qtyPerUnit: l.qtyPerUnit ?? 0,
      factor: l.factor ?? 1,
    })),
  };
}

/**
 * GET /rategen/library/meta
 * Returns master library versions.
 */
router.get("/library/meta", async (_req, res, next) => {
  try {
    await ensureDb();

    const [m, l, c] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
    ]);

    res.json({
      ok: true,
      meta: {
        materials: { version: m.version, updatedAt: m.updatedAt },
        labour: { version: l.version, updatedAt: l.updatedAt },
        compute: { version: c.version, updatedAt: c.updatedAt },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /rategen/library/all
 * Full snapshot for offline-first clients.
 */
router.get("/library/all", async (_req, res, next) => {
  try {
    await ensureDb();

    const [mMeta, lMeta, cMeta, materials, labours] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
      RateGenMaterial.find({ enabled: true }).sort({ sn: 1 }).lean(),
      RateGenLabour.find({ enabled: true }).sort({ sn: 1 }).lean(),
    ]);

    res.json({
      ok: true,
      meta: {
        materialsVersion: mMeta.version,
        labourVersion: lMeta.version,
        computeVersion: cMeta.version,
      },
      materials,
      labours,
      // NOTE: compute items are synced incrementally via /library/compute-items/sync
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /rategen/library/compute-items/sync
 * Incremental sync with cursor paging + version.
 *
 * Query:
 *  - sinceVersion (optional): number
 *  - cursor (optional): "ISO_DATE|OBJECTID"
 *  - limit (optional): default 250, max 1000
 */
router.get("/library/compute-items/sync", async (req, res, next) => {
  try {
    await ensureDb();

    const meta = await ensureMeta("compute");
    const sinceVersion = Number(req.query.sinceVersion || 0);
    const limit = clampInt(req.query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);

    // If client is on this version and has no cursor, it's up to date.
    if (
      sinceVersion > 0 &&
      sinceVersion === meta.version &&
      !req.query.cursor
    ) {
      return res.json({
        ok: true,
        upToDate: true,
        meta: { version: meta.version, updatedAt: meta.updatedAt },
        items: [],
        nextCursor: null,
      });
    }

    const cur = parseCursor(req.query.cursor);
    let q = {};
    if (cur?.ts) {
      q = cur.id
        ? {
            $or: [
              { updatedAt: { $gt: cur.ts } },
              { updatedAt: cur.ts, _id: { $gt: cur.id } },
            ],
          }
        : { updatedAt: { $gt: cur.ts } };
    }

    // IMPORTANT: do NOT filter enabled here — we want enabled:false as tombstones.
    const docs = await RateGenComputeItem.find(q)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit)
      .lean();

    const nextCursor =
      docs.length === limit
        ? buildCursor(
            docs[docs.length - 1].updatedAt,
            docs[docs.length - 1]._id
          )
        : null;

    res.json({
      ok: true,
      meta: { version: meta.version, updatedAt: meta.updatedAt },
      items: docs.map(toComputeItemDefinition),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
