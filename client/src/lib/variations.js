// Variation approval status, on the client.
//
// The mirror of server/util/variationStatus.js. Same rule, same default, so
// the screens and the server never disagree about what a variation is worth:
//
//   A variation only moves money once it is APPROVED. A row with no status —
//   every variation written before the field existed, and every row the
//   post-lock auto-add flow raises — reads back as approved, so no existing
//   project's total moves.

export const VARIATION_STATUSES = ["pending", "approved", "rejected"];

export function normalizeVariationStatus(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return VARIATION_STATUSES.includes(s) ? s : "approved";
}

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
  for (const v of list) if (isApprovedVariation(v)) total += variationAmount(v);
  return total;
}

/** Approved AND executed on site — the earned-value reading. */
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

/** Newest first, each row keeping the index the server knows it by. */
export function variationRowsNewestFirst(list) {
  return (Array.isArray(list) ? list : [])
    .map((v, index) => ({
      ...v,
      index,
      no: index + 1,
      status: normalizeVariationStatus(v?.status),
      amount: variationAmount(v),
    }))
    .reverse();
}

export function variationStatusLabel(status) {
  const s = normalizeVariationStatus(status);
  if (s === "pending") return "Pending";
  if (s === "rejected") return "Rejected";
  return "Approved";
}

/** His stage-pill modifier for a status. */
export function variationStatusClass(status) {
  const s = normalizeVariationStatus(status);
  if (s === "pending") return "v-awaiting";
  if (s === "rejected") return "v-rejected";
  return "v-approved";
}
