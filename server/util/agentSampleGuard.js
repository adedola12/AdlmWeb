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

// ── Read-only lookup of ONE sample (built on the guard above) ───────────────

/** The label on every answer about a sample. Wording from the work-board item. */
export const SAMPLE_LABEL = "This is a sample project, figures are illustrative.";

// Every tool result about a sample starts with this, so the chat loop can tell
// a sample was answered without parsing anything else.
export const SAMPLE_MARK = "SAMPLE PROJECT:";

/** The block a tool puts in front of a sample answer. */
export function sampleBanner(project) {
  const name = String(project?.name || "Sample project");
  return [
    `${SAMPLE_MARK} "${name}" is a read-only sample (learning material), not one of the user's projects.`,
    `Start your answer with exactly: "${SAMPLE_LABEL}"`,
    "These figures are illustrative. Never add them to, compare them with, or copy them into the user's own projects, totals, estimates, budgets, valuations or rates.",
    "",
  ].join("\n");
}

/** Did a tool answer about a sample? */
export function isSampleAnswer(text) {
  return typeof text === "string" && text.startsWith(SAMPLE_MARK);
}

/** Does the name Ada passed say "sample"? Only then is a sample looked up by name. */
export function mentionsSample(query) {
  return /\bsamples?\b/i.test(String(query || ""));
}

/** The name with "sample" and the "Sample:" prefix taken out, for matching. */
export function withoutSampleWord(text) {
  return String(text || "")
    .replace(/\bsamples?\b\s*:?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The reply, labelled. When a tool answered about a sample this turn and the
 * model left the label out, it goes on the front: the label is not left to the
 * model's memory.
 */
export function labelSampleReply(reply, sampleAnswered) {
  const text = String(reply || "");
  if (!sampleAnswered || text.includes(SAMPLE_LABEL)) return text;
  return `${SAMPLE_LABEL}\n\n${text}`;
}

/** Every number the user typed in a message: "88k" is 88000, "9,500" is 9500. */
export function numbersIn(message) {
  const out = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/gi;
  let m;
  while ((m = re.exec(String(message || "")))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    // "5 m" may be five metres or five million: keep both readings.
    out.push(n);
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") out.push(n * 1000);
    if (suffix === "m") out.push(n * 1000000);
  }
  return out;
}

/**
 * Did the user type this rate themselves in their latest message? A stated-rate
 * card must carry the user's own figure; after a sample was discussed, a rate
 * the user did not type is a sample's rate being copied, and is refused.
 */
export function rateTypedByUser(rate, message) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return false;
  return numbersIn(message).some((n) => Math.abs(n - r) < 0.5);
}

/** What Ada is told when a rate after a sample answer was not typed by the user. */
export const SAMPLE_RATE_NOT_TYPED =
  "This conversation has shown a SAMPLE project's figures, and the rate passed is not one the user typed in their latest message. " +
  "A sample's rates must never be copied into the user's own projects. Nothing was proposed. " +
  "Ask the user to type the rate they want for their own project.";
