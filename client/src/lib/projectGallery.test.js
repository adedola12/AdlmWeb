// Reading a project's stage, and its one estimated figure (S18, PR2-24/25).
//
// The stage used to be guessed from progressPercent, so a job whose bill was
// fully ticked read as "Final account" even though nobody had issued a single
// certificate. These tests pin the new rule, and pin the fall-back for a row
// from an API that predates the extra fields.

import { describe, it, expect } from "vitest";
import { STAGES, STAGE_ORDER, estimatedOf, stageOf } from "./projectGallery.js";

const row = (extra = {}) => ({ totalCost: 0, progressPercent: 0, ...extra });

describe("STAGES", () => {
  it("is his six, in order", () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      "takeoff",
      "priced",
      "tendered",
      "locked",
      "valuing",
      "final",
    ]);
  });

  it("sorts by how far a project has got", () => {
    expect(STAGE_ORDER.takeoff).toBeLessThan(STAGE_ORDER.priced);
    expect(STAGE_ORDER.tendered).toBeLessThan(STAGE_ORDER.locked);
    expect(STAGE_ORDER.valuing).toBeLessThan(STAGE_ORDER.final);
  });
});

describe("stageOf", () => {
  it("is Takeoff while nothing is priced", () => {
    expect(stageOf(row())).toBe("takeoff");
  });

  it("is Priced once the bill carries money", () => {
    expect(stageOf(row({ totalCost: 12_500 }))).toBe("priced");
  });

  it("is Tendered once the bill has gone out", () => {
    expect(stageOf(row({ totalCost: 12_500, tenderedAt: "2026-09-20T09:00:00Z" }))).toBe(
      "tendered",
    );
  });

  it("is Contract locked once the contract is locked, tender date or not", () => {
    expect(
      stageOf(row({ totalCost: 12_500, tenderedAt: "2026-09-20T09:00:00Z", contractLocked: true })),
    ).toBe("locked");
  });

  it("is Valuations from the first certificate", () => {
    expect(stageOf(row({ totalCost: 12_500, contractLocked: true, certificateCount: 1 }))).toBe(
      "valuing",
    );
  });

  it("is Final account only when the final account is actually closed", () => {
    expect(
      stageOf(row({ totalCost: 12_500, contractLocked: true, certificateCount: 4, finalized: true })),
    ).toBe("final");
  });

  it("no longer calls a fully ticked bill a closed final account", () => {
    // The bug rec-05 and PR2-24 exist for: every line marked complete, but
    // nothing certified and no final account.
    expect(stageOf(row({ totalCost: 900_000, progressPercent: 100 }))).toBe("priced");
  });

  it("falls back safely for a row from an older API", () => {
    expect(stageOf({ totalCost: 5, progressPercent: 55 })).toBe("priced");
    expect(stageOf({ totalCost: 0, progressPercent: 55 })).toBe("takeoff");
  });

  it("survives a missing row", () => {
    expect(stageOf(undefined)).toBe("takeoff");
    expect(stageOf({})).toBe("takeoff");
  });
});

describe("estimatedOf", () => {
  it("uses the server's estimated total when it is there", () => {
    expect(estimatedOf({ totalCost: 1_000, estimatedTotal: 1_186 })).toBe(1_186);
  });

  it("uses it even when it is zero, because zero is an answer", () => {
    expect(estimatedOf({ totalCost: 1_000, estimatedTotal: 0 })).toBe(0);
  });

  it("falls back to measured work for a row from an older API", () => {
    expect(estimatedOf({ totalCost: 1_000 })).toBe(1_000);
  });

  it("never returns NaN", () => {
    expect(estimatedOf({ totalCost: "not a number" })).toBe(0);
    expect(estimatedOf(undefined)).toBe(0);
  });
});
