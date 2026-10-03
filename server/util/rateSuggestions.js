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
    m: "m", lm: "m", "lin m": "m", "linear metre": "m", "lineal metre": "m", rm: "m",
    nr: "nr", no: "nr", each: "nr", ea: "nr", item: "nr", unit: "nr", pc: "nr", piece: "nr",
    kg: "kg", t: "t", tonne: "t", ton: "t",
    // Measured by volume of liquid, and by the packet. Neither has a master
    // rate today, but a QS who builds one must be able to match a bill that
    // spells it either way.
    l: "l", litre: "l", liter: "l",
    pack: "pack", packet: "pack", bag: "bag", roll: "roll", set: "set", sum: "sum",
  }),
);

/**
 * The same measurement written any of the ways a QS writes it.
 *
 * WHY THE PUNCTUATION AND THE PLURAL ARE STRIPPED FIRST
 *
 * A unit mismatch is a HARD exclusion here (see below), so a spelling this does
 * not recognise is not a weaker match — it is a rate that is never offered at
 * all. Real bills write "Nos.", "Sq.m", "Cu.m", "Lin.m", "L.M", "pcs" and
 * "tonnes"; an earlier version stripped only a TRAILING dot, so every one of
 * those normalised to itself and could never meet the library's "Nr", "m2",
 * "m3", "m" or "tonne". The QS saw "No suggestion" on a line they had a perfect
 * rate for, with nothing to say why.
 *
 * So: lower-case, drop every dot, collapse whitespace, then try the table; and
 * if that misses, try again without a trailing "s". "Sq.m" -> "sqm" -> m2.
 * "Nos." -> "nos" -> (plural) "no" -> nr. "tonnes" -> "tonne" -> t.
 */
const SQUASHED = new Map(
  [...UNIT_ALIASES.entries()].map(([k, v]) => [k.replace(/\s+/g, ""), v]),
);

export function normaliseUnit(unit) {
  const u = low(unit)
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!u) return "";

  const look = (key) => {
    if (!key) return "";
    // Spelt as the table has it, or with the spaces closed up: "lin m" and
    // "Lin.m" are the same unit, and a bill writes it both ways.
    const hit = UNIT_ALIASES.get(key) || SQUASHED.get(key.replace(/\s+/g, ""));
    return hit || "";
  };

  return (
    look(u) ||
    // "nos", "pcs", "tonnes", "items", "bags" — the plural of something known.
    (u.endsWith("s") ? look(u.slice(0, -1)) : "") ||
    u
  );
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
 * The same item, whichever level or type of it this line happens to be.
 *
 * A Revit bill repeats one item per level: "Blockwork - Lintel Concrete
 * [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]", then L:02, L:03... The level
 * says WHERE the work is, not WHAT it is, so it is dropped. The type ("T:...")
 * is kept: a 230mm wall and a 150mm wall are different rates per m2.
 *
 * Mirrored on the client (client/src/features/workProject/similarLines.js);
 * both are tested against the same descriptions.
 */
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

/**
 * What this QS has priced before, keyed by item and unit.
 *
 * Built from RateUsage records (one per line priced from a rate on the web).
 * Each entry is a rate they chose for that item, with how often and where,
 * so a suggestion can say "you used this on 3 projects" rather than just
 * "this looks similar".
 *
 * @param {Array} records  {key, unit, rateId, projectId, projectName, at}
 * @returns {Map<string, Array<{rateId, uses, projects, lastAt, lastProject}>>}
 *          keyed `${lineKey}|${normalisedUnit}`
 */
export function usageIndex(records) {
  const byKey = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    const key = str(r?.key);
    const unit = normaliseUnit(r?.unit);
    const rateId = str(r?.rateId);
    if (!key || !unit || !rateId) continue;
    const slot = `${key}|${unit}`;
    const list = byKey.get(slot) || [];
    let hit = list.find((u) => u.rateId === rateId);
    if (!hit) {
      hit = { rateId, uses: 0, projects: new Set(), lastAt: 0, lastProject: "" };
      list.push(hit);
    }
    hit.uses += 1;
    if (r?.projectId) hit.projects.add(String(r.projectId));
    const at = new Date(r?.at || 0).getTime() || 0;
    if (at >= hit.lastAt) {
      hit.lastAt = at;
      hit.lastProject = str(r?.projectName);
    }
    byKey.set(slot, list);
  }
  return byKey;
}

