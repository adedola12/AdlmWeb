import mongoose from "mongoose";

export const SECTION_LABELS = {
  ground: "Groundwork",
  concrete: "Concrete Works",
  blockwork: "Blockwork",
  finishes: "Finishes",
  roofing: "Roofing",
  doors_windows: "Windows & Doors",
  paint: "Painting",
  steelwork: "Steelwork",
  carbon: "Carbon and Others",
};

export function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeSectionKey(raw) {
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
  if (s.includes("carbon")) return "carbon";
  return s;
}

export function normalizeSectionLabel(sectionKey, fallback = "") {
  const key = normalizeSectionKey(sectionKey);
  return String(SECTION_LABELS[key] || fallback || "").trim();
}

export function getUserId(req) {
  return req?.user?._id || req?.user?.id || null;
}

function normalizeText(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDescriptionKey(raw) {
  return normalizeText(raw).toLowerCase();
}

function normalizeDate(raw, fallback = null) {
  if (!raw) return fallback;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function normalizeMaybeNumber(raw, fallback = null) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const n = toNum(raw, fallback ?? 0);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBreakdownLine(raw = {}) {
  const quantity = toNum(raw.quantity ?? raw.Quantity, 0);
  const unitPrice = toNum(raw.unitPrice ?? raw.UnitPrice, 0);
  const lineTotalRaw =
    raw.lineTotal !== undefined
      ? raw.lineTotal
      : raw.LineTotal !== undefined
        ? raw.LineTotal
        : raw.totalPrice ?? raw.TotalPrice;
  const lineTotal = toNum(lineTotalRaw, quantity * unitPrice);

  return {
    componentName: normalizeText(
      raw.componentName ??
        raw.ComponentName ??
        raw.description ??
        raw.Description ??
        ""
    ),
    quantity,
    unit: normalizeText(raw.unit ?? raw.Unit),
    unitPrice,
    lineTotal,
    refKind: normalizeText(raw.refKind ?? raw.RefKind),
    refSn: normalizeMaybeNumber(raw.refSn ?? raw.RefSn, null),
    refName: normalizeText(raw.refName ?? raw.RefName),
    priceAsOf: normalizeDate(raw.priceAsOf ?? raw.PriceAsOf, null),
  };
}

function isMeaningfulBreakdownLine(line) {
  return Boolean(
    line.componentName ||
      line.refName ||
      (line.quantity > 0 && line.unitPrice > 0) ||
      line.lineTotal > 0
  );
}

function normalizeBreakdownLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => normalizeBreakdownLine(line))
    .filter(isMeaningfulBreakdownLine);
}

function computeTotals(netCost, overheadPercent, profitPercent) {
  const net = toNum(netCost, 0);
  const overheadPct = toNum(overheadPercent, 0);
  const profitPct = toNum(profitPercent, 0);
  const overheadValue = (net * overheadPct) / 100;
  const profitValue = (net * profitPct) / 100;
  const totalCost = net + overheadValue + profitValue;

  return {
    netCost: net,
    overheadPercent: overheadPct,
    profitPercent: profitPct,
    overheadValue,
    profitValue,
    totalCost,
  };
}

function normalizeCustomRateLine(raw = {}, fallbackType = "material") {
  const quantity = toNum(raw.quantity ?? raw.Quantity, 0);
  const unitPrice = toNum(raw.unitPrice ?? raw.UnitPrice, 0);
  const totalCostRaw =
    raw.totalCost ??
    raw.TotalCost ??
    raw.lineTotal ??
    raw.LineTotal ??
    raw.totalPrice ??
    raw.TotalPrice;
  const totalCost = toNum(totalCostRaw, quantity * unitPrice);

  const rawRateType =
    raw.rateType ??
    raw.RateType ??
    raw.kind ??
    raw.Kind ??
    fallbackType;

  const normalizedRateTypeRaw = String(rawRateType || "")
    .trim()
    .toLowerCase();
  const normalizedRateType =
    normalizedRateTypeRaw === "labour" || normalizedRateTypeRaw === "1"
      ? "labour"
      : "material";

  return {
    rateType: normalizedRateType,
    description: normalizeText(raw.description ?? raw.Description),
    quantity,
    unit: normalizeText(raw.unit ?? raw.Unit),
    unitPrice,
    totalCost,
    category: normalizeText(raw.category ?? raw.Category),
    refSn: normalizeMaybeNumber(raw.refSn ?? raw.RefSn ?? raw.sn ?? raw.Sn, null),
    refName: normalizeText(raw.refName ?? raw.RefName),
    priceAsOf: normalizeDate(raw.priceAsOf ?? raw.PriceAsOf, null),
  };
}

