// server/util/serviceMatch.js
//
// Finds the price for a services (MEP) line's material or labour in a price list,
// STRICTLY. Used by the web MEP pricing (util/serviceResolve.js) and the services
// lines of the M&L schedule (util/mlScheduleContext.js), now that both read the
// RateGen master library: ~600 named items for every trade.
//
// WHY NOT THE OLD lookup()
//
// lookup() takes the exact name, else the first list entry whose name contains
// the query or is contained in it. Against an empty list that was harmless;
// against the master it prices "connector" as the first item with "connector"
// in its name (a 100mm uPVC pan connector) and a 25mm pipe line from whichever
// pipe comes first. A wrong price that looks right is worse than no price: an
// unpriced line is a visible gap the QS fills.
//
// THE RULES, in order
//   1. exact name (case, spacing, punctuation and mm²/mm2 folded)
//   2. word match, only when ALL hold:
//      - every size or rating agrees both ways (25mm never meets 32mm; a 100mm
//        item never prices a line that names no size)
//      - the units agree (a price per metre never prices a count)
//      - most of the line's words are in the item's name
//      - the best item is clearly better than the next (a tie is no match)
//
// An item from a "(installed)" category is an all-in supply-and-fix price; the
// caller must then not add labour on top. `allIn` says so.
//
// Pure: no Mongo. Pinned by serviceMatch.test.js.

const STOP = new Set([
  "a", "an", "and", "the", "of", "to", "in", "on", "for", "with", "or", "by", "at", "as", "per",
  "supply", "fix", "fixing", "install", "installation", "installed", "complete", "including", "incl",
  "all", "other", "equal", "approved", "type", "standard", "default", "item", "items",
  "fixtures", "fixture", "equipment", "plumbing", "electrical", "mechanical", "m",
  // where a thing is fixed, not what it is ("18W wall mounted ceiling" light is no ceiling-mounted fan)
  // ("surface" stays: a surface pump is a kind of pump, not where it is fixed)
  "mounted", "recessed", "concealed", "external", "internal", "wall", "hosted",
]);

// The same thing, spelt the ways bills and the library spell it, folded to one
// word so it counts once ("Wash hand basin (WHB)" is one thing, not four).
const CANON = [
  [/\bwater closets?\b|\btoilets?\b|\bw\.?c\b/g, "wc"],
  [/\bwash[\s-]?hand[\s-]?basins?\b|\bwhb\b/g, "whb"],
  [/\bdistribution boards?\b|\bpanelboards?\b|\bdb\b/g, "db"],
  [/\bair[\s-]?condition(?:er|ers|ing)\b|\ba\/c\b/g, "ac"],
  [/\bu?pvc\b/g, "upvc"],
  [/\bexhaust\b/g, "extractor"],
  [/\breceptacles?\b/g, "socket"],
  [/\binspection chambers?\b|\bic\b/g, "ic"],
];
// Spelt-out forms of an abbreviation, before folding: Revit's "DWV" pipe is drain-waste-vent.
const SPELL = [[/\bdwv\b/g, "drain waste vent"]];
const CANON_WORDS = new Set(CANON.map(([, w]) => w));

export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/(\d)\s*mm\s*2\b/g, "$1mm2")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9.\/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(text) {
  let t = text;
  for (const [re, w] of SPELL) t = t.replace(re, ` ${w} `);
  for (const [re, w] of CANON) t = t.replace(re, ` ${w} `);
  return t;
}

/** The sizes and ratings a name states: "25mm", "2.5mm2", "1.5hp", "12way", "50l", "9kg", "13a". */
export function sizesOf(text) {
  const out = new Set();
  // "1300 x 1200 mm", "600x600", "450 x 200 x 50": one size, not its last figure
  let t = normName(String(text || "").replace(/[×*]/g, "x")).replace(
    /(\d+(?:\.\d+)?)\s*(?:mm)?\s*x\s*(\d+(?:\.\d+)?)(?:\s*(?:mm)?\s*x\s*(\d+(?:\.\d+)?))?\s*(?:mm\b)?/g,
    (_, a, b, c) => {
      out.add([a, b, c].filter(Boolean).map(Number).join("x"));
      return " ";
    },
  );
  const re = /(\d+(?:\.\d+)?)\s*(mm2|mm|hp|kva|kw|a|v|w|l|litres?|liters?|kg|way|ways|gang|core|cores|zones?|m)\b/g;
  for (const m of t.matchAll(re)) {
    let u = m[2];
    if (/^(litres?|liters?)$/.test(u)) u = "l";
    if (u === "ways") u = "way";
    if (u === "cores") u = "core";
    if (u === "zones") u = "zone";
    if (u === "m") continue; // a length ("3m") describes a product's pack, not its size
    out.add(`${Number(m[1])}${u}`);
  }
  for (const m of t.matchAll(/(\d+)\s*-\s*(way|gang|core)\b/g)) out.add(`${Number(m[1])}${m[2]}`);
  return out;
}

// The words that say what a thing is: no sizes, no filler, nothing under three
// letters ("SP&N", "TP") except the folded words above ("wc", "db", "ac").
function wordsOf(text) {
  return new Set(wordList(text));
}

