// Turning a price-list price into a price in the unit a schedule measures in.
//
// The Material & Labour schedules (the server's mlSchedule and QUIV's own) count
// sand and granite in tons, binding wire in kg, paint in 20-litre drums and
// timber in metres. The RateGen master list sells sand per m³, binding wire per
// 25 kg roll, paint per 4-litre tin and timber per 3,600 mm length. Without
// conversion every one of those rows stayed unpriced: on three real QUIV
// projects (7 Oct 2026) only about 40% of budget rows got a price.
//
// The rule is the same as before for anything this module does not know: no
// conversion means no price. An unpriced row is a gap the QS sees and fills; a
// wrongly-scaled one quietly corrupts a budget. So only these conversions exist:
//
//   - the same family at another scale (ton <-> kg, litre <-> drum);
//   - a pack whose size is written in the price list (unit "4 Litre", "25kg
//     roll", a length "3600mm" or 12'), converted per kg, litre or metre;
//   - mass <-> volume for loose bulk materials only (sand, granite, laterite,
//     hardcore), by a density: sharp/plaster sand from the firm's own constant
//     (Concrete.SharpSand.KgPerM3), the rest from DENSITY_KG_PER_M3 below.
// Pure: no database.

import { MC } from "./materialConstants.js";

/** Litres in the drum the schedules count paint in (the constants say "20L drum"). */
export const PAINT_DRUM_LITRES = 20;

/** Loose bulk densities (kg/m³) used only to convert tons <-> m³. Sand comes from the firm's constant. */
export const DENSITY_KG_PER_M3 = {
  granite: 1500,
  gravel: 1500,
  laterite: 1800,
  hardcore: 1900,
};

const UNIT_ALIASES = {
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  ton: "ton", tons: "ton", tonne: "ton", tonnes: "ton", t: "ton", mt: "ton",
  bag: "bag", bags: "bag",
  nr: "nr", no: "nr", nos: "nr", each: "nr", pcs: "nr", piece: "nr", pieces: "nr",
  m2: "m2", sqm: "m2",
  m3: "m3", cum: "m3",
  m: "m", lm: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  l: "litre", ltr: "litre", litre: "litre", litres: "litre", liter: "litre", liters: "litre",
  drum: "drum", drums: "drum",
  roll: "roll", rolls: "roll",
  length: "length", lengths: "length",
  sheet: "sheet", sheets: "sheet",
};

export function unitKey(u) {
  const s = String(u || "").trim().toLowerCase().replace(/[³]/g, "3").replace(/[²]/g, "2").replace(/\./g, "");
  return UNIT_ALIASES[s] || s;
}

/**
 * What one unit of a price-list item contains, read from its unit and its own
 * description: { kg }, { litre }, { m } or null. "4 Litre" -> { litre: 4 };
 * a [Roll] described "25kg roll" -> { kg: 25 }; a [Length] described
 * "(50x75x3600mm)" -> { m: 3.6 }.
 */
export function packContent(priceUnit, description = "") {
  const u = String(priceUnit || "").trim().toLowerCase();
  const d = String(description || "").toLowerCase();

  const litresInUnit = /^(\d+(?:\.\d+)?)\s*(?:l|ltr|litres?|liters?)$/.exec(u);
  if (litresInUnit) return { litre: Number(litresInUnit[1]) };
  const kgInUnit = /^(\d+(?:\.\d+)?)\s*kg$/.exec(u);
  if (kgInUnit) return { kg: Number(kgInUnit[1]) };

  const key = unitKey(u);
  if (key === "roll" || key === "bag" || key === "drum") {
    const kg = /(\d+(?:\.\d+)?)\s*kg\b/.exec(d);
    if (kg) return { kg: Number(kg[1]) };
    const l = /(\d+(?:\.\d+)?)\s*(?:l|ltr|litres?|liters?)\b/.exec(d);
    if (l) return { litre: Number(l[1]) };
  }
  if (key === "length") {
    const mm = /(\d{3,5})\s*mm\)?\s*(?:-|$|\s)/.exec(d) || /x(\d{3,5})mm/.exec(d);
    if (mm) return { m: Number(mm[1]) / 1000 };
    const ft = /(\d{1,2})'/.exec(d);
    if (ft) return { m: Number(ft[1]) * 0.3048 };
  }
  return null;
}

/** Bulk density in kg/m³ for a material name, or null when it is not a loose bulk material. */
export function densityFor(name, K = null) {
  const n = String(name || "").toLowerCase();
  if (/\bsand\b/.test(n)) {
    const v = K && typeof K.get === "function" ? Number(K.get(MC.ConcreteSandKgPerM3)) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 1440;
  }
  for (const [k, v] of Object.entries(DENSITY_KG_PER_M3)) if (n.includes(k)) return v;
  return null;
}

