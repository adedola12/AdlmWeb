import { describe, it, expect } from "vitest";
import {
  VALUATION_VIEWS,
  certificateBars,
  certificateStatus,
  certificatesNewestFirst,
  contractIsLocked,
  cumulativePercent,
  lockChecklist,
  readyToLock,
  resolveValuationView,
  valuationKpis,
  worksBaseFor,
} from "./valuationsModel.js";

// His valuations() (work-proj.js:1508-1575). WORK.md §13: "Valuations stay
// locked until the contract is, with a checklist saying why."

const bill = (over = {}) => ({
  code: "BQ-1",
  qty: 100,
  rate: 1_000,
  percentComplete: 0,
  ...over,
});

const project = (over = {}) => ({
  contract: { locked: true, lockedAt: "2026-09-01", contractSum: 100_000_000, tenderedAt: "2026-08-15" },
  valuationSettings: { retentionPct: 5, vatPct: 7.5, withholdingPct: 2.5 },
  items: [bill(), bill({ code: "BQ-2" })],
  variations: [],
  certificates: [
    {
      number: 1,
      date: "2026-09-10",
      cumulativeValue: 30_000_000,
      thisCertificate: 30_000_000,
      retentionAmount: 1_500_000,
      retentionReleased: 0,
      netPayable: 29_212_500,
      status: "approved",
    },
    {
      number: 2,
      date: "2026-09-24",
      cumulativeValue: 45_000_000,
      thisCertificate: 15_000_000,
      retentionAmount: 750_000,
      retentionReleased: 0,
      netPayable: 14_606_250,
      status: "draft",
    },
  ],
  ...over,
});

describe("the gate", () => {
  it("is the contract's own lock, not the stage label", () => {
    // The stage is a label; the lock is the fact. Where they disagree the
    // contract wins.
    expect(contractIsLocked(project())).toBe(true);
    expect(contractIsLocked(project({ contract: { locked: false }, stage: "locked" }))).toBe(false);
    expect(contractIsLocked(null)).toBe(false);
  });

  it("says every bill item is priced when it is", () => {
    const checks = lockChecklist(project());
    expect(checks.find((c) => c.key === "priced")).toMatchObject({
      ok: true,
      text: "Every bill item is priced",
    });
  });

  it("counts what still needs a rate, and says it in the singular when it is one", () => {
    const one = project({ items: [bill(), bill({ code: "BQ-2", rate: 0 })] });
    expect(lockChecklist(one).find((c) => c.key === "priced")).toMatchObject({
      ok: false,
      text: "1 bill item still needs a rate",
    });
    const two = project({ items: [bill({ rate: 0 }), bill({ code: "BQ-2", rate: 0 })] });
    expect(lockChecklist(two).find((c) => c.key === "priced").text).toBe(
      "2 bill items still need a rate",
    );
  });

  it("reports whether the bill has gone to tender", () => {
    expect(lockChecklist(project()).find((c) => c.key === "tendered").ok).toBe(true);
    const untendered = project({ contract: { locked: false } });
    expect(lockChecklist(untendered).find((c) => c.key === "tendered")).toMatchObject({
      ok: false,
      text: "The bill has not gone to tender yet",
    });
  });

  it("leaves the model check out entirely when nobody has checked the model", () => {
    // His third check is "bill and model agree". We carry no drift list, and
    // asserting agreement nobody verified would be worse than saying nothing.
    expect(lockChecklist(project()).map((c) => c.key)).toEqual(["priced", "tendered"]);
  });

  it("includes it when a drift list is passed", () => {
    const withDrift = lockChecklist(project(), { drift: [{ item: 0 }, { item: 3 }] });
    expect(withDrift.find((c) => c.key === "model")).toMatchObject({
      ok: false,
      text: "The model has 2 changes to review",
    });
    const clean = lockChecklist(project(), { drift: [] });
    expect(clean.find((c) => c.key === "model")).toMatchObject({
      ok: true,
      text: "Bill and model agree",
    });
  });

  it("knows when the project is one step from the lock", () => {
    expect(readyToLock({ stage: "tendered" })).toBe(true);
    expect(readyToLock({ stage: "priced" })).toBe(false);
  });
});

