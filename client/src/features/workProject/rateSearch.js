// Finding a rate by name, to price a bill line with.
//
// WHY THIS EXISTS BESIDE THE SUGGESTIONS
//
// The suggestions answer "what would price this line?" and they are scored
// matches on the line's own description. They are useful and they are not
// enough:
//
//   - They need GET .../rate-suggestions, which is not on every server yet. Where
//     it is missing a QS has no way to price a line at all, which is the state
//     the Rates tab was in before any of this: a read-only list and a side panel
//     that pointed back at it.
//   - A QS often knows the rate they want BY NAME. "Blockwork 225" is faster to
//     type than it is to find among five scored guesses, and it is the way they
//     talk about their own library.
//
// Both ends of this are already deployed everywhere: the merged library
// (GET /rategen-v2/library/user-rates/merged) and the apply endpoint
// (POST .../bill/:code/price-from-rate), which writes the material, labour and
// plant rows as it goes. So searching by name works on any server, and that is
// the point.
//
// THE UNIT IS STILL A HARD GATE
//
// A rate per cubic metre cannot price a line measured in square metres, however
// certain the QS is about the name — the result would be wrong by a factor of
// the thickness and would look entirely reasonable on the bill. So a rate in
// another unit is SHOWN, with its unit, and cannot be applied. Hiding it would
// leave somebody hunting for a rate they can see in RateGen; offering it would
// let them price a line wrongly in one click.
//
// Pure, so every rule is tested without a server.

/** Units agree when they normalise to the same thing. Mirrors the server's own
 *  table (server/util/rateSuggestions.js), including the spellings bills really
 *  use: "Nos.", "Sq.m", "Cu.m", "Lin.m", "pcs", "tonnes". */
const UNIT_ALIASES = new Map(
  Object.entries({
    m2: "m2", "m²": "m2", sqm: "m2", "sq m": "m2", "square metre": "m2", "square meter": "m2",
    m3: "m3", "m³": "m3", cum: "m3", "cu m": "m3", "cubic metre": "m3", "cubic meter": "m3",
    m: "m", lm: "m", "lin m": "m", "linear metre": "m", "lineal metre": "m", rm: "m",
    nr: "nr", no: "nr", each: "nr", ea: "nr", item: "nr", unit: "nr", pc: "nr", piece: "nr",
    kg: "kg", t: "t", tonne: "t", ton: "t",
    l: "l", litre: "l", liter: "l",
    pack: "pack", packet: "pack", bag: "bag", roll: "roll", set: "set", sum: "sum",
  }),
);
const SQUASHED = new Map(
  [...UNIT_ALIASES.entries()].map(([k, v]) => [k.replace(/\s+/g, ""), v]),
);

const low = (v) => String(v ?? "").trim().toLowerCase();

export function normaliseUnit(unit) {
  const u = low(unit).replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!u) return "";
  const look = (key) =>
    key ? UNIT_ALIASES.get(key) || SQUASHED.get(key.replace(/\s+/g, "")) || "" : "";
  return look(u) || (u.endsWith("s") ? look(u.slice(0, -1)) : "") || u;
}

/** Do these two units measure the same thing? */
export function unitsAgree(a, b) {
  const x = normaliseUnit(a);
  const y = normaliseUnit(b);
  if (!x || !y) return false;
  return x === y;
}

/**
 * What a rate is worth, per its own unit.
 *
 * The merged library has NO `unitPrice`: toUserRateDefinition emits `totalCost`
 * (net plus overhead and profit) and `netCost`. Reading unitPrice alone would
 * price every rate at zero and offer none of them.
 */