/** How much of `family` (kg / litre / m / m3) one `wantUnit` holds, or null. */
function amountIn(wantUnit, family, name, K) {
  const w = unitKey(wantUnit);
  if (family === "kg") {
    if (w === "kg") return 1;
    if (w === "ton") return 1000;
    if (w === "m3") { const d = densityFor(name, K); return d ? d : null; }
  }
  if (family === "litre") {
    if (w === "litre") return 1;
    if (w === "drum") return PAINT_DRUM_LITRES;
  }
  if (family === "m" && w === "m") return 1;
  if (family === "m3") {
    if (w === "m3") return 1;
    const d = densityFor(name, K);
    if (!d) return null;
    if (w === "ton") return 1000 / d;
    if (w === "kg") return 1 / d;
  }
  return null;
}

/**
 * A price quoted per `priceUnit` (an item described `description`) as a price
 * per `wantUnit` for the material `name`, or null when it cannot be converted.
 */
export function convertPrice(price, priceUnit, description, wantUnit, name, K = null) {
  const p = Number(price);
  if (!(p > 0)) return null;
  if (!wantUnit || !String(priceUnit || "").trim()) return p; // unit-agnostic (a firm's own library)

  const from = unitKey(priceUnit);
  const to = unitKey(wantUnit);
  if (from === to) return p;

  // Same family at another scale.
  if (from === "ton" && to === "kg") return p / 1000;
  if (from === "kg" && to === "ton") return p * 1000;
  if (from === "drum" && to === "litre") return p / PAINT_DRUM_LITRES;
  if (from === "litre" && to === "drum") return p * PAINT_DRUM_LITRES;

  // What one priced unit contains, then how much of that one wanted unit holds.
  let family = null;
  let per = null;
  const pack = packContent(priceUnit, description);
  if (pack?.kg) { family = "kg"; per = pack.kg; }
  else if (pack?.litre) { family = "litre"; per = pack.litre; }
  else if (pack?.m) { family = "m"; per = pack.m; }
  else if (from === "m3") { family = "m3"; per = 1; }
  else if (from === "ton") { family = "kg"; per = 1000; }
  else if (from === "kg") { family = "kg"; per = 1; }
  else if (from === "litre") { family = "litre"; per = 1; }
  if (!family || !(per > 0)) return null;

  const need = amountIn(wantUnit, family, name, K);
  if (!(need > 0)) return null;
  return (p / per) * need;
}

/**
 * The price-list's own wording for names the schedules use differently, tried
 * after the name itself. Choices made for the owner to confirm (7 Oct 2026):
 * paint is the 20-litre "Emulsion Paint (All Colours)" (the list's "Coloured
 * Emulsion (High Quality)" reads NGN 420 per 4 L, which is a data error), soft
 * sand for plaster sand, 3" nails, hollow blocks by their thickness.
 */
export const NAME_ALIASES = {
  "emulsion paint": ["emulsion paint (all colours)"],
  "pop paint": ["emulsion paint (all colours)"],
  "finishes – paint required": ["emulsion paint (all colours)"],
  "plaster sand": ["soft sand"],
  nails: ['nails 3"', "nails"],
  "bracing timber": ["2x3\"x12' (50x75x3600mm) - hardwood"],
  "blocks (generic - 230mm)": ['225 x 225 x 450mm (9 x 9 x 18") hollow blocks'],
  "blocks (generic - 225mm)": ['225 x 225 x 450mm (9 x 9 x 18") hollow blocks'],
  "blocks (generic - 150mm)": ['150 x 225 x 450mm (6 x 9 x 18") hollow blocks'],
  "blocks (generic - 100mm)": ['100 x 225 x 450mm (4 x 9 x 18") hollow blocks'],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Every map entry that could be `name`, best first: the exact name, its
 * aliases, then any entry whose key contains it or is contained by it.
 * map: Map<normalised description, { price, unit, description? }>
 */
export function candidatesFor(map, name) {
  const k = norm(name);
  if (!k || !map) return [];
  const out = [];
  const seen = new Set();
  const push = (key) => {
    if (!seen.has(key) && map.has(key)) { seen.add(key); out.push({ key, ...map.get(key) }); }
  };
  push(k);
  for (const a of NAME_ALIASES[k] || []) push(norm(a));
  for (const a of [k, ...(NAME_ALIASES[k] || []).map(norm)]) {
    for (const key of map.keys()) if (key.includes(a) || a.includes(key)) push(key);
  }
  return out;
}

/** The first candidate whose price converts to `wantUnit`, as that price; 0 when none does. */
export function convertedPrice(map, name, wantUnit, K = null) {
  for (const c of candidatesFor(map, name)) {
    const v = convertPrice(c.price, c.unit, c.description || c.key, wantUnit, name, K);
    if (v !== null && v > 0) return v;
  }
  return 0;
}
