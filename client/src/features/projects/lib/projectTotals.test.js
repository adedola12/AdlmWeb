// The totals module is the one place a project's money is added up, so these
// tests do two jobs.
//
//   1. They pin the cascade itself (order of operations, the bases each
//      percentage is taken on, which variations count).
//   2. They prove the figure has NOT moved. `legacyBillTotal` below is a
//      verbatim copy of the arithmetic ProjectBillTable carried before this
//      module existed, and `legacyLockContractSum` is the server's lock
//      formula. Every scenario asserts the module agrees with both, so no
//      customer's total changes value because the code was tidied.

import { describe, it, expect } from "vitest";
import projectTotals, {
  approvedVariationsTotal,
  clampPercent,
  isApprovedVariation,
  linkedServicesTotal,
  measuredTotal,
  splitProvisionalSums,
} from "./projectTotals.js";

const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** ProjectBillTable, before S18 (lines 1323-1381 of the old file). */
function legacyBillTotal(p) {
  const grossAmount = (p.items || []).reduce(
    (acc, it) => acc + safeNum(it.qty) * safeNum(it.rate),
    0,
  );
  const variationsTotal = (p.variations || []).reduce(
    (acc, v) => acc + safeNum(v.qty) * safeNum(v.rate),
    0,
  );
  const provisionalTotal = (p.provisionalSums || []).reduce(
    (acc, s) => acc + safeNum(s.amount),
    0,
  );
  const preliminaryAmount =
    ((grossAmount + provisionalTotal) * safeNum(p.preliminaryPercent)) / 100;
  const boqSubtotal = grossAmount + provisionalTotal + preliminaryAmount;
  const contingencyAmount = (boqSubtotal * safeNum(p.contingencyPercent)) / 100;
  const taxAmount =
    ((boqSubtotal + contingencyAmount) * safeNum(p.taxPercent)) / 100;
  const plannedProjectTotal = boqSubtotal + contingencyAmount + taxAmount;
  return { planned: plannedProjectTotal, total: plannedProjectTotal + variationsTotal };
}

/** server/routes/projects.js lockContract() — what a locked contract froze. */
function legacyLockContractSum(p) {
  const measured = (p.items || []).reduce(
    (acc, it) => acc + safeNum(it.qty) * safeNum(it.rate),
    0,
  );
  const provisional = (p.provisionalSums || []).reduce(
    (acc, s) => acc + safeNum(s.amount),
    0,
  );
  const prelim = ((measured + provisional) * safeNum(p.preliminaryPercent)) / 100;
  const subtotal = measured + provisional + prelim;
  const contingency = (subtotal * safeNum(p.contingencyPercent)) / 100;
  const tax = ((subtotal + contingency) * safeNum(p.taxPercent)) / 100;
  return subtotal + contingency + tax;
}

const run = (p) =>
  projectTotals({
    items: p.items,
    provisionalSums: p.provisionalSums,
    variations: p.variations,
    preliminaryPercent: p.preliminaryPercent,
    contingencyPercent: p.contingencyPercent,
    taxPercent: p.taxPercent,
    linkedSummaries: p.linkedSummaries,
  });

// ── The four projects the brief names ─────────────────────────────────────
const UNPRICED = {
  items: [
    { qty: 120, rate: 0 },
    { qty: 40, rate: 0 },
  ],
  provisionalSums: [],
  variations: [],
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
};

const PRICED = {
  items: [
    { qty: 120, rate: 4500 },
    { qty: 40, rate: 12750.5 },
    { qty: 6, rate: 0 },
  ],
  provisionalSums: [],
  variations: [],
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
};

const LOCKED = {
  items: [
    { qty: 120, rate: 4500 },
    { qty: 40, rate: 12750.5 },
  ],
  provisionalSums: [
    { description: "Kitchen fittings", amount: 2500000 },
    { description: "Statutory fees", amount: 180000 },
  ],
  variations: [
    { description: "Extra manholes", qty: 1, rate: 450000 },
    { description: "Omit the render", qty: 1, rate: -120000 },
  ],
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
};

const FULL_CASCADE = {
  items: [{ qty: 1000, rate: 1000 }],
  provisionalSums: [{ description: "Lift", amount: 500000, kind: "pc" }],
  variations: [],
  preliminaryPercent: 10,
  contingencyPercent: 5,
  taxPercent: 7.5,
};

describe("projectTotals — the figure does not move", () => {
  const cases = [
    ["an unpriced bill", UNPRICED],
    ["a priced bill", PRICED],
    ["a locked contract", LOCKED],
    ["a bill with prelims, contingency and VAT set", FULL_CASCADE],
  ];

  for (const [name, p] of cases) {
    it(`matches the old Bill arithmetic for ${name}`, () => {
      const legacy = legacyBillTotal(p);
      const now = run(p);
      expect(now.planned).toBe(legacy.planned);
      expect(now.total).toBe(legacy.total);
    });

    it(`matches what the server freezes at lock for ${name}`, () => {
      expect(run(p).planned).toBe(legacyLockContractSum(p));
    });
  }
});

