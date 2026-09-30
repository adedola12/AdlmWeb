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
  assert.deepEqual(referralTotals([{ total: 12, converted: 5, revenue: 640_000 }]), {
    total: 12,
    converted: 5,
    waiting: 7,
    revenue: 640_000,
  });
});

test("an empty aggregate is zeroes, not NaN", () => {
  // Mongo returns [] from a $group over no documents. NaN would render as
  // "NaN of NaN have subscribed".
  assert.deepEqual(referralTotals([]), { total: 0, converted: 0, waiting: 0, revenue: 0 });
  assert.deepEqual(referralTotals(null), { total: 0, converted: 0, waiting: 0, revenue: 0 });
  assert.deepEqual(referralTotals(undefined), { total: 0, converted: 0, waiting: 0, revenue: 0 });
});

test("waiting is never negative, however odd the aggregate", () => {
  assert.equal(referralTotals([{ total: 2, converted: 5 }]).waiting, 0);
});
