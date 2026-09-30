import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certificateMoney,
  certifiedSoFar,
  earnedLineValue,
  percentCertified,
} from "./certificateMaths.js";

// Six valuations to 80%, which is the scenario nobody had run end to end.

const RATES = { retentionPct: 5, vatPct: 7.5, whtPct: 2.5 };

test("one certificate, the whole way down", () => {
  const c = certificateMoney({ cumulativeValue: 20_000_000, lessPrevious: 0, ...RATES });
  assert.equal(c.thisCertificate, 20_000_000);
  assert.equal(c.retentionAmount, 1_000_000); // 5%
  assert.equal(c.netBeforeTax, 19_000_000);
  assert.equal(c.vatAmount, 1_425_000); // 7.5% of 19m
  assert.equal(c.whtAmount, 475_000); // 2.5% of 19m
  assert.equal(c.netPayable, 19_950_000);
  assert.equal(c.overCertified, false);
});

test("SIX certificates accumulate without double-counting or dropping one", () => {
  // The question that decides whether a client is over- or under-paid.
  const steps = [20_000_000, 34_000_000, 46_000_000, 58_000_000, 70_000_000, 80_000_000];
  const issued = [];
  for (const cumulative of steps) {
    const c = certificateMoney({
      cumulativeValue: cumulative,
      lessPrevious: certifiedSoFar(issued),
      ...RATES,
    });
    issued.push(c);
  }

  // Each certificate is only its own share.
  assert.deepEqual(
    issued.map((c) => c.thisCertificate),
    [20_000_000, 14_000_000, 12_000_000, 12_000_000, 12_000_000, 10_000_000],
  );
  // And the six together are exactly the value earned — not more, not less.
  assert.equal(certifiedSoFar(issued), 80_000_000);
  // Retention held across the six is 5% of the lot, once.
  assert.equal(
    issued.reduce((a, c) => a + c.retentionAmount, 0),
    4_000_000,
  );
});

test("retention is taken on THIS certificate, not on the cumulative figure", () => {
  // Taking 5% of the cumulative value each time would hold ₦4,000,000 on the
  // sixth certificate alone and roughly ₦13m across the six.
  const second = certificateMoney({
    cumulativeValue: 34_000_000,
    lessPrevious: 20_000_000,
    ...RATES,
  });
  assert.equal(second.retentionAmount, 700_000); // 5% of 14m, not of 34m
});

test("A DOWNWARD MOVE IS A RECOVERY, NOT A ZERO", () => {
  // IPC 05 certified a ₦6,000,000 variation that is later rejected, so the
  // value earned drops below what has been certified. The old clamp showed
  // ₦0 payable with retention ₦0 and said nothing about the ₦6,000,000
  // outstanding.
  const c = certificateMoney({
    cumulativeValue: 74_000_000,
    lessPrevious: 80_000_000,
    ...RATES,
  });
  assert.equal(c.thisCertificate, -6_000_000);
  assert.equal(c.overCertified, true);
  assert.equal(c.overCertifiedBy, 6_000_000);
  // The retention taken against that work comes back with it, or the correction
  // would be the wrong size.
  assert.equal(c.retentionAmount, -300_000);
  assert.equal(c.netBeforeTax, -5_700_000);
  // The same multiplier a positive certificate gets: net + 7.5% VAT - 2.5% WHT
  // is net x 1.05, so -5,700,000 recovers -5,985,000. A recovery that did not
  // reverse the tax would leave the contractor carrying VAT on work that was
  // taken back off them.
  assert.equal(c.netPayable, -5_985_000);
  assert.equal(c.netPayable, Math.round(c.netBeforeTax * 1.05));
});

test("a recovery SUBTRACTS from what has been certified so far", () => {
  // So the next certificate starts from the corrected position rather than
  // carrying the overpayment forward for ever.
  const issued = [
    { thisCertificate: 80_000_000 },
    { thisCertificate: -6_000_000 },
  ];
  assert.equal(certifiedSoFar(issued), 74_000_000);
});

