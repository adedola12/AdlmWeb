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

/**
 * The per-line snapshot for a certificate being issued.
 *
 * One row per bill line that MOVED in this certificate's period, carrying the
 * figures the money was actually worked out at and what the period earned on it.
 * A line standing where it stood last month is not part of this claim, and
 * previousSnapshotLines (below) is what keeps its position findable.
 *
 * WHY `earnedThisPeriod` IS TAKEN FROM THE PREVIOUS CERTIFICATE'S OWN ROWS
 *
 * A certificate is cumulative less previously certified, and the same has to be
 * true line by line or the parts will not sum to the whole. Recomputing a line's
 * previous position from the project is exactly the mistake this snapshot exists to
 * end: the project has moved on, and asking it what June looked like gets July's
 * answer. So the previous position comes from the previous certificates' stored
 * rows, which cannot move.
 *
 * A certificate issued before snapshots existed has no rows, so there is nothing to
 * subtract and every line reads its full cumulative value as this period's. That is
 * stated rather than hidden: `basis` says which it is, so a reader is never left to
 * assume a breakdown reconciles when it cannot.
 *
 * @param {object[]} items          the project's bill lines, as they stand now
 * @param {function} factorFor      (item) => 0..1, the share earned — the caller's
 *   valuationFactor, so the snapshot and the certificate total agree by construction
 * @param {object[]} previousLines  previousSnapshotLines(previousCerts), or []
 * @param {function} identityFor    (item, index) => string, the caller's itemIdentity
 * @returns {{ lines: object[], basis: "previous-certificate" | "no-previous-snapshot" }}
 */
export function certificateLineSnapshot({
  items = [],
  factorFor,
  previousLines = [],
  identityFor,
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const before = new Map();
  for (const row of Array.isArray(previousLines) ? previousLines : []) {
    const k = String(row?.itemKey || "");
    if (k) before.set(k, num(row?.earned));
  }
  const basis = before.size > 0 ? "previous-certificate" : "no-previous-snapshot";

  const lines = [];
  list.forEach((it, index) => {
    const factor = typeof factorFor === "function" ? num(factorFor(it)) : 0;
    const pct = Math.max(0, Math.min(100, factor * 100));
    const earned = earnedLineValue(it, pct);
    const itemKey = typeof identityFor === "function" ? String(identityFor(it, index)) : "";
    const was = before.has(itemKey) ? before.get(itemKey) : 0;
    // ONLY THE LINES THAT MOVED. A certificate is a claim for a period, so a line
    // standing at the same 60% it stood at last month is not part of this claim and
    // does not belong on it — and a 2,000-line bill would otherwise print 1,950 rows
    // of "0.00 this period" on every certificate.
    //
    // It is also what keeps the stored snapshot bounded. A row is 284 bytes; at a
    // row per bill line per certificate, a 2,000-line bill with three years of
    // monthly certificates reaches 19.5MB and breaches MongoDB's 16MB document
    // limit — the project would simply stop saving. Storing only movement makes the
    // size proportional to work done rather than to bill size times certificate
    // count, which is the thing that was unbounded.
    //
    // previousSnapshotLines therefore merges across ALL previous certificates, not
    // just the newest, or an untouched line would lose its position and be paid for
    // twice. A line that has gone BACKWARDS is movement too: its negative figure is
    // what the certificate is recovering.
    if (Math.abs(earned - was) <= 0.005) return;
    const usesActuals = it?.actualQty != null || it?.actualRate != null;
    lines.push({
      itemKey,
      sn: num(it?.sn) || index + 1,
      description: String(it?.description || ""),
      unit: String(it?.unit || ""),
      qty: it?.actualQty != null ? num(it.actualQty) : num(it?.qty),
      rate: it?.actualRate != null ? num(it.actualRate) : num(it?.rate),
      fromActuals: usesActuals,
      percentComplete: pct,
      earned,
      earnedThisPeriod: earned - was,
    });
  });
  return { lines, basis };
}

/**
 * Each line's last certified position, merged across EVERY previous certificate.
 *
 * A certificate stores only the lines that moved in its period (see
 * certificateLineSnapshot), so no single certificate holds the whole picture: a
 * line certified in June and untouched in July appears on June's certificate and
 * not on July's. Reading only the newest one would therefore find no position for
 * it and certify the work a second time.
 *
 * Merged in certificate NUMBER order, last writer per line wins. Number rather
 * than array position because a recovery certificate can be inserted and the
 * stored order is not a guarantee.
 *
 * Returns [] when no previous certificate carries a snapshot, which is every
 * project whose certificates predate them. certificateLineSnapshot reports that
 * as its `basis` rather than quietly presenting cumulative figures as
 * per-period ones.
 */
export function previousSnapshotLines(previousCerts = []) {
  const withLines = (Array.isArray(previousCerts) ? previousCerts : []).filter(
    (c) => Array.isArray(c?.lines) && c.lines.length,
  );
  if (!withLines.length) return [];
  const byNumber = [...withLines].sort((a, b) => num(a?.number) - num(b?.number));
  const latest = new Map();
  for (const cert of byNumber) {
    for (const row of cert.lines) {
      const k = String(row?.itemKey || "");
      if (k) latest.set(k, row);
    }
  }
  return [...latest.values()];
}
