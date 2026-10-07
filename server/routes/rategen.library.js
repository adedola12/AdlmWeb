// server/routes/rategen.library.js
import express from "express";
import { normalizeState, zoneForState } from "../util/states.js";
import { normalizeZone } from "../util/zones.js";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { ensureDb } from "../db.js";
import { refuseBrowserRateWrites } from "../middleware/rateGenOnlyWrites.js";

import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { RateGenRate } from "../models/RateGenRate.js";
import { ensureMeta } from "../models/RateGenMeta.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { RateGenTradeMargin } from "../models/RateGenTradeMargin.js";
import { RateGenPlant } from "../models/RateGenPlant.js";
import { PLANT_UNIT, cleanPlantInput, mergePlantLibrary } from "../util/plantCosting.js";
import { cleanMarginRows } from "../util/tradeMargins.js";
import { tradeMarginsView } from "../util/tradeMarginsView.js";
import { ALLOWED_SECTION_KEYS } from "../util/rategenSections.js";
import {
  buildRateComposition,
  buildUserRateKey,
  getUserId,
  mergeRatesWithUserData,
  normalizeCustomRateFor,
  normalizeRateOverrideFor,
  normalizeSectionKey,
  preservePlantLines,
  toUserRateDefinition,
  compositionSubtotals,
} from "../util/rategenUserRates.js";
import {
  archiveCustomRate,
  clientIsSyncAware,
  customRateOrigin,
  deleteDecision,
  mergeBulkCustomRates,
} from "../util/rategenCustomRateGuard.js";
import {
  makeCompositionBudget,
  projectBestRate,
  projectRateCandidate,
} from "../util/rategenRateProjection.js";

const router = express.Router();

// ✅ IMPORTANT: scope auth ONLY to /library/*
// Rates are built in Rate Gen: a browser may read here (and restore an
// archived custom rate) but not write (middleware/rateGenOnlyWrites.js).
router.use("/library", requireAuth, requireEntitlement("rategen"), refuseBrowserRateWrites);

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

// Fraction of a rate's build-up that is plant/equipment hire. A "concrete mixer
// hire" rate shares the token "concrete" with a concrete BoQ line and would win on
// text alone — but it's plant, not the work item's material+labour. We demote such
// rates so a real rate wins. Returns 0 (no demotion) when there's no breakdown.
const PLANT_RE =
  /\b(excavat\w*|mixer|vibrator|poker|crane|loader|roller|grader|compressor|bulldozer|dozer|tipper|truck|pump|hire|plant|machine|machinery|equipment|scaffold\w*)\b/i;
