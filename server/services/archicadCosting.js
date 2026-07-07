// server/services/archicadCosting.js
//
// QUIV for ArchiCAD — costing engine. Faithful JavaScript port of the QUIV
// Revit plugin's rate engine (RevitPluginArch/Infrastructure/Rates):
//   RateComposition.cs / RateCompositionParser.cs  → parseComposition / normalizeComposition
//   RateCompositionValidator.cs                    → validateComposition / enforceCeiling
//   TakeoffMaterialDeriver.cs (ResidualLabourUnit) → residualLabourUnit
//   ProfitMarginCalculator.cs                      → margin maths in computeLineAmounts
// plus the line→rate matcher (token coverage + unit agreement + kg↔t soft match)
// per revit-quiv-analysis.md §9.3 and the labour precedence of api-contract.md.
//
// Pure functions only in this module (no DB access) so the engine is
// unit-testable; the route layer supplies rate candidates and labour library.

import mongoose from "mongoose";
import { RateGenRate } from "../models/RateGenRate.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";
import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { fetchMasterLabour } from "../util/rategenMaster.js";

/* ────────────────────────────── constants ────────────────────────────── */

export const KIND = {
  MATERIAL: "material",
  LABOUR: "labour",
  PLANT: "plant",
  CONSUMABLE: "consumable",
  OTHER: "other",
};

// Guardrail tolerances (RateCompositionValidator.cs).
export const ABSOLUTE_TOLERANCE_MONEY = 1.0;
export const RELATIVE_TOLERANCE = 0.005;

// Category catalogue — fixed order per api-contract.md.
export const CATEGORIES = [
  { key: "substructure", title: "Substructure", nrm: "1" },
  { key: "frame", title: "Frame", nrm: "2.1" },
  { key: "upperFloors", title: "Upper Floors", nrm: "2.2" },
  { key: "roof", title: "Roof", nrm: "2.3" },
  { key: "externalWalls", title: "External Walls", nrm: "2.5" },
  { key: "internalWalls", title: "Internal Walls", nrm: "2.7" },
  { key: "windowsExternalDoors", title: "Windows & External Doors", nrm: "2.6" },
  { key: "internalDoors", title: "Internal Doors", nrm: "2.8" },
];
const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export const DEFAULT_CURRENCY = "NGN"; // RateGen carries no currency field → NGN, no FX.

/* ────────────────────────── small helpers ────────────────────────── */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readStr(obj, ...names) {
  if (!obj) return "";
  for (const name of names) {
    const v = obj[name];
    if (v === undefined || v === null) continue;
    const text = String(v).trim();
    if (text) return text;
  }
  return "";
}

