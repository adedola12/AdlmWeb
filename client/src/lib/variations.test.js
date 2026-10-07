import { describe, it, expect } from "vitest";
import {
  normalizeVariationStatus,
  isApprovedVariation,
  approvedVariationsTotal,
  approvedVariationsEarned,
  variationKpis,
  variationRowsNewestFirst,
  selAfterVariationWrite,
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

// ── Raising a variation must not cost the QS their unsaved Bill ──────────
//
// A raise and a decision are server writes: both bump the document version.
// The page merges the response into the project it is holding, and if it takes
// only the rows it keeps a version the server has already moved past. The very
// next Bill save sends that stale number as baseVersion and is refused as a
// conflict — and with it goes everything typed since the raise.
describe("adopting a variation raise or decision", () => {
  const held = { _id: "p1", name: "Ikeja tower", version: 7, variations: [] };
  const raised = {
    ok: true,
    index: 0,
    variations: [
      { description: "Extra soakaway", qty: 1, unit: "item", rate: 450_000, status: "pending" },
    ],
    version: 8,
  };

  // The save the QS does next. The server refuses any baseVersion that is not
  // the one it holds — routes/projects.js: 409 "Version conflict".
  function save(sel, serverVersion) {
    return sel.version === serverVersion
      ? { ok: true }
      : { status: 409, error: "Version conflict" };
  }

  it("carries the new version through, so the next ordinary save succeeds", () => {
    const after = selAfterVariationWrite(held, raised);
    expect(after.version).toBe(8);
    expect(save(after, 8)).toEqual({ ok: true });
  });

  it("takes the rows the server returned", () => {
    const after = selAfterVariationWrite(held, raised);
    expect(after.variations).toEqual(raised.variations);
    expect(after.name).toBe("Ikeja tower");
  });

  it("would lose the save if the version were dropped", () => {
    // The shape of the bug, pinned so it cannot come back unnoticed.
    const dropped = { ...held, variations: raised.variations };
    expect(save(dropped, 8).status).toBe(409);
  });

  it("keeps the version it already had when a response carries none", () => {
    const after = selAfterVariationWrite(held, { variations: raised.variations });
    expect(after.version).toBe(7);
  });

  it("leaves an unloaded project alone", () => {
    expect(selAfterVariationWrite(null, raised)).toBe(null);
  });
});
