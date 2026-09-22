import { describe, it, expect } from "vitest";
import {
  normalizeVariationStatus,
  isApprovedVariation,
  approvedVariationsTotal,
  approvedVariationsEarned,
  variationKpis,
  variationRowsNewestFirst,
  variationStatusLabel,
  variationStatusClass,
} from "./variations.js";

// What every existing project holds: rows with no status at all.
const legacy = [
  { description: "Extra windows", qty: 4, unit: "no", rate: 180_000 },
  { description: "Omit render", qty: 1, unit: "item", rate: -250_000 },
];

describe("variation approval status", () => {
  it("reads a row written before the field existed as approved", () => {
    expect(normalizeVariationStatus(undefined)).toBe("approved");
    expect(normalizeVariationStatus("nonsense")).toBe("approved");
    expect(isApprovedVariation({})).toBe(true);
  });

  it("does not move an existing total", () => {
    expect(approvedVariationsTotal(legacy)).toBe(470_000);
    expect(
      approvedVariationsTotal([
        ...legacy,
        { qty: 1, unit: "item", rate: 9_000_000, status: "pending" },
        { qty: 1, unit: "item", rate: 5_000_000, status: "rejected" },
      ]),
    ).toBe(470_000);
  });

  it("earns only what is approved and executed", () => {
    const rows = [
      { qty: 1, rate: 100, completed: true },
      { qty: 1, rate: 200, completed: true, status: "pending" },
      { qty: 1, rate: 400, completed: false },
    ];
    expect(approvedVariationsEarned(rows)).toBe(100);
  });

  it("splits the KPI row into additions, omissions and waiting", () => {
    const k = variationKpis([
      { qty: 1, rate: 500_000 },
      { qty: 1, rate: -120_000, status: "approved" },
      { qty: 1, rate: 300_000, status: "pending" },
      { qty: 1, rate: 700_000, status: "rejected" },
    ]);
    expect(k.additions).toBe(500_000);
    expect(k.additionsCount).toBe(1);
    expect(k.omissions).toBe(-120_000);
    expect(k.approvedNet).toBe(380_000);
    expect(k.pendingCount).toBe(1);
    expect(k.pendingNet).toBe(300_000);
    expect(k.rejectedCount).toBe(1);
  });

  it("lists newest first but keeps each row's own index and number", () => {
    const rows = variationRowsNewestFirst(legacy);
    expect(rows.map((r) => r.no)).toEqual([2, 1]);
    expect(rows.map((r) => r.index)).toEqual([1, 0]);
    expect(rows[0].amount).toBe(-250_000);
    expect(rows[1].status).toBe("approved");
  });

  it("labels and classes each status", () => {
    expect(variationStatusLabel("pending")).toBe("Pending");
    expect(variationStatusLabel(undefined)).toBe("Approved");
    expect(variationStatusClass("pending")).toBe("v-awaiting");
    expect(variationStatusClass("rejected")).toBe("v-rejected");
    expect(variationStatusClass("approved")).toBe("v-approved");
  });

  it("is worth nothing, not NaN, when the numbers are unusable", () => {
    expect(approvedVariationsTotal([{ qty: "x", rate: "y" }])).toBe(0);
    expect(approvedVariationsTotal(null)).toBe(0);
  });
});