function readNum(obj, ...names) {
  if (!obj) return 0;
  for (const name of names) {
    const v = obj[name];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/* ──────────────────── kind classification (parser port) ──────────────────── */

const LABOUR_KEYWORDS = [
  "labour", "labor", "operator", "banksman", "mason", "carpenter", "steel fixer",
  "steelfixer", "fixer", "foreman", "ganger", "helper", "skilled", "unskilled", "craftsman",
];
const PLANT_KEYWORDS = [
  "bulldozer", "dozer", "mixer", "compressor", "excavator", "loader", "payloader",
  "crane", "vibrator", "poker", "machine", "plant", "roller", "grader", "truck", "tipper", "pump",
];
const CONSUMABLE_KEYWORDS = [
  "diesel", "fuel", "petrol", "oil", "consumable", "consumables", "lubricant", "grease",
];

export function classifyKind(name, explicitKind = null, labourId = null, materialId = null) {
  if (labourId) return KIND.LABOUR;
  if (materialId) return KIND.MATERIAL;

  const k = String(explicitKind || "").trim().toLowerCase();
  switch (k) {
    case "labour":
    case "labor": return KIND.LABOUR;
    case "material": return KIND.MATERIAL;
    case "plant":
    case "equipment": return KIND.PLANT;
    case "consumable":
    case "consumables": return KIND.CONSUMABLE;
    default: break;
  }

  const n = String(name || "").toLowerCase();
  if (CONSUMABLE_KEYWORDS.some((w) => n.includes(w))) return KIND.CONSUMABLE;
  if (PLANT_KEYWORDS.some((w) => n.includes(w))) return KIND.PLANT;
  if (LABOUR_KEYWORDS.some((w) => n.includes(w))) return KIND.LABOUR;
  return KIND.MATERIAL; // anything physical and priced defaults to material
}

/* ──────────────── composition parsing (RateCompositionParser port) ──────────────── */

const COMPOSITION_CONTAINER_KEYS = [
  "composition", "rateComposition", "buildUp", "buildup", "breakdown", "build_up",
];
// "breakdown" and "lines" are RateGen's own array names — kept first so the
// real RateGen shape wins. Note: RateGenRate breakdown lines call the total
// "totalPrice" (see models/RateGenRate.js), added to the total aliases below.
const COMPONENT_ARRAY_KEYS = [
  "breakdown", "components", "items", "lineItems", "lines", "rows", "elements", "materials",
];

function componentEffectiveTotal(c) {
  return c.totalCost > 0 ? c.totalCost : c.quantity * c.unitPrice;
}

function parseComponent(item) {
  if (!item || typeof item !== "object") return null;
  const name = readStr(item, "name", "componentName", "description", "component", "title", "material", "label", "refName");
  if (!name) return null;

  // Compute-item lines express quantity as qtyPerUnit × factor and carry the
  // captured price in unitPriceAtBuild; finalized breakdown lines use
  // quantity/unitPrice/lineTotal(totalPrice) directly.
  let quantity = readNum(item, "quantity", "qty", "qtyPerUnit");
  const factor = readNum(item, "factor");
  if (factor > 0 && Math.abs(factor - 1) > 1e-9) quantity *= factor;

  const c = {
    name,
    unit: readStr(item, "unit"),
    quantity,
    unitPrice: readNum(item, "unitPrice", "rate", "price", "unitCost", "unitPriceAtBuild"),
    totalCost: readNum(item, "totalCost", "total", "amount", "lineTotal", "totalPrice"),
    materialId: readStr(item, "materialId"),
    labourId: readStr(item, "labourId"),
  };
  const explicitKind = readStr(item, "kind", "refKind", "rateType", "type", "category");
  c.kind = classifyKind(name, explicitKind, c.labourId, c.materialId);
  return c;
}

function findComponentArray(scope) {
  if (!scope || typeof scope !== "object") return null;

  // CustomRate documents split inputs into parallel materials[] + labour[]
  // arrays; merge them so the labour lines aren't dropped.
  const mats = Array.isArray(scope.materials) ? scope.materials : null;
  const labs = Array.isArray(scope.labour) ? scope.labour : null;
  if (mats && labs && (mats.length > 0 || labs.length > 0)) {
    return [...mats, ...labs];
  }

  for (const key of COMPONENT_ARRAY_KEYS) {
    const a = scope[key];
    if (Array.isArray(a) && a.length > 0) return a;
  }
  return null;
}

/**
 * Defensively reads a composition out of a rate-ish object. Handles the three
 * real shapes: finalized RateGenRate (breakdown[] + netCost/OH/profit values),
 * compute item (lines[] + poPercent / *Default percents), and custom rate
 * (materials[]+labour[] merge). Returns null when nothing structured exists.
 */
export function parseComposition(rate) {
  if (!rate || typeof rate !== "object") return null;

  let scope = rate;
  for (const key of COMPOSITION_CONTAINER_KEYS) {
    const nested = rate[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      scope = nested;
      break;
    }
  }

  const arr = findComponentArray(scope) || findComponentArray(rate);
  const components = [];
  if (arr) {
    for (const item of arr) {
      const c = parseComponent(item);
      if (c) components.push(c);
    }
  }

  // Finalized rates split overhead vs profit; compute items carry a single
  // combined "PO" percent or only the *Default fields. Prefer the explicit
  // split, fall back to the defaults, then fold PO into overhead so
  // (overhead + profit) always equals the true markup.
  let overheadPercent = readNum(scope, "overheadPercent", "overheadPct", "overhead_percentage", "overheadPercentDefault");
  if (overheadPercent <= 0) overheadPercent = readNum(rate, "overheadPercent", "overheadPct", "overheadPercentDefault");

  let profitPercent = readNum(scope, "profitPercent", "profitPct", "profit_percentage", "profitPercentDefault");
  if (profitPercent <= 0) profitPercent = readNum(rate, "profitPercent", "profitPct", "profitPercentDefault");

  if (overheadPercent <= 0 && profitPercent <= 0) {
    let po = readNum(scope, "poPercent", "poPct");
    if (po <= 0) po = readNum(rate, "poPercent", "poPct");
    if (po > 0) overheadPercent = po;
  }

  const overheadAmount = readNum(scope, "overheadAmount", "overheadValue", "overhead");
  const profitAmount = readNum(scope, "profitAmount", "profitValue", "profit");
  const netCost = readNum(scope, "netCost", "baseCost", "primeCost", "net");
  let totalCost = readNum(rate, "totalCost", "total", "price");
  if (totalCost <= 0) totalCost = readNum(scope, "totalCost", "total");

  if (
    components.length === 0 &&
    overheadPercent <= 0 && profitPercent <= 0 &&
    overheadAmount <= 0 && profitAmount <= 0 &&
    netCost <= 0
  ) {
    return null;
  }

  const comp = {
    rateId: readStr(rate, "rateId", "id", "_id"),
    customRateId: readStr(rate, "customRateId"),
    description: readStr(rate, "description", "title", "name"),
    unit: readStr(rate, "unit"),
    source: readStr(rate, "source"),
    components,
    netCost,
    overheadPercent,
    profitPercent,
    overheadAmount,
    profitAmount,
    totalCost,
  };
  return normalizeComposition(comp);
}

/* ─────────────── composition normalization (RateCompositionDto.Normalize) ─────────────── */

export function compMaterialCost(comp) {
  return (comp?.components || [])
    .filter((c) => c && c.kind === KIND.MATERIAL)
    .reduce((s, c) => s + componentEffectiveTotal(c), 0);
}
export function compLabourCost(comp) {
  return (comp?.components || [])
    .filter((c) => c && c.kind === KIND.LABOUR)
    .reduce((s, c) => s + componentEffectiveTotal(c), 0);
}
export function compPlantCost(comp) {
  return (comp?.components || [])
    .filter((c) => c && c.kind === KIND.PLANT)
    .reduce((s, c) => s + componentEffectiveTotal(c), 0);
}
export function compOtherCost(comp) {
  return (comp?.components || [])
    .filter((c) => c && c.kind !== KIND.MATERIAL && c.kind !== KIND.LABOUR && c.kind !== KIND.PLANT)
    .reduce((s, c) => s + componentEffectiveTotal(c), 0);
}
export function expectedTotal(comp) {
  return toNum(comp?.netCost) + toNum(comp?.overheadAmount) + toNum(comp?.profitAmount);
}

/**
 * Recomputes netCost / overheadAmount / profitAmount / totalCost so a
 * partially-populated composition becomes fully balanced. Does NOT overwrite
 * a non-zero totalCost coming from the server — the guardrail validates that.
 */
export function normalizeComposition(comp) {
  if (!comp) return comp;
  if (Array.isArray(comp.components) && comp.components.length > 0) {
    const sum = comp.components.reduce((s, c) => (c ? s + componentEffectiveTotal(c) : s), 0);
    if (sum > 0) comp.netCost = sum;
  }

  if (comp.overheadAmount <= 0 && comp.overheadPercent > 0) {
    comp.overheadAmount = comp.netCost * (comp.overheadPercent / 100);
  } else if (comp.overheadAmount > 0 && comp.overheadPercent <= 0 && comp.netCost > 0) {
    comp.overheadPercent = (comp.overheadAmount / comp.netCost) * 100;
  }

  // Profit applied ON net cost (matches the website Rate Composition modal).
  if (comp.profitAmount <= 0 && comp.profitPercent > 0) {
    comp.profitAmount = comp.netCost * (comp.profitPercent / 100);
  } else if (comp.profitAmount > 0 && comp.profitPercent <= 0 && comp.netCost > 0) {
    comp.profitPercent = (comp.profitAmount / comp.netCost) * 100;
  }

  if (comp.totalCost <= 0) {
    comp.totalCost = comp.netCost + comp.overheadAmount + comp.profitAmount;
  }
  return comp;
}

/* ─────────────── guardrail (RateCompositionValidator port) ─────────────── */

/**
 * Clamps a stated headline rate DOWN to the build-up total when it exceeds it
 * by more than max(1.0, 0.5% × expected). Returns the value to actually use.
 */
export function enforceCeiling(comp, statedTotal) {
  if (!comp) return statedTotal;
  normalizeComposition(comp);
  const expected = expectedTotal(comp);
  if (expected <= 0) return statedTotal;
  const tolerance = Math.max(ABSOLUTE_TOLERANCE_MONEY, Math.abs(expected) * RELATIVE_TOLERANCE);
  return statedTotal - expected > tolerance ? expected : statedTotal;
}

/* ─────────────── residual labour (TakeoffMaterialDeriver.ResidualLabourUnit) ─────────────── */

/**
 * Back-calculates a per-unit labour cost for a build-up that prices
 * material/plant but itemises no labour: strips overhead+profit off the
 * headline rate to recover the true net, then subtracts the non-labour net.
 * Returns 0 when the headline carries no slack.
 */
export function residualLabourUnit(comp) {
  if (!comp || toNum(comp.totalCost) <= 0) return 0;
  const markup = (toNum(comp.overheadPercent) + toNum(comp.profitPercent)) / 100;
  const trueNet = markup > -1 ? comp.totalCost / (1 + markup) : comp.totalCost;
  const nonLabour = compMaterialCost(comp) + compPlantCost(comp) + compOtherCost(comp);
  const residual = trueNet - nonLabour;
  return residual > 0.005 ? residual : 0;
}

/* ─────────────────────────── units & tokens ─────────────────────────── */

export function normalizeUnit(u) {
  let s = String(u || "").trim().toLowerCase()
    .replace(/²/g, "2").replace(/³/g, "3")
    .replace(/\^/g, "").replace(/\./g, "").replace(/\s+/g, "");
  if (["m2", "sqm", "sm", "squaremetre", "squaremeter", "sqmetre"].includes(s)) return "m2";
  if (["m3", "cum", "cbm", "cubicmetre", "cubicmeter"].includes(s)) return "m3";
  if (["m", "lm", "mtr", "metre", "meter", "linm", "rm"].includes(s)) return "m";
  if (["no", "nr", "nos", "each", "ea", "number", "pcs", "pc", "unit"].includes(s)) return "nr";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(s)) return "kg";
  if (["t", "ton", "tons", "tonne", "tonnes", "mt"].includes(s)) return "t";
  if (["sum", "ls", "lumpsum", "lump"].includes(s)) return "sum";
  if (["item", "itm"].includes(s)) return "item";
  return s;
}

const STOP_TOKENS = new Set([
  "and", "the", "for", "with", "per", "into", "onto", "including", "incl",
  "thick", "wide", "deep", "high", "not", "exceeding", "all", "other",
]);

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9:]+/)
    // Pure numbers / mm sizes are matched via sizeTokens, not token overlap.
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t) && !/^\d+(mm)?$/.test(t));
}

