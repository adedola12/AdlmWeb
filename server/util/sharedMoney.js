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

// The rollup fields /me/projects-rollup masks. Exactly the list that route
// carried before the move.
//
// totalCost / valuedAmount / remainingAmount are deliberately NOT here: they
// have been on that route (and on the per-product list route) since long
// before this masking existed, are read by screens that are not part of it,
// and are left exactly as they were.
export const ROLLUP_MONEY_FIELDS = Object.freeze([
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
// and the grand-summary cascade that builds the "Estimated" figure. Same
// reasoning as above, so the three long-standing fields stay off this list too.
export const PROJECT_LIST_MONEY_FIELDS = Object.freeze([
  "contractSum",
  "provisionalTotal",
  "approvedVariationsTotal",
  "preliminaryTotal",
  "estimateSubtotal",
  "contingencyTotal",
  "taxTotal",
  "estimatedTotal",
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
    for (const f of fields) out[f] = 0;
    out.moneyHidden = true;
    return out;
  });
}
