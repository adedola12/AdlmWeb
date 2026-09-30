import { describe, it, expect } from "vitest";
import {
  actualAmountOf,
  actualQtyOf,
  actualRateOf,
  actualTotals,
  anyMeasured,
  contractAmountOf,
  isLocked,
  optional,
  showActuals,
  varianceOf,
  withActualColumns,
  withActualQty,
  withActualRate,
} from "./actualsModel.js";

// The contract said 120 m3 at 4,500. The site measured 134.
const line = (over = {}) => ({ qty: 120, rate: 4_500, ...over });

describe("a null is not a zero", () => {
  it("distinguishes not-measured from measured-as-none", () => {
    // The whole thing turns on this. A null means the line stands at its
    // contract figure; a zero means somebody measured and found none of it,
    // which is an omission of the entire line.
    expect(actualQtyOf(line())).toBe(null);
    expect(actualQtyOf(line({ actualQty: 0 }))).toBe(0);
    expect(actualQtyOf(line({ actualQty: null }))).toBe(null);
    expect(actualQtyOf(line({ actualQty: "" }))).toBe(null);
  });

  it("reads a number a person typed, and refuses what is not one", () => {
    expect(optional("134")).toBe(134);
    expect(optional(134)).toBe(134);
    expect(optional(0)).toBe(0);
    expect(optional("abc")).toBe(null);
    expect(optional(undefined)).toBe(null);
  });
});

describe("what a re-measure is worth", () => {
  it("prices the measured quantity at the contract rate", () => {
    // A re-measure normally moves the quantity, not the price.
    expect(actualRateOf(line({ actualQty: 134 }))).toBe(4_500);
    expect(actualAmountOf(line({ actualQty: 134 }))).toBe(603_000);
    expect(contractAmountOf(line())).toBe(540_000);
    expect(varianceOf(line({ actualQty: 134 }))).toBe(63_000);
  });

  it("uses an actual rate when one was agreed", () => {
    expect(actualRateOf(line({ actualQty: 120, actualRate: 4_800 }))).toBe(4_800);
    expect(varianceOf(line({ actualQty: 120, actualRate: 4_800 }))).toBe(36_000);
  });

  it("says NOTHING rather than repeating the contract figure", () => {
    // Showing the contract amount in the actual column would read as a
    // confirmed measurement. It is not one.
    expect(actualAmountOf(line())).toBe(null);
    expect(varianceOf(line())).toBe(null);
  });

  it("a line measured and found to agree has a variance of ZERO, not null", () => {
    // Zero variance is a statement: somebody checked. Null is the absence of
    // one, and collapsing them loses which lines have been done.
    expect(varianceOf(line({ actualQty: 120 }))).toBe(0);
  });

  it("an omitted line is a full negative variance", () => {
    expect(actualAmountOf(line({ actualQty: 0 }))).toBe(0);
    expect(varianceOf(line({ actualQty: 0 }))).toBe(-540_000);
  });
});

describe("the bill's two totals", () => {
  const bill = [
    line({ actualQty: 134 }), // +63,000
    line({ qty: 40, rate: 72_000 }), // not measured — 2,880,000 both sides
    line({ qty: 10, rate: 1_000, actualQty: 8 }), // -2,000
  ];

  it("counts an UNMEASURED line at its contract amount", () => {
    // Excluding it would make the actual total shrink every time the contract
    // grew, which reads as savings that do not exist.
    const t = actualTotals(bill);
    expect(t.contract).toBe(540_000 + 2_880_000 + 10_000);
    expect(t.actual).toBe(603_000 + 2_880_000 + 8_000);
    expect(t.variance).toBe(63_000 - 2_000);
  });

  it("says how much of the bill the figure actually rests on", () => {
    const t = actualTotals(bill);
    expect(t.measured).toBe(2);
    expect(t.lines).toBe(3);
    expect(t.anyMeasured).toBe(true);
  });

  it("is honest about a bill nobody has measured", () => {
    const t = actualTotals([line(), line({ qty: 1, rate: 100 })]);
    expect(t.anyMeasured).toBe(false);
    expect(t.actual).toBe(t.contract);
    expect(t.variance).toBe(0);
    expect(anyMeasured([line(), line()])).toBe(false);
    expect(anyMeasured([line({ actualQty: 0 })])).toBe(true);
  });

  it("survives a bill that is not a list", () => {
    expect(actualTotals(null).lines).toBe(0);
    expect(actualTotals(undefined).variance).toBe(0);
    expect(anyMeasured(null)).toBe(false);
  });
});

