// Pricing a bill line with a rate written in another unit.
//
// WHY THIS EXISTS
//
// Bills and rate libraries rarely share units. Blockwork is billed in m2 while
// concrete rates are per m3; rebar is measured in metres and priced per kg or
// tonne; an imported bill can be in mm or ft. Until now a rate in another unit
// was simply refused ("Measured in m3, this line is m2"), so the QS built a
// duplicate rate for every unit or priced the line by hand.
//
// THE FACTOR
//
// Everything here produces ONE number: how many of the RATE's unit one of the
// LINE's unit is. The line's rate is then the rate's price times that factor,
// and the rate's build-up scales by the same factor. A 230mm wall: 1 m2 is
// 0.23 m3, so a ₦154,916/m3 concrete rate prices the m2 line at ₦35,630.68.
//
// Within one kind of unit the factor is arithmetic (1 m = 1000 mm). Across
// kinds it needs the dimension that links them, and only that one:
//
//   area   <-> volume   thickness (m)
//   length <-> area     width (m)
//   length <-> volume   width x depth (m)
//   length <-> mass     kg per metre (a bar's, from its size: d²/162)
//   count  <-> anything how much of the rate's unit one item is
//
// THE SERVER NEVER TAKES A FACTOR FROM THE CLIENT. It takes the dimension the
// QS saw and confirmed, and works the factor out here. A posted factor would
// let a client price a line at anything.
//
// Mirrored in client/src/features/workProject/unitConversion.js. Pure.

const low = (v) => String(v ?? "").trim().toLowerCase();

/** Each unit's kind and its size in that kind's base unit (m, m2, m3, kg, nr). */
const UNITS = {
  // length, in metres
  m: ["length", 1], mm: ["length", 0.001], cm: ["length", 0.01], km: ["length", 1000],
  ft: ["length", 0.3048], in: ["length", 0.0254], yd: ["length", 0.9144],
  // area, in m2
  m2: ["area", 1], mm2: ["area", 1e-6], cm2: ["area", 1e-4], ft2: ["area", 0.09290304],
  yd2: ["area", 0.83612736], ha: ["area", 10000],
  // volume, in m3
  m3: ["volume", 1], l: ["volume", 0.001], ft3: ["volume", 0.028316846592],
  yd3: ["volume", 0.764554857984],
  // mass, in kg
  kg: ["mass", 1], t: ["mass", 1000], g: ["mass", 0.001], lb: ["mass", 0.45359237],
  // count
  nr: ["count", 1],
};

/** The spellings bills and rate libraries actually use. */
const ALIASES = {
  m: ["m", "lm", "lin m", "linm", "linear metre", "lineal metre", "linear meter", "rm", "metre", "meter", "mtr"],
  mm: ["mm", "millimetre", "millimeter"],
  cm: ["cm", "centimetre", "centimeter"],
  km: ["km"],
  ft: ["ft", "foot", "feet", "lft", "lf"],
  in: ["in", "inch", "inches"],
  yd: ["yd", "yard"],
  m2: ["m2", "m²", "sqm", "sq m", "square metre", "square meter"],
  mm2: ["mm2", "mm²"],
  cm2: ["cm2", "cm²"],
  ft2: ["ft2", "ft²", "sqft", "sq ft", "sf", "square foot", "square feet"],
  yd2: ["yd2", "sqyd", "sq yd"],
  ha: ["ha", "hectare"],
  m3: ["m3", "m³", "cum", "cu m", "cubic metre", "cubic meter"],
  l: ["l", "ltr", "litre", "liter"],
  ft3: ["ft3", "ft³", "cuft", "cu ft", "cf"],
  yd3: ["yd3", "cuyd", "cu yd", "cy"],
  kg: ["kg", "kgs", "kilogram", "kilo"],
  t: ["t", "tonne", "ton", "tn", "metric ton"],
  g: ["g", "gram"],
  lb: ["lb", "lbs", "pound"],
  nr: ["nr", "no", "each", "ea", "item", "unit", "pc", "piece", "pcs", "nos"],
};