describe("projectTotals — the cascade", () => {
  it("takes preliminaries on measured work PLUS the sums, not measured alone", () => {
    const t = run(FULL_CASCADE);
    expect(t.measured).toBe(1000000);
    expect(t.sums).toBe(500000);
    // 10% of 1,500,000 — his prototype would give 100,000 here.
    expect(t.prelims).toBe(150000);
    expect(t.subtotal).toBe(1650000);
  });

  it("takes contingency on the sub-total and VAT on sub-total + contingency", () => {
    const t = run(FULL_CASCADE);
    expect(t.contingency).toBe(82500); // 5% of 1,650,000
    expect(t.tax).toBeCloseTo(129937.5, 6); // 7.5% of 1,732,500
    expect(t.planned).toBeCloseTo(1862437.5, 6);
  });

  it("adds approved variations after VAT, keeping planned untouched", () => {
    const t = run(LOCKED);
    expect(t.total - t.planned).toBe(330000); // 450,000 − 120,000
  });

  it("is all zero for an unpriced bill", () => {
    const t = run(UNPRICED);
    expect(t.measured).toBe(0);
    expect(t.planned).toBe(0);
    expect(t.total).toBe(0);
  });

  it("treats a missing percentage as zero rather than inventing a default", () => {
    const t = projectTotals({ measured: 100 });
    expect(t.prelims).toBe(0);
    expect(t.contingency).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(100);
  });

  it("prefers an explicit measured figure over recomputing from items", () => {
    const t = projectTotals({ measured: 42, items: [{ qty: 10, rate: 10 }] });
    expect(t.measured).toBe(42);
  });
});

describe("variation status, read defensively", () => {
  it("counts a variation with no status at all", () => {
    expect(isApprovedVariation({ qty: 1, rate: 10 })).toBe(true);
    expect(approvedVariationsTotal([{ qty: 1, rate: 10 }])).toBe(10);
  });

  it("counts an explicitly approved one", () => {
    expect(approvedVariationsTotal([{ qty: 1, rate: 10, status: "approved" }])).toBe(10);
  });

  it("holds back pending and rejected", () => {
    const list = [
      { qty: 1, rate: 10, status: "approved" },
      { qty: 1, rate: 100, status: "pending" },
      { qty: 1, rate: 1000, status: "rejected" },
    ];
    expect(approvedVariationsTotal(list)).toBe(10);
  });

  it("ignores case and stray whitespace", () => {
    expect(isApprovedVariation({ status: " PENDING " })).toBe(false);
    expect(isApprovedVariation({ status: "Approved" })).toBe(true);
  });

  it("counts an unknown status, because holding money back needs a reason", () => {
    expect(isApprovedVariation({ status: "draft" })).toBe(true);
  });

  it("keeps the total of a project whose variations predate the status field", () => {
    const before = LOCKED.variations.reduce((a, v) => a + v.qty * v.rate, 0);
    expect(approvedVariationsTotal(LOCKED.variations)).toBe(before);
  });
});

describe("PC sums and provisional sums", () => {
  it("files a row with no kind as provisional, so old rows behave as today", () => {
    const s = splitProvisionalSums([{ amount: 100 }, { amount: 50 }]);
    expect(s.pcTotal).toBe(0);
    expect(s.provisionalTotal).toBe(150);
    expect(s.total).toBe(150);
  });

  it("separates the two groups but adds up to the same figure", () => {
    const rows = [
      { amount: 100, kind: "pc" },
      { amount: 50, kind: "provisional" },
      { amount: 25 },
    ];
    const s = splitProvisionalSums(rows);
    expect(s.pcTotal).toBe(100);
    expect(s.provisionalTotal).toBe(75);
    expect(s.total).toBe(175);
    expect(projectTotals({ measured: 0, provisionalSums: rows }).sums).toBe(175);
  });

  it("keeps each row's index in the stored list, so an edit writes back correctly", () => {
    const s = splitProvisionalSums([{ amount: 1 }, { amount: 2, kind: "pc" }, { amount: 3 }]);
    expect(s.pc.map((x) => x.index)).toEqual([1]);
    expect(s.provisional.map((x) => x.index)).toEqual([0, 2]);
  });

  it("survives a missing or malformed list", () => {
    expect(splitProvisionalSums(null).total).toBe(0);
    expect(splitProvisionalSums([{ amount: "nonsense" }]).total).toBe(0);
  });
});

describe("linked services stay outside the cascade", () => {
  const withLink = {
    ...FULL_CASCADE,
    linkedSummaries: [{ live: { total: 9000000 } }, { snapshot: { total: 1000000 } }],
  };

  it("reports the linked figure separately", () => {
    expect(run(withLink).linked).toBe(10000000);
    expect(linkedServicesTotal(withLink.linkedSummaries)).toBe(10000000);
  });

  it("does not fold it into the estimated total", () => {
    expect(run(withLink).total).toBe(run(FULL_CASCADE).total);
  });

  it("prefers the live figure over the frozen snapshot", () => {
    expect(linkedServicesTotal([{ live: { total: 5 }, snapshot: { total: 99 } }])).toBe(5);
  });
});

describe("small helpers", () => {
  it("clamps a percentage to 0–100 by default", () => {
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent("7.5")).toBe(7.5);
    expect(clampPercent("")).toBe(0);
  });

  it("clamps to a caller-chosen ceiling", () => {
    expect(clampPercent(80, 50)).toBe(50);
  });

  it("adds up measured work from bill lines", () => {
    expect(measuredTotal([{ qty: 2, rate: 3 }, { qty: 4, rate: 5 }])).toBe(26);
    expect(measuredTotal(undefined)).toBe(0);
  });
});
