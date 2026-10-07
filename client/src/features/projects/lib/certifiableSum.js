// The part of an agreed contract sum that a certificate can ever pay out.
//
// The contract lock builds the sum as a QS grand summary:
//
//   subtotal    = measured + provisional + preliminaries
//   contingency = subtotal × c%
//   tax         = (subtotal + contingency) × t%
//   contractSum = subtotal + contingency + tax
//
// A finalized account's finalContractValue is the subtotal cascade plus
// approved variations, and deliberately carries neither contingency nor VAT,
// because neither is ever certified. Comparing the two directly reported the
// contingency plus the VAT as money the job saved — ₦12.875m on a ₦100m
// subtotal at the defaults, on a job that came in exactly as measured.
//
// This is the client half of server/util/finalAccountMath.js. The two are
// deliberately separate files rather than a shared module: the client cannot
// import from server/, and inventing a shared package for eleven lines of
// arithmetic would cost more than it saves. Both carry the same cascade and
// both are tested against the same worked example, so a change to one that is
// not made to the other fails a test.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const present = (v) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * The certifiable part of a finalized account's agreed contract sum.
 *
 * Prefers the figure the server stored when the account was finalized. An
 * account finalized before that field existed carries only the grand total, so
 * the cascade is inverted using the contract's own percentages — the exact
 * inverse, not an approximation.
 *
 * Returns null when there is nothing to derive it from, so a caller can tell
 * "no baseline" from "a baseline of zero".
 */
export function certifiableSumOf(finalAccount, { contingencyPercent, taxPercent } = {}) {
  const fa = finalAccount || {};

  if (present(fa.agreedCertifiableSum) && num(fa.agreedCertifiableSum) > 0) {
    return num(fa.agreedCertifiableSum);
  }

  const sum = num(fa.agreedContractSum);
  if (!present(fa.agreedContractSum) || sum === 0) return null;

  // The amounts the lock stored beat re-deriving from percentages, which can
  // have been edited since.
  if (present(fa.contingencyAtLock) || present(fa.taxAtLock)) {
    return sum - num(fa.contingencyAtLock) - num(fa.taxAtLock);
  }

  const factor = (1 + num(contingencyPercent) / 100) * (1 + num(taxPercent) / 100);
  if (!(factor > 0)) return sum;
  return sum / factor;
}

export default certifiableSumOf;