// Size tokens like "y12", "r10", "225mm", "150", mix ratios "1:2:4".
function sizeTokens(text) {
  const s = String(text || "").toLowerCase();
  const out = new Set();
  for (const m of s.matchAll(/\b([yr]\d{1,2})\b/g)) out.add(m[1]);
  for (const m of s.matchAll(/\b(\d{2,4})\s*mm\b/g)) out.add(`${m[1]}mm`);
  for (const m of s.matchAll(/\b(\d+:\d+:\d+)\b/g)) out.add(m[1]);
  return out;
}

const WORK_KINDS = [
  // Element kinds first: whole-element BoQ lines ("Beam 225 x 450mm",
  // "Reinforced concrete in slab") must key on the element, not on activity
  // words like "reinforced"/"formwork" that appear inside the build-up text.
  ["curtainwall", ["curtain wall", "curtain walling", "cladding"]],
  ["window", ["window", "louvre", "casement"]],
  ["door", ["door"]],
  ["footing", ["footing", "foundation"]],
  ["slab", ["slab", "oversite", "suspended floor"]],
  ["beam", ["beam", "lintel"]],
  ["column", ["column"]],
  ["roofing", ["roof", "rafter", "purlin", "truss", "longspan"]],
  ["wall", ["wall", "walling", "blockwork", "sandcrete", "masonry", "brick"]],
  // Activity kinds (original Revit-ported list) as fallback.
  ["formwork", ["formwork", "shutter", "shuttering", "soffit", "falsework"]],
  ["rebar", ["rebar", "reinforcement", "reinforc", "brc", "mesh", "bar", "y12", "y16", "y10", "r10", "binding"]],
  ["concrete", ["concrete", "rcc", "blinding", "insitu", "in-situ", "grade"]],
  ["blockwork", ["block", "blockwork", "masonry", "sandcrete", "walling", "brick"]],
  ["excavation", ["excavat", "digging", "trench", "cart away", "disposal", "filling", "hardcore", "laterite"]],
  ["paint", ["paint", "emulsion", "gloss", "primer"]],
  ["plaster", ["plaster", "render", "screed", "skimming"]],
  ["tiling", ["tile", "tiling", "terrazzo", "granite floor", "marble"]],
  ["roofing", ["roof", "rafter", "purlin", "truss", "longspan", "aluminium sheet"]],
  ["door", ["door"]],
  ["window", ["window", "glazing", "curtain wall", "louvre"]],
  ["steelwork", ["steelwork", "steel section", "stanchion", "universal beam", "hollow section"]],
  ["dpc", ["dpc", "dpm", "damp proof", "polythene"]],
];

