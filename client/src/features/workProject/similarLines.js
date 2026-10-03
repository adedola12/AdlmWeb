// The lines on a bill that are the same item as the one being priced.
//
// A Revit bill repeats one item per level and type: "Blockwork - Lintel
// Concrete [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]", then L:02, L:03,
// and so on. Pricing one of them is the QS's decision about all of them, so the
// panel offers the rest ticked; the QS can untick any line before applying.
//
// THE RULE, AND WHY IT IS STRICT
//
// Same item: the description with its LEVEL removed. The level says where the
// work is, not what it is. The TYPE ("T:Generic - 230mm") is kept, because a
// 230mm wall and a 150mm wall are different rates per m2.
// Same unit: an m3 rate on an m2 line is wrong by the thickness and looks right.
// No rate yet: a line already priced holds a decision the QS made; this never
// overwrites one.
//
// Mirrors server/util/rateSuggestions.js (lineKey, similarLines), which the
// server uses for the same question. Both are tested on the same descriptions.
//
// Pure, so every rule is tested without a server.

import { normaliseUnit } from "./rateSearch.js";

const low = (v) => String(v ?? "").trim().toLowerCase();

/** The item a description names, with the level removed and the type kept. */
export function lineKey(description) {
  return low(description)
    .replace(/\[([^\]]*)\]/g, (_, inner) => {
      const kept = String(inner)
        .split("|")
        .map((part) => part.trim())
        .filter((part) => part && !/^l(evel)?\s*:/i.test(part));
      return kept.length ? ` [${kept.join(" | ")}]` : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** "L:02 GROUND FLOOR" out of a QUIV description, or "" when it names none. */
export function levelOf(description) {
  const m = String(description ?? "").match(/\[([^\]]*)\]/);
  if (!m) return "";
  const part = m[1]
    .split("|")
    .map((p) => p.trim())
    .find((p) => /^l(evel)?\s*:/i.test(p));
  return part ? part.replace(/^l(evel)?\s*:\s*/i, "").trim() : "";
}

const isPriced = (it) => Number(it?.rate) > 0;

/**
 * The other lines that are the same item as `item`, in bill order, each with
 * its index so the screen can open it.
 *
 * @returns {Array<{index:number, code:string, level:string, qty:number, unit:string}>}
 */
export function similarLines(items, item, { unpricedOnly = true } = {}) {
  const key = lineKey(item?.description);
  const unit = normaliseUnit(item?.unit);
  const code = low(item?.code);
  if (!key || !unit) return [];
  const out = [];
  (Array.isArray(items) ? items : []).forEach((other, index) => {
    const c = low(other?.code);
    if (!c || c === code) return;
    if (unpricedOnly && isPriced(other)) return;
    if (normaliseUnit(other?.unit) !== unit) return;
    if (lineKey(other?.description) !== key) return;
    out.push({
      index,
      code: String(other.code).trim(),
      level: levelOf(other.description),
      qty: Number(other?.qty) || 0,
      unit: String(other?.unit || "").trim(),
    });
  });
  return out;
}

/**
 * What a price-many call said, as one sentence for the panel.
 * "Priced 12 lines. 2 were skipped." with the reasons listed separately.
 */
export function pricedSentence(result) {
  const priced = Array.isArray(result?._priced) ? result._priced.length : 0;
  const skipped = Array.isArray(result?._skipped) ? result._skipped.length : 0;
  const lines = (n) => `${n} ${n === 1 ? "line" : "lines"}`;
  if (!priced && !skipped) return "";
  if (!priced) return `No lines were priced. ${lines(skipped)} skipped.`;
  return skipped
    ? `Priced ${lines(priced)}. ${lines(skipped)} skipped.`
    : `Priced ${lines(priced)}.`;
}