describe("the three views", () => {
  it("are Certificates, Variations and Final account", () => {
    expect(VALUATION_VIEWS.map((v) => v.key)).toEqual(["certs", "variations", "final"]);
  });

  it("falls back to Certificates", () => {
    expect(resolveValuationView("final")).toBe("final");
    expect(resolveValuationView("nonsense")).toBe("certs");
  });
});

describe("a certificate's status", () => {
  it("keeps our three, rather than borrowing his", () => {
    // His were draft | awaiting | approved. Ours are draft | approved | paid —
    // "paid" is a real state his fixture had no idea about, and calling it
    // "approved" would lose it.
    expect(certificateStatus({ status: "draft" }).label).toBe("Draft");
    expect(certificateStatus({ status: "approved" }).label).toBe("Approved");
    expect(certificateStatus({ status: "paid" }).label).toBe("Paid");
  });

  it("treats anything unrecognised as a draft", () => {
    expect(certificateStatus({ status: "who-knows" }).label).toBe("Draft");
    expect(certificateStatus({}).label).toBe("Draft");
  });
});

describe("his five figures", () => {
  const k = () => valuationKpis(project(), { contractSum: 100_000_000, progressPercent: 60 });

  it("counts only what has been certified — a draft is not money", () => {
    // IPC 2 is still a draft, so its £15m has not been certified.
    expect(k().certified).toBe(30_000_000);
    expect(k().certifiedPercent).toBe(30);
  });

  it("counts a paid certificate too", () => {
    const paid = project();
    paid.certificates[1].status = "paid";
    const out = valuationKpis(paid, { contractSum: 100_000_000, progressPercent: 60 });
    expect(out.certified).toBe(45_000_000);
  });

  it("holds retention net of anything released", () => {
    const released = project();
    released.certificates[0].retentionReleased = 500_000;
    const out = valuationKpis(released, { contractSum: 100_000_000 });
    expect(out.retained).toBe(1_000_000);
  });

  it("totals what has actually been paid, after VAT and WHT", () => {
    expect(k().paid).toBe(29_212_500);
  });

  it("says how much work is done but not yet valued", () => {
    // 60% done, and the last certificate reached 45%.
    expect(k().progress).toBe(60);
    expect(k().lastPercent).toBe(45);
    expect(k().notYetValued).toBe(15);
  });

  it("never reports negative unvalued work", () => {
    const out = valuationKpis(project(), { contractSum: 100_000_000, progressPercent: 10 });
    expect(out.notYetValued).toBe(0);
  });

  it("does not divide by a contract sum of zero", () => {
    const out = valuationKpis(project(), { contractSum: 0, progressPercent: 60 });
    expect(out.certifiedPercent).toBe(0);
    expect(out.lastPercent).toBe(0);
  });

  it("is safe on a contract with no certificates at all", () => {
    const out = valuationKpis(project({ certificates: [] }), { contractSum: 100_000_000 });
    expect(out).toMatchObject({ certified: 0, retained: 0, paid: 0, count: 0 });
  });
});

describe("his little chart", () => {
  it("draws one bar per certificate, in number order, plus Now", () => {
    const bars = certificateBars(project(), { contractSum: 100_000_000, progressPercent: 60 });
    expect(bars.map((b) => b.label)).toEqual(["IPC 1", "IPC 2", "Now"]);
  });

  it("makes each bar the cumulative percentage it reached", () => {
    const bars = certificateBars(project(), { contractSum: 100_000_000, progressPercent: 60 });
    expect(bars[0].percent).toBe(30);
    expect(bars[1].percent).toBe(45);
    expect(bars[2].percent).toBe(60);
  });

  it("carries each certificate's status, so the bar can be coloured by it", () => {
    const bars = certificateBars(project(), { contractSum: 100_000_000 });
    expect(bars[0].status).toBe("approved");
    expect(bars[1].status).toBe("draft");
    expect(bars[2].status).toBe("now");
  });

  it("clamps a bar that would run off the top", () => {
    const over = project();
    over.certificates[0].cumulativeValue = 200_000_000;
    const bars = certificateBars(over, { contractSum: 100_000_000, progressPercent: 300 });
    expect(bars[0].percent).toBe(100);
    expect(bars[2].percent).toBe(100);
  });
});