export function detectWorkKind(text) {
  const s = String(text || "").toLowerCase();
  for (const [kind, kws] of WORK_KINDS) {
    if (kws.some((k) => s.includes(k))) return kind;
  }
  return "";
}

/* ─────────────────── rate matching (§9.3 scoring port) ─────────────────── */

function unitAgreement(lineUnit, candUnit) {
  const a = normalizeUnit(lineUnit);
  const b = normalizeUnit(candUnit);
  if (!a || !b) return { compatible: false, exact: false, soft: false, factor: 1 };
  if (a === b) return { compatible: true, exact: true, soft: false, factor: 1 };
  // Soft kg↔t match with conversion: rate per kg = rate per t / 1000.
  if (a === "kg" && b === "t") return { compatible: true, exact: false, soft: true, factor: 1 / 1000 };
  if (a === "t" && b === "kg") return { compatible: true, exact: false, soft: true, factor: 1000 };
  return { compatible: false, exact: false, soft: false, factor: 1 };
}

function tokenSetScore(lineTokens, candTokens) {
  if (!lineTokens.length || !candTokens.length) return 0;
  const lineSet = new Set(lineTokens);
  const candSet = new Set(candTokens);
  let overlap = 0;
  for (const t of lineSet) if (candSet.has(t)) overlap++;
  // Coverage both ways, weighted so a full two-way match ≈ 1.2 (the plugin's
  // confident-accept threshold) before unit/work-kind bonuses.
  return (overlap / lineSet.size) * 0.7 + (overlap / candSet.size) * 0.5;
}

/**
 * Scores one candidate rate against a BoQ line. Port of
 * ScoreQuantityRateMatch: token base + unit agreement (+0.18 exact / +0.12
 * soft kg↔t / −0.25 mismatch), work-kind (+0.35 / −0.25), plant-heavy −1.5,
 * size tokens (+0.45 / −0.35 when candidate carries unmatched sizes).
 */
export function scoreRateMatch(line, cand) {
  let score = tokenSetScore(line.tokens, cand.tokens);

  const ua = unitAgreement(line.unit, cand.unit);
  if (ua.exact) score += 0.18;
  else if (ua.soft) score += 0.12;
  else score -= 0.25;

  if (line.workKind && cand.workKind) {
    score += line.workKind === cand.workKind ? 0.35 : -0.25;
  }

  if (line.workKind && cand.plantHeavy) score -= 1.5;

  const lineSizes = line.sizes || sizeTokens(line.description);
  const candSizes = cand.sizes || sizeTokens(cand.description);
  if (candSizes.size > 0) {
    let matched = false;
    for (const s of candSizes) if (lineSizes.has(s)) { matched = true; break; }
    score += matched ? 0.45 : -0.35;
  }

  return { score, unit: ua };
}

