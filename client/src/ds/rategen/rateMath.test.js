import { describe, it, expect } from "vitest";
import {
  lineAmount,
  componentsOf,
  groupComponents,
  groupForKind,
  percentProblem,
  totalsFrom,
  unexplainedNet,
} from "./rateMath.js";

describe("lineAmount", () => {
  it("reads lineTotal, which is what the sync route actually sends", () => {
    // The live bug: the screen asked for totalPrice, a field /library/rates/sync
    // has never sent, so every amount printed as zero.
    expect(lineAmount({ lineTotal: 1250, quantity: 2, unitPrice: 600 })).toBe(1250);
  });

  it("reads totalCost from a composition component", () => {
    expect(lineAmount({ totalCost: 900 })).toBe(900);
  });

  it("still reads totalPrice, for older desktop payloads", () => {
    expect(lineAmount({ totalPrice: 400 })).toBe(400);
  });

  it("falls back to quantity x unit price when no total is sent", () => {
    expect(lineAmount({ quantity: 2.5, unitPrice: 400 })).toBe(1000);
  });

  it("treats a zero total as a real zero, not as missing", () => {
    expect(lineAmount({ lineTotal: 0, quantity: 3, unitPrice: 100 })).toBe(0);
  });

  it("strips thousands separators rather than reading NaN", () => {
    expect(lineAmount({ lineTotal: "12,500" })).toBe(12500);
  });
});

describe("groupForKind", () => {
  it("files consumables with materials and equipment with plant", () => {
    expect(groupForKind("consumable")).toBe("material");
    expect(groupForKind("equipment")).toBe("plant");
    expect(groupForKind("plant")).toBe("plant");
    expect(groupForKind("labour")).toBe("labour");
  });

  it("does not drop a kind it does not know", () => {
    expect(groupForKind("subcontract")).toBe("other");
    expect(groupForKind("")).toBe("other");
  });
});

describe("componentsOf", () => {
  it("prefers the composition block, where the server already classified plant", () => {
    const rate = {
      composition: {
        components: [
          { name: "Excavator", kind: "plant", quantity: 0.25, unit: "h", unitPrice: 8000, totalCost: 2000 },
        ],
      },
      breakdown: [{ componentName: "Cement", refKind: "material", lineTotal: 5 }],
    };
    const out = componentsOf(rate);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("plant");
    expect(out[0].amount).toBe(2000);
  });

  it("falls back to breakdown when there is no composition", () => {
    const out = componentsOf({
      breakdown: [
        { componentName: "Cement", refKind: "material", quantity: 0.4, unit: "bag", unitPrice: 9000, lineTotal: 3600 },
      ],
    });
    expect(out[0].name).toBe("Cement");
    expect(out[0].amount).toBe(3600);
  });

  it("returns nothing for a rate with no build-up at all", () => {
    expect(componentsOf({})).toEqual([]);
  });
});

describe("groupComponents", () => {
  const comps = [
    { name: "Cement", kind: "material", amount: 3600 },
    { name: "Nails", kind: "consumable", amount: 400 },
    { name: "Mason gang", kind: "labour", amount: 2500 },
    { name: "Mixer", kind: "plant", amount: 1000 },
  ];

  it("groups in Materials, Labour, Plant order and totals each", () => {
    const g = groupComponents(comps);
    expect(g.map((x) => x.label)).toEqual(["Materials", "Labour", "Plant"]);
    expect(g[0].total).toBe(4000);
    expect(g[1].total).toBe(2500);
    expect(g[2].total).toBe(1000);
  });

  it("drops empty groups rather than showing a heading with nothing under it", () => {
    const g = groupComponents([{ name: "Cement", kind: "material", amount: 10 }]);
    expect(g).toHaveLength(1);
  });

  it("keeps an unclassified line visible under Other", () => {
    const g = groupComponents([{ name: "Attendance", kind: "subcontract", amount: 750 }]);
    expect(g[0].label).toBe("Other");
    expect(g[0].total).toBe(750);
  });
});

describe("totalsFrom", () => {
  it("takes overhead and profit on net, never compounded", () => {
    const t = totalsFrom([{ amount: 1000 }], 10, 25);
    expect(t.netCost).toBe(1000);
    expect(t.overheadValue).toBe(100);
    expect(t.profitValue).toBe(250);
    expect(t.totalCost).toBe(1350);
  });

  it("agrees with the server's stored figures for an untouched rate", () => {
    // Mirrors computeTotals() in server/util/rategenUserRates.js.
    const net = 18750;
    const t = totalsFrom([{ amount: net }], 10, 25);
    expect(t.totalCost).toBeCloseTo(net + (net * 10) / 100 + (net * 25) / 100, 6);
  });

  it("reads a blank percentage as zero rather than NaN", () => {
    const t = totalsFrom([{ amount: 500 }], "", null);
    expect(t.totalCost).toBe(500);
  });
});

describe("unexplainedNet", () => {
  it("is zero when the lines add up to the stored net", () => {
    expect(unexplainedNet(4000, [{ amount: 3600 }, { amount: 400 }])).toBe(0);
  });

  it("does not invent a line out of a float artefact", () => {
    expect(unexplainedNet(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(0);
  });

  it("reports a real gap", () => {
    expect(unexplainedNet(5000, [{ amount: 3600 }])).toBe(1400);
  });
});

// ── S18 review, finding 1 ───────────────────────────────────────────────────
describe("totalsFrom with a carried remainder", () => {
  it("carries the part of the net cost no line explains", () => {
    // 10,000 itemised, 2,000 nothing explains: the rate is built on 12,000.
    const t = totalsFrom([{ amount: 7000 }, { amount: 3000 }], 10, 25, 2000);
    expect(t.netCost).toBe(12000);
    expect(t.overheadValue).toBe(1200);
    expect(t.profitValue).toBe(3000);
    expect(t.totalCost).toBe(16200);
  });

  it("holds the remainder still while a line is edited", () => {
    // The plant line goes up by 1,000. The remainder is not a percentage of
    // anything, so it does not move with it.
    const t = totalsFrom([{ amount: 7000 }, { amount: 4000 }], 0, 0, 2000);
    expect(t.netCost).toBe(13000);
  });

  it("changes nothing for a rate whose lines already add up", () => {
    expect(totalsFrom([{ amount: 1000 }], 10, 25, 0).totalCost).toBe(1350);
    expect(totalsFrom([{ amount: 1000 }], 10, 25).totalCost).toBe(1350);
  });
});

// ── S18 review, findings 2 and 4 ────────────────────────────────────────────
describe("percentProblem", () => {
  it("accepts a percentage above the 60 the build-up used to clamp to", () => {
    expect(percentProblem("Profit", 80)).toBe(null);
    expect(percentProblem("Profit", "80")).toBe(null);
  });

  it("accepts a blank, which each screen documents for itself", () => {
    expect(percentProblem("Overhead", "")).toBe(null);
    expect(percentProblem("Overhead", null)).toBe(null);
  });

  it("names the field when it refuses a negative", () => {
    expect(percentProblem("Overhead", "-5")).toBe("Overhead cannot be less than 0%");
    expect(percentProblem("Profit", -0.5)).toBe("Profit cannot be less than 0%");
  });

  it("refuses something that is not a number at all", () => {
    expect(percentProblem("Profit", "ten")).toBe("Profit has to be a number");
  });
});
