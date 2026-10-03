// server/util/icmsWorkCarbon.js
//
// The RateGen rate whose carbon a bill line carries, chosen by the WORK the line
// measures rather than by its wording. The owner's choice (3 Oct 2026): QUIV,
// HERON and SERVIQ bill lines are not linked to RateGen rates and are worded
// nothing like them ("Beams – Reinforcement Links T6", in kg, against "Procure
// and place 7 to 12mm deformed bar reinforcement", per tonne), so a wording match
// finds almost nothing. What a line measures is plain from its words and unit:
// concrete by the m3, reinforcement by weight, blockwork by the m2 at a thickness.
//
// So: the work type picks the family of rates, the unit must agree (kg and tonnes
// convert), and what the line states (mix, grade, bar size, block thickness,
// screed thickness) picks the rate within the family. What the line does NOT
// state is assumed, said in `assumed`, and shown on the report as assumed.
//
// Pure. Pinned by icmsWorkCarbon.test.js.

import { similarityScore } from "./fuzzyMatch.js";
import { normaliseUnit } from "./rateSuggestions.js";

const low = (s) => String(s || "").toLowerCase();

/** Line unit to rate unit: the factor, or null when they cannot meet. */
export function unitFactor(lineUnit, rateUnit) {
  const a = normaliseUnit(lineUnit);
  const b = normaliseUnit(rateUnit);
  if (!a || !b) return null;
  if (a === b) return 1;
  if (a === "kg" && b === "t") return 0.001;
  if (a === "t" && b === "kg") return 1000;
  return null;
}

// Nominal mixes and the grade a QS reads them as.
const MIX_GRADE = { "1:4:8": 10, "1:3:6": 15, "1:2:4": 20, "1:1.5:3": 25, "1:1:2": 30 };
const GRADE_MIX = Object.fromEntries(Object.entries(MIX_GRADE).map(([m, g]) => [g, m]));
const mixRe = (mix) => new RegExp(mix.replace(/\./g, "\\.").replace(/:/g, "\\s*:\\s*"));

/**
 * QUIV's "[L:01 GROUND FLOOR | T:Generic - 150mm]": the level (L:) is where it was
 * measured, not what it is, and its numbers would read as sizes; the type (T:) is
 * what it is ("150mm"), so it stays.
 */