export const rateAmount = (r) => {
  const n = Number(r?.unitPrice ?? r?.totalCost ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Is this the QS's own rate rather than one ADLM published? */
export const isOwnRate = (r) =>
  String(r?.source || "").startsWith("user") ||
  Boolean(r?.isCustom || r?.custom || r?.userOwned || r?.customRateId);

/** The id the apply endpoint resolves a pick by. */
export const rateIdOf = (r) => String(r?.rateId || r?.id || r?.customRateId || r?._id || "");

/** The rate's own name — what a QS is usually typing. */
const nameOf = (r) => [r?.description, r?.title].map(low).filter(Boolean).join(" ");

/**
 * Everything a search looks at.
 *
 * The section and code are included because a QS searching "block" reasonably
 * expects the Blockwork section — but a match in the NAME outranks one that is
 * only in the section. Against the real library, searching "block" finds 12
 * rates whose description says so and 18 more that merely sit in a section
 * called Blockwork ("Mortar Mix (1:3)"), and the blockwall rates are the answer.
 */
const haystack = (r) =>
  [r?.description, r?.title, r?.code, r?.sectionLabel].map(low).filter(Boolean).join(" ");

/**
 * The rates matching what somebody typed, best first.
 *
 * Ranking, in order:
 *   1. every typed word present (a phrase match beats a scattered one)
 *   2. a match at the START of the description — "block" should find
 *      "Blockwork 225mm" before "Hollow clay block infill"
 *   3. the QS's OWN rate over a master one, because they built it for their
 *      own prices and it is the answer they already gave
 *   4. shorter descriptions, which are the more general rate
 *
 * A rate whose unit cannot price this line is still returned, flagged
 * `canApply: false` with the reason — see the note at the top.
 *
 * @param {Array}  items        the merged library
 * @param {string} query        what was typed
 * @param {object} [opts]
 * @param {string} [opts.unit]  the bill line's unit; omit to skip the gate
 * @param {number} [opts.limit]
 */
export function searchRates(items, query, { unit = "", limit = 8 } = {}) {
  const q = low(query);
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const out = [];
  for (const r of Array.isArray(items) ? items : []) {
    const desc = String(r?.description || r?.title || "").trim();
    if (!desc) continue;
    const amount = rateAmount(r);
    // A rate with no money in it prices nothing, so it is not an answer.
    if (!amount) continue;

    const hay = haystack(r);
    if (!words.every((w) => hay.includes(w))) continue;

    const own = isOwnRate(r);
    const rateUnit = String(r?.unit || "").trim();
    const agrees = !unit || unitsAgree(unit, rateUnit);
    const name = nameOf(r);
    out.push({
      rateId: rateIdOf(r),
      description: desc,
      unit: rateUnit,
      amount,
      own,
      canApply: agrees,
      // Said on the row, so a rate that cannot be used explains itself rather
      // than looking broken or missing. A rate with NO unit is its own case:
      // "Measured in  — this line is m2" reads as a bug.
      why: agrees
        ? own
          ? "Your own rate"
          : "ADLM library"
        : rateUnit
          ? `Measured in ${rateUnit} — this line is ${unit}`
          : `No unit set on this rate — this line is ${unit}`,
      // Ranking only; not shown.
      _inName: words.every((w) => name.includes(w)) ? 1 : 0,
      _starts: name.startsWith(words[0]) ? 1 : 0,
      _len: desc.length,
    });
  }

  out.sort(
    (a, b) =>
      // A rate that can actually be applied always comes before one that cannot.
      Number(b.canApply) - Number(a.canApply) ||
      // A rate whose NAME says it beats one that merely sits in a section of
      // that name.
      b._inName - a._inName ||
      b._starts - a._starts ||
      Number(b.own) - Number(a.own) ||
      a._len - b._len ||
      a.description.localeCompare(b.description),
  );

  // Rebuilt rather than destructured, so the ranking fields do not leak into
  // what a screen renders.
  return out
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((r) => ({
      rateId: r.rateId,
      description: r.description,
      unit: r.unit,
      amount: r.amount,
      own: r.own,
      canApply: r.canApply,
      why: r.why,
    }));
}

/**
 * How many of a search's results could actually be applied.
 *
 * So a screen can say "4 rates match, none of them in m2" instead of listing
 * four things none of which do anything.
 */
export const applicableCount = (results) =>
  (Array.isArray(results) ? results : []).filter((r) => r.canApply).length;
