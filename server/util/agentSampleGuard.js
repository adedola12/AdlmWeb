// THE SAMPLE GUARD FOR ADA.
//
// Sample projects (util/sampleProjects.js) are illustrative learning material:
// their quantities and rates belong to no client. Owner's rule, 8 Oct 2026, and
// not negotiable: a sample's figures must NEVER reach a client's real estimate.
//
//   - Every query Ada runs over "the user's projects" (the portfolio, a total
//     across projects, slot counts, the project a name or a page resolves to)
//     excludes samples, through ownOnly() below. Samples carry no owner today,
//     so the userId scope already keeps them out; this is the second lock, so a
//     sample that ever gained a userId (a copy, a bad seed, a migration) still
//     cannot be counted.
//   - A tool that writes, or proposes something to apply (the Proposed rates
//     card), refuses on a sample. So does the period report.
//   - Nothing Ada proposes for a real project is built from a sample: the rate
//     proposals read the user's own RateGen library and own rate usage only.
//
// The read-only, single-sample lookup (when the user names or opens a sample)
// is built on top of this and labels every answer; see resolveProject in
// services/agentUserData.js.

/** The filter clause that keeps samples out. Merge it into every user-scoped query. */
export const NOT_SAMPLE = Object.freeze({ isSample: { $ne: true } });

/** `filter` plus the sample exclusion. Never weakens a clause already on `filter`. */
export function ownOnly(filter = {}) {
  return { ...filter, isSample: { $ne: true } };
}

/** Is this loaded project a sample? */
export function isSampleProject(project) {
  return project?.isSample === true;
}

/** What Ada is told when a pricing tool reaches a sample. */
export function sampleProposalRefusal(project) {
  const name = String(project?.name || "This sample");
  return (
    `"${name}" is a read-only SAMPLE project. Rates cannot be proposed, set or applied on a sample, ` +
    "and a sample's rates or quantities must never be copied into one of the user's own projects. " +
    "Say so plainly. If they want to price their own bill, ask which of THEIR projects to use."
  );
}

/** What Ada is told when the period report reaches a sample. */
export function samplePeriodReportRefusal(project) {
  const name = String(project?.name || "This sample");
  return (
    `"${name}" is a read-only SAMPLE project. Period reports cover the user's own projects only, ` +
    "never a sample. Say so plainly, and offer the report for one of their own projects instead."
  );
}
