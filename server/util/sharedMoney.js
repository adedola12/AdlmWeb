// server/util/sharedMoney.js
//
// One rule for money on a project somebody else owns.
//
// The project routes ask it per document (routes/projects.js
// resolveProjectAccess → maskRates): the owner always sees their own figures,
// and a collaborator only with an active RateGen subscription. Every LIST that
// rolls those same figures up has to ask it the same way, or a list hands back
// the totals the project page would have hidden.
//
// It lived in routes/me.js, for /me/projects-rollup. It is here now because
// the per-product project list (routes/projects.js listProjects) needs exactly
// this rule too — moved, not re-written: the behaviour of the rollup is
// unchanged, it just imports from here.
import { User } from "../models/User.js";
import { hasActiveEntitlement } from "./workOverview.js";

// May this reader see money on work they do not own?
export async function readerMaySeeRates(userId) {
  const me = await User.findById(userId, { entitlements: 1 }).lean();
  return hasActiveEntitlement(me, "rategen");
}

// The rollup fields /me/projects-rollup masks.
//
// totalCost / valuedAmount / remainingAmount used to be left off this list,
// on the reasoning that they predated the masking and the SCREENS could draw
// the line themselves. They could not, and did not:
//
//   - DsWorkHome guarded one totalCost and printed another unguarded.
//   - DsWorkProgramme summed totalCost into a portfolio value and printed it.
//   - PortfolioDashboard summed and EXPORTED totalCost and valuedAmount.
//   - workOverview's headline read `workValue > 0 ? workValue : totalCost`,
//     so masking workValue to 0 fell straight through to the unmasked
//     totalCost. The mask was doing nothing at all on that screen.
//
// totalCost IS the money: it is the sum of the bill's line amounts, and it is
// the biggest input to workValue, which was already masked. Withholding a
// derived figure while shipping its input is not withholding anything. The
// rule belongs here, once, where forgetting fails closed.
export const ROLLUP_MONEY_FIELDS = Object.freeze([
  "totalCost",
  "valuedAmount",
  "remainingAmount",
  "certifiedToDate",
  "provisionalTotal",
  "approvedVariationsTotal",
  "preliminaryTotal",
  "workValue",
  // The grand summary is the most revealing figure on a row, and the rollup
  // only started sending it on this branch, so it is masked from the day it
  // appears — no screen has ever seen it unmasked.
  "estimatedTotal",
]);

// The equivalent fields on a per-product project list row: the contract sum
// and the grand-summary cascade that builds the "Estimated" figure, plus the
// same three, for the same reason.
export const PROJECT_LIST_MONEY_FIELDS = Object.freeze([
  "totalCost",
  "valuedAmount",
  "remainingAmount",
  "contractSum",
  "provisionalTotal",
  "approvedVariationsTotal",
  "preliminaryTotal",
  "estimateSubtotal",
  "contingencyTotal",
  "taxTotal",
  "estimatedTotal",
]);

// The money on a merged contract's row in /me/projects-rollup
// `mergedContracts`: the only two figures a container holds in its own right.
export const MERGED_CONTRACT_MONEY_FIELDS = Object.freeze([
  "certifiedToDate",
  "approvedVariationsTotal",
]);

/**
 * Hide the money on rows the reader does not own, when they may not see rates.
 * The row stays — a collaborator is meant to see the project, its quantities
 * and its progress — but every figure the project API would have masked reads
 * zero here too, and `moneyHidden` says so rather than letting a zero be
 * mistaken for "nothing certified".
 *
 * `rows` must already carry the `shared` flag (true when the row belongs to
 * someone else): an owner's own row is never masked.
 */
export function maskSharedMoney(rows, canSeeRates, fields = ROLLUP_MONEY_FIELDS) {
  if (canSeeRates) return rows;
  return rows.map((p) => {
    if (!p?.shared) return p;
    const out = { ...p };
    // Read before the zeroing, not after. The gallery decides "priced" vs
    // "takeoff" from whether there is money on the bill, and that is a STATE,
    // not an amount — so it is answered here as a boolean rather than left to
    // a screen reading a figure we have just withheld. Without this, masking
    // totalCost would relabel a shared, fully priced job as un-priced.
    out.priced = Number(p.totalCost) > 0 || Number(p.contractSum) > 0;
    for (const f of fields) out[f] = 0;
    out.moneyHidden = true;
    return out;
  });
}
