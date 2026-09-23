// What the bill line says about a rate the QS applied himself.
//
// The server keeps his rate (server/util/deriveBillRates.js). Until the
// Budget-writing work lands, the Budget build-up still says something else,
// and these tests pin what the screen must admit to.

import { describe, it, expect } from "vitest";
import {
  isRateApplied,
  buildUpRate,
  reconcileAppliedRate,
  reconcileBill,
} from "./rateReconcile.js";

describe("isRateApplied", () => {
  it("is false for a line nobody has priced", () => {
    expect(isRateApplied(null)).toBe(false);
    expect(isRateApplied({})).toBe(false);
    expect(isRateApplied({ appliedRateKey: "   " })).toBe(false);
    expect(isRateApplied({ rateLockedAt: "" })).toBe(false);
    expect(isRateApplied({ rateLockedAt: "not a date" })).toBe(false);
  });

  it("is true once a rate is picked or typed", () => {
    expect(isRateApplied({ appliedRateKey: "Concrete 1:2:4" })).toBe(true);
    expect(isRateApplied({ rateLockedAt: "2026-09-23T05:00:00.000Z" })).toBe(true);
  });
});

describe("buildUpRate", () => {
  it("matches the server formula: net x (1 + O&P) / qty", () => {
    const lines = [
      { qty: 10, rate: 8000, overheadPercent: 10, profitPercent: 15 },
      { qty: 10, rate: 2000, overheadPercent: 10, profitPercent: 15 },
    ];
    expect(buildUpRate(10, lines)).toBe(12500);
  });

  it("is null when nothing in the build-up is priced", () => {
    expect(buildUpRate(10, [{ qty: 10, rate: 0 }])).toBe(null);
    expect(buildUpRate(10, [])).toBe(null);
    expect(buildUpRate(10, null)).toBe(null);
  });
});

describe("reconcileAppliedRate", () => {
  const buildUp = [
    { qty: 10, rate: 10000, overheadPercent: 0, profitPercent: 25 },
  ];

  it("says nothing about a line still derived from its build-up", () => {
    // No stamp: the rate IS the build-up's rate, which is the existing,
    // correct behaviour. Nothing to flag.
    expect(reconcileAppliedRate({ qty: 10, rate: 12500 }, buildUp)).toBe(null);
  });

  it("flags a picked rate the build-up does not reconcile with", () => {
    const note = reconcileAppliedRate(
      { qty: 10, rate: 15000, appliedRateKey: "Concrete 1:2:4" },
      buildUp,
    );
    expect(note).toEqual({
      state: "differs",
      budgetRate: 12500,
      difference: 2500,
    });
  });

  it("flags a picked rate with no build-up at all behind it", () => {
    // The plant the client is being charged for is nowhere in the Budget.
    const note = reconcileAppliedRate(
      { qty: 10, rate: 15000, appliedRateKey: "Concrete 1:2:4" },
      [{ qty: 10, rate: 0 }],
    );
    expect(note).toEqual({
      state: "no-buildup",
      budgetRate: null,
      difference: null,
    });
  });

  it("stays quiet when the two agree within rounding", () => {
    expect(
      reconcileAppliedRate(
        { qty: 10, rate: 12500.01, appliedRateKey: "Concrete 1:2:4" },
        buildUp,
      ),
    ).toBe(null);
  });

  it("says nothing about a stamped line with no rate yet", () => {
    expect(
      reconcileAppliedRate({ qty: 10, rate: 0, rateLockedAt: new Date() }, buildUp),
    ).toBe(null);
  });
});

describe("reconcileBill", () => {
  it("is empty for a project nobody has re-priced", () => {
    const items = [
      { code: "A", qty: 10, rate: 12500 },
      { code: "B", qty: 5, rate: 999 },
    ];
    const budget = [
      { billIdentity: "A", qty: 10, rate: 10000, profitPercent: 25 },
    ];
    expect(reconcileBill(items, budget).size).toBe(0);
  });

  it("keys the note by row index and leaves derived rows alone", () => {
    const items = [
      { code: "A", qty: 10, rate: 12500 },
      { code: "B", qty: 10, rate: 15000, appliedRateKey: "Concrete 1:2:4" },
    ];
    const budget = [
      { billIdentity: "A", qty: 10, rate: 10000, profitPercent: 25 },
      { billIdentity: "B", qty: 10, rate: 10000, profitPercent: 25 },
    ];
    const notes = reconcileBill(items, budget);
    expect(notes.size).toBe(1);
    expect(notes.get(0)).toBeUndefined();
    expect(notes.get(1).state).toBe("differs");
    expect(notes.get(1).budgetRate).toBe(12500);
  });

  it("matches the bill code case-insensitively, like the server does", () => {
    const notes = reconcileBill(
      [{ code: "C-Ceil", qty: 10, rate: 15000, appliedRateKey: "x" }],
      [{ billIdentity: "c-ceil", qty: 10, rate: 10000, profitPercent: 25 }],
    );
    expect(notes.get(0).budgetRate).toBe(12500);
  });

  it("survives empty and missing input", () => {
    expect(reconcileBill(null, null).size).toBe(0);
    expect(reconcileBill([], []).size).toBe(0);
  });
});