/**
 * Picks the best candidate for a BoQ line. Confidence per the plugin:
 * accept when best ≥ 1.2; reject below 0.72; otherwise require a clear gap
 * (best − second ≥ 0.08). Unit compatibility (exact or kg↔t) is REQUIRED for
 * acceptance so a per-m² rate never prices an m³ line.
 */
export function selectBestRate(line, candidates) {
  const scored = [];
  const prepared = {
    description: line.description,
    unit: line.unit,
    tokens: tokenize(line.description),
    workKind: detectWorkKind(line.description),
    sizes: sizeTokens(line.description),
  };
  for (const cand of candidates || []) {
    const r = scoreRateMatch(prepared, cand);
    scored.push({ cand, score: r.score, unit: r.unit });
  }
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || !best.unit.compatible) return null;
  const second = scored.find((s) => s !== best && s.cand.groupKey !== best.cand.groupKey);

  if (best.score >= 1.2) return best;
  if (best.score < 0.72) return null;
  if (!second || best.score - second.score >= 0.08) return best;
  return null;
}

/* ─────────── labour library fallback (unit-safe match, §8.3 port) ─────────── */

const GENERIC_LABOUR_TOKENS = new Set([
  "labour", "labor", "work", "works", "gang", "rate", "cost", "per", "and", "the", "for",
]);

/**
 * Unit-safe labour library match: the labour entry's normalized unit must
 * EQUAL the work unit, and the fraction of the entry's meaningful tokens
 * present in the work-line description must be ≥ 0.6.
 */
export function matchLabourLibrary(lineDescription, lineUnit, labourLibrary) {
  const workUnit = normalizeUnit(lineUnit);
  if (!workUnit) return null;
  const lineTokens = new Set(tokenize(lineDescription));

  let best = null;
  for (const entry of labourLibrary || []) {
    if (!entry || toNum(entry.defaultUnitPrice ?? entry.price) <= 0) continue;
    if (normalizeUnit(entry.unit) !== workUnit) continue;
    const tokens = tokenize(entry.name).filter((t) => !GENERIC_LABOUR_TOKENS.has(t));
    if (!tokens.length) continue;
    let hit = 0;
    for (const t of tokens) if (lineTokens.has(t)) hit++;
    const coverage = hit / tokens.length;
    if (coverage >= 0.6 && (!best || coverage > best.coverage)) {
      best = { entry, coverage };
    }
  }
  return best;
}

/* ───────────────────── labour precedence (contract §labour) ───────────────────── */

/**
 * Labour precedence exactly per api-contract.md:
 *  1. rate-breakdown  — Σ kind:"labour" lines per work unit (gangComposition attached)
 *  2. residual        — trueNet = total/(1+(OH+PF)/100); labour = max(0, trueNet − non-labour)
 *  3. labour-library  — unit-safe RateGenLabour match
 *  4. unpriced        — rate 0, flagged
 */
export function deriveLabour({ comp, description, unit, labourLibrary }) {
  if (comp) {
    const breakdownLabour = compLabourCost(comp);
    if (breakdownLabour > 0) {
      const gang = (comp.components || [])
        .filter((c) => c && c.kind === KIND.LABOUR)
        .map((c) => ({
          name: c.name,
          unit: c.unit || "",
          qtyPerUnit: toNum(c.quantity),
          unitPrice: toNum(c.unitPrice),
        }));
      return {
        method: "rate-breakdown",
        labourUnitRate: breakdownLabour,
        gangComposition: gang,
        sourceRateId: null,
        notes: "",
      };
    }

    const residual = residualLabourUnit(comp);
    if (residual > 0) {
      const markup = toNum(comp.overheadPercent) + toNum(comp.profitPercent);
      const trueNet = comp.totalCost / (1 + markup / 100);
      const nonLabour = compMaterialCost(comp) + compPlantCost(comp) + compOtherCost(comp);
      return {
        method: "residual",
        labourUnitRate: residual,
        gangComposition: [],
        sourceRateId: null,
        notes:
          `residual: headline ${round2(comp.totalCost)} / (1 + ${round2(markup)}%) = trueNet ` +
          `${round2(trueNet)}; − non-labour ${round2(nonLabour)} = ${round2(residual)}/unit`,
      };
    }
  }

  const lib = matchLabourLibrary(description, unit, labourLibrary);
  if (lib) {
    const price = toNum(lib.entry.defaultUnitPrice ?? lib.entry.price);
    return {
      method: "labour-library",
      labourUnitRate: price,
      gangComposition: [
        { name: lib.entry.name, unit: lib.entry.unit || "", qtyPerUnit: 1, unitPrice: price },
      ],
      sourceRateId: lib.entry._id ? String(lib.entry._id) : null,
      notes: `labour library match (coverage ${lib.coverage.toFixed(2)})`,
    };
  }

  return { method: "unpriced", labourUnitRate: 0, gangComposition: [], sourceRateId: null, notes: "" };
}

/* ──────────────────────── amounts & margin maths ──────────────────────── */

