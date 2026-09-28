import { test } from "node:test";
import assert from "node:assert/strict";
import { certifiableContractSum, finalAccountSavings } from "./finalAccountMath.js";

// A ₦100m subtotal locked at the defaults, the way lockContract builds it.
const SUBTOTAL = 100_000_000;
const CONTINGENCY = SUBTOTAL * 0.05; // 5,000,000
const TAX = (SUBTOTAL + CONTINGENCY) * 0.075; // 7,875,000
const CONTRACT_SUM = SUBTOTAL + CONTINGENCY + TAX; // 112,875,000

const lockedContract = (over = {}) => ({
  locked: true,
  measuredAtLock: 85_000_000,
  provisionalAtLock: 10_000_000,
  preliminaryAtLock: 5_000_000,
  contingencyAtLock: CONTINGENCY,
  taxAtLock: TAX,
  contingencyPercent: 5,
  taxPercent: 7.5,
  contractSum: CONTRACT_SUM,
  ...over,
});

test("the baseline is what a certificate can pay, not the grand total", () => {
  assert.equal(certifiableContractSum(lockedContract()), SUBTOTAL);
});

test("a job that came in exactly as measured shows no saving", () => {
  // THE BUG, in one assertion. Nothing changed: no variations, quantities as
  // measured at lock. The old arithmetic reported ₦12,875,000 saved, which is
  // the contingency plus the VAT and nothing else.
  const contract = lockedContract();
  const finalValue = SUBTOTAL; // measured + provisional + prelim, no variations
  assert.equal(finalAccountSavings(contract, finalValue), 0);
  assert.equal(
    contract.contractSum - finalValue,
    CONTINGENCY + TAX,
    "what the old comparison was actually measuring",
  );
});

test("a real under-run is still reported", () => {
  // The job finished ₦4m under the certifiable sum.
  assert.equal(finalAccountSavings(lockedContract(), SUBTOTAL - 4_000_000), 4_000_000);
});

test("a real over-run is negative", () => {
  assert.equal(finalAccountSavings(lockedContract(), SUBTOTAL + 3_000_000), -3_000_000);
});

test("approved variations eat into the saving, as they should", () => {
  // Measured as locked, plus ₦6m of approved variations → ₦6m over.
  assert.equal(finalAccountSavings(lockedContract(), SUBTOTAL + 6_000_000), -6_000_000);
});

test("a contract locked before the at-lock fields existed inverts the cascade exactly", () => {
  const legacy = {
    locked: true,
    contractSum: CONTRACT_SUM,
    contingencyPercent: 5,
    taxPercent: 7.5,
  };
  // Not "about right": the cascade is subtotal × 1.05 × 1.075, so dividing by
  // that is the exact inverse.
  assert.ok(Math.abs(certifiableContractSum(legacy) - SUBTOTAL) < 0.000001);
});

test("the stored amounts win over re-deriving from percentages", () => {
  // Percentages can be edited after the lock; the amounts are what was agreed.
  const contract = {
    locked: true,
    contractSum: CONTRACT_SUM,
    contingencyAtLock: CONTINGENCY,
    taxAtLock: TAX,
    contingencyPercent: 99, // edited since, and irrelevant
    taxPercent: 99,
  };
  assert.equal(certifiableContractSum(contract), SUBTOTAL);
});

test("a zero preliminary percentage is a real answer, not a missing one", () => {
  // preliminaryAtLock of 0 is the contract saying "no preliminaries", and
  // Number.isFinite(Number(0)) is true, so it must not fall through to the
  // contractSum branch.
  const contract = {
    locked: true,
    measuredAtLock: 90_000_000,
    provisionalAtLock: 0,
    preliminaryAtLock: 0,
    contractSum: 999_999_999,
  };
  assert.equal(certifiableContractSum(contract), 90_000_000);
});

test("no contract and no sum mean no baseline, told apart from a baseline of zero", () => {
  assert.equal(certifiableContractSum(null), null);
  assert.equal(certifiableContractSum({}), null);
  assert.equal(certifiableContractSum({ locked: false }), null);
});

test("finalizing without ever locking a contract reports nothing, not a giant over-run", () => {
  // baseline - finalValue would be 0 - 94m = a ₦94m "over-run" on a job that
  // simply never had a contract to run over.
  assert.equal(finalAccountSavings(null, 94_000_000), 0);
  assert.equal(finalAccountSavings({}, 94_000_000), 0);
});

test("junk percentages do not divide by zero or flip the sign", () => {
  const contract = { locked: true, contractSum: 50_000_000, contingencyPercent: -100, taxPercent: 0 };
  assert.equal(certifiableContractSum(contract), 50_000_000);
});

test("a non-numeric final value is read as zero rather than producing NaN", () => {
  assert.equal(finalAccountSavings(lockedContract(), undefined), SUBTOTAL);
  assert.equal(finalAccountSavings(lockedContract(), "nope"), SUBTOTAL);
});
