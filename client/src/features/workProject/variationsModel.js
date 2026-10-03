// His Variations and Final account views (work-proj.js:1608 and :1672).
//
// WHERE HIS FIXTURE AND OUR DATA PART
//
// His variation is { no, title, ref, at, amount, status }. Ours is richer in two
// ways that matter on screen:
//
//  • An amount is qty × rate, not a figure typed once. A variation here is a
//    measured item like any other, so the row can say what it is measuring.
//  • `status` and `completed` are two different things, and this codebase is
//    emphatic about it: "approved = it counts toward the contract value,
//    completed = it has been executed on site" (TakeoffProject's VariationSchema).
//    His screen has only the one. Ours shows both, because a variation that is
//    approved but not yet built is money owed later, not money earned now.
//
// `status` defaults to "approved" on the server on purpose — every row written
// before the field existed reads back approved — so a row with no status is
// approved here too rather than being quietly dropped from the total.

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** What a variation is worth. Negative is an omission, as his `om` rows are. */
export const variationAmount = (v) => num(v?.qty) * num(v?.rate);

/** Approved unless it says otherwise — the server's own default. */
export const variationStatus = (v) => {
  const s = String(v?.status || "").trim().toLowerCase();
  return s === "pending" || s === "rejected" ? s : "approved";
};

const STATUS_LABEL = Object.freeze({
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
});

/** His .pj-stage v-* classes (work-proj.js:1601). */
const STATUS_CLASS = Object.freeze({
  approved: "v-approved",
  pending: "v-awaiting",
  rejected: "v-rejected",
});

/**
 * Every variation, newest first as his list is, with its index kept.
 *
 * His numbering is v.no. Ours is the row's position plus one, because that is
 * what the rest of this codebase calls a variation on a certificate.
 */
export function variationRows(project) {
  const list = Array.isArray(project?.variations) ? project.variations : [];
  return list
    .map((v, index) => {
      const status = variationStatus(v);
      return {
        index,
        no: index + 1,
        title: String(v?.description || "").trim() || "Untitled variation",
        reference: String(v?.reference || "").trim(),
        issuedAt: v?.issuedAt || null,
        qty: num(v?.qty),
        unit: String(v?.unit || "").trim(),
        rate: num(v?.rate),
        amount: variationAmount(v),
        status,
        statusLabel: STATUS_LABEL[status],
        statusClass: STATUS_CLASS[status],
        completed: v?.completed === true,
        // Rows the post-lock flow raised itself, which a QS did not key in.
        automatic: String(v?.source || "") === "post-lock-new-item",
      };
    })
    .reverse();
}

/**
 * His four KPIs over the list (work-proj.js:1595).
 *
 * Only approved variations move the contract value, which is the server's rule
 * too — so additions and omissions count approved rows only, and the pending
 * figure is explicitly "not counted yet".
 */
export function variationKpis(project) {
  const rows = variationRows(project);
  const approved = rows.filter((r) => r.status === "approved");
  const pending = rows.filter((r) => r.status === "pending");
  const additions = approved.filter((r) => r.amount > 0);
  const omissions = approved.filter((r) => r.amount < 0);
  const sum = (list) => list.reduce((a, r) => a + r.amount, 0);
  return {
    count: rows.length,
    net: sum(approved),
    additions: sum(additions),
    additionCount: additions.length,
    omissions: sum(omissions),
    omissionCount: omissions.length,
    pendingCount: pending.length,
    pendingValue: sum(pending),
    // Approved but not yet built. His screen cannot say this; ours can, and it
    // is the difference between what is owed eventually and what is earned now.
    awaitingExecution: approved.filter((r) => !r.completed).length,
  };
}

/**
 * His final account breakdown (work-proj.js:1679), against a totals object from
 * projectTotals — which is the one place in this codebase that does this
 * arithmetic, and is not repeated here.
 *
 * Linked services are listed but NOT added: projectTotals keeps them outside
 * the cascade because that project carries its own preliminaries, contingency
 * and VAT and is valued on its own certificates.
 */
export function finalAccountRows(totals) {
  const t = totals || {};
  const rows = [
    { key: "measured", label: "Measured work", value: num(t.measured) },
    { key: "prelims", label: "Preliminaries", value: num(t.prelims) },
    { key: "pc", label: "PC sums", value: num(t.pc) },
    { key: "provisional", label: "Provisional sums", value: num(t.provisional) },
    { key: "linked", label: "Linked services", value: num(t.linked), outside: true },
    { key: "contingency", label: "Contingency", value: num(t.contingency) },
    { key: "variations", label: "Approved variations", value: num(t.variations) },
    { key: "tax", label: "VAT", value: num(t.tax) },
  ];
  // A row worth nothing is noise on a settlement, except the measured work,
  // which being zero is itself the thing worth seeing.
  return rows.filter((r) => r.value !== 0 || r.key === "measured");
}

/**
 * The final account against the contract sum.
 *
 * `over` is what matters: a positive difference is an over-run and a negative
 * one is a saving, and calling either the other way round on a settlement is
 * not a rounding error.
 */
export function againstContract({ total = 0, contractSum = 0, certified = 0 } = {}) {
  const diff = num(total) - num(contractSum);
  return {
    contractSum: num(contractSum),
    total: num(total),
    certified: num(certified),
    difference: Math.abs(diff),
    over: diff > 0,
    label: diff > 0 ? "Over-run" : diff < 0 ? "Saving" : "On the contract sum",
    percentOfContract: num(contractSum) ? (diff / num(contractSum)) * 100 : 0,
    certifiedShare: num(total) ? (num(certified) / num(total)) * 100 : 0,
  };
}

/** Whether the account is closed — his `p.stage === 'final'`. */
export const accountClosed = (project) =>
  String(project?.stage || "").trim().toLowerCase() === "final";