function toBreakdownFromCustomLines(lines) {
  return lines.map((line) => ({
    componentName: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    lineTotal: line.totalCost,
    refKind: line.rateType,
    refSn: line.refSn,
    refName: line.refName || line.description,
    priceAsOf: line.priceAsOf ?? null,
  }));
}

export function normalizeRateOverride(raw = {}) {
  const breakdown = normalizeBreakdownLines(raw.breakdown || raw.Breakdown);
  const netFromBreakdown = breakdown.reduce((sum, line) => sum + line.lineTotal, 0);
  const netCost =
    raw.netCost != null
      ? raw.netCost
      : raw.NetCost != null
        ? raw.NetCost
        : netFromBreakdown;
  const totals = computeTotals(
    netCost,
    raw.overheadPercent ?? raw.OverheadPercent ?? 10,
    raw.profitPercent ?? raw.ProfitPercent ?? 25
  );

  return {
    rateId: raw.rateId || raw.RateId ? String(raw.rateId || raw.RateId) : "",
    sectionKey: normalizeSectionKey(raw.sectionKey || raw.SectionKey),
    sectionLabel: normalizeSectionLabel(
      raw.sectionKey || raw.SectionKey,
      raw.sectionLabel || raw.SectionLabel
    ),
    itemNo: normalizeMaybeNumber(raw.itemNo ?? raw.ItemNo, null),
    code: normalizeText(raw.code ?? raw.Code),
    description: normalizeText(raw.description ?? raw.Description),
    unit: normalizeText(raw.unit ?? raw.Unit),
    breakdown,
    ...totals,
    sourceUpdatedAt: normalizeDate(
      raw.sourceUpdatedAt ?? raw.SourceUpdatedAt,
      null
    ),
    clientUpdatedAt: normalizeDate(
      raw.clientUpdatedAt ?? raw.ClientUpdatedAt,
      new Date()
    ),
  };
}

export function normalizeCustomRate(raw = {}) {
  const customRateId = String(
    raw.customRateId || raw.id || raw.Id || new mongoose.Types.ObjectId()
  ).trim();

  const materialItemsRaw =
    raw.materials || raw.MaterialItems || raw.materialItems || [];
  const labourItemsRaw =
    raw.labour || raw.LabourItems || raw.labourItems || [];

  const materials = (Array.isArray(materialItemsRaw) ? materialItemsRaw : [])
    .map((line) => normalizeCustomRateLine(line, "material"))
    .filter((line) => line.description || line.totalCost > 0);

  const labour = (Array.isArray(labourItemsRaw) ? labourItemsRaw : [])
    .map((line) => normalizeCustomRateLine(line, "labour"))
    .filter((line) => line.description || line.totalCost > 0);

  const explicitBreakdown = normalizeBreakdownLines(raw.breakdown || raw.Breakdown);
  const breakdown =
    explicitBreakdown.length > 0
      ? explicitBreakdown
      : toBreakdownFromCustomLines([...materials, ...labour]);

  const materialTotal = materials.reduce((sum, line) => sum + line.totalCost, 0);
  const labourTotal = labour.reduce((sum, line) => sum + line.totalCost, 0);
  const netCostRaw =
    raw.netCost ?? raw.OverallTotal ?? raw.overallTotal ?? materialTotal + labourTotal;

  const totals = computeTotals(
    netCostRaw,
    raw.overheadPercent ?? raw.OverheadPercent ?? 10,
    raw.profitPercent ?? raw.ProfitPercent ?? 10
  );

  const createdAt = normalizeDate(
    raw.createdAt ?? raw.CreatedDate,
    new Date()
  );
  const updatedAt = normalizeDate(raw.updatedAt ?? raw.UpdatedAt, createdAt);

  return {
    customRateId,
    sectionKey: normalizeSectionKey(raw.sectionKey || raw.SectionKey),
    sectionLabel: normalizeSectionLabel(
      raw.sectionKey || raw.SectionKey,
      raw.sectionLabel || raw.SectionLabel
    ),
    title: normalizeText(raw.title ?? raw.Title),
    description: normalizeText(raw.description ?? raw.Description),
    unit: normalizeText(raw.unit ?? raw.Unit),
    materials,
    labour,
    breakdown,
    ...totals,
    createdAt,
    updatedAt,
  };
}

// ── Rate composition (build-up) ───────────────────────────────────────────
// The QUIV / HERON plugins read a structured build-up off each rate so they
// can auto-derive Material + Labour lines for a takeoff and run the
// "headline == net + overhead + profit" guardrail. See
// docs/quiv-takeoff-material-rate-upgrade.server-spec.md §1.
const LABOUR_KIND_RE =
  /\b(labou?r(er)?|mason|carpenter|bender|fitter|fixer|painter|plumber|electrician|artisan|workmanship|gang|foreman|helper|operative|welder|bricklayer)\b/i;