test("retention released is added back, and taxed with the rest", () => {
  // Half the retention at practical completion, on top of the month's work.
  const c = certificateMoney({
    cumulativeValue: 80_000_000,
    lessPrevious: 70_000_000,
    retentionReleased: 2_000_000,
    ...RATES,
  });
  assert.equal(c.thisCertificate, 10_000_000);
  assert.equal(c.retentionAmount, 500_000);
  assert.equal(c.netBeforeTax, 11_500_000); // 10m - 0.5m + 2m
  assert.equal(c.retentionReleased, 2_000_000);
});

test("certifiedSoFar counts each certificate's OWN share", () => {
  // Summing netPayable would count VAT; summing cumulativeValue would count
  // the first certificate six times.
  assert.equal(certifiedSoFar([{ thisCertificate: 5 }, { thisCertificate: 7 }]), 12);
  assert.equal(certifiedSoFar([]), 0);
  assert.equal(certifiedSoFar(null), 0);
});

test("percent complete is measured against the WORKS, not the bill plus tax", () => {
  // contract.contractSum is subtotal + contingency + tax. A project that has
  // earned 80% of everything a certificate can ever pay reports as ~71% if that
  // is the denominator, and both numbers are real so nothing looks wrong.
  const works = 100_000_000;
  const contractSumWithTax = 112_875_000; // +5% contingency, +7.5% VAT
  assert.equal(percentCertified(80_000_000, works), 80);
  assert.notEqual(percentCertified(80_000_000, contractSumWithTax), 80);
  assert.equal(percentCertified(80_000_000, contractSumWithTax), 70.9);
});

test("percent complete survives a contract worth nothing yet", () => {
  assert.equal(percentCertified(0, 0), 0);
  assert.equal(percentCertified(100, 0), 0);
  assert.equal(percentCertified(100, null), 0);
});

test("a percentage that is not a number does not become NaN money", () => {
  const c = certificateMoney({
    cumulativeValue: 1_000_000,
    lessPrevious: 0,
    retentionPct: "abc",
    vatPct: undefined,
    whtPct: null,
  });
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "number") assert.equal(Number.isFinite(v), true, k);
  }
  assert.equal(c.retentionPct, 5, "falls back to the standard 5%");
});

// ── One line, one value, two documents ──
//
// After a lock, a re-measure lives in actualQty/actualRate beside the frozen
// contract figures. computeValueToDate (the interim CERTIFICATE) read the
// actuals; the daily valuation log (the printed Interim Payment Application)
// read qty * rate. So a line re-measured from 120 m³ to 134 was certified at
// ₦11,390,000 and printed at ₦10,200,000, same work, same day.

const CONCRETE = { qty: 120, rate: 85_000 };

test("a re-measured line is worth the measured quantity", () => {
  assert.equal(earnedLineValue({ ...CONCRETE, actualQty: 134 }), 11_390_000);
});

test("an unmeasured line is worth its contract figures", () => {
  assert.equal(earnedLineValue(CONCRETE), 10_200_000);
  assert.equal(earnedLineValue({ ...CONCRETE, actualQty: null }), 10_200_000);
});

test("a measured ZERO is an omission, not a missing measurement", () => {
  // The null-is-not-a-zero rule, on the money side: 0 means the work was
  // measured and there is none of it.
  assert.equal(earnedLineValue({ ...CONCRETE, actualQty: 0 }), 0);
});

test("an agreed actual RATE is used too", () => {
  assert.equal(earnedLineValue({ ...CONCRETE, actualRate: 90_000 }), 10_800_000);
  assert.equal(earnedLineValue({ ...CONCRETE, actualQty: 134, actualRate: 90_000 }), 12_060_000);
});

test("part-complete work earns part of the line", () => {
  assert.equal(earnedLineValue(CONCRETE, 50), 5_100_000);
  assert.equal(earnedLineValue({ ...CONCRETE, actualQty: 134 }, 50), 5_695_000);
});

test("a percentage outside 0-100 cannot earn more than the line", () => {
  assert.equal(earnedLineValue(CONCRETE, 150), 10_200_000);
  assert.equal(earnedLineValue(CONCRETE, -20), 0);
});

test("nothing priced earns nothing, and never NaN", () => {
  for (const it of [{}, null, { qty: "abc", rate: "x" }, { qty: 10 }]) {
    const v = earnedLineValue(it);
    assert.equal(Number.isFinite(v), true, JSON.stringify(it));
    assert.equal(v, 0);
  }
});