describe("the list", () => {
  it("reads newest first", () => {
    expect(certificatesNewestFirst(project()).map((c) => c.number)).toEqual([2, 1]);
  });

  it("does not mutate the project's own array", () => {
    const p = project();
    certificatesNewestFirst(p);
    expect(p.certificates.map((c) => c.number)).toEqual([1, 2]);
  });

  it("gives each row its cumulative percentage", () => {
    expect(cumulativePercent({ cumulativeValue: 45_000_000 }, 100_000_000)).toBe(45);
    expect(cumulativePercent({ cumulativeValue: 45_000_000 }, 0)).toBe(0);
  });
});

describe("what a certificate percentage is measured against", () => {
  // contract.contractSum is subtotal + contingency + tax. Dividing certified
  // money by it counts VAT the contractor never certifies and a contingency
  // usually never spent: a job that had earned 80% of everything a certificate
  // can ever pay reported ~71%, and could never reach 100% however finished.

  const locked = (over = {}) => ({
    contract: {
      locked: true,
      measuredAtLock: 100_000_000,
      provisionalAtLock: 0,
      preliminaryAtLock: 0,
      contingencyAtLock: 5_000_000,
      taxAtLock: 7_875_000,
      contractSum: 112_875_000,
    },
    variations: [],
    certificates: [],
    ...over,
  });

  it("uses the works figures the LOCK stored, not the contract sum", () => {
    expect(worksBaseFor(locked(), { contractSum: 112_875_000 })).toBe(100_000_000);
  });

  it("so 80,000,000 certified reads as 80%, not 71%", () => {
    const p = locked({
      certificates: [
        { number: 1, cumulativeValue: 80_000_000, thisCertificate: 80_000_000, status: "approved" },
      ],
    });
    const k = valuationKpis(p, { contractSum: 112_875_000, progressPercent: 80 });
    expect(Math.round(k.certifiedPercent)).toBe(80);
    // And the contract sum is still reported — it IS the contract value.
    expect(k.contractSum).toBe(112_875_000);
  });

  it("counts approved variations, which are certifiable", () => {
    // QTY AND RATE, which is what a variation actually stores.
    //
    // This test used to pass `{ status, amount }` — and so did the code, which read
    // `v.amount ?? v.total`. VariationSchema has neither field
    // (server/models/TakeoffProject.js:256-303), so the term was zero on every
    // real project while the test was green: the test and the code agreed on a
    // field the database never produces, which is the one way a dead branch keeps
    // its coverage.
    const p = locked({
      variations: [
        { status: "approved", qty: 1, unit: "item", rate: 10_000_000 },
        { status: "pending", qty: 1, unit: "item", rate: 50_000_000 },
      ],
    });
    expect(worksBaseFor(p, { contractSum: 112_875_000 })).toBe(110_000_000);
  });

  it("counts an omission against the base, because an omission is certifiable too", () => {
    const p = locked({
      variations: [{ status: "approved", qty: 1, unit: "item", rate: -4_000_000 }],
    });
    expect(worksBaseFor(p, { contractSum: 112_875_000 })).toBe(96_000_000);
  });

  it("reads a variation with NO status as approved, like the rest of the build", () => {
    // The server's own default, variationsModel.variationStatus and
    // features/projects/lib/projectTotals.js all read an absent status as approved.
    // A strict === "approved" here excluded every grandfathered row.
    const p = locked({ variations: [{ qty: 1, unit: "item", rate: 10_000_000 }] });
    expect(worksBaseFor(p, { contractSum: 112_875_000 })).toBe(110_000_000);
  });

  it("ignores a rejected variation", () => {
    const p = locked({
      variations: [{ status: "rejected", qty: 1, unit: "item", rate: 10_000_000 }],
    });
    expect(worksBaseFor(p, { contractSum: 112_875_000 })).toBe(100_000_000);
  });

  it("a contract locked before those figures existed keeps its old base", () => {
    // Not the live bill: that moves after a lock, so a denominator taken from
    // it would make last month's percentage change by itself.
    const legacy = { contract: { locked: true, contractSum: 100_000_000 }, variations: [] };
    expect(worksBaseFor(legacy, { worksValue: 2_000_000, contractSum: 100_000_000 })).toBe(
      100_000_000,
    );
  });

  it("never divides by nothing", () => {
    const k = valuationKpis({ certificates: [] }, { contractSum: 0, progressPercent: 0 });
    expect(Number.isFinite(k.certifiedPercent)).toBe(true);
    expect(k.certifiedPercent).toBe(0);
  });
});
