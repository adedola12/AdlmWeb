import { describe, it, expect } from "vitest";
import { buildCertificate } from "./interimCertificate.js";

// 10% retention, no VAT and no withholding, so the retention arithmetic is the
// only thing moving.
const settings = (over = {}) => ({
  retentionPct: 10,
  vatPct: 0,
  withholdingPct: 0,
  ...over,
});

// A valuation's `totalAmount` is the work valued in THAT period, not a
// cumulative figure — buildCertificate sums them to get the gross to date.
const val = (date, totalAmount) => ({ date, totalAmount, items: [], itemCount: 0 });

// ₦100m, then ₦50m, then ₦30m of new work.
const V1 = val("2026-03-31", 100_000_000);
const V2 = val("2026-04-30", 50_000_000);
const V3 = val("2026-05-31", 30_000_000);

describe("the interim payment certificate", () => {
  it("pays the first valuation less its retention", () => {
    const c = buildCertificate(V1, [V1], settings(), 0);
    expect(c.grossToDate).toBe(100_000_000);
    expect(c.retentionAmount).toBe(10_000_000);
    expect(c.netValuationToDate).toBe(90_000_000);
    expect(c.previousPayments).toBe(0);
    expect(c.amountDue).toBe(90_000_000);
  });

  it("does not withhold the previous retention a second time", () => {
    // THE BUG. ₦100m certified, then ₦50m of new work. ₦45m is due: the new
    // work less its own 10%. Subtracting the previous GROSS of ₦100m from a net
    // to date of ₦135m gave ₦35m — short by the ₦10m already held on
    // valuation 1.
    const c = buildCertificate(V2, [V1, V2], settings(), 0);
    expect(c.grossToDate).toBe(150_000_000);
    expect(c.retentionAmount).toBe(15_000_000);
    expect(c.netValuationToDate).toBe(135_000_000);
    expect(c.previousPayments).toBe(90_000_000); // what was actually paid
    expect(c.amountBeforeTax).toBe(45_000_000);
    expect(c.amountDue).toBe(45_000_000);
  });

  it("holds across a third certificate, so the error cannot accumulate", () => {
    const c = buildCertificate(V3, [V1, V2, V3], settings(), 0);
    // ₦30m of new work this period, less 10% → ₦27m.
    expect(c.amountDue).toBe(27_000_000);
    // And the certificates sum to the net of the whole job.
    expect(90_000_000 + 45_000_000 + 27_000_000).toBe(180_000_000 * 0.9);
  });

  it("the previous-payment sub-rows add up to the line they sit under", () => {
    // The certificate lists each earlier valuation beneath "Less previous
    // payments". Listed gross under a net total, the document did not add up.
    const c = buildCertificate(V3, [V1, V2, V3], settings(), 0);
    const listed = c.previousEntries.reduce((a, e) => a + e.netAmount, 0);
    // ₦100m → ₦90m paid, ₦50m → ₦45m paid, and the two add to the ₦135m the
    // "Less previous payments" line shows above them.
    expect(c.previousEntries.map((e) => e.netAmount)).toEqual([90_000_000, 45_000_000]);
    expect(listed).toBeCloseTo(c.previousPayments, 6);
  });

  it("keeps each earlier entry's own fields on the row", () => {
    const c = buildCertificate(V2, [V1, V2], settings(), 0);
    expect(c.previousEntries[0].date).toBe("2026-03-31");
    expect(c.previousEntries[0].totalAmount).toBe(100_000_000);
  });

  it("zero retention pays the full new work", () => {
    const c = buildCertificate(V2, [V1, V2], settings({ retentionPct: 0 }), 0);
    expect(c.retentionAmount).toBe(0);
    expect(c.previousPayments).toBe(100_000_000);
    expect(c.amountDue).toBe(50_000_000);
  });

  it("applies VAT and withholding to the amount actually due", () => {
    const c = buildCertificate(
      V2,
      [V1, V2],
      settings({ vatPct: 7.5, withholdingPct: 5 }),
      0,
    );
    // ₦45m due, +7.5% VAT, −5% WHT.
    expect(c.amountBeforeTax).toBe(45_000_000);
    expect(c.vatAmount).toBeCloseTo(3_375_000, 6);
    expect(c.withholdingAmount).toBeCloseTo(2_250_000, 6);
    expect(c.amountDue).toBeCloseTo(46_125_000, 6);
  });

  it("numbers the valuation by its place in the sequence, not by arrival", () => {
    // Deliberately out of order.
    const c = buildCertificate(V2, [V2, V1], settings(), 0);
    expect(c.valuationNumber).toBe(2);
  });

  it("no selected valuation is null rather than a throw", () => {
    expect(buildCertificate(null, [], settings(), 0)).toBe(null);
  });

  it("survives a junk amount without producing NaN money", () => {
    const v1 = { date: "2026-03-31", totalAmount: "n/a", items: [] };
    const c = buildCertificate(v1, [v1], settings(), 0);
    expect(c.grossToDate).toBe(0);
    expect(c.amountDue).toBe(0);
  });
});

describe("the sub-rows add up to the line above them", () => {
  // "Less previous payments" is each earlier certificate NET of its own
  // retention. Three surfaces print the sub-rows — the PDF, the spreadsheet and
  // the screen — and two of them printed the GROSS, so at 10% retention a first
  // valuation of ₦100m showed "₦100,000,000" beneath a total of "₦90,000,000".
  it("every previous entry carries the amount actually paid", () => {
    const c = buildCertificate(V2, [V1, V2], settings(), 0);
    expect(c.previousEntries).toHaveLength(1);
    expect(c.previousEntries[0].netAmount).toBe(90_000_000);
    // And that is exactly the "Less previous payments" line.
    expect(c.previousPayments).toBe(90_000_000);
    const listed = c.previousEntries.reduce((a, e) => a + e.netAmount, 0);
    expect(listed).toBe(c.previousPayments);
  });

  it("holds over SIX valuations, not just the second", () => {
    const six = [V1, V2, V3, val("2026-06-30", 20_000_000), val("2026-07-31", 20_000_000), val("2026-08-31", 10_000_000)];
    const c = buildCertificate(six[5], six, settings(), 0);
    const listed = c.previousEntries.reduce((a, e) => a + e.netAmount, 0);
    expect(c.previousEntries).toHaveLength(5);
    expect(listed).toBeCloseTo(c.previousPayments, 6);
  });

  it("the gross is still available, and is NOT what the sub-rows show", () => {
    const c = buildCertificate(V2, [V1, V2], settings(), 0);
    expect(c.previousGross).toBe(100_000_000);
    expect(c.previousEntries[0].netAmount).not.toBe(c.previousEntries[0].totalAmount);
  });
});
