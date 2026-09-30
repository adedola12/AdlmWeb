// The actual quantities and rates on a bill, after the contract is locked.
//
// WHAT THESE COLUMNS ARE FOR
//
// Before a lock there is one quantity per line and it is the estimate. Locking
// freezes it: the contract quantity and rate stop moving, and a re-measure is
// recorded BESIDE them as the actual. That is what makes a variation due to
// measured work visible — the contract said 120 m³, the site measured 134 m³, and
// the difference is money somebody has to agree. Overwriting the contract
// quantity instead would make the variation disappear and the contract sum drift
// with no record of why.
//
// New scope is the other kind of variation and does NOT live here: it is its own
// row in `variations`, because it is work nobody measured against the contract.
//
// WHY THEY HIDE
//
// Eight columns on a bill is a lot to read, and before a lock the actuals are
// all empty, so the default is off. The switch is saved on the project
// (valuationSettings.showActualColumns) rather than in the browser, because two
// people looking at the same locked contract should be looking at the same
// columns.
//
// A NULL IS NOT A ZERO
//
// `actualQty` is null until somebody measures. A null means "not measured yet"
// and the line stands at its contract figure; a zero means "measured, and there
// is none of it", which is a variation of the whole line. Treating the two the
// same would turn every unmeasured line into a full omission.
//
// Pure, so every rule is tested without a project or a server.

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** A number somebody entered, or null when they have not. */
export function optional(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Are the actual columns switched on for this project? */
export const showActuals = (project) =>
  Boolean(project?.valuationSettings?.showActualColumns);

/** Is this project locked, i.e. are actuals meaningful at all? */
export const isLocked = (project) => Boolean(project?.contract?.locked);

/** What was measured on site, or null when nobody has. */
export const actualQtyOf = (item) => optional(item?.actualQty);

/**
 * The rate the work was actually done at.
 *
 * Falls back to the contract rate, because a re-measure usually changes the
 * quantity and not the price — and a null here would make the amount unreadable
 * for every line whose quantity moved.
 */
export const actualRateOf = (item) => {
  const own = optional(item?.actualRate);
  return own === null ? optional(item?.rate) : own;
};

/** The contract amount: what was agreed. */
export const contractAmountOf = (item) => n(item?.qty) * n(item?.rate);

/**
 * The actual amount, or null when nothing has been measured.
 *
 * Null rather than the contract amount, so a screen can show "not measured"
 * instead of repeating a figure as though it had been confirmed.
 */
export function actualAmountOf(item) {
  const q = actualQtyOf(item);
  if (q === null) return null;
  return q * n(actualRateOf(item));
}

/**
 * What the re-measure is worth, against the contract.
 *
 * Positive is more than was agreed. Null when the line has not been measured —
 * which is NOT zero: zero variance is a line measured and found to agree, and
 * that is a different statement.
 */
export function varianceOf(item) {
  const actual = actualAmountOf(item);
  if (actual === null) return null;
  return actual - contractAmountOf(item);
}

/** Has anybody measured anything yet? Decides whether a total means anything. */
export const anyMeasured = (items) =>
  (Array.isArray(items) ? items : []).some((it) => actualQtyOf(it) !== null);

/**
 * The bill's contract total, actual total and the variation between them.
 *
 * An UNMEASURED line counts at its contract amount in the actual total. That is
 * the honest reading: the line stands as agreed until somebody says otherwise,
 * and excluding it would make the actual total shrink every time the contract
 * grew. `measured` says how much of the bill the figure actually rests on, so a
 * screen can say so rather than presenting a mostly-assumed total as a fact.
 */
export function actualTotals(items) {
  const list = Array.isArray(items) ? items : [];
  let contract = 0;
  let actual = 0;
  let measured = 0;

  for (const it of list) {
    const c = contractAmountOf(it);
    contract += c;
    const a = actualAmountOf(it);
    if (a === null) {
      actual += c;
    } else {
      actual += a;
      measured += 1;
    }
  }

  return {
    contract,
    actual,
    variance: actual - contract,
    measured,
    lines: list.length,
    // Nothing measured means the two totals are the same number twice, which is
    // worth saying out loud rather than showing a variance of zero.
    anyMeasured: measured > 0,
  };
}

/**
 * The patch that turns the columns on or off.
 *
 * valuationSettings and NOT the project root: that is where the flag lives, and
 * the classic bill reads it from there. The PUT's normaliser falls back per
 * field to what is stored, so sending this one key keeps showDailyLog,
 * showValuationSettings and the basis exactly as they are.
 */
export function withActualColumns(project, on) {
  if (!project) return null;
  return {
    valuationSettings: {
      ...(project.valuationSettings || {}),
      showActualColumns: Boolean(on),
    },
  };
}

/**
 * The patch that records a measured quantity on one line.
 *
 * Sends `items` WHOLE, row for row, because the PUT replaces the array it is
 * given — a row rebuilt from a field list loses everything not listed. An empty
 * value clears the measurement back to null rather than writing 0.
 */
export function withActualQty(project, index, value) {
  const items = Array.isArray(project?.items) ? project.items : [];
  if (index < 0 || index >= items.length) return null;
  const qty = optional(value);
  // Negative measured work is not a thing; a reduction is a smaller quantity.
  if (qty !== null && qty < 0) return null;
  return {
    items: items.map((it, i) => (i === index ? { ...it, actualQty: qty } : it)),
  };
}

/** The same, for a rate that was actually paid. */
export function withActualRate(project, index, value) {
  const items = Array.isArray(project?.items) ? project.items : [];
  if (index < 0 || index >= items.length) return null;
  const rate = optional(value);
  if (rate !== null && rate < 0) return null;
  return {
    items: items.map((it, i) => (i === index ? { ...it, actualRate: rate } : it)),
  };
}
