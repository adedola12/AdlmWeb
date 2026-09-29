// Picking a Rate Gen rate on a bill line left its Budget on ₦0 placeholders:
// the server could price the material and labour from the rate, but the page
// never asked it to. These pin the three things the page now relies on.

import { describe, it, expect } from "vitest";

import {
  mergePricedProject,
  priceFromRateBody,
  priceFromRateFailure,
  priceFromRatePath,
} from "./priceFromRate.js";

describe("priceFromRateBody: only a pick out of the library prices the Budget", () => {
  it("a Rate Gen pick sends which rate, and the per-bill-unit figure the cell showed", () => {
    expect(
      priceFromRateBody("12150", {
        source: "rategen",
        rateKey: " Reinforced concrete 1:2:4 ",
        rateUnit: "m3",
      }),
    ).toEqual({ description: "Reinforced concrete 1:2:4", unit: "m3", unitCost: 12150 });
  });

  it("a pick with no unit (a synced candidate) still goes, without one", () => {
    expect(priceFromRateBody("9876.543", { source: "rategen", rateKey: "Blockwork" })).toEqual({
      description: "Blockwork",
      unitCost: 9876.54,
    });
  });

  it("a typed figure, a cleared cell or a keystroke prices nothing", () => {
    expect(priceFromRateBody("12000", { source: "typed" })).toBeNull();
    expect(priceFromRateBody("", { source: "cleared" })).toBeNull();
    expect(priceFromRateBody("", { source: "editing" })).toBeNull();
    expect(priceFromRateBody("12000", undefined)).toBeNull();
  });

  it("a pick with no rate name or no price prices nothing", () => {
    expect(priceFromRateBody("12000", { source: "rategen", rateKey: "" })).toBeNull();
    expect(priceFromRateBody("0", { source: "rategen", rateKey: "Concrete" })).toBeNull();
  });
});

describe("priceFromRatePath", () => {
  it("hangs off the project's own endpoint and escapes the bill code", () => {
    expect(priceFromRatePath("/projects/revit/abc", "C/1 01")).toBe(
      "/projects/revit/abc/bill/C%2F1%2001/price-from-rate",
    );
  });
});

describe("mergePricedProject: the reply never wipes the QS's other work", () => {
  const prev = {
    _id: "p1",
    version: 4,
    items: [
      { code: "A1", description: "Excavation", rate: 500, qty: 10 },
      { code: "C-101", description: "Concrete", rate: 0, qty: 100 },
      { code: "D1", description: "Blockwork", rate: 7000, qty: 20 },
    ],
    budgetItems: [{ billIdentity: "C-101", description: "Material", rate: 0 }],
    resourceItems: [],
    clientName: "Kept",
  };
  const server = {
    _id: "p1",
    version: 5,
    updatedAt: "2026-09-29T08:00:00.000Z",
    items: [
      // The server re-derived every line; only the priced one is taken.
      { code: "A1", description: "Excavation", rate: 999, qty: 10 },
      { code: "c-101", description: "Concrete", rate: 12150, qty: 100, netUnitCost: 9000 },
      { code: "D1", description: "Blockwork", rate: 1, qty: 20 },
    ],
    budgetItems: [
      { billIdentity: "C-101", description: "Cement", rate: 900 },
      { billIdentity: "C-101", description: "Labour", rate: 1000 },
    ],
    resourceItems: [{ billIdentity: "C-101", name: "Mason" }],
    clientName: "From server",
  };

  const merged = mergePricedProject(prev, server, ["C-101"]);

  it("takes the priced Budget, the resources and the new version", () => {
    expect(merged.budgetItems).toBe(server.budgetItems);
    expect(merged.resourceItems).toBe(server.resourceItems);
    // The next save sends this as baseVersion; a stale one is a conflict.
    expect(merged.version).toBe(5);
    expect(merged.updatedAt).toBe(server.updatedAt);
  });

  it("takes the priced line from the server, matched by code whatever its case", () => {
    expect(merged.items[1]).toMatchObject({ code: "c-101", rate: 12150, netUnitCost: 9000 });
  });

  it("leaves every other line, their order and the project's other fields alone", () => {
    expect(merged.items[0]).toBe(prev.items[0]);
    expect(merged.items[2]).toBe(prev.items[2]);
    expect(merged.items.map((i) => i.description)).toEqual([
      "Excavation",
      "Concrete",
      "Blockwork",
    ]);
    expect(merged.clientName).toBe("Kept");
  });

  it("with nothing priced, only the Budget-side fields move", () => {
    const none = mergePricedProject(prev, server, []);
    expect(none.items).toEqual(prev.items);
    expect(none.version).toBe(5);
  });

  it("copes with a missing side", () => {
    expect(mergePricedProject(null, server, ["C-101"])).toBe(server);
    expect(mergePricedProject(prev, null, ["C-101"])).toBe(prev);
  });
});

describe("priceFromRateFailure: the QS is told the rate stayed and why the Budget did not", () => {
  const err = (code) => Object.assign(new Error("x"), { status: 400, data: { code } });

  it.each([
    ["RATE_HAS_NO_BUILDUP", /no build-up/],
    ["RATE_NOT_FOUND", /no longer in your Rate Gen library/],
    ["VIEW_ONLY", /access/],
    ["RATES_MASKED", /access/],
    ["", /could not be priced/],
  ])("%s", (code, re) => {
    const msg = priceFromRateFailure(err(code));
    expect(msg).toMatch(re);
    expect(msg).toMatch(/The rate is on the line/);
  });
});