describe("the switch", () => {
  it("reads the flag from valuationSettings, where the classic bill keeps it", () => {
    // NOT the project root. Two screens reading different places is how one
    // shows the columns and the other does not.
    expect(showActuals({ valuationSettings: { showActualColumns: true } })).toBe(true);
    expect(showActuals({ showActualColumns: true })).toBe(false);
    expect(showActuals({})).toBe(false);
    expect(showActuals(null)).toBe(false);
  });

  it("writes it back to the same place, keeping the other settings", () => {
    // The PUT's normaliser falls back per field, so a partial object is safe —
    // but only if the keys already there are carried, which is what this does.
    const patch = withActualColumns(
      { valuationSettings: { showDailyLog: true, basis: "budget", showActualColumns: false } },
      true,
    );
    expect(patch).toEqual({
      valuationSettings: { showDailyLog: true, basis: "budget", showActualColumns: true },
    });
  });

  it("works on a project that has no settings yet", () => {
    expect(withActualColumns({}, true)).toEqual({
      valuationSettings: { showActualColumns: true },
    });
    expect(withActualColumns(null, true)).toBe(null);
  });

  it("knows whether actuals mean anything at all", () => {
    expect(isLocked({ contract: { locked: true } })).toBe(true);
    expect(isLocked({ contract: {} })).toBe(false);
    expect(isLocked(null)).toBe(false);
  });
});

describe("recording a measurement", () => {
  const project = () => ({
    version: 4,
    items: [line({ code: "BQ-1", description: "Excavate" }), line({ code: "BQ-2" })],
  });

  it("sends the rows WHOLE, because the PUT replaces the array", () => {
    // A row rebuilt from a field list loses everything not listed — which is how
    // a PC sum came back as a provisional sum.
    const patch = withActualQty(project(), 0, 134);
    expect(patch.items).toHaveLength(2);
    expect(patch.items[0]).toEqual({
      qty: 120,
      rate: 4_500,
      code: "BQ-1",
      description: "Excavate",
      actualQty: 134,
    });
    // And it does not touch the contract quantity. That is the point.
    expect(patch.items[0].qty).toBe(120);
  });

  it("leaves every other line exactly as it was", () => {
    const patch = withActualQty(project(), 0, 134);
    expect(patch.items[1]).toEqual(project().items[1]);
  });

  it("sends nothing but items, so nothing else is overwritten", () => {
    expect(Object.keys(withActualQty(project(), 0, 134))).toEqual(["items"]);
    expect(Object.keys(withActualRate(project(), 0, 4_800))).toEqual(["items"]);
  });

  it("clears a measurement back to NULL rather than writing 0", () => {
    // Emptying the box means "I did not measure this after all", not "there is
    // none of it" — and the second is a variation of the whole line.
    const patch = withActualQty({ items: [line({ actualQty: 134 })] }, 0, "");
    expect(patch.items[0].actualQty).toBe(null);
  });

  it("records a measured zero, which IS a real measurement", () => {
    const patch = withActualQty({ items: [line()] }, 0, 0);
    expect(patch.items[0].actualQty).toBe(0);
  });

  it("refuses a negative quantity or rate", () => {
    // A reduction is a smaller quantity, not a negative one.
    expect(withActualQty(project(), 0, -5)).toBe(null);
    expect(withActualRate(project(), 0, -1)).toBe(null);
  });

  it("refuses a line that does not exist", () => {
    expect(withActualQty(project(), 9, 1)).toBe(null);
    expect(withActualQty(project(), -1, 1)).toBe(null);
    expect(withActualRate({ items: [] }, 0, 1)).toBe(null);
  });
});
