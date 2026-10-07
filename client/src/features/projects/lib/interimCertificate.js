// The interim payment certificate's arithmetic.
//
// Lifted out of ProjectValuationSummary.jsx so it can be unit-tested. It is a
// payment document: the figure it produces is what a contractor is paid, and
// it was wrong. "Less previous payments" subtracted each earlier valuation's
// GROSS, while the retention line above it is already taken on the whole gross
// to date — so the retention on all previous work was withheld twice, and
// every certificate after the first short-paid by exactly that amount.

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildCertificate(selectedValuation, valuations, valuationSettings, progressTotal) {
  if (!selectedValuation) return null;

  const sorted = [...(valuations || [])].sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || "")),
  );
  const selectedDate = String(selectedValuation.date || "");
  const selectedIndex = sorted.findIndex((entry) => String(entry?.date || "") === selectedDate);
  const valuationNumber = selectedIndex >= 0 ? selectedIndex + 1 : 1;
  const toDateEntries = selectedIndex >= 0 ? sorted.slice(0, selectedIndex + 1) : [selectedValuation];
  const previousEntries = selectedIndex > 0 ? sorted.slice(0, selectedIndex) : [];

  const currentValuationAmount = safeNum(selectedValuation.totalAmount);
  const grossToDate = toDateEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.totalAmount),
    0,
  );
  const previousGross = previousEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.totalAmount),
    0,
  );

  const retentionPct = safeNum(valuationSettings?.retentionPct);
  const vatPct = safeNum(valuationSettings?.vatPct);
  const withholdingPct = safeNum(valuationSettings?.withholdingPct);

  const retentionAmount = grossToDate * retentionPct / 100;
  const netValuationToDate = grossToDate - retentionAmount;
  // "Less previous payments" has to be what was previously PAID, which was
  // each earlier certificate net of its own retention. Subtracting the earlier
  // GROSS instead withheld the retention on all previous work a second time:
  // retentionAmount above is already taken on the whole gross to date, this
  // work included. At 10% retention, a first valuation of ₦100m followed by
  // ₦50m of new work certified ₦35m where ₦45m was due — the contractor was
  // short-paid the ₦10m already held back on valuation 1, on every
  // certificate after the first.
  const retentionFactor = 1 - retentionPct / 100;
  const previousPayments = previousGross * retentionFactor;
  const amountBeforeTax = netValuationToDate - previousPayments;
  const vatAmount = amountBeforeTax * vatPct / 100;
  const withholdingAmount = amountBeforeTax * withholdingPct / 100;
  const amountDue = amountBeforeTax + vatAmount - withholdingAmount;

  const progressKeys = new Set();
  toDateEntries.forEach((entry) => {
    (entry?.items || []).forEach((item, index) => {
      const key =
        item?.itemKey ||
        `${entry?.date || "valuation"}::${item?.itemSn || item?.sn || index}::${item?.description || ""}`;
      progressKeys.add(String(key));
    });
  });
  const fallbackProgressCount = toDateEntries.reduce(
    (sum, entry) => sum + safeNum(entry?.itemCount),
    0,
  );
  const progressCountToDate = progressTotal > 0
    ? Math.min(progressTotal, progressKeys.size || fallbackProgressCount)
    : progressKeys.size || fallbackProgressCount;
  const progressPercentToDate = progressTotal > 0
    ? (progressCountToDate / progressTotal) * 100
    : 0;

  return {
    valuationNumber,
    currentValuationAmount,
    grossToDate,
    previousPayments,
    previousGross,
    // Each earlier valuation with the amount it was actually paid, so the
    // sub-rows under "Less previous payments" add up to the line above them.
    previousEntries: previousEntries.map((entry) => ({
      ...(entry && typeof entry === "object" ? entry : {}),
      netAmount: safeNum(entry?.totalAmount) * retentionFactor,
    })),
    retentionPct,
    retentionAmount,
    netValuationToDate,
    amountBeforeTax,
    vatPct,
    vatAmount,
    withholdingPct,
    withholdingAmount,
    amountDue,
    progressCountToDate,
    progressPercentToDate,
    progressTotal: safeNum(progressTotal),
  };
}
