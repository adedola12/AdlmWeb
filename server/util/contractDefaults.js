// Contract percentages, and the difference between "not set" and "set to 0".
//
// A QS who types 0% preliminaries into the Bill's Summary box means it: this
// job carries no preliminary pool. A project created before the field existed
// has no opinion, and 7.5% is the house default for it.
//
// `safeNum(x) || 7.5` cannot tell those apart, because 0 is falsy. Five places
// used it and every other reader honoured a stored 0 — the Mongo pipelines use
// $ifNull, projectTotals uses the raw number, computeValueToDate has no
// default at all. So a project with 0% preliminaries had one figure on the
// Bill, the certificates and the gallery card, and a different, larger one on
// the PM dashboard, the Overview and the printed report: on a NGN120m job with
// NGN18.5m of PC sums the gap was NGN11.72m.
//
// docs/RICHARD-SEP18.md decision 1 is that one formula serves every screen.

export const DEFAULT_PRELIMINARY_PERCENT = 7.5;

/**
 * The preliminary percentage to use for a contract.
 * A stored 0 is honoured. Only a genuinely absent or unreadable value falls
 * back to the house default.
 */
export function preliminaryPercentOf(contract, fallback = DEFAULT_PRELIMINARY_PERCENT) {
  const value = contract?.preliminaryPercent;
  // null, undefined and "" are all absent, and all three would come back from
  // Number() as 0 — which would turn "never set" into "no preliminaries at
  // all" and understate the total. Checking Number.isFinite alone is not
  // enough, which is why this is written out.
  if (value === null || value === undefined || value === "") return fallback;
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : fallback;
}

export default preliminaryPercentOf;
