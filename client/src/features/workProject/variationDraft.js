// Raising a variation, and folding the answer back in.
//
// WHAT IS ASKED FOR IS FOUR FIELDS, AND DELIBERATELY NOT A RATE
//
// The classic form sends { description, reference, kind, amount } and the server
// turns that into qty 1, unit "item", rate ±amount (projects.js:5361-5377). That
// shape is kept exactly, for two reasons. A rate is built in RateGen and never
// typed on the website, so a qty × rate pair here would breach the rule. And the
// server's qty/rate branch IGNORES `kind` — so an omission entered as a positive
// rate with kind "omission" would be stored as an ADDITION, silently adding money
// to a contract where somebody meant to take it away.
//
// A "value" that is a lump sum plus a direction is not a rate. It is what a
// variation is worth.

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** A fresh form. Strings, because that is what inputs hold. */
export const blankVariationDraft = () => ({
  description: "",
  reference: "",
  kind: "addition",
  amount: "",
});

/**
 * Why this cannot be raised yet, in the QS's terms — or "" when it can.
 *
 * One reason at a time, the most basic first, and each one worded as the server
 * words it so the two builds say the same thing: "Say what changed." and "Enter
 * the value of the variation." are the server's own sentences
 * (projects.js:5355, :5368).
 */
export function variationDraftProblem(draft) {
  if (!String(draft?.description || "").trim()) return "Say what changed.";
  const amount = n(draft?.amount);
  if (amount === null || amount === 0) return "Enter the value of the variation.";
  if (amount < 0) {
    // The direction is the `kind`, not the sign. A negative value with kind
    // "addition" is two contradictory answers to the same question, and the server
    // would take the absolute value and believe the kind — so the figure a QS
    // typed and the figure stored would differ in sign with nothing saying so.
    return "Enter the value as a positive figure and choose whether it adds to the contract or takes away.";
  }
  return "";
}

/** The request body for POST /projects/:productKey/:id/variations. */
export function variationBodyFrom(draft) {
  const amount = n(draft?.amount);
  return {
    description: String(draft?.description || "").trim().slice(0, 500),
    reference: String(draft?.reference || "").trim().slice(0, 120),
    kind: draft?.kind === "omission" ? "omission" : "addition",
    amount: amount === null ? 0 : Math.abs(amount),
  };
}

/**
 * Strip the server's enrichment off a variation row.
 *
 * THIS IS THE WHOLE POINT OF THIS FILE AND IT IS NOT A TIDINESS MEASURE.
 *
 * Both variation routes answer with rows passed through variationForClient, which
 * ADDS `index` and `amount` and normalises `status` (projects.js:5322-5331). The
 * project payload carries the raw stored documents, which have neither field.
 *
 * valuationsModel.worksBaseFor is the denominator of every cumulative percentage
 * on the Valuations tab, and it reads each approved variation's value. Fold the
 * enriched rows into the held project and three things happen at once, all
 * silent: the denominator moves by the approved net; a legacy row with no status
 * is pulled in by the normalisation, so ONE raise on an old contract drags every
 * grandfathered variation into the base; and because variationForClient zeroes
 * `amount` for a reader without RateGen, the owner's tab and that collaborator's
 * show different percentages for the same certificates. All of it reverts on the
 * next page load, which is the worst kind of wrong — it does not reproduce.
 *
 * Nothing in this build needs the enrichment: variationsModel recomputes index,
 * number, amount and status from the stored fields. So the stored fields are all
 * that is kept.
 */
/** The keys variationForClient adds, which must not reach the held project. */
const ENRICHED = ["index", "amount", "no", "_ratesMasked"];

export function strippedVariation(row) {
  if (!row || typeof row !== "object") return row;
  const stored = { ...row };
  for (const k of ENRICHED) delete stored[k];
  return stored;
}

/**
 * The project with a variation write folded in.
 *
 * Both routes answer { ok, index, variation, variations, version } — the whole
 * list, which makes this simpler than the certificate case. `version` carries
 * through because saveProjectPatch sends it as baseVersion on every write
 * (saveProject.js:52): left stale, the next edit to the bill is a write against a
 * version the server has already moved past.
 *
 * Returns the project unchanged when there is nothing to fold in, so a caller can
 * hand it straight to a state setter.
 */
export function withVariationWrite(project, out) {
  if (!project || !Array.isArray(out?.variations)) return project;
  const v = Number(out.version);
  return {
    ...project,
    variations: out.variations.map(strippedVariation),
    version: Number.isFinite(v) ? v : project.version,
  };
}

export default variationBodyFrom;