const LOOKUP = new Map();
for (const [unit, names] of Object.entries(ALIASES)) {
  for (const n of names) {
    LOOKUP.set(n.trim(), unit);
    LOOKUP.set(n.trim().replace(/\s+/g, ""), unit);
  }
}

/** A unit as this module knows it ("Sq.m" -> "m2"), or "" when it does not. */
export function canonicalUnit(unit) {
  const u = low(unit).replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!u) return "";
  const look = (k) => LOOKUP.get(k) || LOOKUP.get(k.replace(/\s+/g, "")) || "";
  return look(u) || (u.endsWith("s") ? look(u.slice(0, -1)) : "") || "";
}

/** "length" | "area" | "volume" | "mass" | "count" | "" */
export const unitKind = (unit) => UNITS[canonicalUnit(unit)]?.[0] || "";

// Dimensions are metres. These bounds catch a figure typed in the wrong unit
// ("230" for 230mm read as 230 m) rather than judge the design.
const BOUNDS = {
  thickness: [0.001, 5],
  width: [0.001, 50],
  depth: [0.001, 50],
  kgPerM: [0.01, 1000],
  perItem: [0.000001, 1e6],
};

const inBounds = (name, v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return false;
  const [lo, hi] = BOUNDS[name];
  return n >= lo && n <= hi;
};

/** What a conversion between these kinds needs, or [] for none, or null for impossible. */
function needsFor(lineKind, rateKind) {
  if (lineKind === rateKind) return [];
  const pair = new Set([lineKind, rateKind]);
  const is = (a, b) => pair.has(a) && pair.has(b) && pair.size === 2;
  if (lineKind === "count" || rateKind === "count") return ["perItem"];
  if (is("area", "volume")) return ["thickness"];
  if (is("length", "area")) return ["width"];
  if (is("length", "volume")) return ["width", "depth"];
  if (is("length", "mass")) return ["kgPerM"];
  return null;
}

/**
 * How many of the RATE's unit one of the LINE's unit is.
 *
 * @param {string} lineUnit
 * @param {string} rateUnit
 * @param {object} [dims] {thickness, width, depth} in metres; kgPerM; perItem
 *                        (rate units per item)
 * @returns {{ok: true, factor: number, needs: string[], note: string}
 *          |{ok: false, code: string, message: string, needs?: string[]}}
 */
