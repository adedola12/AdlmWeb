// Overhead and profit defaults, set per trade.
//
// Until this existed the defaults were fixed in code, one pair for every
// trade: 10% overhead / 25% profit on a master rate, 10% / 10% on a
// customer's own rate. Real markups differ by trade (specialist MEP is not
// marked up like blockwork), so a QS re-typed the pair on rate after rate.
//
// THE ONE RULE: a default fills a percentage that is MISSING. It never
// rewrites one that is set. A figure the payload carries wins; on an update,
// the figure the stored rate already holds wins next; only then does a trade
// default apply, and only then the built-in pair. So:
//
//   - nothing is migrated, and no stored rate changes because a default did;
//   - with no trade defaults set, every figure is exactly what it was before
//     (the built-in pairs below are the old hard-coded ones);
//   - the desktop plugins read overheadPercent / profitPercent off each rate
//     as they always have, so no plugin field changes.
//
// Two scopes, kept apart on purpose. The 10/25 master versus 10/10 custom
// split was the owner's decision ("Our RateGen defaults stay"): ADLM's master
// trade table applies to master rates, and a customer's own table applies to
// the rates that customer writes. A customer who has set nothing still gets
// 10/10 on a custom rate, exactly as before.
//
// Pure: no Mongo in here, so the resolution can be tested with figures.

export const BUILTIN_MARGINS = Object.freeze({
  master: Object.freeze({ overheadPercent: 10, profitPercent: 25 }),
  custom: Object.freeze({ overheadPercent: 10, profitPercent: 10 }),
  // A customer's edited copy of a master rate starts from the master pair.
  override: Object.freeze({ overheadPercent: 10, profitPercent: 25 }),
});

// Where a percentage came from, so a screen can say it.
export const MARGIN_SOURCE = Object.freeze({
  RATE: "rate", // on the payload / set on this rate
  STORED: "stored", // kept from the rate already held
  YOUR_TRADE: "your-trade", // the customer's own trade default
  ADLM_TRADE: "adlm-trade", // ADLM's master trade default
  DEFAULT: "default", // the built-in pair
});

/** A percentage that was actually given, or null. Blank, text and negatives are not. */
export function givenPercent(v) {
  if (v === undefined || v === null) return null;
  const raw = String(v).replace(/,/g, "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** What is wrong with a percentage someone is trying to SAVE as a default, or null. */
export function marginProblem(label, v) {
  if (v === undefined || v === null || String(v).trim() === "") return null; // blank = "no default"
  const n = Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return `${label} has to be a number`;
  if (n < 0) return `${label} cannot be less than 0%`;
  return null;
}

export function normalizeTradeKey(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "painting") return "paint";
  return s;
}

/**
 * A table of trade defaults as a Map: sectionKey → { overheadPercent, profitPercent }.
 * Either figure may be null, meaning "no default for this half".
 */
export function marginMap(rows) {
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = normalizeTradeKey(r?.sectionKey);
    if (!key) continue;
    const oh = givenPercent(r?.overheadPercent);
    const pr = givenPercent(r?.profitPercent);
    if (oh === null && pr === null) continue;
    map.set(key, { overheadPercent: oh, profitPercent: pr });
  }
  return map;
}

/**
 * Resolve the two percentages for one rate.
 *
 * Each half is resolved on its own: a customer may set a trade's profit and
 * leave its overhead to the default.
 *
 * @param {object} args
 * @param {"master"|"custom"|"override"} args.scope
 * @param {string} [args.sectionKey]
 * @param {object} [args.given]   the payload: { overheadPercent, profitPercent }
 * @param {object} [args.stored]  the rate already held, on an update
 * @param {Map|Array} [args.yourTrades]  the customer's trade table (custom / override scope)
 * @param {Map|Array} [args.adlmTrades]  ADLM's master trade table (master scope)
 * @returns {{ overheadPercent:number, profitPercent:number,
 *             overheadSource:string, profitSource:string }}
 */
export function resolveMargins({
  scope = "custom",
  sectionKey = "",
  given = {},
  stored = null,
  yourTrades = null,
  adlmTrades = null,
} = {}) {
  const builtin = BUILTIN_MARGINS[scope] || BUILTIN_MARGINS.custom;
  const key = normalizeTradeKey(sectionKey);
  const asMap = (t) => (t instanceof Map ? t : marginMap(t));
  const trade =
    scope === "master"
      ? { row: key ? asMap(adlmTrades).get(key) : null, source: MARGIN_SOURCE.ADLM_TRADE }
      : { row: key ? asMap(yourTrades).get(key) : null, source: MARGIN_SOURCE.YOUR_TRADE };

  const one = (field) => {
    const fromGiven = givenPercent(given?.[field]);
    if (fromGiven !== null) return [fromGiven, MARGIN_SOURCE.RATE];
    const fromStored = stored ? givenPercent(stored[field]) : null;
    if (fromStored !== null) return [fromStored, MARGIN_SOURCE.STORED];
    const fromTrade = trade.row ? trade.row[field] : null;
    if (fromTrade !== null && fromTrade !== undefined) return [fromTrade, trade.source];
    return [builtin[field], MARGIN_SOURCE.DEFAULT];
  };

  const [overheadPercent, overheadSource] = one("overheadPercent");
  const [profitPercent, profitSource] = one("profitPercent");
  return { overheadPercent, profitPercent, overheadSource, profitSource };
}

/**
 * The defaults a NEW rate in this trade would get, for a screen to show as a
 * placeholder. Same resolution as resolveMargins with nothing given or stored.
 */
export function defaultsFor(scope, sectionKey, tables = {}) {
  return resolveMargins({ scope, sectionKey, ...tables });
}

/**
 * Validate and clean a trade table someone is saving. Returns { rows, problem }.
 * A row with both halves blank is dropped: that is how a trade is reset to the
 * ADLM / built-in default.
 */
export function cleanMarginRows(input, allowedKeys = null) {
  const rows = [];
  const seen = new Set();
  for (const r of Array.isArray(input) ? input : []) {
    const key = normalizeTradeKey(r?.sectionKey);
    if (!key) return { rows: [], problem: "Every row needs a trade" };
    if (allowedKeys && !allowedKeys.has(key)) {
      return { rows: [], problem: `'${key}' is not a trade` };
    }
    if (seen.has(key)) return { rows: [], problem: `'${key}' is listed twice` };
    seen.add(key);
    const problem =
      marginProblem("Overhead", r?.overheadPercent) || marginProblem("Profit", r?.profitPercent);
    if (problem) return { rows: [], problem: `${key}: ${problem}` };
    const oh = givenPercent(r?.overheadPercent);
    const pr = givenPercent(r?.profitPercent);
    if (oh === null && pr === null) continue;
    rows.push({ sectionKey: key, overheadPercent: oh, profitPercent: pr });
  }
  return { rows, problem: null };
}
