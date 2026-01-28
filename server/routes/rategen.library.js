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
import { RateGenLibrary } from "../models/RateGenLibrary.js";

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

    createdAt: r.createdAt,
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
            docs[docs.length - 1]._id,
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
 * GET /library/rates/sync
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
            docs[docs.length - 1]._id,
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

/**
 * GET /library/rates/updates
 */
router.get("/library/rates/updates", async (req, res, next) => {
  try {
    await ensureDb();

    const limit = clampInt(req.query.limit, 1, MAX_LIMIT, 60);

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const sinceRaw = req.query.since ? String(req.query.since) : "";
    const since = sinceRaw ? new Date(sinceRaw) : null;

    const q = {};
    if (sectionKey) q.sectionKey = sectionKey;

    if (since && !Number.isNaN(since.getTime())) {
      q.updatedAt = { $gt: since };
    }

    const docs = await RateGenRate.find(q)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      items: docs.map(toRateDefinition),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- ✅ Material price resolve (FUZZY: Admin master + user library) ----------

const BRACKET_RE = /\[[^\]]*\]/g;
const PAREN_RE = /\([^)]*\)/g;

const STOP = new Set([
  "the",
  "and",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "with",
  "without",
  "from",
  "bag",
  "bags",
  "ton",
  "tons",
  "tonne",
  "tonnes",
  "m3",
]);

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(BRACKET_RE, " ")
    .replace(PAREN_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normText(s)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length > 1 && !STOP.has(x) && !/^\d+$/.test(x));
}

function normUnit(u) {
  const raw = String(u || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "bag" || raw === "bags") return "bag";
  if (
    raw === "t" ||
    raw === "ton" ||
    raw === "tons" ||
    raw === "tonne" ||
    raw === "tonnes"
  )
    return "t";
  const compact = raw.replace(/\s+/g, "");
  if (compact === "m3" || compact === "m³" || compact === "cum") return "m3";
  if (/\b(litre|liter|ltr|l)\b/.test(raw)) return "l";
  return raw;
}

function scoreMatch(reqTokens, candTokens) {
  if (!reqTokens.length || !candTokens.length) return 0;

  const A = new Set(reqTokens);
  const B = new Set(candTokens);

  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;

  const coverage = inter / A.size;
  const precision = inter / B.size;

  return 0.75 * coverage + 0.25 * precision;
}

/**
 * POST /library/material-prices/resolve
 * Body:
 *  {
 *    items?: [{ name, unit }],
 *    names?: string[],
 *    includeMaster?: boolean,
 *    includeUser?: boolean,
 *    limitCandidates?: number
 *  }
 *
 * Returns:
 *  {
 *    ok: true,
 *    pricesByKey: { [normKey]: bestMatchOrNull },
 *    candidatesByKey: { [normKey]: Candidate[] },
 *    results: [...],
 *    requested: [...], // legacy-friendly
 *    stats: {...}
 *  }
 */
router.post("/library/material-prices/resolve", async (req, res, next) => {
  try {
    await ensureDb();

    const {
      items,
      names,
      includeMaster = true,
      includeUser = true,
      limitCandidates = 10,
    } = req.body || {};

    const wanted =
      Array.isArray(items) && items.length
        ? items.map((x) => ({ name: x?.name, unit: x?.unit }))
        : Array.isArray(names) && names.length
          ? names.map((n) => ({ name: n, unit: "" }))
          : [];

    const cleanedWanted = wanted
      .slice(0, 2000)
      .map((x) => ({
        name: String(x?.name || "").trim(),
        unit: String(x?.unit || "").trim(),
      }))
      .filter((x) => x.name);

    if (!cleanedWanted.length) {
      return res.json({
        ok: true,
        results: [],
        pricesByKey: {},
        candidatesByKey: {},
        requested: [],
        stats: { requested: 0 },
      });
    }

    // ---- Build pool (master + user) ----
    const pool = [];

    let masterCount = 0;
    if (includeMaster) {
      const master = await RateGenMaterial.find({ enabled: true })
        .select({ sn: 1, name: 1, unit: 1, defaultUnitPrice: 1, category: 1 })
        .lean();

      masterCount = Array.isArray(master) ? master.length : 0;

      for (const m of master || []) {
        const price = Number(m?.defaultUnitPrice || 0);
        const desc = String(m?.name || "").trim();
        if (!desc || !Number.isFinite(price) || price <= 0) continue;

        pool.push({
          sn: m?.sn ?? null,
          description: desc,
          unit: m?.unit || "",
          price,
          category: m?.category || "",
          source: "master",
        });
      }
    }

    let userCount = 0;
    if (includeUser) {
      const lib = await RateGenLibrary.findOne({ userId: req.user._id }).lean();
      const mats = Array.isArray(lib?.materials) ? lib.materials : [];
      userCount = mats.length;

      for (const m of mats) {
        const desc = String(m?.description || m?.name || "").trim();
        const price = Number(m?.price || 0);
        if (!desc || !Number.isFinite(price) || price <= 0) continue;

        pool.push({
          sn: m?.sn ?? null,
          description: desc,
          unit: m?.unit || "",
          price,
          category: m?.category || "",
          source: "user",
        });
      }
    }

    const prepared = pool
      .map((x) => {
        const d = String(x.description || "").trim();
        return {
          ...x,
          _descNorm: normText(d),
          _tokens: tokens(d),
          _unitNorm: normUnit(x.unit),
        };
      })
      .filter((x) => x._descNorm && x.price > 0);

    const maxCands = Math.max(
      3,
      Math.min(20, clampInt(limitCandidates, 3, 20, 10)),
    );

    const pricesByKey = {};
    const candidatesByKey = {};
    const results = [];

    for (const w of cleanedWanted) {
      const key = normText(w.name);
      const reqToks = tokens(w.name);
      const reqUnit = normUnit(w.unit);

      const scored = prepared
        .map((c) => {
          let s = scoreMatch(reqToks, c._tokens);

          // small boost for exact normalized equality
          if (key && c._descNorm === key) s += 0.15;

          // soft penalty for unit mismatch (still show candidates)
          if (reqUnit && c._unitNorm && reqUnit !== c._unitNorm) s *= 0.75;

          return { ...c, score: s };
        })
        .filter((x) => x.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxCands);

      const best = scored[0] || null;

      candidatesByKey[key] = scored.map((x) => ({
        sn: x.sn,
        description: x.description,
        unit: x.unit,
        price: x.price,
        category: x.category,
        source: x.source,
        score: Number(x.score.toFixed(4)),
      }));

      pricesByKey[key] = best
        ? {
            description: best.description,
            unit: best.unit,
            price: best.price,
            category: best.category,
            source: best.source,
            score: Number(best.score.toFixed(4)),
          }
        : null;

      results.push({
        key,
        requested: { name: w.name, unit: w.unit },
        best: pricesByKey[key],
        candidates: candidatesByKey[key],
      });
    }

    // legacy-friendly list (so old clients won’t break)
    const requested = cleanedWanted.map((w) => {
      const key = normText(w.name);
      const hit = pricesByKey[key];
      return {
        query: w.name,
        key,
        match: hit
          ? {
              name: hit.description,
              unit: hit.unit,
              price: hit.price,
              source: hit.source,
            }
          : null,
      };
    });

    return res.json({
      ok: true,
      results,
      pricesByKey,
      candidatesByKey,
      requested,
      stats: {
        requested: cleanedWanted.length,
        pool: prepared.length,
        sources: { master: masterCount, user: userCount },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
