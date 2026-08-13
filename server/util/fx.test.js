// Currency conversion tests.
//
// These exist because of a specific fault: fetchLiveFx asked open.er-api.com
// for rates with NGN as the base and then read `rates.NGN`, which is a currency
// against itself and therefore always 1. The function returned a rate of 1.0
// for months, so every price with no explicit USD override was published at one
// dollar to the naira — on the product pages, in the AI agent's catalogue, and
// in the checkout total. ADLM Time Pro was advertised at $2,000/month against a
// ₦2,000 price and nothing flagged it.
//
// The response that caused it is asserted below verbatim. Nothing here touches
// the network or the database: fetchLiveFx is exercised against stubbed
// responses, and calcUSD is pure. getFxRate itself is not covered — its
// fallback path reads the Setting collection, and a test that needs mongoose
// connected is a test that gets skipped.

import test from "node:test";
import assert from "node:assert/strict";

import { fetchLiveFx, calcUSD, usdPrice } from "./fx.js";
import { getEffectivePrices } from "./pricing.js";

// Rates as open.er-api.com actually returned them on the day the bug was found.
const NGN_PER_USD = 1362;
const USD_PER_NGN = 0.000734;

const realFetch = global.fetch;

/** Run `fn` with global.fetch stubbed to return `body`. */
async function withResponse(body, fn, { ok = true } = {}) {
  global.fetch = async () => ({ ok, json: async () => body });
  try {
    return await fn();
  } finally {
    global.fetch = realFetch;
  }
}

const rejects = (body, opts) =>
  assert.rejects(() => withResponse(body, fetchLiveFx, opts));

// ── the regression ──────────────────────────────────────────────────────────

test("refuses the response that caused the 1:1 bug", async () => {
  // Base NGN. `rates.NGN` is 1 — reading it is what produced fx = 1/1 = 1.
  // There is no usable USD rate here, so the only correct move is to fail and
  // let getFxRate fall back rather than publish a rate of 1.
  await rejects({ base_code: "NGN", rates: { NGN: 1, EUR: 0.00061 } });
});

test("refuses a rate of 1.0 however it arrives", async () => {
  // The value was never out of range in the arithmetic sense — it was exactly
  // 1 — so plausibility, not finiteness, is what has to catch it.
  await rejects({ base_code: "NGN", rates: { USD: 1 } });
});

test("refuses any rate that would price the naira above ₦10 to the dollar", async () => {
  await rejects({ base_code: "NGN", rates: { USD: 0.1 } }); // ₦10, the bound
  await rejects({ base_code: "NGN", rates: { USD: 0.5 } }); // ₦2
});

test("a naira this weak is still accepted — the guard is one-sided", async () => {
  // Only implausibly *strong* rates are refused. A collapsing naira must still
  // get through, or the guard becomes an outage during exactly the currency
  // event it most matters for.
  const fx = await withResponse(
    { base_code: "NGN", rates: { USD: 0.00002 } }, // ₦50,000 to the dollar
    fetchLiveFx,
  );
  assert.equal(fx, 0.00002);
});

// ── reading the response ────────────────────────────────────────────────────

test("reads rates.USD when the source is based on NGN", async () => {
  const fx = await withResponse(
    { base_code: "NGN", rates: { NGN: 1, USD: USD_PER_NGN } },
    fetchLiveFx,
  );
  assert.equal(fx, USD_PER_NGN);
});

test("inverts rates.NGN when the source is based on USD", async () => {
  // FX_SOURCE is configurable, so both bases have to work. Same market, so the
  // two must agree to the 6dp the function rounds to.
  const fx = await withResponse(
    { base_code: "USD", rates: { NGN: NGN_PER_USD, USD: 1 } },
    fetchLiveFx,
  );
  assert.equal(fx, Math.round((1 / NGN_PER_USD) * 1e6) / 1e6);
  assert.ok(Math.abs(fx - USD_PER_NGN) < 1e-6, "both bases agree");
});

test("accepts `base` as well as `base_code`", async () => {
  const fx = await withResponse(
    { base: "NGN", rates: { USD: USD_PER_NGN } },
    fetchLiveFx,
  );
  assert.equal(fx, USD_PER_NGN);
});

test("rounds to 6dp so stored rates don't carry float noise", async () => {
  const fx = await withResponse(
    { base_code: "NGN", rates: { USD: 0.00073412345 } },
    fetchLiveFx,
  );
  assert.equal(fx, 0.000734);
});

// ── responses that must not become a rate ───────────────────────────────────

test("refuses a base it does not understand", async () => {
  await rejects({ base_code: "EUR", rates: { USD: 1.09 } });
  await rejects({ rates: { USD: 1.09 } }); // no base at all
});

test("refuses missing, zero, negative and unreadable rates", async () => {
  await rejects({ base_code: "NGN", rates: {} });
  await rejects({ base_code: "NGN" });
  await rejects({ base_code: "NGN", rates: { USD: 0 } });
  await rejects({ base_code: "NGN", rates: { USD: -0.0007 } });
  await rejects({ base_code: "NGN", rates: { USD: null } });
  await rejects({ base_code: "NGN", rates: { USD: "very strong" } });
  await rejects({ base_code: "USD", rates: { NGN: 0 } });
});

