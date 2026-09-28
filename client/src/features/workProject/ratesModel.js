// The Rates & budget tab's model — his rates() (work-proj.js:975-1040).
//
// WORK.md §13: "The Rates & budget tab *is* RateGen inside the project."
//
// WHAT HIS FIXTURE HAD THAT A REAL PROJECT DOES NOT
//
// His line points at a rate in a library by id (rateOf → W.byId(it.rate)), and
// carries two more fields that only a fixture can have:
//
//   it.suggest  a library rate somebody has already decided would suit this
//               unpriced line. Nothing in our data suggests a rate, and
//               inventing one would be putting a number in a QS's mouth. The
//               "Needs a rate" list therefore offers the actions and not a
//               suggestion, and says so rather than showing an empty slot.
//   it.keep     a multiplier recording that the library rate moved after this
//               bill was priced, which drives his "Library changed" tag.
//
// Ours stores the rate VALUE on the line, plus two pieces of real provenance:
//
//   appliedRateKey  the exact RateGen library description that priced it, sent
//                   by the plugin (models/TakeoffProject.js:664)
//   rateLockedAt    the QS applied this rate himself — a RateGen pick or a
//                   figure typed into the rate cell (:672)
//
// So "Project rate" vs "Library" is answerable for real. "Library changed" is
// NOT: we do not track the library's own history. What we do have is the same
// question asked of a different pair — does the rate on the line still agree
// with the build-up that prices it — and rateReconcile.js has answered that
// since the restyle. That is what the warning on a priced row means here, and
// the wording says so instead of borrowing his.

import { reconcileBill } from "../projects/rateReconcile.js";
import { safeNum } from "../projects/lib/projectTotals.js";
import { isPriced } from "./billModel.js";

/** His three views (work-proj.js:983-985). */
export const RATE_VIEWS = Object.freeze([
  { key: "rates", label: "Rates" },
  { key: "budget", label: "Budget" },
  { key: "buy", label: "Buy schedule" },
]);

export function resolveRateView(requested) {
  const want = String(requested || "").trim().toLowerCase();
  return RATE_VIEWS.some((v) => v.key === want) ? want : "rates";
}

/**
 * His two lists: what still needs a rate, and what is priced.
 *
 * Indexes, not lines — the index is a line's identity everywhere else on this
 * page, including the side panel it opens into.
 */
export function splitByRate(items) {
  const list = Array.isArray(items) ? items : [];
  const unpriced = [];
  const priced = [];
  list.forEach((it, i) => (isPriced(it) ? priced : unpriced).push(i));
  return { unpriced, priced };
}

/**
 * Where a line's rate came from.
 *
 * His tag is "Project rate" when the rate belongs to this project and "Library"
 * when it came from RateGen. appliedRateKey is that distinction, for real: the
 * plugin writes the library description it priced from, so a line that has one
 * came out of the library and a line that does not was priced from this
 * project's own build-up.
 */
export function provenanceOf(item) {
  const key = String(item?.appliedRateKey || "").trim();
  if (key) return { label: "Library", fromLibrary: true, name: key };
  return { label: "Project rate", fromLibrary: false, name: "" };
}

/** Did the QS apply this rate himself, rather than it being derived? */
export const rateWasApplied = (item) => Boolean(item?.rateLockedAt);

/**
 * Lines whose rate no longer agrees with the build-up pricing them.
 *
 * A Map of item index → { state, budgetRate, difference }, straight from
 * rateReconcile.js. Only lines with something to say are in it, so a project
 * with no Budget at all yields an empty map rather than flagging every line —
 * a missing Budget is a fact of the project, not a fault of the line.
 */
export function rateNotes(items, budgetItems) {
  return reconcileBill(items, budgetItems);
}

/** The amount a priced line contributes. His rt × qty (work-proj.js:1020). */
export const lineAmount = (item) => safeNum(item?.qty) * safeNum(item?.rate);

/**
 * The one-line summary his header prints beside the RateGen mark.
 *
 * He names the pricing location from his fixture's W.LOC. We do not price by
 * location, so this names what actually priced the bill instead of inventing a
 * place: how many lines came from the library, and how many from the project's
 * own build-up.
 */
export function pricedBySummary(items) {
  const list = Array.isArray(items) ? items : [];
  const priced = list.filter(isPriced);
  const fromLibrary = priced.filter((it) => provenanceOf(it).fromLibrary).length;
  return {
    priced: priced.length,
    fromLibrary,
    fromProject: priced.length - fromLibrary,
  };
}
