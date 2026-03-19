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
import {
  buildUserRateKey,
  getUserId,
  mergeRatesWithUserData,
  normalizeCustomRate,
  normalizeRateOverride,
  normalizeSectionKey,
  toUserRateDefinition,
} from "../util/rategenUserRates.js";

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

function canonicalMaterialKey(raw) {
  let s = normText(raw);

  s = s.replace(/\bsharpsand\b/g, "sharp sand");
  s = s.replace(/\bsharp\s+sand\b/g, "sharp sand");
  s = s.replace(/\blongplank\b/g, "long plank");
  s = s.replace(/\blong\s+plank\b/g, "long plank");
  s = s.replace(/\bconcrete\s+nails?\b/g, "nails");
  s = s.replace(/\bnails?\b/g, "nails");
  s = s.replace(/\bbrc\s*mesh\b/g, "brc mesh");
  s = s.replace(/\bbinding\s*wire\b/g, "binding wire");
  s = s.replace(/\brebar\s*t?\s*(\d{1,2})\b/g, "rebar t$1");

  return s.replace(/\s+/g, " ").trim();
}

function compactKey(s) {
  return canonicalMaterialKey(s).replace(/\s+/g, "");
}

function tokens(s) {
  return canonicalMaterialKey(s)
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

    const pool = [];

    let masterCount = 0;
    if (includeMaster) {
      const master = await RateGenMaterial.find({ enabled: true })
        .select({
          sn: 1,
          key: 1,
          name: 1,
          unit: 1,
          defaultUnitPrice: 1,
          category: 1,
        })
        .lean();

      masterCount = Array.isArray(master) ? master.length : 0;

      for (const m of master || []) {
        const price = Number(m?.defaultUnitPrice || 0);
        const desc = String(m?.name || "").trim();
        if (!desc || !Number.isFinite(price) || price <= 0) continue;

        pool.push({
          sn: m?.sn ?? null,
          key: m?.key || "",
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
      const lib = await RateGenLibrary.findOne({ userId: getUserId(req) }).lean();
      const mats = Array.isArray(lib?.materials) ? lib.materials : [];
      userCount = mats.length;

      for (const m of mats) {
        const desc = String(m?.description || m?.name || "").trim();
        const price = Number(m?.price || 0);
        if (!desc || !Number.isFinite(price) || price <= 0) continue;

        pool.push({
          sn: m?.sn ?? null,
          key: m?.key || "",
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
        const desc = String(x.description || "").trim();
        const key = String(x.key || "").trim();

        return {
          ...x,
          _descNorm: normText(desc),
          _tokens: tokens(desc),
          _unitNorm: normUnit(x.unit),
          _canon: canonicalMaterialKey(desc),
          _compact: compactKey(desc),
          _keyCanon: canonicalMaterialKey(key),
          _keyCompact: compactKey(key),
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
      const canonKey = canonicalMaterialKey(w.name);
      const compactWanted = compactKey(w.name);
      const reqToks = tokens(w.name);
      const reqUnit = normUnit(w.unit);

      let candidates = prepared.filter((c) => {
        return (
          c._canon === canonKey ||
          c._compact === compactWanted ||
          c._keyCanon === canonKey ||
          c._keyCompact === compactWanted
        );
      });

      if (!candidates.length) {
        candidates = prepared
          .map((c) => {
            let s = scoreMatch(reqToks, c._tokens);

            if (canonKey && c._canon === canonKey) s += 0.2;
            if (compactWanted && c._compact === compactWanted) s += 0.2;
            if (canonKey && c._keyCanon === canonKey) s += 0.15;
            if (compactWanted && c._keyCompact === compactWanted) s += 0.15;

            if (reqUnit && c._unitNorm && reqUnit !== c._unitNorm) s *= 0.75;

            return { ...c, score: s };
          })
          .filter((x) => x.score >= 0.35)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxCands);
      } else {
        candidates = candidates
          .map((c) => {
            let s = 1.0;
            if (reqUnit && c._unitNorm && reqUnit === c._unitNorm) s += 0.1;
            return { ...c, score: s };
          })
          .sort((a, b) => b.score - a.score || a.price - b.price)
          .slice(0, maxCands);
      }

      const best = candidates[0] || null;

      candidatesByKey[canonKey] = candidates.map((x) => ({
        sn: x.sn,
        description: x.description,
        unit: x.unit,
        price: x.price,
        category: x.category,
        source: x.source,
        score: Number((x.score || 0).toFixed(4)),
      }));

      pricesByKey[canonKey] = best
        ? {
            description: best.description,
            unit: best.unit,
            price: best.price,
            category: best.category,
            source: best.source,
            score: Number((best.score || 0).toFixed(4)),
          }
        : null;

      results.push({
        key: canonKey,
        requested: { name: w.name, unit: w.unit },
        best: pricesByKey[canonKey],
        candidates: candidatesByKey[canonKey],
      });
    }

    const requested = cleanedWanted.map((w) => {
      const key = canonicalMaterialKey(w.name);
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

/**
 * POST /library/rate-items/resolve
 * Fuzzy-match BOQ item descriptions against the user's effective RateGen rates.
 * Body: { items: [{ description, unit }], limitCandidates?: number }
 * Returns: { ok, results, ratesByKey, candidatesByKey }
 */
router.post("/library/rate-items/resolve", async (req, res, next) => {
  try {
    await ensureDb();

    const { items, limitCandidates = 10 } = req.body || {};

    const wanted = (Array.isArray(items) ? items : [])
      .slice(0, 2000)
      .map((x) => ({
        description: String(x?.description || "").trim(),
        unit: String(x?.unit || "").trim(),
      }))
      .filter((x) => x.description);

    if (!wanted.length) {
      return res.json({ ok: true, results: [], ratesByKey: {}, candidatesByKey: {} });
    }

    // Fetch user's effective rates (master + overrides + custom)
    const masterRates = await RateGenRate.find({}).lean();
    const lib = await RateGenLibrary.findOne({ userId: getUserId(req) }).lean();
    const rateOverrides = Array.isArray(lib?.rateOverrides) ? lib.rateOverrides : [];
    const customRates = Array.isArray(lib?.customRates) ? lib.customRates : [];

    const merged = mergeRatesWithUserData(masterRates, rateOverrides, customRates);

    // Prepare pool from merged rates
    const pool = merged
      .map((r) => {
        const desc = String(r?.description || "").trim();
        const total = Number(r?.totalCost || 0);
        if (!desc || !Number.isFinite(total) || total <= 0) return null;
        return {
          description: desc,
          unit: String(r?.unit || ""),
          totalCost: total,
          netCost: Number(r?.netCost || 0),
          sectionKey: String(r?.sectionKey || ""),
          sectionLabel: String(r?.sectionLabel || r?.sectionKey || ""),
          source: String(r?.source || "master"),
          rateId: r?.rateId || r?.id || r?._id || null,
          _tokens: tokens(desc),
          _unitNorm: normUnit(r?.unit),
        };
      })
      .filter(Boolean);

    const maxCands = Math.max(3, Math.min(20, Number(limitCandidates) || 10));
    const ratesByKey = {};
    const candidatesByKey = {};
    const results = [];

    for (const w of wanted) {
      const reqToks = tokens(w.description);
      const reqUnit = normUnit(w.unit);
      const descKey = normText(w.description);

      let candidates = pool
        .map((c) => {
          let s = scoreMatch(reqToks, c._tokens);
          if (reqUnit && c._unitNorm && reqUnit === c._unitNorm) s += 0.1;
          if (reqUnit && c._unitNorm && reqUnit !== c._unitNorm) s *= 0.75;
          return { ...c, score: s };
        })
        .filter((x) => x.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxCands);

      const best = candidates[0] || null;

      const mapped = candidates.map((c) => ({
        description: c.description,
        unit: c.unit,
        totalCost: c.totalCost,
        netCost: c.netCost,
        sectionKey: c.sectionKey,
        sectionLabel: c.sectionLabel,
        source: c.source,
        score: Number((c.score || 0).toFixed(4)),
      }));

      candidatesByKey[descKey] = mapped;
      ratesByKey[descKey] = best
        ? {
            description: best.description,
            unit: best.unit,
            totalCost: best.totalCost,
            sectionLabel: best.sectionLabel,
            source: best.source,
            score: Number((best.score || 0).toFixed(4)),
          }
        : null;

      results.push({
        key: descKey,
        requested: { description: w.description, unit: w.unit },
        best: ratesByKey[descKey],
        candidates: mapped,
      });
    }

    return res.json({
      ok: true,
      results,
      ratesByKey,
      candidatesByKey,
      stats: { requested: wanted.length, pool: pool.length },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/rate-items/search?q=...&limit=8
 * Lightweight type-ahead: search user's effective rates by description keyword.
 * Returns: { ok, results: [{ description, unit, totalCost, sectionLabel, source }] }
 */
router.get("/library/rate-items/search", async (req, res, next) => {
  try {
    await ensureDb();

    const q = String(req.query?.q || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(20, Number(req.query?.limit) || 8));

    if (!q || q.length < 2) {
      return res.json({ ok: true, results: [] });
    }

    const masterRates = await RateGenRate.find({}).lean();
    const lib = await RateGenLibrary.findOne({ userId: getUserId(req) }).lean();
    const rateOverrides = Array.isArray(lib?.rateOverrides) ? lib.rateOverrides : [];
    const customRates = Array.isArray(lib?.customRates) ? lib.customRates : [];

    const merged = mergeRatesWithUserData(masterRates, rateOverrides, customRates);

    const qWords = q.split(/\s+/).filter(Boolean);

    const matches = merged
      .map((r) => {
        const desc = String(r?.description || "").trim();
        const total = Number(r?.totalCost || 0);
        if (!desc || !Number.isFinite(total) || total <= 0) return null;

        const descLower = desc.toLowerCase();
        const sectionLower = String(r?.sectionLabel || r?.sectionKey || "").toLowerCase();
        let score = 0;
        for (const w of qWords) {
          // Match against description (higher weight) and section label
          if (descLower.includes(w)) score += 2;
          else if (sectionLower.includes(w)) score += 1;
        }
        if (score === 0) return null;

        return {
          description: desc,
          unit: String(r?.unit || ""),
          totalCost: total,
          netCost: Number(r?.netCost || 0),
          sectionLabel: String(r?.sectionLabel || r?.sectionKey || ""),
          source: String(r?.source || "master"),
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.description.localeCompare(b.description))
      .slice(0, limit);

    return res.json({ ok: true, results: matches });
  } catch (err) {
    next(err);
  }
});

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

async function ensureUserLibrary(req) {
  const userId = getUserId(req);
  let lib = await RateGenLibrary.findOne({ userId });
  if (!lib) lib = await RateGenLibrary.create({ userId });
  return lib;
}

function matchesSection(item, sectionKey) {
  return !sectionKey || normalizeSectionKey(item?.sectionKey) === sectionKey;
}

function mapUserRateOverride(item) {
  return toUserRateDefinition(item, {
    id: item?.rateId || buildUserRateKey(item),
    rateId: item?.rateId || null,
    baseRateId: item?.rateId || null,
    source: "user-override",
  });
}

function mapUserCustomRate(item) {
  return toUserRateDefinition(item, {
    id: item?.customRateId || "",
    rateId: null,
    customRateId: item?.customRateId || null,
    source: "user-custom",
  });
}

function normalizeUserRateOverridePayload(rateId, body) {
  return normalizeRateOverride({
    ...(body || {}),
    rateId,
  });
}

function normalizeUserCustomRatePayload(customRateId, body) {
  return normalizeCustomRate({
    ...(body || {}),
    customRateId,
  });
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
router.get("/library/meta", async (req, res, next) => {
  try {
    await ensureDb();
    const [m, l, c, r, lib] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
      ensureMeta("rates"),
      ensureUserLibrary(req),
    ]);

    res.json({
      ok: true,
      meta: {
        materials: { version: m.version, updatedAt: m.updatedAt },
        labour: { version: l.version, updatedAt: l.updatedAt },
        compute: { version: c.version, updatedAt: c.updatedAt },
        rates: { version: r.version, updatedAt: r.updatedAt },
        library: { version: lib.version ?? 1, updatedAt: lib.updatedAt },
        userRates: {
          version: lib.ratesVersion ?? 1,
          updatedAt: lib.updatedAt,
        },
        customRates: {
          version: lib.customRatesVersion ?? 1,
          updatedAt: lib.updatedAt,
        },
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
router.get("/library/all", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);

    const [mMeta, lMeta, cMeta, rMeta, materials, labours, lib] = await Promise.all([
      ensureMeta("materials"),
      ensureMeta("labour"),
      ensureMeta("compute"),
      ensureMeta("rates"),
      RateGenMaterial.find({ enabled: true }).sort({ sn: 1 }).lean(),
      RateGenLabour.find({ enabled: true }).sort({ sn: 1 }).lean(),
      ensureUserLibrary(req),
    ]);

    const userRateOverrides = (lib.rateOverrides || [])
      .filter((item) => matchesSection(item, sectionKey))
      .map(mapUserRateOverride);
    const userCustomRates = (lib.customRates || [])
      .filter((item) => matchesSection(item, sectionKey))
      .map(mapUserCustomRate);

    res.json({
      ok: true,
      meta: {
        materialsVersion: mMeta.version,
        labourVersion: lMeta.version,
        computeVersion: cMeta.version,
        ratesVersion: rMeta.version,
        libraryVersion: lib.version ?? 1,
        userRatesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
      },
      materials,
      labours,
      userMaterials: lib.materials || [],
      userLabour: lib.labour || [],
      userRateOverrides,
      userCustomRates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/user-rates
 */
router.get("/library/user-rates", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const lib = await ensureUserLibrary(req);

    const rateOverrides = (lib.rateOverrides || [])
      .filter((item) => matchesSection(item, sectionKey))
      .map(mapUserRateOverride);
    const customRates = (lib.customRates || [])
      .filter((item) => matchesSection(item, sectionKey))
      .map(mapUserCustomRate);

    res.json({
      ok: true,
      meta: {
        ratesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
        updatedAt: lib.updatedAt,
      },
      rateOverrides,
      customRates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /library/user-rates
 */
router.put("/library/user-rates", async (req, res, next) => {
  try {
    await ensureDb();

    const {
      rateOverrides,
      customRates,
      ratesBaseVersion,
      customRatesBaseVersion,
    } = req.body || {};

    const lib = await ensureUserLibrary(req);

    if (
      Number.isFinite(ratesBaseVersion) &&
      ratesBaseVersion > 0 &&
      ratesBaseVersion !== (lib.ratesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "User rates version conflict",
        ratesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
      });
    }

    if (
      Number.isFinite(customRatesBaseVersion) &&
      customRatesBaseVersion > 0 &&
      customRatesBaseVersion !== (lib.customRatesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "Custom rates version conflict",
        ratesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
      });
    }

    if (Array.isArray(rateOverrides)) {
      lib.rateOverrides = rateOverrides.map((item) => normalizeRateOverride(item));
      lib.ratesVersion = (lib.ratesVersion ?? 1) + 1;
    }

    if (Array.isArray(customRates)) {
      lib.customRates = customRates.map((item) => normalizeCustomRate(item));
      lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
    }

    await lib.save();

    res.json({
      ok: true,
      meta: {
        ratesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
        updatedAt: lib.updatedAt,
      },
      rateOverrides: (lib.rateOverrides || []).map(mapUserRateOverride),
      customRates: (lib.customRates || []).map(mapUserCustomRate),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/user-rates/merged
 */
router.get("/library/user-rates/merged", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const [ratesMeta, lib, masterRates] = await Promise.all([
      ensureMeta("rates"),
      ensureUserLibrary(req),
      RateGenRate.find(sectionKey ? { sectionKey } : {})
        .sort({ sectionKey: 1, itemNo: 1, description: 1, _id: 1 })
        .lean(),
    ]);

    const items = mergeRatesWithUserData(
      masterRates,
      (lib.rateOverrides || []).filter((item) => matchesSection(item, sectionKey)),
      (lib.customRates || []).filter((item) => matchesSection(item, sectionKey))
    );

    res.json({
      ok: true,
      meta: {
        ratesVersion: ratesMeta.version,
        userRatesVersion: lib.ratesVersion ?? 1,
        customRatesVersion: lib.customRatesVersion ?? 1,
        updatedAt: lib.updatedAt,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /library/user-rates/override/:rateId
 */
router.put("/library/user-rates/override/:rateId", async (req, res, next) => {
  try {
    await ensureDb();

    const rateId = String(req.params.rateId || "").trim();
    if (!rateId) return res.status(400).json({ error: "rateId is required" });

    const ratesBaseVersion = Number(req.body?.ratesBaseVersion || 0);
    const lib = await ensureUserLibrary(req);

    if (
      ratesBaseVersion > 0 &&
      ratesBaseVersion !== (lib.ratesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "User rates version conflict",
        ratesVersion: lib.ratesVersion ?? 1,
      });
    }

    const item = normalizeUserRateOverridePayload(rateId, req.body);
    if (!item.description) {
      return res.status(400).json({ error: "description is required" });
    }
    if (!item.unit) {
      return res.status(400).json({ error: "unit is required" });
    }

    const nextItems = [...(lib.rateOverrides || [])];
    const exactIndex = nextItems.findIndex(
      (candidate) => String(candidate?.rateId || "") === rateId
    );
    const keyIndex =
      exactIndex >= 0
        ? exactIndex
        : nextItems.findIndex(
            (candidate) => buildUserRateKey(candidate) === buildUserRateKey(item)
          );

    if (keyIndex >= 0) nextItems[keyIndex] = item;
    else nextItems.push(item);

    lib.rateOverrides = nextItems;
    lib.ratesVersion = (lib.ratesVersion ?? 1) + 1;
    await lib.save();

    res.json({
      ok: true,
      ratesVersion: lib.ratesVersion ?? 1,
      item: mapUserRateOverride(item),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /library/user-rates/override/:rateId
 */
router.delete("/library/user-rates/override/:rateId", async (req, res, next) => {
  try {
    await ensureDb();

    const rateId = String(req.params.rateId || "").trim();
    if (!rateId) return res.status(400).json({ error: "rateId is required" });

    const ratesBaseVersion = Number(req.query.ratesBaseVersion || 0);
    const lib = await ensureUserLibrary(req);

    if (
      ratesBaseVersion > 0 &&
      ratesBaseVersion !== (lib.ratesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "User rates version conflict",
        ratesVersion: lib.ratesVersion ?? 1,
      });
    }

    const before = (lib.rateOverrides || []).length;
    lib.rateOverrides = (lib.rateOverrides || []).filter(
      (item) => String(item?.rateId || "") !== rateId
    );

    if (lib.rateOverrides.length !== before) {
      lib.ratesVersion = (lib.ratesVersion ?? 1) + 1;
      await lib.save();
    }

    res.json({
      ok: true,
      ratesVersion: lib.ratesVersion ?? 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/custom-rates
 */
router.get("/library/custom-rates", async (req, res, next) => {
  try {
    await ensureDb();

    const sectionKey = normalizeSectionKey(req.query.sectionKey);
    const lib = await ensureUserLibrary(req);

    const items = (lib.customRates || [])
      .filter((item) => matchesSection(item, sectionKey))
      .map(mapUserCustomRate);

    res.json({
      ok: true,
      customRatesVersion: lib.customRatesVersion ?? 1,
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /library/custom-rates/:customRateId
 */
router.put("/library/custom-rates/:customRateId", async (req, res, next) => {
  try {
    await ensureDb();

    const customRateId = String(req.params.customRateId || "").trim();
    if (!customRateId) {
      return res.status(400).json({ error: "customRateId is required" });
    }

    const customRatesBaseVersion = Number(req.body?.customRatesBaseVersion || 0);
    const lib = await ensureUserLibrary(req);

    if (
      customRatesBaseVersion > 0 &&
      customRatesBaseVersion !== (lib.customRatesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "Custom rates version conflict",
        customRatesVersion: lib.customRatesVersion ?? 1,
      });
    }

    const item = normalizeUserCustomRatePayload(customRateId, req.body);
    if (!item.title && !item.description) {
      return res
        .status(400)
        .json({ error: "title or description is required" });
    }

    const nextItems = [...(lib.customRates || [])];
    const existingIndex = nextItems.findIndex(
      (candidate) => String(candidate?.customRateId || "") === customRateId
    );

    if (existingIndex >= 0) nextItems[existingIndex] = item;
    else nextItems.push(item);

    lib.customRates = nextItems;
    lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
    await lib.save();

    res.json({
      ok: true,
      customRatesVersion: lib.customRatesVersion ?? 1,
      item: mapUserCustomRate(item),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /library/custom-rates/:customRateId
 */
router.delete("/library/custom-rates/:customRateId", async (req, res, next) => {
  try {
    await ensureDb();

    const customRateId = String(req.params.customRateId || "").trim();
    if (!customRateId) {
      return res.status(400).json({ error: "customRateId is required" });
    }

    const customRatesBaseVersion = Number(req.query.customRatesBaseVersion || 0);
    const lib = await ensureUserLibrary(req);

    if (
      customRatesBaseVersion > 0 &&
      customRatesBaseVersion !== (lib.customRatesVersion ?? 1)
    ) {
      return res.status(409).json({
        error: "Custom rates version conflict",
        customRatesVersion: lib.customRatesVersion ?? 1,
      });
    }

    const before = (lib.customRates || []).length;
    lib.customRates = (lib.customRates || []).filter(
      (item) => String(item?.customRateId || "") !== customRateId
    );

    if (lib.customRates.length !== before) {
      lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
      await lib.save();
    }

    res.json({
      ok: true,
      customRatesVersion: lib.customRatesVersion ?? 1,
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

// function normText(s) {
//   return String(s || "")
//     .toLowerCase()
//     .replace(BRACKET_RE, " ")
//     .replace(PAREN_RE, " ")
//     .replace(/[^a-z0-9\s]/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function tokens(s) {
//   return normText(s)
//     .split(" ")
//     .map((x) => x.trim())
//     .filter(Boolean)
//     .filter((x) => x.length > 1 && !STOP.has(x) && !/^\d+$/.test(x));
// }

// function normUnit(u) {
//   const raw = String(u || "")
//     .trim()
//     .toLowerCase();
//   if (!raw) return "";
//   if (raw === "bag" || raw === "bags") return "bag";
//   if (
//     raw === "t" ||
//     raw === "ton" ||
//     raw === "tons" ||
//     raw === "tonne" ||
//     raw === "tonnes"
//   )
//     return "t";
//   const compact = raw.replace(/\s+/g, "");
//   if (compact === "m3" || compact === "m³" || compact === "cum") return "m3";
//   if (/\b(litre|liter|ltr|l)\b/.test(raw)) return "l";
//   return raw;
// }

// function scoreMatch(reqTokens, candTokens) {
//   if (!reqTokens.length || !candTokens.length) return 0;

//   const A = new Set(reqTokens);
//   const B = new Set(candTokens);

//   let inter = 0;
//   for (const x of A) if (B.has(x)) inter += 1;

//   const coverage = inter / A.size;
//   const precision = inter / B.size;

//   return 0.75 * coverage + 0.25 * precision;
// }

/**
 * POST /library/material-prices/resolve-legacy
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

router.post(
  "/library/material-prices/resolve-legacy",
  async (req, res, next) => {
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
        const lib = await RateGenLibrary.findOne({
          userId: getUserId(req),
        }).lean();
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
  },
);

export default router;