function round2(v) {
  return Math.round(toNum(v) * 100) / 100;
}

/**
 * Recomputes the money fields on a costed line from its unit figures.
 * unitRate = clamped headline (or net×(1+OH)×(1+margin) after a margin edit);
 * marginAmount = totalAmount − netUnitCost×(1+OH%/100)×qty (ProfitMarginCalculator).
 */
export function computeLineAmounts(line) {
  const qty = toNum(line.quantity);
  line.totalAmount = round2(qty * toNum(line.unitRate));
  line.materialAmount = round2(qty * toNum(line.materialUnitCost));
  line.labourAmount = round2(qty * toNum(line.labourProvenance?.labourUnitRate));
  const directUnit = toNum(line.netUnitCost) * (1 + toNum(line.overheadPercent) / 100);
  line.marginAmount = round2(line.totalAmount - directUnit * qty);
  return line;
}

/**
 * Applies an edited margin % to a line: unitRate = netUnitCost × (1+OH%/100)
 * × (1+margin%/100), then recomputes amounts. Lines with no known net cost
 * (unpriced/manual) keep their rate — only the stored percent changes.
 */
export function applyMarginToLine(line, marginPercent) {
  const m = toNum(marginPercent);
  line.marginPercent = m;
  if (toNum(line.netUnitCost) > 0) {
    line.unitRate = round2(
      toNum(line.netUnitCost) * (1 + toNum(line.overheadPercent) / 100) * (1 + m / 100),
    );
  }
  return computeLineAmounts(line);
}

/* ─────────────────────────── line costing ─────────────────────────── */

/**
 * Prices one canonical BoQ line against a matched candidate. `match` is the
 * output of selectBestRate (or null → unpriced path); `labourLibrary` is the
 * RateGenLabour list for the fallback tier.
 */
export function costLine(rawLine, match, labourLibrary) {
  const line = {
    itemRef: rawLine.itemRef || "",
    category: rawLine.category || "",
    categoryTitle:
      rawLine.categoryTitle ||
      CATEGORY_BY_KEY.get(rawLine.category)?.title ||
      rawLine.category || "",
    description: rawLine.description || "",
    unit: normalizeUnit(rawLine.unit) || rawLine.unit || "",
    quantity: toNum(rawLine.quantity),
    quivType: rawLine.quivType || "",
    elementGuids: Array.isArray(rawLine.elementGuids) ? rawLine.elementGuids : [],
    elementQuantities: Array.isArray(rawLine.elementQuantities) ? rawLine.elementQuantities : [],
    elementQuantitiesEstimated: !!rawLine.elementQuantitiesEstimated,
    quantitiesBreakdown: rawLine.quantitiesBreakdown || {},
    flags: Array.isArray(rawLine.flags) ? [...rawLine.flags] : [],
  };

  // Missing quantity flag (qty 0 on a measured unit).
  if (line.quantity <= 0 && !["item", "sum"].includes(normalizeUnit(line.unit))) {
    if (!line.flags.includes("missing-quantity")) line.flags.push("missing-quantity");
  }

  // Even-split element quantities when the connector sent none.
  if (!line.elementQuantities.length && line.elementGuids.length && line.quantity > 0) {
    const per = line.quantity / line.elementGuids.length;
    line.elementQuantities = line.elementGuids.map((g) => ({ guid: g, qty: per }));
    line.elementQuantitiesEstimated = true;
  }

  let comp = null;
  if (match?.cand?.composition) {
    // Deep-clone so kg↔t scaling / normalization never mutates the shared candidate.
    comp = JSON.parse(JSON.stringify(match.cand.composition));
    normalizeComposition(comp);
    // kg↔t soft match: convert the whole build-up to per-line-unit money.
    const factor = match.unit?.factor ?? 1;
    if (factor !== 1) scaleCompositionMoney(comp, factor);
  }

  if (comp) {
    const stated = toNum(comp.totalCost);
    const clamped = enforceCeiling(comp, stated);

    line.netUnitCost = round2(toNum(comp.netCost));
    line.overheadPercent = toNum(comp.overheadPercent);
    line.profitPercent = toNum(comp.profitPercent);
    line.unitRate = round2(clamped);
    line.materialUnitCost = round2(compMaterialCost(comp));
    line.marginPercent = toNum(comp.profitPercent); // margin defaults from the rate's profit %

    line.rateProvenance = {
      rateId: match.cand.id || null,
      rateSource: match.cand.source, // "rategen" | "compute-item"
      section: match.cand.section || "",
      name: match.cand.description || "",
      matchScore: Math.round(match.score * 100) / 100,
    };
  } else {
    line.netUnitCost = 0;
    line.overheadPercent = 0;
    line.profitPercent = 0;
    line.unitRate = 0;
    line.materialUnitCost = 0;
    line.marginPercent = 0;
    line.rateProvenance = {
      rateId: null,
      rateSource: "unpriced",
      section: "",
      name: "",
      matchScore: 0,
    };
    if (!line.flags.includes("unpriced")) line.flags.push("unpriced");
  }

  const labour = deriveLabour({
    comp,
    description: line.description,
    unit: line.unit,
    labourLibrary,
  });
  line.labourProvenance = {
    method: labour.method,
    labourUnitRate: round2(labour.labourUnitRate),
    gangComposition: labour.gangComposition,
    sourceRateId: labour.sourceRateId,
    notes: labour.notes,
  };

  return computeLineAmounts(line);
}