export function conversionFactor(lineUnit, rateUnit, dims = {}) {
  const lu = canonicalUnit(lineUnit);
  const ru = canonicalUnit(rateUnit);
  if (!lu || !ru) {
    return {
      ok: false,
      code: "UNIT_UNKNOWN",
      message: `"${!lu ? lineUnit : rateUnit}" is not a unit the website can convert.`,
    };
  }
  const [lk, ls] = UNITS[lu];
  const [rk, rs] = UNITS[ru];
  if (lu === ru) return { ok: true, factor: 1, needs: [], note: "" };

  const needs = needsFor(lk, rk);
  if (needs === null) {
    return {
      ok: false,
      code: "UNIT_NOT_CONVERTIBLE",
      message: `A rate per ${rateUnit} cannot price a line in ${lineUnit}: there is no dimension that links ${rk} and ${lk}.`,
    };
  }
  const missing = needs.filter((n) => !inBounds(n, dims?.[n]));
  if (missing.length) {
    return {
      ok: false,
      code: "UNIT_NEEDS_DIMENSION",
      message: `To price a line in ${lineUnit} with a rate per ${rateUnit}, give the ${missing
        .map(label)
        .join(" and ")}.`,
      needs,
    };
  }

  // One line unit in base units of its kind, then into the rate's kind, then
  // into the rate's own unit.
  let base = ls;
  if (lk === "count") {
    // perItem is already in the RATE's unit.
    return finish(Number(dims.perItem), needs, `${fmt(dims.perItem)} ${rateUnit} per ${lineUnit}`);
  }
  if (rk === "count") {
    // The rate is per item; one line unit is 1/perItem items. perItem here is
    // "how many line units one item is".
    return finish(ls / (Number(dims.perItem) * ls), needs, `${fmt(dims.perItem)} ${lineUnit} per ${rateUnit}`);
  }
  const t = Number(dims.thickness);
  const w = Number(dims.width);
  const d = Number(dims.depth);
  if (lk === "area" && rk === "volume") base *= t;
  else if (lk === "volume" && rk === "area") base /= t;
  else if (lk === "length" && rk === "area") base *= w;
  else if (lk === "area" && rk === "length") base /= w;
  else if (lk === "length" && rk === "volume") base *= w * d;
  else if (lk === "volume" && rk === "length") base /= w * d;
  else if (lk === "length" && rk === "mass") base *= Number(dims.kgPerM);
  else if (lk === "mass" && rk === "length") base /= Number(dims.kgPerM);

  const note =
    lk === rk
      ? ""
      : needs.includes("thickness")
        ? `at ${mm(t)} thick`
        : needs.includes("depth")
          ? `at ${mm(w)} x ${mm(d)}`
          : needs.includes("width")
            ? `at ${mm(w)} wide`
            : `at ${fmt(dims.kgPerM)} kg/m`;
  return finish(base / rs, needs, note);
}

function finish(factor, needs, note) {
  if (!Number.isFinite(factor) || factor <= 0) {
    return { ok: false, code: "UNIT_NOT_CONVERTIBLE", message: "That conversion does not give a usable figure." };
  }
  return { ok: true, factor, needs, note };
}

const label = (n) =>
  ({
    thickness: "thickness",
    width: "width",
    depth: "depth",
    kgPerM: "weight per metre (kg/m)",
    perItem: "quantity per item",
  })[n] || n;

const fmt = (v) => String(Math.round(Number(v) * 1000) / 1000);
const mm = (m) => `${Math.round(Number(m) * 1000)} mm`;

/**
 * The dimensions a description names, in metres, so the QS confirms rather
 * than types: "230mm", "150 mm thick", "T:Generic - 230mm", "230 x 450mm",
 * "Y12", "12mm dia".
 *
 * A guess, always shown and editable. Never applied without the QS seeing it.
 */
export function guessDimensions(description) {
  const s = String(description ?? "");
  const out = {};

  // A bar: Y12, T16, R10, "12mm dia", "16mm diameter". Weight is d²/162 kg/m,
  // the standard figure for steel reinforcement.
  const bar = s.match(/\b[YTRD]\s?(\d{1,2})\b/i) || s.match(/\b(\d{1,2})\s?mm\s*(?:dia|diameter|ø|bar)/i);
  if (bar) {
    const d = Number(bar[1]);
    if (d >= 6 && d <= 50) out.kgPerM = Math.round(((d * d) / 162) * 1000) / 1000;
  }

  // A section: "230 x 450mm", "230x450", "0.23 x 0.45m".
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(mm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|m)\b/i);
  if (sec) {
    const unit = (sec[4] || sec[2] || "mm").toLowerCase();
    const k = unit === "m" ? 1 : 0.001;
    out.width = Number(sec[1]) * k;
    out.depth = Number(sec[3]) * k;
  }

  // A thickness: the first plain "230mm" / "150 mm" that is not a bar size.
  if (!out.width) {
    const all = [...s.matchAll(/(\d+(?:\.\d+)?)\s*mm\b(?!\s*(?:dia|diameter|ø|bar))/gi)];
    const t = all.map((m) => Number(m[1])).find((n) => n >= 25 && n <= 1000);
    if (t) {
      out.thickness = t / 1000;
      out.width = t / 1000;
    }
  }
  return out;
}
