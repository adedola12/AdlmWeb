// server/services/handoverReview.js
//
// Pure helpers for the QUIV auto take-off review record (models/HandoverReview.js).
// Kept free of Express and Mongo so the rules can be tested on their own.

const MAX_STEPS = 5000; // the largest real run seen planned 551 steps
const MAX_LINES = 200000;

const count = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

/**
 * Turns a plugin body into the fields we store, or returns { error }.
 * The plugin is trusted to count, not to be consistent, so the counts are
 * made to agree here: kept + rejected can never exceed what the run saved.
 */
export function normaliseReview(body = {}) {
  const stepsPlanned = count(body.stepsPlanned, MAX_STEPS);
  const stepsSaved = count(body.stepsSaved, MAX_STEPS);
  let stepsKept = count(body.stepsKept, MAX_STEPS);
  let stepsRejected = count(body.stepsRejected, MAX_STEPS);
  const undoneWhole = body.undoneWhole === true;

  if (stepsSaved === 0) return { error: "A review needs a run that saved at least one step." };

  if (undoneWhole) {
    stepsKept = 0;
    stepsRejected = stepsSaved;
  } else if (stepsKept + stepsRejected > stepsSaved) {
    // Rejections are the deliberate act; trust them first.
    stepsRejected = Math.min(stepsRejected, stepsSaved);
    stepsKept = stepsSaved - stepsRejected;
  }

  return {
    stepsPlanned: Math.max(stepsPlanned, stepsSaved),
    stepsSaved,
    stepsKept,
    stepsRejected,
    linesKept: count(body.linesKept, MAX_LINES),
    linesRejected: count(body.linesRejected, MAX_LINES),
    undoneWhole,
    seconds: count(body.seconds, 24 * 3600),
    pluginVersion: String(body.pluginVersion || "").trim().slice(0, 40),
  };
}

/** The dashboard figure: of the steps runs saved, what share was kept. */
export function summariseReviews(row) {
  const runs = row?.runs || 0;
  const stepsSaved = row?.stepsSaved || 0;
  const stepsKept = row?.stepsKept || 0;
  return {
    runs,
    stepsSaved,
    stepsKept,
    stepsRejected: row?.stepsRejected || 0,
    linesKept: row?.linesKept || 0,
    linesRejected: row?.linesRejected || 0,
    undoneWhole: row?.undoneWhole || 0,
    // Null, not 0, when there is nothing to judge: "0% kept" would be a claim.
    keptShare: stepsSaved ? Math.round((stepsKept / stepsSaved) * 1000) / 1000 : null,
  };
}
