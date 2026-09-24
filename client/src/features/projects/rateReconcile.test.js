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
    expect(isRateApplied({ rateLockedAt: "" })).toBe(false);
    expect(isRateApplied({ rateLockedAt: "not a date" })).toBe(false);
  });

  it("is true once a rate is picked or typed", () => {
    expect(isRateApplied({ rateLockedAt: "2026-09-23T05:00:00.000Z" })).toBe(true);
  });

  it("ignores the plugin's appliedRateKey, exactly as the server does", () => {
    // QUIV sends appliedRateKey on every line it prices. It is provenance, not
    // a lock: the server re-derives those lines and the screen must agree, or
    // it would tell a QS his rate is safe while the next save changes it.
    expect(isRateApplied({ appliedRateKey: "   " })).toBe(false);
    expect(isRateApplied({ appliedRateKey: "Concrete 1:2:4" })).toBe(false);
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

// What the website's rate cell stamps onto a line the QS priced himself: the
// lock, plus the library description when the figure came from a Rate Gen pick.
const picked = {
  appliedRateKey: "Concrete 1:2:4",
  rateLockedAt: "2026-09-23T05:00:00.000Z",
};

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
    const note = reconcileAppliedRate({ qty: 10, rate: 15000, ...picked }, buildUp);
    expect(note).toEqual({
      state: "differs",
      budgetRate: 12500,
      difference: 2500,
    });
  });

  it("says nothing about a line with no build-up behind it", () => {
    // Nothing is priced against the line, so there is nothing for the rate to
    // disagree WITH. Flagging it would put a warning on every line of every
    // project that has no Budget — noise where a contradiction cannot exist.
    expect(
      reconcileAppliedRate({ qty: 10, rate: 15000, ...picked }, [
        { qty: 10, rate: 0 },
      ]),
    ).toBe(null);
    expect(reconcileAppliedRate({ qty: 10, rate: 15000, ...picked }, [])).toBe(null);
    expect(reconcileAppliedRate({ qty: 10, rate: 15000, ...picked }, null)).toBe(null);
  });

  it("stays quiet when the two agree within rounding", () => {
    expect(
      reconcileAppliedRate({ qty: 10, rate: 12500.01, ...picked }, buildUp),
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

  it("says nothing on a project with no Budget at all", () => {
    // Every line priced by the QS, not one budget row anywhere. Before this
    // the whole bill lit up as "does not reconcile".
    const items = [
      { code: "A", qty: 10, rate: 12500, ...picked },
      { code: "B", qty: 5, rate: 999, ...picked },
    ];
    expect(reconcileBill(items, []).size).toBe(0);
    expect(reconcileBill(items, null).size).toBe(0);
  });

  it("says nothing about a QUIV line carrying only appliedRateKey", () => {
    // The server re-derives this line, so the screen has nothing to admit to.
    const items = [{ code: "A", qty: 10, rate: 15000, appliedRateKey: "x" }];
    const budget = [{ billIdentity: "A", qty: 10, rate: 10000, profitPercent: 25 }];
    expect(reconcileBill(items, budget).size).toBe(0);
  });

  it("keys the note by row index and leaves derived rows alone", () => {
    const items = [
      { code: "A", qty: 10, rate: 12500 },
      { code: "B", qty: 10, rate: 15000, ...picked },
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
      [{ code: "C-Ceil", qty: 10, rate: 15000, ...picked }],
      [{ billIdentity: "c-ceil", qty: 10, rate: 10000, profitPercent: 25 }],
    );
    expect(notes.get(0).budgetRate).toBe(12500);
  });

  it("survives empty and missing input", () => {
    expect(reconcileBill(null, null).size).toBe(0);
    expect(reconcileBill([], []).size).toBe(0);
  });

  it("names the figure a committed release is about to apply", () => {
    // The QS has emptied the cell and not saved. The line still shows his
    // 15,000; the save will price it from the build-up. He is told which
    // figure is coming while he can still change his mind.
    const notes = reconcileBill(
      [{ code: "A", qty: 10, rate: 15000, ...picked, rateReleased: true }],
      [{ billIdentity: "A", qty: 10, rate: 10000, profitPercent: 25 }],
    );
    expect(notes.get(0)).toEqual({ state: "released", budgetRate: 12500 });
  });

  it("reports a release with nothing priced under it as an unknown figure", () => {
    const notes = reconcileBill(
      [{ code: "A", qty: 10, rate: 15000, ...picked, rateReleased: true }],
      [],
    );
    // null, so the screen prints the en dash rather than inventing a zero.
    expect(notes.get(0)).toEqual({ state: "released", budgetRate: null });
  });
});