const lineText = (item) =>
  [item?.description, item?.takeoffLine, item?.type]
    .map((v) => String(v || ""))
    .join(" ")
    .replace(/\bL:[^|\]]*/g, " ")
    .replace(/[[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "Columns" and "column" are the same word to a QS
const stem = (s) => String(s || "").toLowerCase().replace(/\b(\w{3,}?)(es|s)\b/g, "$1");

function concreteWants(t) {
  const mix = t.match(/1\s*:\s*(\d(?:\.\d)?)\s*:\s*(\d+)/);
  const grade = t.match(/\bgrade\s*(\d{2})\b|\bc(\d{2})(?:\/\d{2})?\b|\b(\d{2})\s*mpa\b/i);
  const g = grade ? Number(grade[1] || grade[2] || grade[3]) : null;
  const m = mix ? `1:${mix[1]}:${mix[2]}` : g && GRADE_MIX[g] ? GRADE_MIX[g] : null;
  if (m || g) {
    return {
      wants: [m && ((d) => mixRe(m).test(d)), g && ((d) => new RegExp(`grade\\s*${g}\\b`, "i").test(d))].filter(Boolean),
      assumed: null,
    };
  }
  const blinding = /\b(blinding|mass concrete|plain concrete)\b/i.test(t);
  const def = blinding ? "1:4:8" : "1:2:4";
  return {
    wants: [(d) => mixRe(def).test(d)],
    assumed: `Concrete mix not stated: ${def} (grade ${MIX_GRADE[def]}) assumed.`,
  };
}

function barWants(t) {
  const sizes = [...t.matchAll(/\b[tyr](\d{1,2})\b|\b(\d{1,2})\s*mm\b/gi)].map((m) => Number(m[1] || m[2])).filter((n) => n >= 6 && n <= 40);
  const plain = /\b(plain|mild|round|r\d{1,2})\b/i.test(t) && !/\b(deformed|high yield|t\d|y\d)\b/i.test(t);
  const kind = plain ? /plain round/i : /deformed|high yield/i;
  const inRange = (d) => {
    const r = d.match(/(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*mm/i);
    const one = d.match(/\b(\d{1,2})\s*mm\b/);
    return sizes.some((s) => (r ? s >= Number(r[1]) && s <= Number(r[2]) : one ? s === Number(one[1]) : false));
  };
  return {
    wants: [(d) => kind.test(d), ...(sizes.length ? [inRange] : [])],
    assumed: sizes.length ? null : "Bar size not stated: the rate for 12mm bars assumed.",
    fallbackWants: sizes.length ? [] : [(d) => /\b12\b|10 to 12|12 to 18/i.test(d)],
  };
}

function thicknessWants(t, { options, def, label }) {
  const m = t.match(/\b(\d{2,3})\s*mm\b/);
  let th = m ? Number(m[1]) : null;
  if (th === 230) th = 225; // a QS's 230 wall is the 225 block
  if (th && options.includes(th)) return { wants: [(d) => new RegExp(`\\b${th}\\s*mm`).test(d)], assumed: null };
  return { wants: [(d) => new RegExp(`\\b${def}\\s*mm`).test(d)], assumed: `${label} not stated: ${def}mm assumed.` };
}

function screedWants(t) {
  const m = t.match(/\b(\d{2})\s*mm\b/);
  if (!m) return { wants: [(d) => /40-50mm/.test(d)], assumed: "Screed thickness not stated: the 40-50mm rate assumed." };
  const th = Number(m[1]);
  return {
    wants: [(d) => { const b = d.match(/(\d{2})-(\d{2})mm/); return b ? th >= Number(b[1]) && th <= Number(b[2]) : false; }],
    assumed: null,
  };
}

// Work types, most specific first: the operation ("Wall Rendering") before the
// element it is done to ("Blockwork"). `line` reads the bill line; `units` are
// the units that work is measured in (concrete is never by the m2: a wall finish
// called "Concrete, Cast In Situ" is not concrete work); `rate` picks the family
// of RateGen rates; `not` keeps out rates that only share a word.
const M2 = ["m2"], M3 = ["m3"], WEIGHT = ["kg", "t"], RUN = ["m"], EACH = ["nr"];
const WORK = [
  { id: "mesh", units: M2, line: /\b(brc|mesh|fabric reinforcement)\b/i, rate: /\b(mesh|fabric|brc)\b/i },
  { id: "reinforcement", units: WEIGHT, line: /\b(reinforc\w*|rebar|bars?|high yield|links?|stirrups?|[ty]\d{1,2})\b/i, notLine: /\bburgla?r|buglar\b/i,
    rate: /\breinforcement\b|\bbars?\b/i, not: /concrete \(|build rate for a gra/i, wants: barWants },
  { id: "formwork", units: [...M2, ...RUN], line: /\b(formwork|shuttering|soffit)\b/i, rate: /\bform ?work\b/i },
  { id: "screed", units: M2, line: /\bscreed\w*\b|\bfloated bed\b/i, rate: /\bscreed\w*\b/i, not: /terrazzo|tile/i, wants: screedWants },
  { id: "render", units: M2, line: /\b(render\w*|plaster(ing)?)\b/i, rate: /\b(render|plaster)\b/i },
  { id: "wall-tile", units: M2, line: /\bwall tiles?\b/i, rate: /\bwall tiles?\b|\btiles? to walls?\b/i },
  { id: "floor-tile", units: M2, line: /\b(floor (finish|tile)\w*|floor tiles?|vitrified|ceramic floor|porcelain)\b/i, rate: /\b(vitrified|ceramic|porcelain|floor ?flex|terrazzo)\b.*\b(tiles?|floor)\b|\bfloor tiles?\b/i },
  { id: "paint", units: M2, line: /\b(paint\w*|emulsion|texcote|gloss|decorat\w*)\b/i, rate: /\b(paint|emulsion|texcote|coats?|gloss)\b/i, not: /\bsteel (surface|to sp)/i },
  { id: "ceiling", units: M2, line: /\bceilings?\b|\bp\.?o\.?p\b/i, rate: /\bceiling\b/i },
  { id: "roof-covering", units: M2, line: /\b(roof(ing)? (cover\w*|sheets?)|longspan|long span|aluminium roofing|corrugated|roof – covering|stone[\s-]?coated)\b/i, rate: /\broofing sheet|\blongspan|\broof(ing)? (cover|sheet)/i },
  { id: "roof-timber", units: RUN, line: /\b(rafters?|purlins?|wall ?plates?|king ?posts?|struts?|tie ?beams?|noggin\w*)\b/i,
    rate: /\b(rafters?|purlins?|wall ?plates?|king ?posts?|struts?|tie ?beams?|roof (timber|carcass\w*))\b/i, not: /\b(sheet|covering|tiles?)\b/i },
  { id: "concrete", units: M3, line: /\b(concrete|blinding|\d{2}\s*mpa|grade\s*\d{2})\b/i, rate: /\bconcrete\b/i, not: /\bfilling in\b|\bblock|\bprecast\b/i, wants: concreteWants },
  // "230mm Wall" by the m2 is blockwork in a Nigerian bill: a wall at a block thickness
  { id: "blockwork", units: M2, line: /\b(block\w*|sandcrete)\b|\b(100|150|225|230)\s*mm\b.*\bwalls?\b|\bwalls?\b.*\b(100|150|225|230)\s*mm\b/i,
    rate: /\bblock(wall|work)\b/i, not: /\b(filling|concrete)\b/i,
    wants: (t) => thicknessWants(t, { options: [100, 150, 225], def: 225, label: "Block thickness" }) },
  { id: "filling", units: [...M3, ...M2], line: /\b(hardcore|laterite|filling|sub[\s-]?base)\b/i, rate: /\b(hardcore|laterite|filling sand|filling|sub[\s-]?base)\b/i, not: /\bconcrete filling\b|\bblockwall\b/i },
  { id: "excavation", units: M3, line: /\b(excavat\w*|exc\b|trench)\b/i, notLine: /\bearth ?work support\b/i, rate: /\bexcavat\w*/i },
  { id: "window", units: EACH, line: /\bwindows?\b/i, rate: /\bwindows?\b/i, byArea: true },
  { id: "door", units: EACH, line: /\bdoors?\b/i, rate: /\bdoors?\b/i, byArea: true },
];

/** The opening a window or door is: "(0.9×3)" in metres, "1200 x 1500mm" in mm. */
export function openingArea(text) {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const metres = (v) => (v > 20 ? v / 1000 : v);
  const area = metres(a) * metres(b);
  return area > 0 && area < 50 ? area : null;
}

const workFor = (t, unit) => {
  const u = normaliseUnit(unit);
  return WORK.find((w) => w.line.test(t) && !(w.notLine && w.notLine.test(t)) && w.units.includes(u)) || null;
};

/** What a bill line measures, or "". */
export function workTypeOf(item) {
  return workFor(lineText(item), item?.unit)?.id || "";
}

/**
 * The carbon rate for a bill line by its work, or null.
 * `rates` are carbon rates: { description, unit, source, carbon: { total, ... } }.
 * Returns { rate, factor, workType, assumed, score }: factor converts the line's
 * quantity into the rate's unit.
 */
export function matchWorkRate(item, rates = []) {
  const t = lineText(item);
  if (!t || !item?.unit) return null;
  const work = workFor(t, item.unit);
  if (!work) return null;

  const family = rates
    .filter((r) => r?.carbon && work.rate.test(r.description || "") && !(work.not && work.not.test(r.description || "")))
    .map((r) => ({ r, factor: unitFactor(item.unit, r.unit) }))
    .filter((x) => x.factor != null);
  if (!family.length) return null;

  const spec = work.wants ? work.wants(t) : { wants: [], assumed: null };
  const wants = [...(spec.wants || []), ...(spec.fallbackWants || [])];
  let best = null;
  for (const x of family) {
    const d = x.r.description || "";
    const hits = wants.filter((w) => w(d)).length;
    const score = hits * 2 + similarityScore(stem(t), stem(d)) + (x.r.source && x.r.source !== "master" ? 0.01 : 0);
    if (!best || score > best.score) best = { ...x, hits, score };
  }
  // when the line states a spec, a rate that meets none of it is not this work
  if ((spec.wants || []).length && best.hits === 0 && !spec.assumed) return null;
  // a window or door rate is for one size: another size scales by its area
  let factor = best.factor;
  let sized = null;
  if (work.byArea) {
    const mine = openingArea(t);
    const theirs = openingArea(best.r.description);
    if (mine && theirs && Math.abs(mine - theirs) > 0.01) {
      // an 8 x 3 m opening is not a flush door made larger: past 4x either way, it is not this work
      if (mine / theirs > 4 || mine / theirs < 0.25) return null;
      factor *= mine / theirs;
      sized = `Scaled from the rate's ${theirs.toFixed(2)} m2 opening to this ${mine.toFixed(2)} m2 one.`;
    }
  }
  return {
    rate: best.r,
    factor,
    sized,
    workType: work.id,
    // the default was assumed; when no rate is the default, the nearest one stands in
    assumed: !spec.assumed ? null : best.hits > 0 ? spec.assumed : spec.assumed.replace(/ assumed\.$/, "; no such rate, the nearest used."),
    score: Math.round(best.score * 100) / 100,
  };
}
