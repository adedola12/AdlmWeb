// server/util/variationStatus.js
//
// S18 valuations — approval status for contract variations.
//
// Until now every variation logged against a project counted toward every
// total the moment it was keyed in. A variation now carries an approval
// status, and ONLY an approved variation moves money.
//
// The default is the whole point: a variation document with no status — i.e.
// every row written before this change — and every row the post-lock
// auto-add flow raises reads back as "approved". So no existing project's
// bill total, valuation or certificate moves by a single naira.
//
// Pure functions only: no mongoose, no request context. Shared by the
// project routes, the rollups and the exporters so every figure agrees.

export const VARIATION_STATUSES = ["pending", "approved", "rejected"];

/** Read a stored status, falling back to "approved" for anything unknown. */
export function normalizeVariationStatus(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return VARIATION_STATUSES.includes(s) ? s : "approved";
}

/** True when this variation counts toward the contract value. */
export function isApprovedVariation(v) {
  return normalizeVariationStatus(v?.status) === "approved";
}

/** Signed value of one variation. Omissions carry a negative rate. */
export function variationAmount(v) {
  const qty = Number(v?.qty);
  const rate = Number(v?.rate);
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) return 0;
  return qty * rate;
}

/** Net value of the approved variations only. */
export function approvedVariationsTotal(list) {
  if (!Array.isArray(list)) return 0;
  let total = 0;
  for (const v of list) {
    if (isApprovedVariation(v)) total += variationAmount(v);
  }
  return total;
}

/**
 * Net value of the variations that are BOTH approved and executed on site
 * (`completed`). This is the earned-value reading, not the contract value.
 */
export function approvedVariationsEarned(list) {
  if (!Array.isArray(list)) return 0;
  let total = 0;
  for (const v of list) {
    if (isApprovedVariation(v) && v?.completed) total += variationAmount(v);
  }
  return total;
}

/** The four figures the Variations view puts in its KPI row. */
export function variationKpis(list) {
  const rows = Array.isArray(list) ? list : [];
  const out = {
    approvedNet: 0,
    additions: 0,
    additionsCount: 0,
    omissions: 0,
    omissionsCount: 0,
    pendingCount: 0,
    pendingNet: 0,
    rejectedCount: 0,
  };
  for (const v of rows) {
    const status = normalizeVariationStatus(v?.status);
    const amount = variationAmount(v);
    if (status === "approved") {
      out.approvedNet += amount;
      if (amount < 0) {
        out.omissions += amount;
        out.omissionsCount += 1;
      } else {
        out.additions += amount;
        out.additionsCount += 1;
      }
    } else if (status === "pending") {
      out.pendingCount += 1;
      out.pendingNet += amount;
    } else {
      out.rejectedCount += 1;
    }
  }
  return out;
}
