// A required field that accepts "4" is not required.
//
// The numbers in this file are measured, not invented. On production on 4 Oct
// 2026 the account list held whatsapp values of one digit (15 accounts), two (15),
// three (10), four (2) and six (1). Across the 493 confirmed accounts the digit
// lengths were 10, 11, 12, 13 and 14 — and the only ones below that were seven
// legacy accounts whose number is empty, from before the field existed.
//
// So there is a gap between 6 and 10 with nothing in it, and the floor sits in
// that gap. The tests below pin both edges of it: too low and real Nigerian
// numbers start failing, too high and the junk gets back in.
import test from "node:test";
import assert from "node:assert/strict";

import { isPlausiblePhone, phoneDigits } from "./phonePlausible.js";

test("real numbers from the customer base are accepted", () => {
  // Every shape actually present among confirmed accounts.
  const real = [
    "08030000000", //      11, how a Nigerian number is written locally
    "+2348030000000", //   13, the same number internationally
    "2348030000000", //    13, without the plus
    "8030000000", //       10, without the leading zero
    "+234 803 000 0000", // spaces and punctuation
    "+234 (0)803-000-0000",
    "+44 7700 900000", //  a UK mobile, 12
    "+1 415 555 0100", //  a US number, 11
  ];
  for (const v of real) {
    assert.equal(isPlausiblePhone(v), true, `should accept ${v}`);
  }
});

test("the junk that was actually in the list is refused", () => {
  // These lengths are the ones the measurement found.
  for (const v of ["1", "7", "12", "44", "123", "803", "1234", "080300"]) {
    assert.equal(isPlausiblePhone(v), false, `should refuse ${v}`);
  }
});

test("a single digit repeated is not a telephone number", () => {
  // Long enough to pass a length check, which is the point — this is the shape
  // of a required field being got past rather than answered.
  assert.equal(isPlausiblePhone("0000000000"), false);
  assert.equal(isPlausiblePhone("1111111111"), false);
  assert.equal(isPlausiblePhone("99999999999999"), false);

  // NOT covered, on purpose: "+2340000000000" is a real country code followed by
  // zeros, so it is not a uniform repeat and this passes. Catching it would mean
  // knowing where each country's dialling code ends and testing the remainder,
  // and a rule clever enough to do that is a rule that eventually refuses a real
  // number. The check is here to refuse "4", not to adjudicate dialling plans.
  assert.equal(isPlausiblePhone("+2340000000000"), true);
});

test("nothing at all is refused", () => {
  for (const v of ["", null, undefined, "   ", "+", "abc", "not a number"]) {
    assert.equal(isPlausiblePhone(v), false, `should refuse ${JSON.stringify(v)}`);
  }
});

test("a pasted paragraph is not stored as a phone number", () => {
  // E.164 caps at 15 digits.
  assert.equal(isPlausiblePhone("1234567890123456"), false);
  assert.equal(isPlausiblePhone("123456789012345"), true, "15 is the limit, not past it");
});

test("the floor is 9, which is inside the measured gap", () => {
  // Pinning the boundary in both directions. If somebody lowers this to 6 the
  // junk returns; if they raise it to 11 a bare Nigerian mobile without its
  // leading zero stops working.
  assert.equal(isPlausiblePhone("12345678"), false, "8 digits is below the floor");
  assert.equal(isPlausiblePhone("123456789"), true, "9 digits is the floor");
  assert.equal(
    isPlausiblePhone("8030000000"),
    true,
    "10 digits — the shortest length any confirmed account actually used",
  );
});

test("phoneDigits makes two writings of one number comparable", () => {
  assert.equal(phoneDigits("+234 (0)803-000-0000"), "23408030000000");
  assert.equal(phoneDigits("abc"), "");
  assert.equal(phoneDigits(null), "");
});
