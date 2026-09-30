// Which of the QS's own rates would price this bill line.
//
// WHY THIS IS NOT "INVENTING A FIGURE"
//
// The new build's rate list has said "No suggestion — price it from the
// build-up" since it was written, and the reasoning was sound: nothing in a
// project suggests a rate, and putting a number in a QS's mouth on a bill is
// not a small liberty.
//
// But there IS a real source, and it was simply never asked. RateGen holds the
// master rates plus this user's own overrides and custom rates, and
// priceLineFromRate already resolves a pick against exactly that merged set.
// Offering a rate the QS built themselves, for work whose description matches,
// in the same unit, is not inventing anything — it is finding what they
// already decided.
//
// THE UNIT IS A HARD GATE, NOT A TIE-BREAK
//
// A rate per cubic metre cannot price a line measured in square metres, however
// well the words match. Offering one would produce a number that is wrong by a
// factor of the thickness, and it would look right. So a unit mismatch is
// excluded outright rather than ranked lower.
//
// Pure, so every rule is tested without a database.

import { similarityScore } from "./fuzzyMatch.js";

const str = (v) => String(v || "").trim();
const low = (v) => str(v).toLowerCase();

/** Units a QS writes the same measurement in. */
const UNIT_ALIASES = new Map(
  Object.entries({
    m2: "m2", "m²": "m2", sqm: "m2", "sq m": "m2", "square metre": "m2", "square meter": "m2",
    m3: "m3", "m³": "m3", cum: "m3", "cu m": "m3", "cubic metre": "m3", "cubic meter": "m3",
    m: "m", lm: "m", "lin m": "m", "linear metre": "m", rm: "m",
    nr: "nr", no: "nr", "no.": "nr", each: "nr", ea: "nr", item: "nr", unit: "nr",
    kg: "kg", t: "t", tonne: "t", tons: "t", ton: "t",
  }),
);

/** The same measurement written any of the ways a QS writes it. */
export function normaliseUnit(unit) {
  const u = low(unit).replace(/\s+/g, " ").replace(/\.$/, "");
  return UNIT_ALIASES.get(u) || u;
}

/** Do these two units measure the same thing? */
export const unitsAgree = (a, b) => {
  const x = normaliseUnit(a);
  const y = normaliseUnit(b);
  if (!x || !y) return false;
  return x === y;
};

/** The words worth matching on: the description, minus the noise. */
export function billLineText(item) {
  return [item?.description, item?.takeoffLine, item?.materialName, item?.type]
    .map(str)
    .filter(Boolean)
    .join(" ");
}

/**
 * The rates that could price this line, best first.
 *
 * @param {object} item                 the bill line
 * @param {Array} rates                 the merged rate set (master + the user's own)
 * @param {object} [opts]
 * @param {number} [opts.limit]         how many to return
 * @param {number} [opts.minScore]      below this, a match is a coincidence
 * @returns {Array<{rateId, description, unit, unitPrice, score, why}>}
 */
export function suggestRatesForLine(item, rates, { limit = 5, minScore = 0.45 } = {}) {
  const text = billLineText(item);
  const unit = str(item?.unit);
  if (!text || !unit) return [];

  const out = [];
  for (const r of Array.isArray(rates) ? rates : []) {
    const desc = str(r?.description);
    if (!desc) continue;

    // A unit mismatch is not a weaker match, it is a wrong answer.
    if (!unitsAgree(unit, r?.unit)) continue;

    const price = Number(r?.unitPrice ?? r?.totalCost ?? 0);
    // A rate with no money in it prices nothing.
    if (!Number.isFinite(price) || price <= 0) continue;

    const score = similarityScore(text, desc);
    if (score < minScore) continue;

    out.push({
      rateId: str(r?.rateId || r?.id || r?._id),
      description: desc,
      unit: str(r?.unit),
      unitPrice: price,
      score: Math.round(score * 100) / 100,
      // The QS's own rate outranks a master one at the same score: they built
      // it, for their own prices, and it is the answer they already gave.
      own: Boolean(r?.isCustom || r?.custom || r?.userOwned),
      why: describeMatch(score, Boolean(r?.isCustom || r?.custom || r?.userOwned)),
    });
  }

  out.sort((a, b) => b.score - a.score || Number(b.own) - Number(a.own));
  return out.slice(0, Math.max(1, Math.min(20, limit)));
}

/** A sentence the screen prints beside the figure, so a pick is never blind. */
function describeMatch(score, own) {
  const where = own ? "your own rate" : "the ADLM library";
  if (score >= 0.85) return `Close match in ${where}`;
  if (score >= 0.65) return `Likely match in ${where}`;
  return `Possible match in ${where} — check it before applying`;
}

/**
 * Is a suggestion strong enough to put in front of somebody?
 *
 * Deliberately separate from the score: this is the editorial decision, and it
 * belongs in one place rather than in every screen that shows a list.
 */
export const worthOffering = (s) => Boolean(s) && s.score >= 0.45 && s.unitPrice > 0;
