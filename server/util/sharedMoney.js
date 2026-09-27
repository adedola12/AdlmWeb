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

// The three totals every list row carries: measured work, what has been
// valued and what is left. They were left unmasked when this masking was
// first added, on the grounds that they predated it. That left a collaborator
// without RateGen reading the value, the amount certified and the balance of
// a project whose rates the project page itself hides from them (found in the
// R4b review, 27 Sep 2026), so they are masked on both lists now. The field
// stays on the row, as a number, so the plugins that parse the per-product
// list as a bare array read a zero exactly as they already do on a masked
// project GET; the screens show an en dash wherever `moneyHidden` is set.
export const LIST_TOTAL_FIELDS = Object.freeze([
  "totalCost",
  "valuedAmount",
  "remainingAmount",
]);

// The rollup fields /me/projects-rollup masks.
export const ROLLUP_MONEY_FIELDS = Object.freeze([
  ...LIST_TOTAL_FIELDS,
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

// The equivalent fields on a per-product project list row: the three totals,
// the contract sum and the grand-summary cascade that builds the "Estimated"
// figure.
export const PROJECT_LIST_MONEY_FIELDS = Object.freeze([
  ...LIST_TOTAL_FIELDS,
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

// ── The owner's switch (R4b) ────────────────────────────────────────────────
// The primitives live in util/ownerMoney.js (no imports, so workOverview.js can
// use them without a cycle through this file); they are re-exported here so the
// routes have one place to import the money rules from.
export {
  SHOW_MONEY_DEFAULT,
  collaboratorShowsMoney,
  ownerAllowsMoney,
  ownerHidesMoneyExpr,
} from "./ownerMoney.js";

/**
 * Hide the money on rows the reader does not own.
 *
 * A shared row is masked when the reader may not see rates (no RateGen) OR the
 * owner switched money off for them (`ownerHidesMoney` on the row, from
 * ownerHidesMoneyExpr). The row stays — a collaborator is meant to see the
 * project, its quantities and its progress — but every hidden figure reads
 * zero, `moneyHidden` says so rather than letting a zero be mistaken for
 * "nothing certified", and `moneyHiddenBy` says why ("owner" | "rategen") so
 * the screen can say who to ask.
 *
 * `priced` survives the masking as a plain yes/no (does the bill carry any
 * value at all?), because the gallery reads a project's stage from it and a
 * hidden row would otherwise read as "Takeoff" whatever its real state. It
 * says nothing about how much.
 *
 * `rows` must already carry the `shared` flag (true when the row belongs to
 * someone else): an owner's own row is never masked. The internal
 * `ownerHidesMoney` flag is always stripped, so it never reaches a client.
 */
export function maskSharedMoney(rows, canSeeRates, fields = ROLLUP_MONEY_FIELDS) {
  return rows.map((p) => {
    if (!p || typeof p !== "object") return p;
    const hasFlag = Object.prototype.hasOwnProperty.call(p, "ownerHidesMoney");
    const byOwner = p.shared === true && p.ownerHidesMoney === true;
    const hide = p.shared === true && (byOwner || !canSeeRates);
    if (!hide && !hasFlag) return p;
    const out = { ...p };
    delete out.ownerHidesMoney;
    if (!hide) return out;
    if ("totalCost" in p) out.priced = Number(p.totalCost) > 0;
    for (const f of fields) out[f] = 0;
    out.moneyHidden = true;
    out.moneyHiddenBy = byOwner ? "owner" : "rategen";
    return out;
  });
}
