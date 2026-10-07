// Issuing an interim payment certificate: what is asked for, and what is sent.
//
// The arithmetic is NOT here, and that is the whole reason this is four fields
// rather than a screen. The server recomputes every figure from the project
// itself (computeValueToDate, then the percentages off valuationSettings) and
// ignores the money in the body unless the caller can see rates — so a form that
// did its own sums would be a second opinion about what the client owes, and the
// two would disagree the first time a line moved.
//
// WHAT IT ASKS FOR, AND WHY EACH ONE
//
//   the period     What the certificate says it covers. The endpoint has always
//                  accepted periodStart/periodEnd and the classic panel once
//                  called it with no arguments at all, so every certificate it
//                  issued stored null and the exporter printed "Period – to
//                  <issue date>" on all of them. Six certificates over six
//                  months, not one stating the period it certified.
//   retention      A certificate carries retentionReleased and the endpoint has
//                  always taken it; nothing ever sent one. So the half of
//                  retention that comes back at practical completion could not be
//                  recorded at all — on six valuations at 5% of ₦80m cumulative,
//                  ₦2,000,000 with nowhere to go.
//   notes          Printed on the document. Unreachable the same way.
//
// AN EMPTY FIELD IS LEFT OUT, NOT SENT EMPTY
//
// "" for a date is stored as an invalid date rather than left unset, and 0 for
// retention is a release of nothing, which is not the same as not releasing. So
// the body carries only what was actually filled in.

/** A fresh form. Strings throughout, because that is what inputs hold. */
export const blankCertDraft = () => ({
  periodStart: "",
  periodEnd: "",
  retentionReleased: "",
  notes: "",
});

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Why this draft cannot be issued yet, in the QS's terms — or "" when it can.
 *
 * Returns one reason at a time, the most basic first: a form that listed three
 * complaints at once reads as an argument rather than an instruction.
 *
 * @param {object} draft
 * @param {object} p
 * @param {number} p.totalRetained  what is actually being held, so a release
 *   bigger than that can be refused before it pays out money never withheld.
 *   Zero means nothing is held, not "unknown": the form only renders off a loaded
 *   project, and the server supplies certificates as an array.
 */
export function certDraftProblem(draft, { totalRetained = 0 } = {}) {
  const from = String(draft?.periodStart || "");
  const to = String(draft?.periodEnd || "");
  if (from && to && from > to) {
    // ISO dates compare as strings, which is the one thing YYYY-MM-DD is for.
    return "The period cannot end before it starts.";
  }
  const release = n(draft?.retentionReleased);
  if (release !== null && release < 0) {
    return "Retention released cannot be negative. A deduction is a smaller certificate, not a negative release.";
  }
  if (release !== null && release > 0 && release > totalRetained) {
    // NO `totalRetained > 0` GUARD HERE, and that is the point.
    //
    // It used to carry one, with a comment reasoning that 0 might mean "we have
    // not been told" and that the server was the backstop either way. Both halves
    // were wrong. The form only renders off a loaded project, whose certificates
    // is an array from the server, so 0 means nothing has been retained — which
    // is exactly the case on a first certificate, when a mis-keyed figure does
    // the most damage. And the server has no ceiling at all: issueCertificate
    // reads safeNum(req.body.retentionReleased) at projects.js:5064 and hands it
    // straight to certificateMoney, where it is ADDED BACK before tax. So the
    // check was switched off in the one case it was written for, and nothing
    // behind it would have caught the result.
    return totalRetained > 0
      ? "That is more than has been retained, so it would pay out money that was never withheld."
      : "Nothing has been retained on this contract yet, so there is nothing to release.";
  }
  return "";
}

/**
 * The request body for POST /projects/:productKey/:id/certificates.
 *
 * Only the keys that were filled in. Never a figure the server works out for
 * itself: no cumulativeValue, no percentages, no number — the number is
 * max(existing) + 1 on the server and must stay there, or two people issuing at
 * once would both believe they issued IPC 4.
 */
export function certBodyFrom(draft) {
  const body = {};
  const from = String(draft?.periodStart || "").trim();
  const to = String(draft?.periodEnd || "").trim();
  const notes = String(draft?.notes || "").trim();
  if (from) body.periodStart = from;
  if (to) body.periodEnd = to;
  if (notes) body.notes = notes.slice(0, 2000);
  const release = n(draft?.retentionReleased);
  if (release !== null && release > 0) body.retentionReleased = release;
  return body;
}

/**
 * What is still held back across every certificate issued so far.
 *
 * Retained less released, per certificate, summed — the same sum the classic
 * panel shows, and the ceiling a release is checked against. Never below zero:
 * a release that over-ran in the past is not a debt the next certificate owes.
 */
export function retentionHeld(certs) {
  const list = Array.isArray(certs) ? certs : [];
  const held = list.reduce(
    (a, c) => a + (n(c?.retentionAmount) || 0) - (n(c?.retentionReleased) || 0),
    0,
  );
  return Math.max(0, held);
}

export default certBodyFrom;

/**
 * The project with a newly issued certificate folded in.
 *
 * POST .../certificates answers with { ok, certificate, version } — NOT the
 * project — so the two things that changed are merged by hand. Both matter, and
 * both were wrong the first time this was wired:
 *
 *   certificates  the list the Valuations tab draws, the bars, the KPIs, and the
 *                 retention the form offers to release next time. Left alone, a
 *                 QS issues a certificate, the panel closes, and the tab still
 *                 says "No valuations yet".
 *   version       saveProjectPatch sends it as baseVersion on every write
 *                 (saveProject.js:52). Left stale, the next edit to the bill is a
 *                 write against a version the server has already moved past.
 *
 * The certificate is taken exactly as the server returned it rather than rebuilt
 * from the form: for a reader who may not see rates it comes back masked, and
 * that masked copy is precisely what this client should hold.
 *
 * Returns the project unchanged when there is nothing to fold in, so a caller can
 * hand it straight to a state setter.
 */
export function withIssuedCertificate(project, out) {
  if (!project || !out?.certificate) return project;
  const v = Number(out.version);
  return {
    ...project,
    certificates: [
      ...(Array.isArray(project.certificates) ? project.certificates : []),
      out.certificate,
    ],
    version: Number.isFinite(v) ? v : project.version,
  };
}