function scaleCompositionMoney(comp, factor) {
  comp.netCost = toNum(comp.netCost) * factor;
  comp.overheadAmount = toNum(comp.overheadAmount) * factor;
  comp.profitAmount = toNum(comp.profitAmount) * factor;
  comp.totalCost = toNum(comp.totalCost) * factor;
  for (const c of comp.components || []) {
    c.unitPrice = toNum(c.unitPrice) * factor;
    c.totalCost = toNum(c.totalCost) * factor;
  }
  return comp;
}

/* ─────────────────── categories / totals / document ─────────────────── */

export function buildCategories(lines) {
  return CATEGORIES.map((c) => {
    const catLines = lines.filter((l) => l.category === c.key);
    return {
      key: c.key,
      title: c.title,
      nrm: c.nrm,
      materialAmount: round2(catLines.reduce((s, l) => s + toNum(l.materialAmount), 0)),
      labourAmount: round2(catLines.reduce((s, l) => s + toNum(l.labourAmount), 0)),
      totalAmount: round2(catLines.reduce((s, l) => s + toNum(l.totalAmount), 0)),
      marginAmount: round2(catLines.reduce((s, l) => s + toNum(l.marginAmount), 0)),
    };
  });
}

export function buildTotals(lines) {
  const materialAmount = round2(lines.reduce((s, l) => s + toNum(l.materialAmount), 0));
  const labourAmount = round2(lines.reduce((s, l) => s + toNum(l.labourAmount), 0));
  const marginAmount = round2(lines.reduce((s, l) => s + toNum(l.marginAmount), 0));
  const grandTotal = round2(lines.reduce((s, l) => s + toNum(l.totalAmount), 0));

  // floorArea = Σ slab (ground + upper) net top areas from quantitiesBreakdown.
  let floorArea = 0;
  for (const l of lines) {
    if (l.quivType !== "slab") continue;
    const qb = l.quantitiesBreakdown || {};
    floorArea += toNum(qb.netTopArea ?? qb.netArea ?? qb.area);
  }
  floorArea = round2(floorArea);

  return {
    materialAmount,
    labourAmount,
    directCost: round2(grandTotal - marginAmount),
    marginAmount,
    grandTotal,
    floorArea,
    costPerM2: floorArea > 0 ? round2(grandTotal / floorArea) : 0,
  };
}

/**
 * itemRefs whose quantity differs from the previous version's line with the
 * same itemRef (new lines count as changed).
 */
export function computeChangedLineRefs(newLines, prevLines) {
  const prevByRef = new Map((prevLines || []).map((l) => [l.itemRef, l]));
  const changed = [];
  for (const l of newLines || []) {
    const prev = prevByRef.get(l.itemRef);
    if (!prev || Math.abs(toNum(prev.quantity) - toNum(l.quantity)) > 1e-6) {
      changed.push(l.itemRef);
    }
  }
  return changed;
}

/* ─────────────────────── candidate loading (DB) ─────────────────────── */

function resolveLinePrice(l, materialsBySn, laboursBySn, materialsByName, laboursByName) {
  // Price mode "current" with cached fallback, mirroring the compute engine's
  // hybrid default: current library price by refSn → refKey/refName → cached.
  const bySn = l.kind === "labour" ? laboursBySn : materialsBySn;
  const byName = l.kind === "labour" ? laboursByName : materialsByName;
  if (l.refSn != null && bySn.has(l.refSn)) return toNum(bySn.get(l.refSn).defaultUnitPrice);
  const nameKey = String(l.refKey || l.refName || l.description || "").trim().toLowerCase();
  if (nameKey && byName.has(nameKey)) return toNum(byName.get(nameKey).defaultUnitPrice);
  return toNum(l.unitPriceAtBuild);
}

/**
 * Loads all matchable rate candidates + the labour library from Mongo.
 * Candidates carry a pre-parsed composition, token set and work kind so the
 * matcher stays pure. Compute-item lines are priced at CURRENT library prices
 * (the models are the source of truth), with unitPriceAtBuild as fallback.
 */
