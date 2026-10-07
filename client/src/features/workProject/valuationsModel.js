// The Valuations tab's model — his valuations() (work-proj.js:1508-1575).
//
// WORK.md §13: "Valuations stay locked until the contract is, with a checklist
// saying why."
//
// THE ARITHMETIC IS NOT HERE. What a certificate is worth was fixed earlier this
// week in features/projects/lib/interimCertificate.js, after "Less previous
// payments" was found to be subtracting each earlier valuation's GROSS while
// retention was already taken on the whole gross to date — withholding the
// retention on all previous work a second time, on every certificate after the
// first. Nothing on this page recomputes a certificate; it reads the ones the
// project stores and totals them.

import { safeNum } from "../projects/lib/projectTotals.js";
import { isPriced } from "./billModel.js";
import { stageIndex } from "./overviewModel.js";

/** His three views (work-proj.js:1533). */
export const VALUATION_VIEWS = Object.freeze([
  { key: "certs", label: "Certificates" },
  { key: "variations", label: "Variations" },
  { key: "final", label: "Final account" },
]);

export function resolveValuationView(requested) {
  const want = String(requested || "").trim().toLowerCase();
  return VALUATION_VIEWS.some((v) => v.key === want) ? want : "certs";
}

/**
 * Is the contract locked?
 *
 * Read from the contract itself rather than from the stage: the stage is a
 * label and the lock is the fact. They agree on every project that went through
 * lockContract, and where they do not, the contract wins.
 */
export const contractIsLocked = (project) => Boolean(project?.contract?.locked);

/**
 * His gate, and the checklist that explains it.
 *
 * Three checks, in his order. The third is his "bill and model agree", which
 * needs a model-drift list we do not carry — so it is only included when one is
 * passed, rather than asserting agreement nobody checked.
 */
export function lockChecklist(project, { drift = null } = {}) {
  const items = Array.isArray(project?.items) ? project.items : [];
  const unpriced = items.filter((it) => !isPriced(it)).length;
  const tendered = Boolean(project?.contract?.tenderedAt);

  const checks = [
    {
      key: "priced",
      ok: unpriced === 0,
      text:
        unpriced === 0
          ? "Every bill item is priced"
          : `${unpriced} bill item${unpriced === 1 ? "" : "s"} still need${unpriced === 1 ? "s" : ""} a rate`,
    },
    {
      key: "tendered",
      ok: tendered,
      text: tendered ? "The bill has gone to tender" : "The bill has not gone to tender yet",
    },
  ];

  if (drift) {
    const n = Array.isArray(drift) ? drift.length : Object.keys(drift).length;
    checks.push({
      key: "model",
      ok: n === 0,
      text: n === 0 ? "Bill and model agree" : `The model has ${n} change${n === 1 ? "" : "s"} to review`,
    });
  }

  return checks;
}

/** Is this project one step from the lock — his `si === 2`? */
export const readyToLock = (project) => stageIndex(project) === 2;

// Ours are draft | approved | paid; his were draft | awaiting | approved. The
// words differ, so they are mapped rather than borrowed: "paid" is a real state
// of ours that his fixture had no idea about, and calling it "approved" would
// lose that.
const STATUS_LABEL = Object.freeze({
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
});

export const certificateStatus = (certificate) => {
  const s = String(certificate?.status || "draft").toLowerCase();
  return { key: s, label: STATUS_LABEL[s] || "Draft" };
};

/** A certificate counts toward the money once it is approved — or paid. */
const counts = (c) => ["approved", "paid"].includes(String(c?.status || "").toLowerCase());

/**
 * His five figures across the top.
 *
 * Every one is read off the stored certificates, not recomputed: these are
 * documents that have been issued, and a screen that disagreed with the
 * certificate it is summarising would be worse than no screen.
 */
