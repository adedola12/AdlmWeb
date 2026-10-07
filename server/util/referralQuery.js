// Turning the referrals screen's filter into a query.
//
// WHY THIS IS NOT INLINE IN THE ROUTE
//
// One rule here is the kind that fails silently: a value the filter does not
// recognise must list EVERYTHING, not nothing. Get it backwards — or treat an
// empty string as a filter for an empty string — and the screen shows an empty
// table while the referrals exist, which reads as "nobody has referred anybody"
// rather than as a bug. So it is a pure function with tests rather than three
// lines inside a handler nothing can call.
//
// The filter is the SERVER's, deliberately. The screen sends `converted` and
// reads back the totals; if the browser filtered its own copy instead, a list
// capped at 200 would disagree with a count taken over all of them.

const str = (v) => String(v ?? "").trim();

/** The values that mean "yes" and "no". Anything else means "do not filter". */
const YES = new Set(["1", "true", "yes"]);
const NO = new Set(["0", "false", "no"]);

/**
 * The Mongo filter for a referrals listing.
 *
 * @param {object} [query]            the request's query string, as given
 * @param {string} [query.converted]  "1" for the ones that paid, "0" for those
 *                                    that have not, absent for all of them
 * @param {string} [query.code]       one referral code
 * @param {string} [query.referrer]   one referrer's email
 * @returns {object} a filter for Referral.find
 */
export function referralListFilter(query = {}) {
  const where = {};

  const converted = str(query?.converted).toLowerCase();
  // Only a recognised value filters. An absent, empty or unknown one lists
  // everything, because a filter nobody asked for hides rows without saying so.
  if (YES.has(converted)) where.convertedAt = { $ne: null };
  else if (NO.has(converted)) where.convertedAt = null;

  // Codes are stored upper-cased (the model upper-cases them), emails lower.
  // Normalising here rather than trusting the caller is why a link pasted in
  // any case finds its own referrals.
  const code = str(query?.code).toUpperCase();
  if (code) where.code = code;

  const referrer = str(query?.referrer).toLowerCase();
  if (referrer) where.referrerEmail = referrer;

  return where;
}

/**
 * The counts a screen prints, out of one aggregate.
 *
 * Taken over ALL referrals, never the filtered page: a screen that said
 * "3 of 3 subscribed" because the Subscribed filter was on would be a lie, and
 * a plausible one.
 */
export function referralTotals(agg) {
  // The aggregate groups BY CURRENCY, so there is one row per currency and the
  // counts have to be folded across them.
  const rows = Array.isArray(agg) ? agg : agg ? [agg] : [];

  let total = 0;
  let converted = 0;
  const byCurrency = {};

  for (const r of rows) {
    total += Number(r?.total) || 0;
    converted += Number(r?.converted) || 0;
    const amount = Number(r?.revenue) || 0;
    if (!amount) continue;
    // _id is the currency the group was keyed on; a referral that never
    // converted has none, and contributes nothing to money either way.
    const cur = String(r?._id ?? r?.currency ?? "").trim().toUpperCase() || "NGN";
    byCurrency[cur] = (byCurrency[cur] || 0) + amount;
  }

  const currencies = Object.keys(byCurrency).sort();
  return {
    total,
    converted,
    // Never negative, however odd the aggregate.
    waiting: Math.max(0, total - converted),
    // Money PER CURRENCY. Adding ₦150,000 to $400 and printing "₦300,400"
    // understates the take by roughly ₦600,000 a sale while looking precise, so
    // there is no single `revenue` number to reach for by accident.
    byCurrency,
    currencies,
    // The base-currency figure, offered only when there is nothing to convert.
    // Null when takings are mixed, so a screen has to say so rather than print
    // a total that silently means two things.
    revenue: currencies.length <= 1 ? byCurrency[currencies[0]] || 0 : null,
    mixedCurrency: currencies.length > 1,
  };
}
