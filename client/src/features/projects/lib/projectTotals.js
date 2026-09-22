// One project, one set of totals (S18, PR2-08).
//
// Richard's second pass (work.js estimate(), 17 Sep 2026) asks for two totals
// and only two, so that no screen can show a third. The screens here used to
// each do their own arithmetic:
//
//   the Bill        measured + provisional + prelims → contingency → VAT,
//                   then variations on top
//   the Overview    measured + PC + prelims + variations, no contingency, no VAT
//   the gallery     measured work alone, labelled "Estimated"
//
// This module is now the only place that arithmetic lives. Every screen calls
// it, so the figures agree by construction rather than by luck.
//
// The cascade is OURS, not his (owner decision, 22 Sep 2026). His prelims are a
// percentage of measured work alone and his variations sit before VAT; ours
// follow the standard QS grand summary and match what the server freezes at
// contract lock (server/routes/projects.js lockContract):
//
//   sub-total   = measured + sums (PC + provisional) + preliminaries
//                 preliminaries = (measured + sums) × preliminary%
//   contingency = sub-total × contingency%
//   VAT         = (sub-total + contingency) × VAT%
//   planned     = sub-total + contingency + VAT        ← frozen at lock
//   total       = planned + approved variations        ← what is owed today
//
// Linked services (an MEP bill rolled into an architectural one) stay OUTSIDE
// the cascade, exactly as they do today: that project carries its own
// preliminaries, contingency and VAT, and is valued on its own certificates.
// It is reported separately as `linked` so a screen can show it honestly,
// never folded into `total`.
//
// Nothing here has state and nothing here rounds: callers format.

/** The one placeholder for an empty value. An en dash, never an em dash. */
export const EN_DASH = "–";

export function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * A percentage as the user may type it. Ours clamps 0–100 (his prototype
 * clamps 0–50); keeping ours means no saved percentage is silently rewritten.
 */
export function clampPercent(value, max = 100) {
  return Math.max(0, Math.min(max, safeNum(value)));
}

/**
 * Does this variation count toward the total?
 *
 * Read defensively. `status` is being added by the valuations stream and most
 * documents in the database do not carry it yet; every one of those is work
 * that has always counted, so a missing, empty or unknown status means
 * approved. Only an explicit "pending" or "rejected" is held back. That rule
 * is what keeps every existing project's total exactly where it is.
 */
export function isApprovedVariation(variation) {
  const status = String(variation?.status || "").trim().toLowerCase();
  if (!status) return true;
  return status !== "pending" && status !== "rejected";
}

/** A variation's signed amount. Omissions are negative rates. */
export function variationAmount(variation) {
  return safeNum(variation?.qty) * safeNum(variation?.rate);
}

/** The net of the approved variations only. */
export function approvedVariationsTotal(variations) {
  return (Array.isArray(variations) ? variations : []).reduce(
    (acc, v) => (isApprovedVariation(v) ? acc + variationAmount(v) : acc),
    0,
  );
}

/**
 * Split the one stored list into his two named groups, keeping each row's
 * index in the stored array so an editor can write back to the right row.
 *
 * `kind` is new (S18) and optional. A row without it is a provisional sum,
 * which is what the whole list has always been treated as, so no total moves.
 */
export function splitProvisionalSums(sums) {
  const list = Array.isArray(sums) ? sums : [];
  const pc = [];
  const provisional = [];
  let pcTotal = 0;
  let provisionalTotal = 0;
  list.forEach((sum, index) => {
    const amount = safeNum(sum?.amount);
    if (String(sum?.kind || "").trim().toLowerCase() === "pc") {
      pc.push({ sum, index });
      pcTotal += amount;
    } else {
      provisional.push({ sum, index });
      provisionalTotal += amount;
    }
  });
  return { pc, provisional, pcTotal, provisionalTotal, total: pcTotal + provisionalTotal };
}

/** The live total of the linked ("sum" type) projects, for reporting only. */
export function linkedServicesTotal(linkedSummaries) {
  return (Array.isArray(linkedSummaries) ? linkedSummaries : []).reduce(
    (acc, l) => acc + safeNum(l?.live?.total ?? l?.snapshot?.total),
    0,
  );
}

/** Sum of qty × rate over bill lines — the measured work. */
export function measuredTotal(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, it) => acc + safeNum(it?.qty) * safeNum(it?.rate),
    0,
  );
}

/**
 * The whole cascade in one call.
 *
 * @param {object} input
 * @param {number} [input.measured]      measured work; pass it when the caller
 *                                       already has it (the Bill computes each
 *                                       line's amount with its own overrides)
 * @param {object[]} [input.items]       bill lines, used only when `measured`
 *                                       is not given
 * @param {object[]} [input.provisionalSums]
 * @param {object[]} [input.variations]
 * @param {number} [input.preliminaryPercent]
 * @param {number} [input.contingencyPercent]
 * @param {number} [input.taxPercent]
 * @param {object[]} [input.linkedSummaries]
 * @returns {{measured:number, pc:number, provisional:number, sums:number,
 *   prelims:number, subtotal:number, contingency:number, tax:number,
 *   planned:number, variations:number, total:number, linked:number,
 *   preliminaryPercent:number, contingencyPercent:number, taxPercent:number}}
 */
export function projectTotals(input = {}) {
  const measured =
    input.measured == null ? measuredTotal(input.items) : safeNum(input.measured);

  const split = splitProvisionalSums(input.provisionalSums);
  const sums = split.total;

  const preliminaryPercent = safeNum(input.preliminaryPercent);
  const contingencyPercent = safeNum(input.contingencyPercent);
  const taxPercent = safeNum(input.taxPercent);

  const prelims = ((measured + sums) * preliminaryPercent) / 100;
  const subtotal = measured + sums + prelims;
  const contingency = (subtotal * contingencyPercent) / 100;
  const tax = ((subtotal + contingency) * taxPercent) / 100;
  const planned = subtotal + contingency + tax;
  const variations = approvedVariationsTotal(input.variations);

  return {
    measured,
    pc: split.pcTotal,
    provisional: split.provisionalTotal,
    sums,
    prelims,
    subtotal,
    contingency,
    tax,
    planned,
    variations,
    total: planned + variations,
    linked: linkedServicesTotal(input.linkedSummaries),
    preliminaryPercent,
    contingencyPercent,
    taxPercent,
  };
}

export default projectTotals;
