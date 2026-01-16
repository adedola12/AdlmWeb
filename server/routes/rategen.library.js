// server/routes/rategen.library.js
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { ensureDb } from "../db.js";

import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { RateGenRate } from "../models/RateGenRate.js";
import { ensureMeta } from "../models/RateGenMeta.js";

const router = express.Router();

// ✅ IMPORTANT: scope auth ONLY to /library/*
router.use("/library", requireAuth, requireEntitlement("rategen"));

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

// keep in sync with admin normalize logic
function normalizeSectionKey(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return "";

  if (s === "painting") return "paint";
  if (s.includes("door") || s.includes("window")) return "doors_windows";
  if (s.includes("steel")) return "steelwork";
  if (s.includes("roof")) return "roofing";
  if (s.includes("paint")) return "paint";
  if (s.includes("ground") || s.includes("substructure")) return "ground";
  if (s.includes("concrete")) return "concrete";
  if (s.includes("finish")) return "finishes";
  if (s.includes("block")) return "blockwork";
  return s;
}

function toComputeItemDefinition(x) {
  const oh = Number(x.overheadPercentDefault ?? 10);
  const pf = Number(x.profitPercentDefault ?? 25);

  return {
    id: String(x._id),
    section: x.section,
    name: x.name,
    outputUnit: x.outputUnit || "m2",

    overheadPercentDefault: oh,
    profitPercentDefault: pf,

    // legacy field
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

function toRateDefinition(r) {
  return {
    id: String(r._id),
    sectionKey: r.sectionKey || "",
    sectionLabel: r.sectionLabel || "",
    itemNo: r.itemNo ?? null,
    description: r.description || "",
    unit: r.unit || "",
    netCost: r.netCost ?? 0,
    overheadPercent: r.overheadPercent ?? 10,
    profitPercent: r.profitPercent ?? 25,
    overheadValue: r.overheadValue ?? 0,
    profitValue: r.profitValue ?? 0,
    totalCost: r.totalCost ?? 0,
    updatedAt: r.updatedAt,

    breakdown: Array.isArray(r.breakdown)
      ? r.breakdown.map((l) => ({
          componentName: l.componentName || "",
          quantity: l.quantity ?? 0,
          unit: l.unit || "",
          unitPrice: l.unitPrice ?? 0,
          lineTotal:
            l.lineTotal ??
            l.totalPrice ??
            (l.quantity ?? 0) * (l.unitPrice ?? 0),

          refKind: l.refKind ?? null,
          refSn: l.refSn ?? null,
          refName: l.refName ?? null,
        }))
      : [],
  };
}

/**
 * GET /library/meta
 */
router.get("/library/meta", async (_req, res, next) => {
  try {
    await ensureDb();
    const [m, l, c, r] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
      ensureMeta("rates"),
    ]);

    res.json({
      ok: true,
      meta: {
        materials: { version: m.version, updatedAt: m.updatedAt },
        labour: { version: l.version, updatedAt: l.updatedAt },
        compute: { version: c.version, updatedAt: c.updatedAt },
        rates: { version: r.version, updatedAt: r.updatedAt },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/all
 * (kept for legacy clients)
 */
router.get("/library/all", async (_req, res, next) => {
  try {
    await ensureDb();

    const [mMeta, lMeta, cMeta, rMeta, materials, labours] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
      ensureMeta("rates"),
      RateGenMaterial.find({ enabled: true }).sort({ sn: 1 }).lean(),
      RateGenLabour.find({ enabled: true }).sort({ sn: 1 }).lean(),
    ]);

    res.json({
      ok: true,
      meta: {
        materialsVersion: mMeta.version,
        labourVersion: lMeta.version,
        computeVersion: cMeta.version,
        ratesVersion: rMeta.version,
      },
      materials,
      labours,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/compute-items/sync
 */
router.get("/library/compute-items/sync", async (req, res, next) => {
  try {
    await ensureDb();

    const meta = await ensureMeta("compute");
    const sinceVersion = Number(req.query.sinceVersion || 0);
    const limit = clampInt(req.query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);

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

/**
 * ✅ NEW: GET /library/rates/sync
 * Used by Windows app to pull admin-created Rate Library (rategenrates collection).
 *
 * Query:
 *  - sectionKey=ground (optional)
 *  - limit=250 (optional)
 *  - cursor=... (optional)
 */
router.get("/library/rates/sync", async (req, res, next) => {
  try {
    await ensureDb();

    const meta = await ensureMeta("rates");
    const limit = clampInt(req.query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const cur = parseCursor(req.query.cursor);

    const q = {};
    if (sectionKey) q.sectionKey = sectionKey;

    if (cur?.ts) {
      q.$or = cur.id
        ? [
            { updatedAt: { $gt: cur.ts } },
            { updatedAt: cur.ts, _id: { $gt: cur.id } },
          ]
        : [{ updatedAt: { $gt: cur.ts } }];
    }

    const docs = await RateGenRate.find(q)
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
      items: docs.map(toRateDefinition),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