export async function loadRateCandidates(userId = null) {
  const [rates, computeItems, materials, labours, userLibrary, masterLabour] =
    await Promise.all([
      RateGenRate.find({}).lean(),
      RateGenComputeItem.find({ enabled: true }).lean(),
      RateGenMaterial.find({ enabled: true }).lean(),
      RateGenLabour.find({ enabled: true }).lean(),
      // The user's own RateGen library: priced custom rates with build-ups —
      // in production this is where most usable rates live (the curated
      // RateGenRate/ComputeItem collections are sparsely populated).
      userId
        ? RateGenLibrary.findOne({ userId }).lean().catch(() => null)
        : Promise.resolve(null),
      // Master labour price list (separate ADLMRateDB connection) for the
      // labour-library fallback tier: [{ sn, description, unit, price }].
      fetchMasterLabour().catch(() => []),
    ]);

  const materialsBySn = new Map(materials.map((m) => [m.sn, m]));
  const laboursBySn = new Map(labours.map((m) => [m.sn, m]));
  const materialsByName = new Map(
    materials.flatMap((m) => {
      const keys = [m.key, m.name].filter(Boolean).map((k) => String(k).trim().toLowerCase());
      return keys.map((k) => [k, m]);
    }),
  );
  const laboursByName = new Map(
    labours.flatMap((m) => {
      const keys = [m.key, m.name].filter(Boolean).map((k) => String(k).trim().toLowerCase());
      return keys.map((k) => [k, m]);
    }),
  );

  const candidates = [];

  for (const r of rates) {
    const comp = parseComposition(r);
    if (!comp) continue;
    const plantHeavy = comp.netCost > 0 && compPlantCost(comp) / comp.netCost > 0.6;
    candidates.push({
      id: String(r._id),
      groupKey: `rategen:${r._id}`,
      source: "rategen",
      section: r.sectionKey || "",
      description: r.description || "",
      unit: r.unit || "",
      tokens: tokenize(r.description),
      workKind: detectWorkKind(r.description),
      sizes: sizeTokens(r.description),
      plantHeavy,
      composition: comp,
    });
  }

  for (const ci of computeItems) {
    const pricedLines = (ci.lines || []).map((l) => ({
      ...l,
      unitPrice: resolveLinePrice(l, materialsBySn, laboursBySn, materialsByName, laboursByName),
    }));
    const comp = parseComposition({
      _id: ci._id,
      description: ci.name,
      unit: ci.outputUnit,
      overheadPercentDefault: ci.overheadPercentDefault,
      profitPercentDefault: ci.profitPercentDefault,
      lines: pricedLines,
    });
    if (!comp) continue;
    const text = `${ci.section} ${ci.name}`;
    const plantHeavy = comp.netCost > 0 && compPlantCost(comp) / comp.netCost > 0.6;
    candidates.push({
      id: String(ci._id),
      groupKey: `compute:${ci._id}`,
      source: "compute-item",
      section: ci.section || "",
      description: ci.name || "",
      unit: ci.outputUnit || "",
      tokens: tokenize(text),
      workKind: detectWorkKind(text),
      sizes: sizeTokens(text),
      plantHeavy,
      composition: comp,
    });
  }

  // User-library custom rates (the QUIV Revit "CustomRate" shape: parallel
  // materials[]/labour[] arrays or a breakdown[], plus net/OH%/profit%).
  for (const cr of userLibrary?.customRates || []) {
    const comp = parseComposition(cr);
    if (!comp) continue;
    const text = `${cr.sectionLabel || cr.sectionKey || ""} ${cr.title || ""} ${cr.description || ""}`;
    const plantHeavy = comp.netCost > 0 && compPlantCost(comp) / comp.netCost > 0.6;
    candidates.push({
      id: String(cr.customRateId || cr._id || ""),
      groupKey: `custom:${cr.customRateId || cr._id}`,
      source: "custom",
      section: cr.sectionKey || "",
      description: cr.title || cr.description || "",
      unit: cr.unit || "",
      tokens: tokenize(text),
      // Kind from the rate's own wording only — a section label like
      // "Doors & Windows" must not stamp every rate in it as "door".
      workKind: detectWorkKind(`${cr.title || ""} ${cr.description || ""}`),
      sizes: sizeTokens(text),
      plantHeavy,
      composition: comp,
    });
  }

  // Labour library = enabled RateGenLabour docs + the master price list
  // (mapped to the {name, unit, price} shape matchLabourLibrary expects).
  const labourLibrary = [
    ...labours,
    ...masterLabour.map((l) => ({
      _id: `master:${l.sn}`,
      name: l.description,
      unit: l.unit,
      price: l.price,
    })),
  ];

  return { candidates, labourLibrary, currency: DEFAULT_CURRENCY };
}

/**
 * Costs a whole extraction: matches + prices each line, returning the costed
 * lines plus categories and totals. Pure given the loaded candidates.
 */
// Trade-vocabulary hints per element type: connector descriptions are
// dimension-speak ("240mm thick slab") while rates are trade-speak
// ("Reinforced concrete in slab"). The hints join the matcher input only —
// the displayed line description is untouched.
const MATCH_HINTS = {
  slab: "concrete suspended floor slab",
  padFooting: "concrete pad foundation footing base",
  stripFooting: "concrete strip foundation footing",
  column: "reinforced concrete column",
  beam: "reinforced concrete beam",
  wall: "blockwork wall",
  roof: "roof construction roofing",
  curtainWall: "curtain walling glazed aluminium",
  door: "door",
  window: "window",
};

export function costBoqLines(rawLines, { candidates, labourLibrary }) {
  const lines = (rawLines || []).map((raw) => {
    const hint = MATCH_HINTS[raw.quivType] || "";
    const match = selectBestRate(
      { description: `${raw.description} ${hint}`.trim(), unit: raw.unit },
      candidates,
    );
    return costLine(raw, match, labourLibrary);
  });
  return { lines, categories: buildCategories(lines), totals: buildTotals(lines) };
}

/* Utility used by routes for ObjectId checks without re-importing mongoose. */
export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}