function plantShareOf(rate) {
  const bd = Array.isArray(rate?.breakdown)
    ? rate.breakdown
    : Array.isArray(rate?.Breakdown)
      ? rate.Breakdown
      : [];
  if (!bd.length) return 0;
  let plant = 0;
  let net = 0;
  for (const b of bd) {
    const amt =
      Number(
        b?.lineTotal ??
          b?.LineTotal ??
          Number(b?.quantity ?? b?.Quantity ?? 0) * Number(b?.unitPrice ?? b?.UnitPrice ?? 0),
      ) || 0;
    if (amt <= 0) continue;
    net += amt;
    const rk = String(b?.refKind ?? b?.RefKind ?? "").toLowerCase();
    const nm = String(b?.componentName ?? b?.ComponentName ?? "");
    if (rk === "plant" || rk === "equipment" || PLANT_RE.test(nm)) plant += amt;
  }
  return net > 0 ? plant / net : 0;
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
 * Returns: { ok, results, ratesByKey, candidatesByKey, stats }
 *
 * Every candidate carries the rate's id and its per-unit split by resource
 * class — materialCost / labourCost / plantCost / otherCost — because plant is
 * its own class and a caller filing this money into a Budget has to know which
 * bucket it belongs in. The best match additionally carries the full
 * `composition` (up to a per-response cap; see util/rategenRateProjection.js).
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
          // The build-up itself, and its split by resource class. A rate's
          // material, labour and plant prices were parsed a line above and then
          // thrown away at the projection; the caller needs them to put the
          // right money in the right Budget bucket (plant is its own class, not
          // a slice of labour).
          composition: r?.composition || null,
          subtotals: compositionSubtotals(r?.composition),
          _tokens: tokens(desc),
          _unitNorm: normUnit(r?.unit),
          _plantShare: plantShareOf(r),
        };
      })
      .filter(Boolean);

    const maxCands = Math.max(3, Math.min(20, Number(limitCandidates) || 10));
    const ratesByKey = {};
    const candidatesByKey = {};
    const results = [];

    // Bounds how much build-up one response may carry; see the helper.
    const budget = makeCompositionBudget();

    for (const w of wanted) {
      const reqToks = tokens(w.description);
      const reqUnit = normUnit(w.unit);
      const descKey = normText(w.description);

      let candidates = pool
        .map((c) => {
          let s = scoreMatch(reqToks, c._tokens);
          if (reqUnit && c._unitNorm && reqUnit === c._unitNorm) s += 0.1;
          // Harder unit penalty (was ×0.75): a m³ work item shouldn't fall back to a
          // per-day plant rate just because the descriptions share a word.
          if (reqUnit && c._unitNorm && reqUnit !== c._unitNorm) s *= 0.5;
          // Demote plant/equipment-hire rates for a work item — pushes them below the
          // 0.25 acceptance floor so a real material+labour rate wins (the "Lintel
          // Concrete → plant-hire" mismatch).
          if (c._plantShare > 0.6) s -= 1.5;
          return { ...c, score: s };
        })
        .filter((x) => x.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxCands);

      const best = candidates[0] || null;

      // Candidates carry the per-unit subtotals and the rate's id, but NOT the
      // whole build-up — see util/rategenRateProjection.js for why.
      const mapped = candidates.map(projectRateCandidate);

      candidatesByKey[descKey] = mapped;
      ratesByKey[descKey] = projectBestRate(best, {
        includeComposition: budget.take(best),
      });

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
      stats: { requested: wanted.length, pool: pool.length, ...budget.stats },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/rate-items/search?q=...&limit=8
 * Lightweight type-ahead: search user's effective rates by description keyword.
 * Returns: { ok, results: [{ description, unit, totalCost, netCost, sectionLabel,
 *   source, score, rateId, materialCost, labourCost, plantCost, otherCost }] }
 * No composition here — this fires on every keystroke.
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

        // Same additive shape as a resolve candidate: the id so a pick can name
        // the rate it took, and the per-unit split by resource class so the
        // caller can file material, labour and plant money separately. The full
        // build-up stays off a type-ahead result — it fires on every keystroke.
        const subtotals = compositionSubtotals(r?.composition);
        return {
          description: desc,
          unit: String(r?.unit || ""),
          totalCost: total,
          netCost: Number(r?.netCost || 0),
          sectionLabel: String(r?.sectionLabel || r?.sectionKey || ""),
          source: String(r?.source || "master"),
          score,
          rateId: r?.rateId || r?.id || r?._id || null,
          materialCost: subtotals.materialCost,
          labourCost: subtotals.labourCost,
          plantCost: subtotals.plantCost,
          otherCost: subtotals.otherCost,
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

// A percentage the payload leaves out is filled from the rate already held,
// then the customer's trade default, then the built-in pair — never by
// rewriting one the payload carries (util/tradeMargins.js).
function normalizeUserRateOverridePayload(lib, rateId, body) {
  return normalizeRateOverrideFor(lib, {
    ...(body || {}),
    rateId,
  });
}

function normalizeUserCustomRatePayload(lib, customRateId, body) {
  return normalizeCustomRateFor(lib, {
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


/**
 * Location filter for the shared rate library.
 *
 * A consumer asking about a state should get, per rate, the most specific
 * version that exists: a rate written for that state, else one written for its
 * zone, else the location-free rate. Mongo cannot express "best match per
 * description" in a find(), so this returns the candidate set and
 * pickBestByLocation() narrows it.
 */
function locationScope(req) {
  const state = normalizeState(req.query.state) || normalizeState(req.user?.state);
  const zone =
    (state ? zoneForState(state) : null) ||
    normalizeZone(req.query.zone) ||
    req.user?.zone ||
    null;
  return { state, zone };
}

function pickBestByLocation(docs, { state, zone }) {
  const rank = (d) => (d.state && d.state === state ? 3 : d.zone && d.zone === zone ? 2 : !d.state && !d.zone ? 1 : 0);
  const best = new Map();
  for (const d of docs) {
    const r = rank(d);
    if (r === 0) continue; // written for somewhere else entirely
    const key = `${d.sectionKey}|${d.description}|${d.unit}`;
    const cur = best.get(key);
    if (!cur || r > cur.r) best.set(key, { r, d });
  }
  return [...best.values()].map((x) => x.d);
}

function toRateDefinition(r) {
  const def = {
    id: String(r._id),
    sectionKey: r.sectionKey || "",
    sectionLabel: r.sectionLabel || "",
    state: r.state || null,
    zone: r.zone || null,
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
          priceAsOf: l.priceAsOf ?? null,
        }))
      : [],
  };

  // Structured build-up for QUIV/HERON material derivation + guardrail.
  const composition = buildRateComposition(r);
  if (composition) def.composition = composition;

  return def;
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
      lib.rateOverrides = rateOverrides.map((item) => normalizeRateOverrideFor(lib, item));
      lib.ratesVersion = (lib.ratesVersion ?? 1) + 1;
    }

    if (Array.isArray(customRates)) {
      // PLANT SURVIVES THE BULK SYNC TOO.
      //
      // This path replaced every custom rate wholesale, and unlike the
      // single-rate push it never asked preservePlantLines — so one sync from a
      // Rate Gen desktop that cannot send plant stripped the plant line from
      // EVERY rate the QS had built here, in one write, each one silently worth
      // less than before. Same rule as the single push: a client that declares
      // supportsPlant is authoritative, including for a deliberate deletion.
      const storedById = new Map(
        (lib.customRates || []).map((r) => [
          String(r?.customRateId || r?.id || ""),
          typeof r?.toObject === "function" ? r.toObject() : r,
        ]),
      );
      const incoming = customRates.map((item) => {
        // R2: a missing overhead/profit is filled from the trade defaults.
        const next = normalizeCustomRateFor(lib, item);
        const prior = storedById.get(String(next.customRateId || ""));
        return prior
          ? preservePlantLines(next, prior, { clientSupportsPlant: req.body?.supportsPlant === true })
          : next;
      });
      // A rate the payload left out is NOT a deletion: see
      // util/rategenCustomRateGuard.js. Rate Gen desktop 2.9.x never
      // downloads custom rates, so its list omits every rate made elsewhere.
      const merged = mergeBulkCustomRates(lib, incoming, {
        syncAware: clientIsSyncAware(req),
      });
      lib.customRates = merged.customRates;
      lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
      if (merged.kept.length || merged.archived.length) {
        console.info(
          `[rategen] bulk custom-rate sync for ${getUserId(req)}: kept ${merged.kept.length} omitted, archived ${merged.archived.length}`
        );
      }
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

    const item = normalizeUserRateOverridePayload(lib, rateId, req.body);
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

    const incoming = normalizeUserCustomRatePayload(lib, customRateId, req.body);
    if (!incoming.title && !incoming.description) {
      return res
        .status(400)
        .json({ error: "title or description is required" });
    }

    const nextItems = [...(lib.customRates || [])];
    const existingIndex = nextItems.findIndex(
      (candidate) => String(candidate?.customRateId || "") === customRateId
    );

    // Rate Gen desktop rebuilds its push from its own material and labour
    // lists, so a plant line authored on the website is simply missing from
    // it and the rate would come back worth the plant amount less. A client
    // that understands plant says so and its payload is authoritative.
    const item = preservePlantLines(
      incoming,
      existingIndex >= 0 ? nextItems[existingIndex] : null,
      { clientSupportsPlant: req.body?.supportsPlant === true },
    );

    item.origin = customRateOrigin(existingIndex >= 0 ? nextItems[existingIndex] : item);

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

    const stored = (lib.customRates || []).find(
      (item) => String(item?.customRateId || "") === customRateId
    );
    if (!stored) {
      return res.json({ ok: true, customRatesVersion: lib.customRatesVersion ?? 1 });
    }

    // Rate Gen desktop 2.9.x sends this for every cloud rate missing from its
    // own list, including rates it never had. Answer ok so its sync carries
    // on, but keep the rate. See util/rategenCustomRateGuard.js.
    const decision = deleteDecision(stored, { syncAware: clientIsSyncAware(req) });
    if (!decision.allow) {
      console.info(
        `[rategen] kept custom rate ${customRateId} for ${getUserId(req)}: ${decision.reason}`
      );
      return res.json({
        ok: true,
        kept: true,
        reason: decision.reason,
        customRatesVersion: lib.customRatesVersion ?? 1,
      });
    }

    archiveCustomRate(lib, stored, decision.reason);
    lib.customRates = (lib.customRates || []).filter(
      (item) => String(item?.customRateId || "") !== customRateId
    );
    lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
    await lib.save();

    res.json({
      ok: true,
      customRatesVersion: lib.customRatesVersion ?? 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/trade-margins
 *
 * The customer's own overhead and profit default per trade, beside ADLM's
 * master default for the same trade (for reference) and what a NEW custom
 * rate in that trade would actually get. A default only fills a percentage a
 * rate arrives without; it never rewrites a stored rate.
 */
router.get("/library/trade-margins", async (req, res, next) => {
  try {
    await ensureDb();
    const [lib, master] = await Promise.all([
      ensureUserLibrary(req),
      RateGenTradeMargin.find({}).lean(),
    ]);
    res.json({
      ok: true,
      ...tradeMarginsView(lib.tradeMargins, master),
      version: lib.tradeMarginsVersion ?? 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /library/trade-margins
 * body: { rows: [{ sectionKey, overheadPercent, profitPercent }], baseVersion? }
 *
 * Replaces the customer's table. A row with both figures blank is dropped,
 * which is how a trade goes back to the default. Nothing already stored is
 * re-priced: the table is read only when a rate is written without a figure.
 */
router.put("/library/trade-margins", async (req, res, next) => {
  try {
    await ensureDb();
    const lib = await ensureUserLibrary(req);
    const baseVersion = Number(req.body?.baseVersion || 0);
    if (baseVersion > 0 && baseVersion !== (lib.tradeMarginsVersion ?? 1)) {
      return res.status(409).json({
        error: "Your trade margins were changed somewhere else. Reload and try again.",
        version: lib.tradeMarginsVersion ?? 1,
      });
    }
    const { rows, problem } = cleanMarginRows(req.body?.rows, ALLOWED_SECTION_KEYS);
    if (problem) return res.status(400).json({ error: problem });

    const now = new Date();
    lib.tradeMargins = rows.map((r) => ({ ...r, updatedAt: now }));
    lib.tradeMarginsVersion = (lib.tradeMarginsVersion ?? 1) + 1;
    await lib.save();

    const master = await RateGenTradeMargin.find({}).lean();
    res.json({
      ok: true,
      ...tradeMarginsView(lib.tradeMargins, master),
      version: lib.tradeMarginsVersion,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/custom-rates/deleted
 * The archive of removed custom rates, newest first.
 */
router.get("/library/custom-rates/deleted", async (req, res, next) => {
  try {
    await ensureDb();
    const lib = await ensureUserLibrary(req);
    res.json({
      ok: true,
      items: (lib.deletedCustomRates || []).map((item) => ({
        ...mapUserCustomRate(item),
        deletedAt: item.deletedAt,
        deletedReason: item.deletedReason || "",
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /library/plant
 *
 * ADLM's machines with this customer's own versions laid over them, each with
 * its day cost, hours per day and hourly rate. A machine that cannot be priced
 * says so (hourlyRate null + problems) rather than reading ₦0.
 */
router.get("/library/plant", async (req, res, next) => {
  try {
    await ensureDb();
    const [lib, master] = await Promise.all([
      ensureUserLibrary(req),
      RateGenPlant.find({ enabled: true }).lean(),
    ]);
    res.json({
      ok: true,
      items: mergePlantLibrary(master, lib.plant),
      version: lib.plantVersion ?? 1,
      unit: PLANT_UNIT,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /library/plant/:key
 * body: { baseSn?, name, category?, hoursPerDay, parts[], notes?, plantBaseVersion? }
 *
 * The customer's own machine, or (with baseSn) their own version of one of
 * ADLM's. Rates already built keep the hourly price they were built at.
 */
router.put("/library/plant/:key", async (req, res, next) => {
  try {
    await ensureDb();
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "key is required" });

    const lib = await ensureUserLibrary(req);
    const base = Number(req.body?.plantBaseVersion || 0);
    if (base > 0 && base !== (lib.plantVersion ?? 1)) {
      return res.status(409).json({
        error: "Your plant list was changed somewhere else. Reload and try again.",
        version: lib.plantVersion ?? 1,
      });
    }

    const { plant, problem } = cleanPlantInput(req.body);
    if (problem) return res.status(400).json({ error: problem });

    let baseSn = null;
    if (req.body?.baseSn !== undefined && req.body?.baseSn !== null && req.body?.baseSn !== "") {
      baseSn = Number(req.body.baseSn);
      const exists = Number.isFinite(baseSn) && (await RateGenPlant.exists({ sn: baseSn }));
      if (!exists) return res.status(400).json({ error: "That ADLM machine does not exist" });
    }

    const now = new Date();
    const row = { ...plant, key, baseSn, priceAsOf: now, updatedAt: now };
    const list = [...(lib.plant || [])].filter(
      // one version per ADLM machine, whatever key it was filed under
      (p) => p.key !== key && !(baseSn !== null && Number(p.baseSn) === baseSn),
    );
    list.push(row);
    lib.plant = list;
    lib.plantVersion = (lib.plantVersion ?? 1) + 1;
    await lib.save();

    const master = await RateGenPlant.find({ enabled: true }).lean();
    res.json({
      ok: true,
      items: mergePlantLibrary(master, lib.plant),
      version: lib.plantVersion,
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /library/plant/:key — drop the customer's own row (back to ADLM's, for a copy). */
router.delete("/library/plant/:key", async (req, res, next) => {
  try {
    await ensureDb();
    const key = String(req.params.key || "").trim();
    const lib = await ensureUserLibrary(req);
    const before = (lib.plant || []).length;
    lib.plant = (lib.plant || []).filter((p) => p.key !== key);
    if (lib.plant.length !== before) {
      lib.plantVersion = (lib.plantVersion ?? 1) + 1;
      await lib.save();
    }
    const master = await RateGenPlant.find({ enabled: true }).lean();
    res.json({
      ok: true,
      items: mergePlantLibrary(master, lib.plant),
      version: lib.plantVersion ?? 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /library/custom-rates/:customRateId/restore
 * Puts an archived custom rate back. A live rate with the same id wins.
 */
router.post("/library/custom-rates/:customRateId/restore", async (req, res, next) => {
  try {
    await ensureDb();

    const customRateId = String(req.params.customRateId || "").trim();
    const lib = await ensureUserLibrary(req);
    const archived = (lib.deletedCustomRates || []).find(
      (item) => String(item?.customRateId || "") === customRateId
    );
    if (!archived) return res.status(404).json({ error: "No deleted custom rate with that id" });

    const live = (lib.customRates || []).some(
      (item) => String(item?.customRateId || "") === customRateId
    );
    if (!live) {
      const { deletedAt, deletedReason, ...rate } =
        typeof archived.toObject === "function" ? archived.toObject() : archived;
      lib.customRates = [...(lib.customRates || []), { ...rate, updatedAt: new Date() }];
      lib.customRatesVersion = (lib.customRatesVersion ?? 1) + 1;
    }
    lib.deletedCustomRates = (lib.deletedCustomRates || []).filter(
      (item) => String(item?.customRateId || "") !== customRateId
    );
    await lib.save();

    res.json({
      ok: true,
      restored: !live,
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

    const loc = locationScope(req);
    const q = {};
    if (sectionKey) q.sectionKey = sectionKey;
    // Candidates: this state, its zone, or location-free.
    q.$and = [{ $or: [{ state: loc.state }, { zone: loc.zone }, { state: null, zone: null }] }];

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
      items: pickBestByLocation(docs, locationScope(req)).map(toRateDefinition),
      location: locationScope(req),
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
