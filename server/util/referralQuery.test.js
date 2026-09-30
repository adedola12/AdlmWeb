import { test } from "node:test";
import assert from "node:assert/strict";
import { referralListFilter, referralTotals } from "./referralQuery.js";

// The rule that fails silently: an unrecognised filter must list EVERYTHING.
// Getting it backwards shows an empty table while the referrals exist, which
// reads as "nobody has referred anybody" rather than as a bug.

test("no filter at all lists everything", () => {
  assert.deepEqual(referralListFilter(), {});
  assert.deepEqual(referralListFilter({}), {});
});

test("an EMPTY converted value is not a filter for empty", () => {
  // The screen's "All" tab sends nothing. If "" became a filter, the whole
  // list would come back empty.
  assert.deepEqual(referralListFilter({ converted: "" }), {});
  assert.deepEqual(referralListFilter({ converted: "   " }), {});
  assert.deepEqual(referralListFilter({ converted: null }), {});
  assert.deepEqual(referralListFilter({ converted: undefined }), {});
});

test("an unrecognised value lists everything rather than nothing", () => {
  for (const bad of ["maybe", "2", "-1", "null", "[object Object]"]) {
    assert.deepEqual(referralListFilter({ converted: bad }), {}, bad);
  }
});

test("the ones that subscribed", () => {
  for (const yes of ["1", "true", "TRUE", "yes", " Yes "]) {
    assert.deepEqual(referralListFilter({ converted: yes }), { convertedAt: { $ne: null } }, yes);
  }
});

test("the ones that have not", () => {
  for (const no of ["0", "false", "FALSE", "no", " No "]) {
    assert.deepEqual(referralListFilter({ converted: no }), { convertedAt: null }, no);
  }
});

test("a code is upper-cased, because that is how the model stores it", () => {
  // A link pasted in any case has to find its own referrals.
  assert.deepEqual(referralListFilter({ code: "ab7k2xq9" }), { code: "AB7K2XQ9" });
  assert.deepEqual(referralListFilter({ code: " ab7k2xq9 " }), { code: "AB7K2XQ9" });
});

test("a referrer is lower-cased, because that is how the model stores it", () => {
  assert.deepEqual(referralListFilter({ referrer: "Bola@Example.COM" }), {
    referrerEmail: "bola@example.com",
  });
});

test("filters combine", () => {
  assert.deepEqual(referralListFilter({ converted: "0", code: "ab1", referrer: "A@b.c" }), {
    convertedAt: null,
    code: "AB1",
    referrerEmail: "a@b.c",
  });
});

test("the totals come out of the aggregate", () => {
  const t = referralTotals([{ _id: "NGN", total: 12, converted: 5, revenue: 640_000 }]);
  assert.equal(t.total, 12);
  assert.equal(t.converted, 5);
  assert.equal(t.waiting, 7);
  assert.equal(t.revenue, 640_000);
  assert.equal(t.mixedCurrency, false);
});

test("NAIRA AND DOLLARS ARE NOT ADDED TOGETHER", () => {
  // convertedAmount is copied from the purchase, whose currency is NGN or USD.
  // Summing them into one number and printing it with a naira sign understates
  // the real take by roughly ₦600,000 a dollar sale, while looking precise.
  const t = referralTotals([
    { _id: "NGN", total: 2, converted: 2, revenue: 300_000 },
    { _id: "USD", total: 1, converted: 1, revenue: 400 },
  ]);
  assert.equal(t.total, 3, "counts fold across currencies");
  assert.equal(t.converted, 3);
  assert.deepEqual(t.byCurrency, { NGN: 300_000, USD: 400 });
  assert.deepEqual(t.currencies, ["NGN", "USD"]);
  assert.equal(t.mixedCurrency, true);
  // There is deliberately NO single figure to print when takings are mixed.
  assert.equal(t.revenue, null);
});

test("an unconverted referral carries no currency and no money", () => {
  // Its group is keyed on "" and its revenue is 0, so it must not invent a
  // currency bucket.
  const t = referralTotals([
    { _id: "", total: 4, converted: 0, revenue: 0 },
    { _id: "NGN", total: 1, converted: 1, revenue: 250_000 },
  ]);
  assert.equal(t.total, 5);
  assert.equal(t.converted, 1);
  assert.deepEqual(t.currencies, ["NGN"]);
  assert.equal(t.revenue, 250_000);
});

test("an empty aggregate is zeroes, not NaN", () => {
  // Mongo returns [] from a $group over no documents. NaN would render as
  // "NaN of NaN have subscribed".
  for (const empty of [[], null, undefined]) {
    const t = referralTotals(empty);
    assert.equal(t.total, 0);
    assert.equal(t.converted, 0);
    assert.equal(t.waiting, 0);
    assert.equal(t.revenue, 0);
    assert.equal(t.mixedCurrency, false);
  }
});

test("waiting is never negative, however odd the aggregate", () => {
  assert.equal(referralTotals([{ _id: "NGN", total: 2, converted: 5 }]).waiting, 0);
});
