// server/util/pricing.js
// Authoritative product pricing shared by checkout (routes/purchase.js) and
// the auto-renewal cron (util/autoRenew.js). Extracted verbatim from
// routes/purchase.js so a renewal charge is computed by the exact same rules
// as a fresh checkout — never trust a stored historical price.

export const round2 = (x) =>
  Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;

export function toMoney(x, currency) {
  return currency === "USD" ? round2(x) : Math.round(Number(x || 0));
}

// Mirror of client/src/pages/Purchase.jsx getPrices() + resolve().
// For USD, prefers the explicit USD field; otherwise converts NGN via fx.
// Discounted variant wins when set and strictly less than actual.
export function getEffectivePrices(p, currency, fx) {
  const isUSD = currency === "USD";
  const pr = p?.price || {};

  const inCur = (usd, ngn) => {
    if (!isUSD) return Math.round(Number(ngn || 0));
    const n = usd != null ? Number(usd || 0) : Number(ngn || 0) * fx;
    return round2(n);
  };

  const monthlyActual = inCur(pr.monthlyUSD, pr.monthlyNGN);
  const sixActual = inCur(pr.sixMonthUSD, pr.sixMonthNGN);
  const yearlyActual = inCur(pr.yearlyUSD, pr.yearlyNGN);
  const installFee = inCur(pr.installUSD, pr.installNGN);

  const monthlyDisc = inCur(pr.discountedMonthlyUSD, pr.discountedMonthlyNGN);
  const sixDisc = inCur(pr.discountedSixMonthUSD, pr.discountedSixMonthNGN);
  const yearlyDisc = inCur(pr.discountedYearlyUSD, pr.discountedYearlyNGN);

  const pick = (actual, discounted) =>
    discounted > 0 && discounted < actual ? discounted : actual;

  return {
    monthly: pick(monthlyActual, monthlyDisc),
    sixMonth: pick(sixActual, sixDisc),
    yearly: pick(yearlyActual, yearlyDisc),
    install: installFee,
  };
}

// Legacy product.discounts.{sixMonths,oneYear} — applied only as a fallback
// when the corresponding new tier price (sixMonthNGN/yearlyNGN) is unset,
// to preserve behavior for older products that haven't migrated.
export function applyLegacyBundleDiscount(baseRecurring, disc, seats, currency, fx) {
  if (!disc) return baseRecurring;

  if (disc.type === "percent") {
    const pct = Number(disc.valueNGN || 0);
    const factor = Math.max(0, 1 - pct / 100);
    return toMoney(baseRecurring * factor, currency);
  }

  if (disc.type === "fixed") {
    let fixedPerSeat = 0;
    if (currency === "USD") {
      fixedPerSeat =
        disc.valueUSD != null
          ? Number(disc.valueUSD || 0)
          : Number(disc.valueNGN || 0) * fx;
      fixedPerSeat = round2(fixedPerSeat);
    } else {
      fixedPerSeat = Math.round(Number(disc.valueNGN || 0));
    }
    if (fixedPerSeat > 0) return toMoney(fixedPerSeat * seats, currency);
  }

  return baseRecurring;
}

// Tier logic mirroring client/src/pages/Purchase.jsx lineCalc().
// 1-5 mo  → monthly × periods × seats
// 6 mo    → sixMonth (or fallback monthly × 6 + legacy sixMonths discount) × seats
// 7-11 mo → sixMonth + monthly × (periods - 6), all × seats
// 12 mo   → yearly  (or fallback monthly × 12 + legacy oneYear discount) × seats
// 13+ mo  → yearly + monthly × (periods - 12), all × seats
// Yearly-billed products skip tier logic and use yearly × periods × seats.
export function computeRecurring({ p, eff, periods, seats, currency, fx }) {
  const m = (n) => toMoney(n, currency);

  if (p.billingInterval === "yearly") {
    return m(eff.yearly * periods * seats);
  }

  if (periods < 6) {
    return m(eff.monthly * periods * seats);
  }

  if (periods === 6) {
    if (eff.sixMonth > 0) return m(eff.sixMonth * seats);
    return applyLegacyBundleDiscount(
      m(eff.monthly * 6 * seats),
      p?.discounts?.sixMonths,
      seats,
      currency,
      fx,
    );
  }

  if (periods > 6 && periods < 12) {
    const sixBase = eff.sixMonth > 0 ? eff.sixMonth : eff.monthly * 6;
    const extra = eff.monthly * (periods - 6);
    return m((sixBase + extra) * seats);
  }

  if (periods === 12) {
    if (eff.yearly > 0) return m(eff.yearly * seats);
    return applyLegacyBundleDiscount(
      m(eff.monthly * 12 * seats),
      p?.discounts?.oneYear,
      seats,
      currency,
      fx,
    );
  }

  const yearBase = eff.yearly > 0 ? eff.yearly : eff.monthly * 12;
  const extra = eff.monthly * (periods - 12);
  return m((yearBase + extra) * seats);
}