/** The rates this QS used before on this item, exactly or on a near-identical one. */
function usedBefore(item, usage) {
  if (!(usage instanceof Map) || !usage.size) return [];
  const key = lineKey(item?.description || billLineText(item));
  const unit = normaliseUnit(item?.unit);
  if (!key || !unit) return [];
  const exact = usage.get(`${key}|${unit}`);
  if (exact?.length) return exact.map((u) => ({ ...u, exact: true }));
  // Not the same words, but plainly the same item ("Lintel concrete 230mm"
  // against "Lintel concrete - 230mm"). Only in the same unit.
  const near = [];
  for (const [slot, list] of usage) {
    if (!slot.endsWith(`|${unit}`)) continue;
    const other = slot.slice(0, -(unit.length + 1));
    if (similarityScore(key, other) >= 0.8) near.push(...list.map((u) => ({ ...u, exact: false })));
  }
  return near;
}

/** "You used this on 3 lines across 2 projects, last on Sunrise Estate." */
function describeUse(u) {
  const projects = u.projects instanceof Set ? u.projects.size : Number(u.projects) || 0;
  const lines = `${u.uses} ${u.uses === 1 ? "line" : "lines"}`;
  const across = projects > 1 ? ` across ${projects} projects` : "";
  const last = u.lastProject ? `, last on ${u.lastProject}` : "";
  return u.exact
    ? `You used this on ${lines}${across}${last}`
    : `You used this on a similar item (${lines}${across})`;
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
export function suggestRatesForLine(
  item,
  rates,
  { limit = 5, minScore = 0.45, usage = null } = {},
) {
  const text = billLineText(item);
  const unit = str(item?.unit);
  if (!text || !unit) return [];

  // WHAT THEY CHOSE LAST TIME COMES FIRST.
  //
  // Word-matching alone missed the obvious: "Lintel Concrete" shares almost no
  // words with "Concrete (1:2:4) grade 20", so a QS who has priced lintels with
  // that rate on five projects was offered nothing and had to search again. A
  // rate they already chose for this item is the strongest evidence there is.
  // It is still re-read from today's library, so the price is today's.
  const used = new Map();
  for (const u of usedBefore(item, usage)) {
    const had = used.get(u.rateId);
    if (!had || (u.exact && !had.exact) || u.uses > had.uses) used.set(u.rateId, u);
  }

  const out = [];
  for (const r of Array.isArray(rates) ? rates : []) {
    const desc = str(r?.description);
    if (!desc) continue;

    // A unit mismatch is not a weaker match, it is a wrong answer.
    if (!unitsAgree(unit, r?.unit)) continue;

    const price = Number(r?.unitPrice ?? r?.totalCost ?? 0);
    // A rate with no money in it prices nothing.
    if (!Number.isFinite(price) || price <= 0) continue;

    const rateId = str(r?.rateId || r?.id || r?._id);
    const use = rateId ? used.get(rateId) : null;
    const words = similarityScore(text, desc);
    if (words < minScore && !use) continue;

    // Used before on this exact item outranks any word match; on a near one it
    // ranks with a likely match.
    const score = use
      ? Math.max(words, use.exact ? 0.9 + Math.min(use.uses, 9) / 100 : 0.7)
      : words;

    const own = isOwnRate(r);
    out.push({
      rateId,
      description: desc,
      unit: str(r?.unit),
      unitPrice: price,
      score: Math.round(score * 100) / 100,
      // The QS's own rate outranks a master one at the same score: they built
      // it, for their own prices, and it is the answer they already gave.
      own,
      usedBefore: use
        ? { uses: use.uses, projects: use.projects?.size ?? 0, exact: use.exact }
        : null,
      why: use ? describeUse(use) : describeMatch(words, own),
    });
  }

  out.sort((a, b) => b.score - a.score || Number(b.own) - Number(a.own));
  return out.slice(0, Math.max(1, Math.min(20, limit)));
}

/**
 * Is this the QS's own rate, rather than one ADLM published?
 *
 * READ THE FIELD THE MERGE ACTUALLY EMITS
 *
 * mergeRatesWithUserData builds every rate through toUserRateDefinition
 * (util/rategenUserRates.js), which records ownership ONLY as
 *   source: "master" | "user-override" | "user-custom"
 * An earlier version of this file looked for `isCustom`, `custom` or
 * `userOwned` — none of which exist on that object; `isCustom` is a local
 * variable inside toUserRateDefinition, not a field on its result. So `own` was
 * false for every rate a real request could return, and a QS picking a rate
 * THEY had built was told "Close match in the ADLM library". The tie-break that
 * puts their own rate first was inert for the same reason.
 *
 * The other spellings are kept as a fallback so a caller passing a raw
 * RateGenLibrary.customRates row still reads correctly.
 */
export function isOwnRate(rate) {
  if (String(rate?.source || "").startsWith("user")) return true;
  return Boolean(rate?.isCustom || rate?.custom || rate?.userOwned || rate?.customRateId);
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

/** Does this line still need a rate? The same test the client's isPriced makes. */
export const needsRate = (item) => !(Number(item?.rate) > 0);

/**
 * The best rate for every line on a bill that has none, keyed by bill code.
 *
 * WHY ONE MAP AND NOT ONE REQUEST PER LINE
 *
 * The Rates tab lists every unpriced line at once. Asking per line would
 * re-read the whole rate library each time, and that read is the expensive
 * part; matching in memory over a library loaded once is both cheaper and the
 * only version that survives a bill with four hundred unpriced lines.
 *
 * THE KEY IS LOWERCASED, AND THAT IS A CONTRACT
 *
 * The endpoint that applies a pick matches a line case-insensitively on its
 * code, and the client looks a suggestion up the same way
 * (client/src/features/workProject/ratesModel.js, suggestionFor). If either
 * side stopped lowercasing, every line whose code carries a letter would show
 * "No suggestion" while a match existed — a silent miss, not an error. Both
 * sides are tested against it.
 *
 * A line with NO code is skipped: the apply endpoint addresses a line by its
 * code, so offering one a rate would build a button that always fails.
 *
 * @param {Array} items    the bill
 * @param {Array} rates    the merged rate set (master + the user's own)
 * @param {object} [opts]
 * @param {number} [opts.cap]  most lines to consider, so one huge bill cannot
 *                             hold a request open
 * @returns {{byCode: object, considered: number, unpriced: number, truncated: boolean}}
 */
export function suggestionMapForBill(items, rates, { cap = 600, usage = null } = {}) {
  const needing = (Array.isArray(items) ? items : []).filter(needsRate);
  const lines = needing.slice(0, Math.max(0, cap));

  const byCode = {};
  for (const item of lines) {
    const code = str(item?.code).toLowerCase();
    if (!code) continue;
    // First match wins, which matters when two lines share a code: they are the
    // same line to the apply endpoint too, so a second answer would be noise.
    if (byCode[code]) continue;
    const best = suggestRatesForLine(item, rates, { limit: 1, usage }).filter(worthOffering)[0];
    if (best) byCode[code] = best;
  }

  return {
    byCode,
    considered: lines.length,
    unpriced: needing.length,
    // Reported rather than silent: a screen showing suggestions for the first
    // 600 of 900 lines while saying nothing reads as "the rest have no match".
    truncated: needing.length > lines.length,
  };
}

/**
 * The other lines on this bill that are the same item as `item`: same key,
 * same unit, a code to address them by, and (by default) no rate yet.
 *
 * Pricing one of them is the QS's decision about all of them ("lintel concrete
 * is this rate"), so the panel offers the rest, ticked.
 */
export function similarLines(items, item, { unpricedOnly = true } = {}) {
  const key = lineKey(item?.description);
  const unit = normaliseUnit(item?.unit);
  const code = low(item?.code);
  if (!key || !unit) return [];
  return (Array.isArray(items) ? items : []).filter(
    (other) =>
      low(other?.code) &&
      low(other?.code) !== code &&
      (!unpricedOnly || needsRate(other)) &&
      normaliseUnit(other?.unit) === unit &&
      lineKey(other?.description) === key,
  );
}