const PLANT_KIND_RE =
  /\b(plant|excavat\w*|mixer|vibrator|crane|machine|pump|roller|compactor|scaffold(ing)?|hoist|hire)\b/i;
const CONSUMABLE_KIND_RE =
  /\b(nails?|binding\s*wire|tying\s*wire|fuel|diesel|petrol|consumable|disposab\w*)\b/i;

// Map a component to one of: material | labour | plant | equipment | consumable.
// Prefer an explicit refKind/rateType; otherwise classify by name keywords.
export function classifyComponentKind(name, refKind) {
  const rk = String(refKind || "")
    .trim()
    .toLowerCase();
  if (rk) {
    if (rk === "labour" || rk === "labor" || rk === "1") return "labour";
    if (rk === "material" || rk === "0") return "material";
    if (rk === "plant") return "plant";
    if (rk === "equipment") return "equipment";
    if (rk === "consumable") return "consumable";
  }
  const n = String(name || "");
  if (LABOUR_KIND_RE.test(n)) return "labour";
  if (PLANT_KIND_RE.test(n)) return "plant";
  if (CONSUMABLE_KIND_RE.test(n)) return "consumable";
  return "material";
}

// Build the `composition` object the plugin's RateCompositionParser expects.
// Reads from a rate's breakdown lines (per-unit quantities) plus its
// net/overhead/profit fields. Returns null when there is no structured
// build-up, so partial rollout stays safe (the plugin reports "no build-up").
export function buildRateComposition(rate = {}) {
  const rawBreakdown = Array.isArray(rate.breakdown) ? rate.breakdown : [];

  const components = rawBreakdown
    .map((l) => {
      const name = normalizeText(
        l.componentName ??
          l.ComponentName ??
          l.refName ??
          l.RefName ??
          l.description ??
          l.Description ??
          ""
      );
      const quantity = toNum(l.quantity ?? l.Quantity, 0);
      const unit = normalizeText(l.unit ?? l.Unit);
      const unitPrice = toNum(l.unitPrice ?? l.UnitPrice, 0);
      const totalCost = toNum(
        l.lineTotal ??
          l.LineTotal ??
          l.totalCost ??
          l.TotalCost ??
          l.totalPrice ??
          l.TotalPrice,
        quantity * unitPrice
      );
      const refKind = l.refKind ?? l.RefKind ?? l.rateType ?? l.RateType ?? null;
      const refSn = normalizeMaybeNumber(l.refSn ?? l.RefSn ?? l.sn ?? l.Sn, null);
      const refName = normalizeText(l.refName ?? l.RefName);
      const priceAsOf = normalizeDate(l.priceAsOf ?? l.PriceAsOf, null);

      const component = {
        name,
        kind: classifyComponentKind(name, refKind),
        quantity, // per single unit of the rate
        unit,
        unitPrice,
        totalCost,
      };
      // refSn / refName tie a row back to the Material/Labour master library
      // so the plugin can re-resolve prices later; priceAsOf records when the
      // unit price was captured.
      if (refSn != null) component.refSn = refSn;
      if (refName) component.refName = refName;
      if (priceAsOf) component.priceAsOf = priceAsOf;
      return component;
    })
    .filter(
      (c) => c.name || c.totalCost > 0 || (c.quantity > 0 && c.unitPrice > 0)
    );

  if (!components.length) return null;

  const componentsNet = components.reduce(
    (sum, c) => sum + toNum(c.totalCost, 0),
    0
  );
  const netCost = toNum(rate.netCost, 0) > 0 ? toNum(rate.netCost, 0) : componentsNet;
  const overheadPercent = toNum(rate.overheadPercent, 0);
  const profitPercent = toNum(rate.profitPercent, 0);
  const overheadAmount =
    toNum(rate.overheadValue, 0) || (netCost * overheadPercent) / 100;
  const profitAmount =
    toNum(rate.profitValue, 0) || (netCost * profitPercent) / 100;

  return {
    netCost,
    overheadPercent,
    profitPercent,
    overheadAmount,
    profitAmount,
    // Both overhead and profit are applied on netCost (matches the website
    // Rate Composition modal). Stated explicitly so the plugin can align.
    profitBasis: "netCost",
    components,
  };
}

export function buildUserRateKey(raw = {}) {
  const sectionKey = normalizeSectionKey(raw.sectionKey);
  const itemNo = normalizeMaybeNumber(raw.itemNo, "");
  const description = normalizeDescriptionKey(raw.description);
  const unit = normalizeDescriptionKey(raw.unit);
  return [sectionKey, itemNo, description, unit].join("|");
}

