// Moving a whole category of prices at once.
//
// A QS does not correct cement, then sand, then granite, then blocks, one row
// at a time, when the market moves; they say "everything in Concrete is up
// eight per cent". The single-row route (PUT /rategen/price-overrides) could
// do it in N calls, but N calls is N chances to stop half way, and there is no
// screen anywhere that would show a half-applied correction.
//
// WHAT THIS DOES AND DOES NOT TOUCH
//
// It writes the CUSTOMER's own prices — RateGenLibrary.priceOverrides, scoped
// to the state on their profile. It does not and must not touch the master
// catalogue. Master material, labour and rate prices are corrected in Rate Gen
// desktop and published from there; the website's master routes answer 405
// MASTER_READ_ONLY, and that stays.
//
// AND WHAT IT HONESTLY CANNOT DO
//
// It does not re-price existing rates. A RateGenRate stores netCost and a
// breakdown as a snapshot taken when the rate was built, so raising the price
// of cement does not move any rate that contains cement until something
// recomputes that rate from its components. The prototype's copy said "every
// rate using them follows". Ours must not, and the screen says so instead.

/**
 * A number, tolerant of "12,500". A blank is absent rather than zero, so it
 * takes the fallback: a missing percentage must not read as "change by 0%"
 * when the caller asked for a default.
 */
export function toNum(v, fallback = 0) {
  if (v === null || v === undefined || String(v).trim() === "") return fallback;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** The key an override is matched on: name AND unit, never name alone. */
export function priceKey(name, unit) {
  return `${String(name ?? "").trim().toLowerCase()}|${String(unit ?? "").trim().toLowerCase()}`;
}

/**
 * The price this user actually pays for a row today: their own override for
 * the state they work in, else a location-free override of theirs, else the
 * published figure. Same precedence as applyPriceOverrides in routes/rategen.js
 * — a percentage has to be applied to the figure the user is looking at, not
 * to a master price their own correction already replaced.
 */
export function effectivePrice(row, overrides, kind, stateKey) {
  const key = priceKey(row.description ?? row.name, row.unit);
  let best = null;
  let bestRank = 0;
  for (const o of overrides || []) {
    if (o.kind !== kind) continue;
    if (priceKey(o.name, o.unit) !== key) continue;
    const rank = o.state && o.state === stateKey ? 2 : !o.state ? 1 : 0;
    if (rank === 0) continue; // belongs to another state entirely
    if (rank > bestRank) {
      bestRank = rank;
      best = o;
    }
  }
  return best ? toNum(best.price) : toNum(row.price);
}

export const MAX_BULK_ROWS = 1000;

/**
 * Work out the whole change before writing any of it.
 *
 * Pure on purpose: the arithmetic and the row selection are the part that can
 * be wrong, and they are testable without a database. Returns the complete new
 * priceOverrides array, so the caller does one assignment and one save.
 *
 *  - `percent` may be negative (a reduction). Zero changes nothing.
 *  - prices round to the kobo. They used to round to whole naira, which reads
 *    as tidy until it meets a customer's own price: someone who had corrected
 *    a row to 9,500.50 by hand lost the 50k the first time they moved the
 *    category. The single-row route stores whatever they type, so a bulk move
 *    has no business being coarser than the figure it starts from.
 *  - a price never goes below zero.
 *  - `category` null or "all" means every row of that kind.
 */
export function planBulkPriceChange({
  rows = [],
  overrides = [],
  kind,
  category = null,
  percent = 0,
  stateKey = null,
  limit = MAX_BULK_ROWS,
} = {}) {
  const pc = toNum(percent);
  const wantAll = !category || String(category).toLowerCase() === "all";
  const wanted = String(category ?? "").trim().toLowerCase();

  const matching = rows.filter((r) => {
    if (wantAll) return true;
    return String(r.category ?? "").trim().toLowerCase() === wanted;
  });

  if (!pc || !matching.length) {
    return { changed: 0, matched: matching.length, capped: false, overrides };
  }

  const capped = matching.length > limit;
  const take = capped ? matching.slice(0, limit) : matching;

  // Everything this user already has for this kind and this state is replaced
  // row by row; overrides for another kind, or another state, are untouched.
  const written = new Map();
  let changed = 0;

  for (const row of take) {
    const name = String(row.description ?? row.name ?? "").trim();
    if (!name) continue;
    const unit = String(row.unit ?? "").trim();
    const before = effectivePrice(row, overrides, kind, stateKey);
    const after = Math.max(0, Math.round(before * (1 + pc / 100) * 100) / 100);
    // A row whose price does not actually move is not a change. Writing it
    // would still create an override, which quietly freezes that row against
    // future published corrections for no gain.
    if (after === before) continue;
    written.set(priceKey(name, unit), {
      kind,
      name,
      unit,
      price: after,
      state: stateKey ?? null,
      note: "",
      updatedAt: new Date(),
    });
    changed++;
  }

  const kept = (overrides || []).filter((o) => {
    if (o.kind !== kind) return true;
    if ((o.state || null) !== (stateKey ?? null)) return true;
    return !written.has(priceKey(o.name, o.unit));
  });

  return {
    changed,
    matched: matching.length,
    capped,
    overrides: [...kept, ...written.values()],
  };
}
