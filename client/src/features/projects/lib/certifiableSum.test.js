import { describe, it, expect } from "vitest";
import { certifiableSumOf } from "./certifiableSum.js";

// The same worked example as server/util/finalAccountMath.test.js, on purpose:
// the two files carry the same cascade and cannot be allowed to drift.
const SUBTOTAL = 100_000_000;
const CONTINGENCY = SUBTOTAL * 0.05; // 5,000,000
const TAX = (SUBTOTAL + CONTINGENCY) * 0.075; // 7,875,000
const CONTRACT_SUM = SUBTOTAL + CONTINGENCY + TAX; // 112,875,000

const pct = { contingencyPercent: 5, taxPercent: 7.5 };

describe("the certifiable part of an agreed contract sum", () => {
  it("prefers the figure the server stored when the account was closed", () => {
    const fa = {
      agreedContractSum: CONTRACT_SUM,
      agreedCertifiableSum: SUBTOTAL,
      contingencyAtLock: 999,
      taxAtLock: 999,
    };
    expect(certifiableSumOf(fa, pct)).toBe(SUBTOTAL);
  });

  it("falls back to the amounts the lock stored", () => {
    const fa = {
      agreedContractSum: CONTRACT_SUM,
      contingencyAtLock: CONTINGENCY,
      taxAtLock: TAX,
    };
    expect(certifiableSumOf(fa, { contingencyPercent: 99, taxPercent: 99 })).toBe(SUBTOTAL);
  });

  it("inverts the cascade exactly for an account closed before either existed", () => {
    // Not "about right": the cascade is subtotal × 1.05 × 1.075.
    const fa = { agreedContractSum: CONTRACT_SUM };
    expect(certifiableSumOf(fa, pct)).toBeCloseTo(SUBTOTAL, 6);
  });

  it("nothing to derive it from is null, told apart from a baseline of zero", () => {
    expect(certifiableSumOf(null, pct)).toBe(null);
    expect(certifiableSumOf({}, pct)).toBe(null);
    expect(certifiableSumOf({ agreedContractSum: 0 }, pct)).toBe(null);
  });

  it("junk percentages do not divide by zero or flip the sign", () => {
    const fa = { agreedContractSum: 50_000_000 };
    expect(certifiableSumOf(fa, { contingencyPercent: -100, taxPercent: 0 })).toBe(50_000_000);
  });

  it("no percentages at all means the sum carried neither, so it is the sum", () => {
    expect(certifiableSumOf({ agreedContractSum: 50_000_000 })).toBe(50_000_000);
  });

  it("a stored baseline of zero is not trusted over deriving one", () => {
    // 0 is what the schema defaults to, so it means "not recorded" here rather
    // than "the certifiable sum was nil".
    const fa = { agreedContractSum: CONTRACT_SUM, agreedCertifiableSum: 0 };
    expect(certifiableSumOf(fa, pct)).toBeCloseTo(SUBTOTAL, 6);
  });
});
