// What the final account is allowed to call a saving.
//
// The final account settled the job at
//
//   finalContractValue = measured + provisional + preliminaries + variations
//
// and then reported
//
//   savings = contract.contractSum - finalContractValue
//
// but contractSum is the whole grand summary. The contract lock builds it as
//
//   subtotal   = measured + provisional + preliminaries
//   contingency = subtotal × c%
//   tax         = (subtotal + contingency) × t%
//   contractSum = subtotal + contingency + tax
//
// so the two sides of that subtraction were never the same thing. On a job that
// came in exactly as measured, with no variations at all, the difference is
// precisely the contingency plus the VAT — on a ₦100m subtotal at the defaults
// (5% and 7.5%) that is ₦12.875m, printed on the client's final account as
// "Under-run (savings)".
//
// Contingency is a client-held risk allowance, not a payable, and VAT is a
// statutory addition to whatever is finally certified. Neither is money the job
// saved, and neither is ever certified — which is exactly why
// finalContractValue leaves them out. So the comparison is made against the
// certifiable part of the contract sum instead.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const present = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * The part of the agreed contract sum that a certificate can ever pay out:
 * measured work + provisional sums + preliminaries, before contingency and tax.
 *
 * Read from the figures the lock stored. A contract locked before those fields
 * existed carries only contractSum, so the cascade is inverted using the
 * contract's own percentages — an exact inverse, not an approximation.
 *
 * Returns null when there is nothing to derive it from, so a caller can tell
 * "no baseline" from "a baseline of zero".
 */
export function certifiableContractSum(contract) {
  if (!contract) return null;

  const parts = ["measuredAtLock", "provisionalAtLock", "preliminaryAtLock"];
  if (parts.some((k) => present(contract[k]))) {
    return parts.reduce((acc, k) => acc + num(contract[k]), 0);
  }

  if (!present(contract.contractSum)) return null;
  const sum = num(contract.contractSum);

  // Prefer the amounts the lock stored over re-deriving from percentages: they
  // are what was actually agreed, percentages can have been edited since.
  if (present(contract.contingencyAtLock) || present(contract.taxAtLock)) {
    return sum - num(contract.contingencyAtLock) - num(contract.taxAtLock);
  }

  const c = num(contract.contingencyPercent);
  const t = num(contract.taxPercent);
  const factor = (1 + c / 100) * (1 + t / 100);
  // A nonsensical percentage (≤ -100%) would divide by zero or flip the sign.
  if (!(factor > 0)) return sum;
  return sum / factor;
}

/**
 * The final account's under-run (positive) or over-run (negative).
 *
 * Compared against the certifiable contract sum, not the grand total, so
 * contingency and VAT are never reported as money the job saved.
 *
 * With no baseline at all — a project finalized without ever locking a
 * contract — there is nothing to compare against and the answer is 0 rather
 * than the whole final value dressed up as an over-run.
 */
export function finalAccountSavings(contract, finalContractValue) {
  const baseline = certifiableContractSum(contract);
  if (baseline === null) return 0;
  return baseline - num(finalContractValue);
}

export default { certifiableContractSum, finalAccountSavings };