export function valuationKpis(project, { contractSum = 0, worksValue = 0, progressPercent = 0 } = {}) {
  const certs = Array.isArray(project?.certificates) ? project.certificates : [];
  const settled = certs.filter(counts);

  const certified = settled.reduce((a, c) => a + safeNum(c.thisCertificate), 0);
  const retained = settled.reduce(
    (a, c) => a + safeNum(c.retentionAmount) - safeNum(c.retentionReleased),
    0,
  );
  const paid = settled.reduce((a, c) => a + safeNum(c.netPayable), 0);

  // His "cumulative %" of the last certificate, so the page can say how much
  // work is done but not yet valued.
  const lastCumulative = certs.length
    ? Math.max(...certs.map((c) => safeNum(c.cumulativeValue)))
    : 0;
  const sum = safeNum(contractSum);
  // MEASURED AGAINST THE WORKS, NOT THE BILL PLUS TAX.
  //
  // contract.contractSum is `subtotal + contingency + tax` (lockContract), so
  // dividing certified money by it counts VAT the contractor never certifies
  // and a contingency that is usually never spent. A project that had earned
  // 80% of everything a certificate can ever pay reported ~71% complete, and
  // could never reach 100% however finished it was. The contract sum is still
  // shown — it IS the contract value — but the percentage uses the base the
  // certificates are actually drawn against.
  const base = worksBaseFor(project, { worksValue, contractSum: sum });
  const lastPercent = base > 0 ? (lastCumulative / base) * 100 : 0;
  const progress = Math.max(0, Math.min(100, safeNum(progressPercent)));

  return {
    contractSum: sum,
    worksValue: base,
    certified,
    certifiedPercent: base > 0 ? (certified / base) * 100 : 0,
    retained,
    paid,
    progress,
    lastPercent,
    notYetValued: Math.max(0, progress - lastPercent),
    count: certs.length,
    settledCount: settled.length,
  };
}

/**
 * What a certificate is drawn against, for a LOCKED contract.
 *
 * WHY NOT contract.contractSum
 *
 * That figure is `subtotal + contingency + tax` (lockContract), so dividing
 * certified money by it counts VAT the contractor never certifies and a
 * contingency that is usually never spent. A project that had earned 80% of
 * everything a certificate can ever pay reported about 71% complete — and could
 * never reach 100% however finished it was — with nothing looking wrong,
 * because both numbers are real.
 *
 * WHY NOT THE LIVE BILL EITHER
 *
 * Locking freezes the contract, and the bill moves afterwards: re-measures,
 * added lines, re-pricing. A denominator recomputed from today's bill would
 * make last month's certificate percentage change by itself.
 *
 * So: the works figures the lock itself stored — measured + provisional +
 * preliminaries, as they were at lock — plus variations approved since, which
 * ARE certifiable. Falls back to the live works figure, and then to the
 * contract sum, so a project locked before those fields existed still reads.
 */
export function worksBaseFor(project, { worksValue = 0, contractSum = 0 } = {}) {
  const c = project?.contract || {};
  const atLock =
    safeNum(c.measuredAtLock) + safeNum(c.provisionalAtLock) + safeNum(c.preliminaryAtLock);
  if (atLock > 0) {
    const variations = (Array.isArray(project?.variations) ? project.variations : [])
      .filter((v) => String(v?.status || "").toLowerCase() === "approved")
      .reduce((a, v) => a + safeNum(v?.amount ?? v?.total), 0);
    return atLock + variations;
  }
  // A contract locked before those figures were stored keeps the behaviour it
  // has always had. The live bill is NOT used as a middle fallback: it moves
  // after a lock — re-measures, added lines, re-pricing — so it can be
  // unrelated to what was signed, and a denominator that drifts would make last
  // month's certificate percentage change by itself.
  return safeNum(contractSum) || safeNum(worksValue);
}

/**
 * The bars in his little chart: one per certificate, plus "Now".
 *
 * Height is the cumulative percentage the certificate reached, so the chart
 * reads as a staircase up to where the work actually is.
 */
export function certificateBars(project, { contractSum = 0, worksValue = 0, progressPercent = 0 } = {}) {
  const certs = Array.isArray(project?.certificates) ? project.certificates : [];
  // Same base as the KPIs above, for the same reason: a staircase drawn
  // against the bill plus VAT never reaches the top of its own chart.
  const sum = worksBaseFor(project, { worksValue, contractSum });
  const bars = certs
    .slice()
    .sort((a, b) => safeNum(a.number) - safeNum(b.number))
    .map((c) => ({
      key: `ipc-${safeNum(c.number)}`,
      label: `IPC ${safeNum(c.number)}`,
      percent: sum > 0 ? Math.max(0, Math.min(100, (safeNum(c.cumulativeValue) / sum) * 100)) : 0,
      status: certificateStatus(c).key,
    }));
  bars.push({
    key: "now",
    label: "Now",
    percent: Math.max(0, Math.min(100, safeNum(progressPercent))),
    status: "now",
  });
  return bars;
}

/** Newest first, which is the order his list reads in. */
export function certificatesNewestFirst(project) {
  const certs = Array.isArray(project?.certificates) ? project.certificates : [];
  return certs.slice().sort((a, b) => safeNum(b.number) - safeNum(a.number));
}

/** The cumulative percentage one certificate reached. */
export function cumulativePercent(certificate, contractSum) {
  const sum = safeNum(contractSum);
  if (sum <= 0) return 0;
  return Math.max(0, Math.min(100, (safeNum(certificate?.cumulativeValue) / sum) * 100));
}