function normalizeOutputBreakdown(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    componentName: normalizeText(line.componentName),
    quantity: toNum(line.quantity, 0),
    unit: normalizeText(line.unit),
    unitPrice: toNum(line.unitPrice, 0),
    lineTotal: toNum(line.lineTotal ?? line.totalPrice, 0),
    refKind: normalizeText(line.refKind),
    refSn: normalizeMaybeNumber(line.refSn, null),
    refName: normalizeText(line.refName),
    priceAsOf: normalizeDate(line.priceAsOf, null),
  }));
}

export function toUserRateDefinition(rate = {}, extra = {}) {
  const isCustom = (extra.source || "").includes("custom");

  const result = {
    id: extra.id || rate.id || rate.rateId || rate.customRateId || "",
    rateId: extra.rateId ?? rate.rateId ?? rate.id ?? null,
    customRateId: extra.customRateId ?? rate.customRateId ?? null,
    baseRateId: extra.baseRateId ?? null,
    source: extra.source || "master",
    sectionKey: normalizeSectionKey(rate.sectionKey),
    sectionLabel: normalizeSectionLabel(rate.sectionKey, rate.sectionLabel),
    itemNo: normalizeMaybeNumber(rate.itemNo, null),
    code: normalizeText(rate.code),
    title: normalizeText(rate.title),
    description: normalizeText(rate.description),
    unit: normalizeText(rate.unit),
    netCost: toNum(rate.netCost, 0),
    overheadPercent: toNum(rate.overheadPercent, 10),
    profitPercent: toNum(rate.profitPercent, 25),
    overheadValue: toNum(rate.overheadValue, 0),
    profitValue: toNum(rate.profitValue, 0),
    totalCost: toNum(rate.totalCost, 0),
    createdAt: normalizeDate(rate.createdAt, null),
    updatedAt: normalizeDate(rate.updatedAt ?? rate.clientUpdatedAt, null),
    sourceUpdatedAt: normalizeDate(rate.sourceUpdatedAt, null),
    breakdown: normalizeOutputBreakdown(rate.breakdown),
  };

  // Include materials/labour line items for custom rates so plugins
  // (HERON, Arch QUIV) and multi-seat clients see full rate composition
  if (isCustom && Array.isArray(rate.materials)) {
    result.materials = rate.materials.map((l) => normalizeCustomRateLine(l, "material"));
  }
  if (isCustom && Array.isArray(rate.labour)) {
    result.labour = rate.labour.map((l) => normalizeCustomRateLine(l, "labour"));
  }

  // Structured build-up so QUIV/HERON can derive Material + Labour lines and
  // run the headline-vs-build-up guardrail. Built from the normalized
  // breakdown + net/overhead/profit so it is consistent across master,
  // override and custom rates. Omitted when there is no build-up.
  const composition = buildRateComposition({
    netCost: result.netCost,
    overheadPercent: result.overheadPercent,
    profitPercent: result.profitPercent,
    overheadValue: result.overheadValue,
    profitValue: result.profitValue,
    breakdown: result.breakdown,
  });
  if (composition) result.composition = composition;

  return result;
}

function sortRateDefinitions(a, b) {
  const sectionCmp = String(a.sectionKey || "").localeCompare(String(b.sectionKey || ""));
  if (sectionCmp !== 0) return sectionCmp;

  const aItemNo = a.itemNo ?? Number.MAX_SAFE_INTEGER;
  const bItemNo = b.itemNo ?? Number.MAX_SAFE_INTEGER;
  if (aItemNo !== bItemNo) return aItemNo - bItemNo;

  return String(a.description || "").localeCompare(String(b.description || ""));
}

export function mergeRatesWithUserData(masterRates = [], rateOverrides = [], customRates = []) {
  const overrideByRateId = new Map();
  const overrideByKey = new Map();

  for (const overrideRaw of rateOverrides) {
    const override = normalizeRateOverride(overrideRaw);
    if (override.rateId) overrideByRateId.set(String(override.rateId), override);
    overrideByKey.set(buildUserRateKey(override), override);
  }

  const merged = [];

  for (const masterRaw of masterRates) {
    const masterId = String(masterRaw?._id || masterRaw?.id || "");
    const master = toUserRateDefinition(
      {
        ...masterRaw,
        id: masterId,
      },
      {
        id: masterId,
        rateId: masterId,
        source: "master",
      }
    );

    const override =
      overrideByRateId.get(masterId) || overrideByKey.get(buildUserRateKey(master));

    if (!override) {
      merged.push(master);
      continue;
    }

    merged.push(
      toUserRateDefinition(override, {
        id: masterId,
        rateId: masterId,
        baseRateId: masterId,
        source: "user-override",
      })
    );
  }

  for (const customRaw of customRates) {
    const custom = normalizeCustomRate(customRaw);
    merged.push(
      toUserRateDefinition(custom, {
        id: custom.customRateId,
        rateId: null,
        customRateId: custom.customRateId,
        source: "user-custom",
      })
    );
  }

  return merged.sort(sortRateDefinitions);
}
