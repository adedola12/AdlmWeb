// What one interim payment certificate is worth.
//
// WHY THIS IS ITS OWN FILE
//
// It was eleven lines inside a route handler, which meant the only way to check
// the arithmetic on a sixth certificate was to issue six of them against a live
// database. These are the rules that decide what a contractor is paid, so they
// belong somewhere they can be read and tested on their own.
//
// THE CLAMP THAT HID AN OVERPAYMENT
//
// `thisCertificate` used to be `Math.max(0, cumulativeValue - lessPrevious)`,
// while cumulativeValue and lessPrevious were both stored unclamped. When the
// value earned to date falls BELOW what has already been certified — a
// variation certified on IPC 05 and later rejected, or a downward re-measure —
// the true figure is negative. The clamp turned that into ₦0 payable, with
// retention ₦0 and VAT ₦0, and nothing anywhere said that (in the case the
// audit found) ₦6,000,000 of over-certification was sitting unrecovered.
//
// A negative interim certificate is ordinary quantity surveying: it is how an
// overpayment is recovered on the next valuation. So the arithmetic is allowed
// to be negative and the fact is reported, rather than a zero that reads as
// "nothing is due this month".

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pct = (v, fallback = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
};

/**
 * The money on an interim certificate.
 *
 * @param {object} args
 * @param {number} args.cumulativeValue    value earned to date, gross
 * @param {number} args.lessPrevious       the sum of what previous certificates certified
 * @param {number} args.retentionPct       held back on this certificate's own value
 * @param {number} args.retentionReleased  retention handed back on this one
 * @param {number} args.vatPct
 * @param {number} args.whtPct             withholding tax, deducted
 * @returns {{thisCertificate, retentionAmount, netBeforeTax, vatAmount, whtAmount,
 *            netPayable, overCertified, overCertifiedBy}}
 */
export function certificateMoney({
  cumulativeValue,
  lessPrevious,
  retentionPct,
  retentionReleased = 0,
  vatPct,
  whtPct,
} = {}) {
  const cumulative = num(cumulativeValue);
  const previous = num(lessPrevious);

  // NOT clamped. See the note at the top of this file.
  const thisCertificate = cumulative - previous;

  const rPct = pct(retentionPct, 5);
  const vPct = pct(vatPct, 7.5);
  const wPct = pct(whtPct, 2.5);

  // Retention follows the sign of the certificate: on a recovery the retention
  // taken against the over-certified amount is given back with it, otherwise
  // the correction would be the wrong size.
  const retentionAmount = (thisCertificate * rPct) / 100;
  const netBeforeTax = thisCertificate - retentionAmount + num(retentionReleased);
  const vatAmount = (netBeforeTax * vPct) / 100;
  const whtAmount = (netBeforeTax * wPct) / 100;
  const netPayable = netBeforeTax + vatAmount - whtAmount;

  return {
    thisCertificate,
    retentionPct: rPct,
    retentionAmount,
    retentionReleased: num(retentionReleased),
    netBeforeTax,
    vatPct: vPct,
    vatAmount,
    whtPct: wPct,
    whtAmount,
    netPayable,
    // Said out loud, so a screen and a PDF can both explain a negative
    // certificate instead of printing a figure nobody expects.
    overCertified: thisCertificate < 0,
    overCertifiedBy: thisCertificate < 0 ? Math.abs(thisCertificate) : 0,
  };
}

/**
 * What previous certificates have already certified.
 *
 * Sums `thisCertificate`, which is each certificate's own share — NOT its net
 * payable and NOT the cumulative value, either of which would double-count.
 * A negative one (a recovery) subtracts, which is the point of allowing it.
 */
export function certifiedSoFar(certificates) {
  return (Array.isArray(certificates) ? certificates : []).reduce(
    (acc, c) => acc + num(c?.thisCertificate),
    0,
  );
}

/**
 * How far through the contract the work is, as a percentage.
 *
 * AGAINST THE WORKS, NOT AGAINST THE BILL PLUS TAX
 *
 * The obvious denominator is `contract.contractSum`, and it is the wrong one:
 * that figure is `subtotal + contingency + tax` (lockContract), so it includes
 * VAT the contractor never certifies and a contingency that is only spent if it
 * is spent. Dividing certified work by it reports a project that has genuinely
 * earned 80% of everything a certificate can ever pay as roughly 71% complete,
 * and the gap is invisible because both numbers are real.
 *
 * So the denominator is the works figure — measured work plus provisional sums
 * plus approved variations — which is what a certificate is drawn against.
 */
export function percentCertified(cumulativeValue, worksValue) {
  const works = num(worksValue);
  if (works <= 0) return 0;
  return Math.round((num(cumulativeValue) / works) * 1000) / 10;
}

/**
 * What one bill line is worth, at the quantity and rate that actually apply.
 *
 * ONE RULE, BECAUSE TWO PAYMENT DOCUMENTS MUST NOT DISAGREE
 *
 * After a contract is locked a re-measure is recorded in actualQty/actualRate
 * beside the frozen contract figures. computeValueToDate — which feeds the
 * interim CERTIFICATE — read the actuals. The daily valuation log, which feeds
 * the printed Interim Payment Application, read `qty * rate`.
 *
 * So on a line certified at 134 m³ the certificate said ₦11,390,000 and the
 * application printed ₦10,200,000, for the same work, on the same day, from the
 * same project. Whichever the client received first was the one they believed.
 *
 * Both now call this.
 *
 * @param {object} item
 * @param {number} [percentComplete]  0-100; omit for the whole line
 */
export function earnedLineValue(item, percentComplete = 100) {
  const qty = item?.actualQty != null ? num(item.actualQty) : num(item?.qty);
  const rate = item?.actualRate != null ? num(item.actualRate) : num(item?.rate);
  const pct = Math.max(0, Math.min(100, num(percentComplete)));
  return qty * rate * (pct / 100);
}
