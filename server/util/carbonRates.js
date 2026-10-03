// server/util/carbonRates.js
//
// The carbon of every priced rate, built from that rate's own build-up: the
// same materials, the same quantities, the same library rows. Change a
// quantity and the price and the carbon move together.
//
// A port of the desktop RateGen's Services/CarbonRates.cs (ADLMRateGen-suiteui,
// feat/rategen-suite-ui, 29448e7). Kept line for line where it can be, so a rate
// shows the same carbon in ADLM Cloud as on the desktop. The one addition: a
// cloud build-up line can name its library row (refName) and its kind (refKind),
// which is used before any matching by wording or price.
//
// Practice followed (RICS whole life carbon, 2nd ed. 2023; IStructE 2020):
// upfront carbon A1-A5 per unit of the rate. Plant hire and labour carry no
// material carbon; the fuel the plant burns does (A5a). Worker transport
// (A5.4) is not counted. Where a line's carbon cannot be worked out (no
// published factor, or a mass that cannot be read), it is not guessed: it
// lowers the rate's coverage, which is reported beside the figure.
//
// Shapes:
//   rate     { trade, description, unit, netCost, breakdown: [line] }
//   line     { componentName, quantity, unit, unitPrice, totalPrice | lineTotal, refKind?, refName?, isTotalLine? }
//   material { name, category, unit, price }
//   result   { trade, description, unit, netCost, a13, a4, a5, total, low, coverage, hasAssumedMass, breakdown }

import { assessCarbon, matchFactor } from "./carbonEngine.js";
import { normalizeSectionKey } from "./rategenUserRates.js";

// Cloud section keys (as normalizeSectionKey folds them) to the desktop's trade names.
const TRADE_BY_SECTION = {
  ground: "Ground",
  concrete: "Concrete",
  blockwork: "Block Works",
  finishes: "Finishes",
  roofing: "Roofs",
  paint: "Painting",
  steelwork: "Steel",
  doors_windows: "Window and Door",
};

// "concretework", "Roof Works", "windowsdoors" all name the same desktop trade.
export const tradeForSection = (sectionKey) => TRADE_BY_SECTION[normalizeSectionKey(sectionKey)] || "";

// Lines that summarise the build-up rather than add to it.
const SUMMARY =
  /^(total\b|total cost|total rate|sub-?total:|net cost|overhead|profit|cost per|output per|compute po|⚠|- |check:|rate as published|labour cost per|gang cost|labour per (sqm|m2|m3)|labour output)/i;

// Lines that are labour or plant hire: no material carbon (their fuel is its own line).
const LABOUR_OR_PLANT =
  /\b(labour|labourer|operator|mason|carpenter|painter|tiler|plumber|electrician|fitter|welder|steel ?fixer|banksman|foreman|ganger|mate|operative|bulldozer|excavator|dozer|grader|roller|compactor|mixer|vibrator|crane|truck|tipper|loader|pump|hire|scaffold|gang)\b/i;

const KIND_PREFIX = /^(material|labour|constant)\s*:\s*/i;

// The library categories a trade's build-ups draw on, for matching a line by its price.
const TRADE_CATEGORIES = {
  Ground: ["fuels", "earthwork", "crushed rock"],
  Concrete: ["cement", "earthwork", "crushed rock", "steel bar", "mesh", "timber", "plywood", "nails", "fuels"],
  "Block Works": ["cement", "earthwork", "crushed rock", "timber", "plywood", "nails"],
  Finishes: ["finishes", "pvc floor", "cement", "earthwork", "terrazzo", "ceiling"],
  Roofs: ["timber", "longspan", "nigerite", "zinc", "nails", "roof felting"],
  Painting: ["paint"],
  Steel: ["structural steel", "fuels"],
  "Window and Door": ["timber", "aluminium doors", "glasswork", "casement", "door", "plywood"],
};

const SIZE = /(\d+)\s*x\s*(\d+)/i;
const STOP = new Set(["size", "with", "from", "cost", "material", "per", "square", "meter", "metre", "length", "allow", "high", "thick", "wide", "including"]);
const HANDLING = /\b(loading|unloading|handling|offloading)\b/i;
const WASTE_ALLOWANCE = /^add (for )?waste|^waste allowance|\bwaste\b.*%/i;
const POINTS_BACK = /as before|\bsee\b/i;