// The thing a short line names is its last word ("Fire Alarm Panel" is a panel,
// not a sounder that shares "fire alarm"). Only for a short line without a
// comma; a described line ("20mm conduit, 1.5mm2 wiring and switch") has no head.
function headOf(text) {
  if (/,/.test(String(text || ""))) return null;
  const list = wordList(text);
  return list.length > 0 && list.length <= 4 ? list[list.length - 1] : null;
}

function wordList(text) {
  return (
    canonical(normName(text))
      .replace(/\d+(\.\d+)?\s*[a-z0-9]*/g, " ")
      .split(/[\s\/+-]+/)
      .filter((w) => (w.length >= 3 || CANON_WORDS.has(w)) && !STOP.has(w))
      // "points" and "point" are one word to a QS
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
  );
}

// Units that measure the same thing.
const UNIT = {
  m: "m", lm: "m", rm: "m", "lin m": "m", metre: "m", meter: "m", "m.": "m",
  nr: "nr", no: "nr", "no.": "nr", nos: "nr", each: "nr", ea: "nr", pcs: "nr", pc: "nr", set: "set", item: "nr",
  m2: "m2", sqm: "m2", "m²": "m2", m3: "m3", "m³": "m3", kg: "kg", t: "t", tonne: "t", ton: "t", day: "day", hr: "hr", hour: "hr",
};
export const unitFamily = (u) => {
  const s = String(u || "").trim().toLowerCase();
  return UNIT[s] || UNIT[s.replace(/\.$/, "")] || s;
};

/**
 * An index over a price list.
 * rows: [{ name, price, unit?, category?, source? }], later rows win on the same name
 * (so pass the master first, then the user's own library).
 */
export function buildPriceIndex(rows = []) {
  const byName = new Map();
  for (const r of rows) {
    const key = normName(r?.name);
    const price = Number(r?.price);
    if (!key || !(price > 0)) continue;
    byName.set(key, {
      name: String(r.name),
      price,
      unit: String(r.unit || ""),
      category: String(r.category || ""),
      source: r.source || "",
      allIn: /\(installed\)/i.test(String(r.category || "")),
      words: wordsOf(r.name),
      sizes: sizesOf(r.name),
    });
  }
  return { byName, items: [...byName.values()] };
}

// A sized item must state exactly the line's sizes; an item that states none is
// generic ("Point wiring, lighting point") and may price a sized line.
const sizesFit = (line, item) => item.size === 0 || (item.size === line.size && [...line].every((x) => item.has(x)));

// SERVIQ writes "Fire Alarm Devices – Smoke detector": the words after the dash
// name the thing; the category before it would only dilute the match.
const itemPart = (name) => {
  const s = String(name || "");
  const i = s.indexOf(" – ");
  return i > 0 && s.slice(0, i).split(/\s+/).length <= 3 ? s.slice(i + 3) : s;
};

/**
 * The price for `name`, or null. { price, name, unit, allIn, how: "exact"|"words", score }
 * `unit` (optional) is the unit the line is measured in; a known unit that disagrees
 * with the item's excludes it.
 */
export function matchPrice(index, name, { unit = "", minCoverage = 0.6 } = {}) {
  const key = normName(name);
  if (!key || !index) return null;
  const want = unit ? unitFamily(unit) : "";
  const unitOk = (it) => !want || !it.unit || unitFamily(it.unit) === want;

  const exact = index.byName.get(key);
  if (exact && unitOk(exact)) return { ...pick(exact), how: "exact", score: 1 };

  // read the line as its item part and as a whole, and keep the better reading:
  // "Fire Alarm Devices – Smoke detector" is about the detector, but
  // "Lighting Points – 20mm conduit" is about the lighting point
  const readings = [...new Set([itemPart(name), name])]
    .map((text) => Object.assign(wordsOf(text), { head: headOf(text) }))
    .filter((w) => w.size > 0);
  const qSizes = sizesOf(name);
  if (!readings.length) return null;

  const scored = [];
  for (const it of index.items) {
    if (!unitOk(it) || !sizesFit(qSizes, it.sizes)) continue;
    let best = null;
    for (const qWords of readings) {
      if (qWords.head && !it.words.has(qWords.head)) continue; // not the thing the line names
      const common = [...qWords].filter((w) => it.words.has(w));
      if (common.length === 0) continue;
      const coverage = common.length / qWords.size; // how much of the line the item explains
      const precision = common.length / Math.max(1, it.words.size); // how much of the item is about the line
      const score = coverage * 0.75 + precision * 0.25;
      // two words in common, or one that names the thing outright ("WC", "DB");
      // "lighting" alone, or "connector" alone, names nothing in particular
      const enough = common.length >= 2 || CANON_WORDS.has(common[0]);
      if (coverage >= minCoverage && enough && (!best || score > best)) best = score;
    }
    if (best != null) scored.push({ it, score: best });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (next && best.score - next.score < 0.05) return null; // ambiguous: no price beats a guessed one
  return { ...pick(best.it), how: "words", score: Math.round(best.score * 100) / 100 };
}

const pick = (it) => ({ price: it.price, name: it.name, unit: it.unit, category: it.category, allIn: it.allIn, source: it.source });
