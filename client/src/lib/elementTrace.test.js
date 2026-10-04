// What one model element costs.
//
// This is the arithmetic behind "click an element, see what it is worth", on
// both the classic ModelViewer panel and the Model tab in the ported design.
// It computes MONEY that ends up in front of a client, so the two things worth
// pinning are the split rule and the masking rule — both are silent when wrong.
import { describe, it, expect } from "vitest";
import {
  elementQtyFor,
  elementCostFor,
  linesForElement,
  itemLabel,
  traceForElement,
} from "./elementTrace.js";

describe("an element's share of a line", () => {
  it("uses the measured figure when the takeoff recorded one", () => {
    const it_ = {
      elementIds: [1, 2, 3, 4],
      qty: 100,
      elementQuantities: [{ id: 2, qty: 7.5 }],
    };
    expect(elementQtyFor(it_, 2)).toEqual({ qty: 7.5, estimated: false });
  });

  it("splits evenly ONLY when there is no measured figure, and says so", () => {
    // The flag is the point. A split figure presented as measured is a number
    // somebody will put in a valuation.
    const it_ = { elementIds: [1, 2, 3, 4], qty: 100 };
    expect(elementQtyFor(it_, 2)).toEqual({ qty: 25, estimated: true });
  });

  it("honours the takeoff's own estimated flag on a measured figure", () => {
    const it_ = {
      elementIds: [1, 2],
      qty: 10,
      elementQuantities: [{ id: 1, qty: 4 }],
      elementQuantitiesEstimated: true,
    };
    expect(elementQtyFor(it_, 1)).toEqual({ qty: 4, estimated: true });
  });

  it("falls back to the split when this element is not in the measured list", () => {
    const it_ = { elementIds: [1, 2], qty: 10, elementQuantities: [{ id: 1, qty: 4 }] };
    expect(elementQtyFor(it_, 2)).toEqual({ qty: 5, estimated: true });
  });

  it("does not divide by zero on a line with no elements", () => {
    expect(elementQtyFor({ qty: 10 }, 1)).toEqual({ qty: 10, estimated: true });
  });

  it("compares ids numerically, so a string id still matches", () => {
    const it_ = { elementIds: [7], qty: 9, elementQuantities: [{ id: "7", qty: 3 }] };
    expect(elementQtyFor(it_, "7").qty).toBe(3);
  });
});

describe("what it costs", () => {
  it("is the share times the rate", () => {
    expect(elementCostFor({ elementIds: [1, 2], qty: 10, rate: 500 }, 1)).toBe(2500);
  });

  it("is 0 when the rate is masked — which is ABSENT, not free", () => {
    // A collaborator without rate access is served rate 0 by the server. Every
    // caller must treat 0 as "no figure to show"; rendering "₦0" would be a
    // statement about the job rather than about their access.
    expect(elementCostFor({ elementIds: [1], qty: 10, rate: 0 }, 1)).toBe(0);
    expect(elementCostFor({ elementIds: [1], qty: 10 }, 1)).toBe(0);
  });
});

describe("which lines reference an element", () => {
  const items = [
    { elementIds: [1, 2], description: "Concrete" },
    { elementIds: [3], description: "Blockwork" },
    { description: "No elements" },
  ];

  it("finds them, numerically", () => {
    expect(linesForElement(items, 1)).toHaveLength(1);
    expect(linesForElement(items, "1")).toHaveLength(1);
    expect(linesForElement(items, 3)[0].description).toBe("Blockwork");
  });

  it("returns nothing for no selection, rather than everything", () => {
    expect(linesForElement(items, 0)).toEqual([]);
    expect(linesForElement(null, 1)).toEqual([]);
  });
});

describe("the label", () => {
  it("prefers the takeoff line and material, joined", () => {
    expect(itemLabel({ takeoffLine: "Wall", materialName: "Cement" })).toBe("Wall — Cement");
    expect(itemLabel({ takeoffLine: "Wall" })).toBe("Wall");
    expect(itemLabel({ description: "Only a description" })).toBe("Only a description");
  });

  it("never renders blank", () => {
    expect(itemLabel({})).toBe("(unnamed item)");
    expect(itemLabel(null)).toBe("(unnamed item)");
  });
});

describe("the whole trace", () => {
  const items = [{ elementIds: [1], qty: 4, rate: 1000, description: "Concrete" }];
  const materialItems = [
    { elementIds: [1], qty: 2, rate: 500, materialName: "Cement" },
    { elementIds: [1], qty: 1, rate: 300, materialName: "Sand" },
  ];

  it("totals the bill and the breakdown separately", () => {
    const t = traceForElement({ id: 1, items, materialItems });
    expect(t.billCost).toBe(4000);
    expect(t.materialCost).toBe(1300);
    expect(t.bill).toHaveLength(1);
    expect(t.materials).toHaveLength(2);
  });

  it("says when an element is in the model but in no bill line", () => {
    // The answer to "why is this not in my bill", which is worth finding before
    // the takeoff is issued rather than after.
    const t = traceForElement({ id: 99, items, materialItems });
    expect(t.unreferenced).toBe(true);
    expect(t.billCost).toBe(0);
  });

  it("flags when ANY figure on screen is a split rather than a measurement", () => {
    expect(traceForElement({ id: 1, items, materialItems }).anyEstimated).toBe(true);
    const measured = [
      { elementIds: [1], qty: 4, rate: 1000, elementQuantities: [{ id: 1, qty: 4 }] },
    ];
    expect(
      traceForElement({ id: 1, items: measured, materialItems: [] }).anyEstimated,
    ).toBe(false);
  });

  it("is null with nothing selected, so a caller needs no second condition", () => {
    expect(traceForElement({ id: 0, items, materialItems })).toBeNull();
  });
});
