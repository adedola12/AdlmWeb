// Term pricing for the product page's 1 / 6 / 12-month selector.
//
// IMPORTANT: this mirrors the `recurring` branch of `lineCalc` in
// pages/Purchase.jsx (NGN, one seat). It is deliberately a separate, smaller
// function rather than a shared refactor of checkout — rewriting the money path
// during a visual redesign is not a trade worth making — but that means the two
// can drift. If the tiers change in Purchase.jsx, change them here too, or the
// page advertises a price the checkout does not honour.
//
// The tiers, from Purchase.jsx:
//   < 6 months   monthly x months
//   = 6 months   sixMonth price when set, else monthly x 6
//   = 12 months  yearly price when set, else monthly x 12
// Yearly-billed products bill yearly x periods instead.

const num = (v) => Number(v) || 0;

/** Price actually charged: the discounted figure when one is set and lower. */
function effective(base, discounted) {
  const b = num(base);
  const d = num(discounted);
  return d > 0 && d < b ? d : b;
}

export function unitPrices(p, currency = "NGN") {
  const pr = p?.price || {};
  // The catalogue carries a full USD column beside the naira one. Reading only
  // the naira fields meant a checkout placed in dollars showed naira figures
  // beside a dollar total — the panel said ₦1,710,000 while the invoice
  // charged $1,455.77, for the same order.
  if (String(currency).toUpperCase() === "USD") {
    return {
      monthly: effective(pr.monthlyUSD, pr.discountedMonthlyUSD),
      sixMonth: effective(pr.sixMonthUSD, pr.discountedSixMonthUSD),
      yearly: effective(pr.yearlyUSD, pr.discountedYearlyUSD),
      install: num(pr.installUSD),
      listMonthly: num(pr.monthlyUSD),
      listYearly: num(pr.yearlyUSD),
    };
  }
  return {
    monthly: effective(pr.monthlyNGN, pr.discountedMonthlyNGN),
    sixMonth: effective(pr.sixMonthNGN, pr.discountedSixMonthNGN),
    yearly: effective(pr.yearlyNGN, pr.discountedYearlyNGN),
    install: num(pr.installNGN),
    listMonthly: num(pr.monthlyNGN),
    listYearly: num(pr.yearlyNGN),
  };
}

/**
 * Total recurring charge for `months` of `p`, one seat, in `currency`.
 *
 * The tiering is the server's: computeRecurring in util, and the same ladder
 * the purchase page walks. Only the price column changes.
 */
export function termTotal(p, months, currency = "NGN") {
  const u = unitPrices(p, currency);
  const m = Math.max(1, parseInt(months, 10) || 1);

  if (p?.billingInterval === "yearly") return u.yearly * m;
  if (m < 6) return u.monthly * m;
  if (m === 6) return u.sixMonth > 0 ? u.sixMonth : u.monthly * 6;
  if (m < 12) {
    const six = u.sixMonth > 0 ? u.sixMonth : u.monthly * 6;
    return six + u.monthly * (m - 6);
  }
  if (m === 12) return u.yearly > 0 ? u.yearly : u.monthly * 12;
  const year = u.yearly > 0 ? u.yearly : u.monthly * 12;
  return year + u.monthly * (m - 12);
}

/** Naira, the common case. Kept so existing callers need no edit. */
export function termTotalNGN(p, months) {
  return termTotal(p, months, "NGN");
}

/**
 * The selectable terms for a product, each with what it costs, what it works
 * out to per month, and what it saves against paying monthly.
 *
 * Only returns a term when it genuinely costs less per month than the one
 * before it — an option badged "save 0%" invites the visitor to work out that
 * the longer commitment buys them nothing.
 */
export function termOptions(p) {
  const u = unitPrices(p);
  if (p?.billingInterval === "yearly") {
    return [{ months: 12, label: "1 year", total: u.yearly, perMonth: u.yearly / 12, savePct: 0 }];
  }
  if (!(u.monthly > 0)) return [];

  const out = [{ months: 1, label: "1 month", total: u.monthly, perMonth: u.monthly, savePct: 0 }];
  for (const months of [6, 12]) {
    const total = termTotalNGN(p, months);
    if (!(total > 0)) continue;
    const straight = u.monthly * months;
    const savePct = straight > 0 ? Math.round(((straight - total) / straight) * 100) : 0;
    if (savePct <= 0) continue;
    out.push({
      months,
      label: months === 12 ? "1 year" : `${months} months`,
      total,
      perMonth: total / months,
      savePct,
    });
  }
  return out;
}