// People on the gang: never matched to a material or another rate, whatever their price.
const PEOPLE =
  /\b(labour|labourer|operator|mason|masons|carpenter|painter|tiler|plumber|electrician|fitter|welder|fixer|foreman|headman|tradesman|ganger|operative|crew|gang|skilled|artisan|mate|torch|burner|compressor|machine|gear|sand pot|output|driver|motor-?boy|banksman|steelfixer)\b/i;
const CONSUMABLES = /\b(consumables|sundries|small tools|lubricants?)\b/i;
// "lit/m2", "kg per m3": a quantity per unit of the work, not per day.
const PER_UNIT_OF_WORK = /(\/|\bper\s+)(m|m2|m3|sqm|no|tonne|t)\b/i;
// Time-based units: a line paid by the hour or the day is labour or plant hire.
const TIME_UNIT = /^\s*(\d+(\.\d+)?\s*)?(n\/hr|no\/hr|hrs?|hours?|hr\/\S+|per\s*\/?\s*(day|hr|hour))\b/i;
// A line costed for a day or an hour of work, which the rate divides by its output.
const BATCH = /(^|\/|\bper\s*\/?\s*|\s)(day|days|hr|hrs|hour|hours)\s*\.?$/i;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const words = (s) => String(s || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
const eqi = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const has = (hay, needle) => String(hay || "").toLowerCase().includes(String(needle || "").toLowerCase());
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The library row a line was priced from when its name is not the row's name:
 * the rows at the line's unit price, preferring one that shares its size
 * ("50 x 100mm" and "(50x100x3600mm)") or a word, within the trade's categories.
 */
function byPrice(trade, name, unitPrice, mats) {
  if (!(unitPrice > 0)) return null;
  const tol = Math.max(0.5, unitPrice * 0.005);
  const at = mats.filter((m) => Math.abs(m.price - unitPrice) <= tol);
  if (!at.length) return null;

  const cats = TRADE_CATEGORIES[trade] || [];
  const size = name.match(SIZE);
  const ws = new Set(words(name));
  let best = null;
  let bestScore = 0;
  for (const m of at) {
    let score = 0;
    if (size && new RegExp(`\\b${size[1]}\\s*x\\s*${size[2]}\\b`, "i").test(m.name)) score += 3;
    score += 2 * words(m.name).filter((w) => ws.has(w)).length;
    if (cats.some((k) => has(m.category, k))) score += 1;
    if (has(name, "softwood") && has(m.category, "softwood")) score += 2;
    if (has(name, "hardwood") && has(m.category, "hardwood")) score += 2;
    if (score > bestScore) { best = m; bestScore = score; }
  }
  // a match on price alone only stands when it is the one row in the trade's own categories
  if (bestScore >= 2) return best;
  const inTradeOnly = at.filter((m) => cats.some((k) => has(m.category, k)));
  return inTradeOnly.length === 1 ? inTradeOnly[0] : null;
}

/**
 * A line that is another rate ("Mortar per square meter" at the mortar rate's
 * cost): the rate whose unit cost it carries, or failing that, the rate sharing
 * its main word whose cost divides the line's into the cleanest quantity
 * ("Mortar 12mm thick" = 0.012 m3 of mortar).
 */
function byReference(trade, name, unitPrice, total, refs) {
  if (!refs.length || !(total > 0)) return null;
  // A line only reuses a rate when it says so; an equal price on its own is a coincidence.
  const named = words(name).filter((w) =>
    ["mortar", "concrete", "formwork", "reinforcement", "mixing", "screed", "render", "blockwork", "plaster", "filling"].includes(w));
  const pointsBack = POINTS_BACK.test(name);
  if (!named.length && !pointsBack) return null;
  const names = (r) => pointsBack || named.some((w) => has(r.description, w));

  if (unitPrice > 0) {
    const tol = Math.max(0.5, unitPrice * 0.002);
    const exact = refs
      .filter((r) => Math.abs(r.netCost - unitPrice) <= tol && names(r))
      .sort((a, b) => (b.trade === trade) - (a.trade === trade))[0];
    if (exact) return { ref: exact, qty: total / exact.netCost };
  }
  // Matching by a clean quantity needs the line to point back or give a thickness.
  if (!named.length || !(pointsBack || /\d+\s*mm\s+thick/i.test(name))) return null;
  let pick = null;
  let bestErr = Number.MAX_VALUE;
  for (const r of refs.filter((x) => named.some((w) => has(x.description, w)))) {
    const q = total / r.netCost;
    if (q <= 0 || q > 100) continue;
    const err = Math.abs(q * 1000 - Math.round(q * 1000));
    if (err < bestErr) { bestErr = err; pick = { ref: r, qty: q }; }
  }
  return bestErr < 0.05 ? pick : null;
}

// "bag/m3", "Bag.", "Tonne per m3": the library unit the line was counted in.
const unitHead = (u) => String(u || "").toLowerCase().split(/[\/\s]|per\b/)[0].replace(/\.+$/, "").trim();

function findMaterial(name, unitPrice, unit, lib) {
  const exact = lib.byName.get(name.toLowerCase());
  if (exact) return exact;
  // "Fuel (Diesel)" names the library's "Diesel": the longest library name inside the line.
  // Not "Oil & Consumables (3% of Diesel)": lubricant is not fuel burnt.
  if (/\boil\b|consumable/i.test(name)) return null;
  const lower = name.toLowerCase();
  let inside = null;
  for (const m of lib.rows) {
    if (m.name.length >= 5 && lower.includes(m.lower) && (!inside || m.name.length > inside.name.length)) inside = m;
  }
  if (inside) return inside;
  // "Cement" priced from "Cement (50kg bag)": a library row that starts with the
  // line's name and was priced at the line's unit price is the row it used.
  const starts = lib.rows.filter((m) => m.lower.startsWith(lower));
  if (unitPrice > 0) {
    const hit = starts.find((m) => Math.abs(m.price - unitPrice) <= Math.max(1, unitPrice * 0.01));
    if (hit) return hit;
  }
  if (starts.length === 1) return starts[0];
  // Cloud only: a build-up keeps the unit price it was saved at, and the library
  // has moved on since ("Cement" at 10,200 against "Cement (50kg bag)" at 11,500),
  // so the price no longer picks the row. The unit still does: "bag/m3" was
  // counted in bags, and only one of the cement rows is sold by the bag.
  const head = unitHead(unit);
  const byUnit = head ? starts.filter((m) => unitHead(m.unit) === head) : [];
  return byUnit.length === 1 ? byUnit[0] : null;
}

/** One row per material name, ready for the matchers. */
export function prepareMaterialLibrary(materials = []) {
  const rows = [];
  const byName = new Map();
  for (const m of materials) {
    const name = String(m?.name ?? m?.MaterialName ?? "").trim();
    if (!name || byName.has(name.toLowerCase())) continue;
    const row = {
      name,
      lower: name.toLowerCase(),
      category: String(m.category ?? m.MaterialCategory ?? ""),
      unit: String(m.unit ?? m.MaterialUnit ?? ""),
      price: num(m.price ?? m.MaterialPrice ?? m.defaultUnitPrice),
    };
    rows.push(row);
    byName.set(row.lower, row);
  }
  return { rows, byName };
}

function assessRate(rate, lib, labourNames, refs) {
  const trade = rate.trade || tradeForSection(rate.sectionKey);
  const self = rate.description || "";
  const lines = Array.isArray(rate.breakdown) ? rate.breakdown.filter(Boolean) : null;
  if (!lines) return null;

  let resourceCost = 0, coveredCost = 0, a13 = 0, a4 = 0, a5w = 0, a5a = 0;
  // a build-up written without prices (Ada's drafts) is weighed by its quantities,
  // and its coverage counted by lines instead of by cost
  let lineCount = 0, coveredLines = 0;
  // the part of the build-up costed per day or per hour, which the rate divides by its output
  let batchCost = 0, b13 = 0, b4 = 0, b5w = 0, b5a = 0;
  // how far the low end (Nigerian cement, Scope 1) sits below the figure
  let gap = 0, bgap = 0;
  let anyAssumed = false;
  const breakdown = [];

  // A build-up with plant hired by the day ("1 No/Day") states its fuel and its
  // consumables for that same day, even when their unit ("250 Liters", "3%") says not.
  const hasDayLines = lines.some((l) => BATCH.test(String(l.unit || "")));
  // "Output per day: 980 m2/day": what a day of another item's kit is divided by
  const output = num(lines.find((l) => /^output per (day|hr|hour)\b/i.test(String(l.componentName || "").trim()))?.quantity);
  // carbon already per unit of this rate (a day's kit over the stated output): not scaled again
  let f13 = 0, f4 = 0, f5w = 0, f5a = 0;

  for (const line of lines) {
    const raw = String(line.componentName || "");
    const total = num(line.totalPrice ?? line.lineTotal) || num(line.quantity) * num(line.unitPrice);
    const qty = num(line.quantity);
    const unit = String(line.unit || "");
    const unitPrice = num(line.unitPrice);
    if (line.isTotalLine || SUMMARY.test(raw.trim()) || !raw.trim()) continue;

    const name = raw.replace(KIND_PREFIX, "").trim();
    const prefix = raw.match(KIND_PREFIX);
    const refKind = String(line.refKind || "").toLowerCase();
    const fuel = matchFactor("", name)?.fuel === true;
    // a cloud line tagged labour or plant is the gang, unless it is the plant's fuel
    const kind = prefix ? prefix[1].toLowerCase() : (refKind === "labour" || refKind === "plant") && !fuel ? "labour" : "";
    resourceCost += total;
    lineCount++;
    const consumable = CONSUMABLES.test(name);
    const batch = BATCH.test(unit) || /\bper\s*(day|hr|hour)\b/i.test(name)
      || (hasDayLines && (fuel || consumable) && !PER_UNIT_OF_WORK.test(unit));
    if (batch) batchCost += total;

    const bl = { componentName: name, quantity: qty, unit, unitPrice, totalPrice: total, refName: name, refKind: kind, carbonKg: null, carbonBasis: "" };

    const person = kind === "labour" || HANDLING.test(name) || PEOPLE.test(name) || TIME_UNIT.test(unit)
      || labourNames.has(name.toLowerCase());
    if (consumable && !fuel) {
      bl.carbonBasis = "Plant oil and consumables: no published carbon factor; not counted. It lowers this rate's coverage.";
      breakdown.push(bl);
      continue;
    }
    if (person && !POINTS_BACK.test(name) && !fuel) {
      coveredCost += total; coveredLines++;
      bl.carbonKg = 0;
      bl.carbonBasis = "Labour or plant hire: no material carbon. The plant's fuel is counted on its own line (A5a).";
      breakdown.push(bl);
      continue;
    }

    let carbon = null;
    let mat = null;
    if (kind !== "labour") {
      if (!HANDLING.test(name)) {
        const named = line.refName ? lib.byName.get(String(line.refName).trim().toLowerCase()) : null;
        mat = named || findMaterial(name, unitPrice, unit, lib) || byPrice(trade, name, unitPrice, lib.rows);
      }
      // An unpriced line (Ada's drafts) has only its own quantity, in its own unit:
      // a library row sold in another unit cannot take it (1.05 m2 of boards is not
      // 1.05 m3 of hardwood). Its own wording weighs it instead.
      if (mat && !(total > 0) && unitHead(mat.unit) !== unitHead(unit)) mat = null;
      if (mat) {
        // the quantity in library units, exactly as the cost was built
        const libQty = mat.price > 0 && total > 0 ? total / mat.price : qty;
        carbon = assessCarbon(mat.category, mat.name, mat.unit, libQty, name);
        if (carbon) bl.refName = mat.name;
        else mat = null; // priced from a row with no factor: let the line's own wording try
      }
      // "Hardcore (cubic metre content in 1m2 of filling)" holds m3 whatever its unit says
      const ownUnit = /\bcubic met(re|er)s?\b/i.test(name) ? "m3" : unit;
      carbon ??= assessCarbon("", name, ownUnit, qty, name);
      // "Sheeting (975 x 2250)", "Window size 1800 x 1200mm": what it is made of is in
      // the rate's own description ("asbestos roofing sheet", "natural anodised")
      carbon ??= assessCarbon("", `${name} || ${self}`, unit, qty, name, { context: true });
    }

    // "Subtotal from Item1 approach": a day of another rate's kit (the D8 and its
    // diesel), which this rate divides by its own output
    const item = !carbon && kind !== "labour" ? name.match(/\bitem\s*(\d+)\b/i) : null;
    const day = item
      ? refs.find((r) => r.itemNo === Number(item[1]) && r.sectionKey === normalizeSectionKey(rate.sectionKey) && r.description !== self && r.raw)
      : null;
    if (day) {
      coveredCost += total; coveredLines++;
      const q = qty > 0 ? qty : 1;
      if (output > 0) {
        // the build-up states its output: a day of the kit over that, whatever the prices say
        f13 += (day.raw.a13 * q) / output; f4 += (day.raw.a4 * q) / output; f5w += (day.raw.a5w * q) / output; f5a += (day.raw.a5a * q) / output;
      } else {
        a13 += day.raw.a13 * q; a4 += day.raw.a4 * q; a5w += day.raw.a5w * q; a5a += day.raw.a5a * q;
      }
      bl.carbonKg = day.raw.total * q;
      bl.carbonBasis = `${Number(q.toFixed(4))} x the build-up of item ${item[1]}, "${day.description}", at ${Number(day.raw.total.toFixed(3))} kgCO2e as written` +
        (output > 0 ? `, over this rate's output of ${output} per day.` : " (before this rate divides it by its output).");
      breakdown.push(bl);
      continue;
    }

    // a line that is another rate: its carbon per unit, times the quantity this build-up uses
    if (!carbon && kind !== "labour" && !HANDLING.test(name) && !WASTE_ALLOWANCE.test(name)) {
      const r = byReference(trade, name, unitPrice, total, refs.filter((x) => x.description !== self));
      if (r) {
        coveredCost += total; coveredLines++;
        const kg = r.ref.carbonPerUnit * r.qty;
        a13 += kg; // carried as product carbon: the referenced rate's A1-A5 per unit
        if (batch) b13 += kg;
        const g = (r.ref.carbonPerUnit - r.ref.carbonLowPerUnit) * r.qty;
        gap += g;
        if (batch) bgap += g;
        bl.carbonKg = kg;
        bl.carbonBasis = `Uses ${Number(r.qty.toFixed(4))} ${r.ref.unit} of the ${r.ref.trade} rate "${r.ref.description}" at ${Number(r.ref.carbonPerUnit.toFixed(3))} kgCO2e per ${r.ref.unit} (that rate's own upfront carbon, A1-A5).`;
        breakdown.push(bl);
        continue;
      }
    }

    if (carbon) {
      coveredCost += total; coveredLines++;
      a13 += carbon.a13; a4 += carbon.a4; a5w += carbon.a5w; a5a += carbon.a5a;
      if (batch) { b13 += carbon.a13; b4 += carbon.a4; b5w += carbon.a5w; b5a += carbon.a5a; }
      const lg = carbon.total - carbon.totalLow;
      gap += lg;
      if (batch) bgap += lg;
      anyAssumed ||= carbon.factor.massAssumed;
      bl.carbonKg = carbon.total;
      bl.carbonBasis = carbon.basis;
    } else if (WASTE_ALLOWANCE.test(name)) {
      coveredCost += total; coveredLines++; // material wasted on site is A5w, worked out per material above
      bl.carbonKg = 0;
      bl.carbonBasis = "Waste allowance: the carbon of material wasted on site is counted as A5w on each material line.";
    } else if (!mat && (kind === "labour" || HANDLING.test(name) || labourNames.has(name.toLowerCase()) || LABOUR_OR_PLANT.test(name))) {
      coveredCost += total; coveredLines++; // labour and plant hire: no material carbon
      bl.carbonKg = 0;
      bl.carbonBasis = "Labour or plant hire: no material carbon. The plant's fuel is counted on its own line (A5a).";
    } else {
      bl.carbonBasis = "No published carbon factor for this line, or its mass cannot be read from the library: not counted. It lowers this rate's coverage.";
    }
    breakdown.push(bl);
  }

  const carbonOfBuildUp = a13 + a4 + a5w + a5a + (f13 + f4 + f5w + f5a) * (output || 1);
  // Every rate with a build-up gets a figure, the owner's rule (3 Oct 2026). A
  // labour-only rate (hand excavation, backfill) has no upfront carbon: it is 0,
  // and says so, rather than missing. Only a rate with no lines at all has none.
  if (lineCount === 0) return null;
  const raw = { a13, a4, a5w, a5a, total: carbonOfBuildUp };

  // A build-up written for a batch (a day's output, a mixer load) is divided down
  // to one unit for its price; the carbon is divided the same way. Lines given per
  // unit of the rate stand as they are; only the day's or hour's lines are divided,
  // by the output the price itself implies: net = per-unit lines + day lines x (1 / output).
  const net = num(rate.netCost);
  const ratio = net > 0 && resourceCost > 0 ? net / resourceCost : 1;
  const unitCost = resourceCost - batchCost;
  let scale = 1;
  let batchScale = 1;
  if (ratio < 0.95) {
    if (batchCost > 0 && net > unitCost && unitCost > 0) batchScale = Math.min(1, (net - unitCost) / batchCost);
    else scale = ratio; // all of it is a batch (a mixer load, a day's output)
  }
  const per = (all, b) => (all - b + b * batchScale) * scale;
  a13 = per(a13, b13) + f13; a4 = per(a4, b4) + f4; a5w = per(a5w, b5w) + f5w; a5a = per(a5a, b5a) + f5a;
  const perUnit = a13 + a4 + a5w + a5a;
  const perUnitLow = perUnit - per(gap, bgap);

  const labourOnly = carbonOfBuildUp <= 0 && coveredLines === lineCount;
  return {
    trade,
    sectionKey: normalizeSectionKey(rate.sectionKey),
    itemNo: rate.itemNo ?? null,
    description: rate.description || "Untitled",
    unit: rate.unit || "",
    netCost: net,
    a13,
    a4,
    a5: a5w + a5a,
    total: Math.round(perUnit * 1000) / 1000,
    low: Math.round(perUnitLow * 1000) / 1000,
    coverage: resourceCost > 0 ? Math.min(1, coveredCost / resourceCost) : coveredLines / lineCount,
    hasAssumedMass: anyAssumed,
    labourOnly,
    note: labourOnly
      ? "Labour and plant hire only: no material or fuel in the build-up, so no upfront carbon."
      : carbonOfBuildUp <= 0
        ? "No line of this build-up could be weighed: the figure is 0 and its coverage shows how much is not counted."
        : "",
    carbonOfBuildUp,
    raw,
    scale: scale < 1 ? scale : batchScale,
    breakdown,
  };
}

/**
 * Carbon for every rate that has any, in the order given. Build-ups reuse one
 * another ("Mortar per square meter" is the mortar rate, "Formwork" the formwork
 * rate), so carbon is worked out in passes: each pass can follow the rates whose
 * carbon the pass before found, until nothing more is found.
 *
 * Returns an array parallel to `rates`: the carbon result, or null.
 */
export function buildCarbonRates(rates = [], materials = [], labourNames = []) {
  const lib = materials.rows && materials.byName ? materials : prepareMaterialLibrary(materials);
  const labours = new Set([...labourNames].map((n) => String(n || "").trim().toLowerCase()).filter(Boolean));
  const done = new Map();
  for (let pass = 0; pass < 4; pass++) {
    const refs = [...done.values()]
      .filter((c) => c.netCost > 0 && c.total > 0)
      .map((c) => ({
        trade: c.trade, sectionKey: c.sectionKey, itemNo: c.itemNo, description: c.description, unit: c.unit,
        netCost: c.netCost, carbonPerUnit: c.total, carbonLowPerUnit: c.low, raw: c.raw,
      }));
    const before = done.size;
    const totalBefore = [...done.values()].reduce((s, c) => s + c.total, 0);
    rates.forEach((rate, i) => {
      try {
        const c = assessRate(rate, lib, labours, refs);
        if (c) done.set(i, c);
      } catch (err) {
        console.warn(`[carbon] ${rate?.description}: ${err.message}`);
      }
    });
    const totalAfter = [...done.values()].reduce((s, c) => s + c.total, 0);
    if (done.size === before && Math.abs(totalAfter - totalBefore) < 1e-6) break;
  }
  return rates.map((_, i) => done.get(i) || null);
}