test("accepts a rate that arrives as a numeric string", async () => {
  // Deliberate: the value is coerced rather than type-checked, so a source
  // that quotes its numbers survives. What makes that safe is that the
  // plausibility bound is applied to the coerced result either way — a wrong
  // rate is caught by being wrong, not by being the wrong type.
  const fx = await withResponse(
    { base_code: "NGN", rates: { USD: "0.000734" } },
    fetchLiveFx,
  );
  assert.equal(fx, USD_PER_NGN);
});

test("refuses a non-2xx response", async () => {
  await rejects({ base_code: "NGN", rates: { USD: USD_PER_NGN } }, { ok: false });
});

// ── calcUSD: what the rate is actually used for ─────────────────────────────

test("an explicit USD override is returned untouched", async () => {
  // This is why a bad rate went unnoticed for so long: every product with an
  // override was shielded from it, and Time Pro — the one product without —
  // was the only visible symptom.
  assert.equal(calcUSD(8000, USD_PER_NGN, 10), 10);
  assert.equal(calcUSD(8000, 1, 10), 10, "override survives even a broken rate");
});

test("a blank override converts from the naira price", async () => {
  for (const blank of [undefined, null, ""]) {
    assert.equal(calcUSD(2000, USD_PER_NGN, blank), 1.47);
  }
});

test("₦2,000 converts to $1.47, not $2,000", async () => {
  // The exact figure the site was advertising for ADLM Time Pro.
  assert.equal(calcUSD(2000, USD_PER_NGN), 1.47);
  assert.equal(calcUSD(20000, USD_PER_NGN), 14.68);
  assert.notEqual(calcUSD(2000, USD_PER_NGN), 2000);
});

test("converted prices are rounded to 2dp for display", async () => {
  assert.equal(calcUSD(50000, USD_PER_NGN), 36.7);
  assert.equal(calcUSD(1, USD_PER_NGN), 0);
});

// ── usdPrice: what the pages actually read ──────────────────────────────────

test("every USD tier is resolved, not just monthly/yearly/install", async () => {
  // The 6-month tier is the one that bit: Purchase.jsx reads `sixMonthUSD || 0`
  // off this payload, so leaving it unresolved advertised a 6-month
  // subscription at $0 while checkout charged the converted price.
  const out = usdPrice(
    { monthlyNGN: 12000, sixMonthNGN: 65000, yearlyNGN: 120000, installNGN: 15000 },
    USD_PER_NGN,
  );
  assert.equal(out.monthlyUSD, 8.81);
  assert.equal(out.sixMonthUSD, 47.71);
  assert.equal(out.yearlyUSD, 88.08);
  assert.equal(out.installUSD, 11.01);
});

test("explicit overrides still win on every tier", async () => {
  const out = usdPrice(
    {
      monthlyNGN: 12000, monthlyUSD: 10,
      sixMonthNGN: 65000, sixMonthUSD: 50,
      yearlyNGN: 120000, yearlyUSD: 100,
      installNGN: 15000, installUSD: 5,
    },
    USD_PER_NGN,
  );
  assert.deepEqual(
    [out.monthlyUSD, out.sixMonthUSD, out.yearlyUSD, out.installUSD],
    [10, 50, 100, 5],
  );
});

test("a discounted tier that was never set is left absent", async () => {
  // Writing 0 into an unset sale price would read as "₦0, on offer" to
  // anything testing presence rather than value.
  const out = usdPrice({ monthlyNGN: 12000 }, USD_PER_NGN);
  assert.equal("discountedMonthlyUSD" in out, false);
  assert.equal("discountedYearlyUSD" in out, false);
});

test("a discounted tier that IS set gets converted", async () => {
  const out = usdPrice(
    { monthlyNGN: 12000, discountedMonthlyNGN: 9000 },
    USD_PER_NGN,
  );
  assert.equal(out.discountedMonthlyUSD, 6.61);
});

test("what the page shows equals what checkout charges", async () => {
  // The display path (usdPrice, here) and the money path (getEffectivePrices in
  // pricing.js) are separate implementations of the same rule. This is the
  // assertion that keeps them honest — a buyer must never be quoted one figure
  // and charged another.
  for (const price of [
    { monthlyNGN: 12000, sixMonthNGN: 65000, yearlyNGN: 120000, installNGN: 15000 },
    { monthlyNGN: 8000, sixMonthNGN: 35000, yearlyNGN: 70000, installNGN: 0 },
    { monthlyNGN: 2000, yearlyNGN: 20000, monthlyUSD: 2, yearlyUSD: 20 },
    { monthlyNGN: 50000, yearlyNGN: 500000, installNGN: 25000, monthlyUSD: 30 },
  ]) {
    const shown = usdPrice(price, USD_PER_NGN);
    const charged = getEffectivePrices({ price }, "USD", USD_PER_NGN);
    assert.equal(shown.monthlyUSD, charged.monthly, "monthly");
    assert.equal(shown.yearlyUSD, charged.yearly, "yearly");
    assert.equal(shown.installUSD, charged.install, "install");
    if (price.sixMonthNGN) {
      assert.equal(shown.sixMonthUSD, charged.sixMonth, "6-month");
    }
  }
});

test("an override of 0 is honoured rather than converted", async () => {
  // Products carry installUSD: 0 to mean "no install fee". Converting it
  // instead would invent a charge, so 0 has to win over the naira price.
  assert.equal(calcUSD(15000, USD_PER_NGN, 0), 0);
});
