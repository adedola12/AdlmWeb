import { describe, it, expect } from "vitest";
import {
  RATE_VIEWS,
  lineAmount,
  pricedBySummary,
  provenanceOf,
  rateNotes,
  rateWasApplied,
  resolveRateView,
  splitByRate,
} from "./ratesModel.js";

// His rates() (work-proj.js:975-1040). WORK.md §13: the Rates & budget tab IS
// RateGen inside the project.

const BILL = [
  // Priced from the RateGen library — the plugin wrote the description it used.
  {
    code: "BQ-1",
    description: "Excavate foundation trench n.e. 1.5m deep",
    unit: "m3",
    qty: 120,
    rate: 2_500,
    appliedRateKey: "Excavation in firm soil n.e. 1.5m",
    rateLockedAt: "2026-09-20T10:00:00Z",
  },
  // Priced from this project's own build-up: no library key.
  {
    code: "BQ-2",
    description: "Reinforced concrete grade 25 in columns",
    unit: "m3",
    qty: 32,
    rate: 72_000,
  },
  // Not priced at all.
  {
    code: "BQ-3",
    description: "Ceramic wall tiling 200x300 to toilets",
    takeoffLine: "First floor",
    unit: "m2",
    qty: 420,
    rate: 0,
  },
];

describe("his three views", () => {
  it("are Rates, Budget and Buy schedule, in his order", () => {
    expect(RATE_VIEWS.map((v) => v.key)).toEqual(["rates", "budget", "buy"]);
    expect(RATE_VIEWS.map((v) => v.label)).toEqual(["Rates", "Budget", "Buy schedule"]);
  });

  it("falls back to Rates rather than showing an empty body", () => {
    expect(resolveRateView("budget")).toBe("budget");
    expect(resolveRateView("nonsense")).toBe("rates");
    expect(resolveRateView(null)).toBe("rates");
    expect(resolveRateView(" BUY ")).toBe("buy");
  });
});

describe("his two lists", () => {
  it("splits what needs a rate from what is priced", () => {
    const { unpriced, priced } = splitByRate(BILL);
    expect(unpriced).toEqual([2]);
    expect(priced).toEqual([0, 1]);
  });

  it("returns indexes, because that is a line's identity on this page", () => {
    // The side panel, the bill's rows and the reconcile map all address a line
    // by its index in the project's items array.
    const { priced } = splitByRate(BILL);
    expect(BILL[priced[0]].code).toBe("BQ-1");
  });

  it("does not throw on a project with no bill", () => {
    expect(splitByRate(null)).toEqual({ unpriced: [], priced: [] });
    expect(splitByRate([])).toEqual({ unpriced: [], priced: [] });
  });
});

describe("where a rate came from", () => {
  it("calls a line the plugin priced from the library a Library rate", () => {
    // appliedRateKey is the exact RateGen description that priced it
    // (models/TakeoffProject.js:664) — real provenance, not a guess.
    const p = provenanceOf(BILL[0]);
    expect(p.label).toBe("Library");
    expect(p.fromLibrary).toBe(true);
    expect(p.name).toBe("Excavation in firm soil n.e. 1.5m");
  });

  it("calls a line priced from the project's own build-up a Project rate", () => {
    const p = provenanceOf(BILL[1]);
    expect(p.label).toBe("Project rate");
    expect(p.fromLibrary).toBe(false);
    expect(p.name).toBe("");
  });

  it("ignores a blank key rather than reading it as a library rate", () => {
    expect(provenanceOf({ appliedRateKey: "   " }).fromLibrary).toBe(false);
  });

  it("knows whether the QS applied the rate himself", () => {
    expect(rateWasApplied(BILL[0])).toBe(true);
    expect(rateWasApplied(BILL[1])).toBe(false);
  });

  it("counts what priced the bill, for the header line", () => {
    expect(pricedBySummary(BILL)).toEqual({ priced: 2, fromLibrary: 1, fromProject: 1 });
  });
});

describe("rates that no longer agree with their build-up", () => {
  // His tag here reads "Library changed", driven by a fixture field recording
  // that the library moved. We do not track the library's history. What we do
  // have is the same question asked of a different pair, and rateReconcile.js
  // has answered it since the restyle.
  const budgetItems = [
    // 120 m3 at a build-up that comes to 3,000/m3 — the line says 2,500.
    {
      billIdentity: "BQ-1",
      componentKind: "Material",
      qty: 120,
      rate: 3_000,
      overheadPercent: 0,
      profitPercent: 0,
    },
  ];

  it("flags a line whose applied rate disagrees with what prices it", () => {
    const notes = rateNotes(BILL, budgetItems);
    expect(notes.get(0)?.state).toBe("differs");
  });

  it("says nothing about a line with no build-up behind it", () => {
    // A missing Budget is a fact of the project, not a fault of the line —
    // otherwise every rate a QS ever applied would be flagged on exactly the
    // projects where a disagreement cannot exist.
    const notes = rateNotes(BILL, []);
    expect(notes.size).toBe(0);
  });

  it("says nothing about a rate the QS never applied", () => {
    // BQ-2 has no rateLockedAt, so there is nothing to reconcile against.
    const notes = rateNotes(BILL, [
      { billIdentity: "BQ-2", componentKind: "Material", qty: 32, rate: 1, overheadPercent: 0, profitPercent: 0 },
    ]);
    expect(notes.has(1)).toBe(false);
  });

  it("does not flag a rate that agrees within rounding", () => {
    const agreeing = [
      { billIdentity: "BQ-1", componentKind: "Material", qty: 120, rate: 2_500, overheadPercent: 0, profitPercent: 0 },
    ];
    expect(rateNotes(BILL, agreeing).size).toBe(0);
  });
});

describe("what a priced line is worth", () => {
  it("is qty × rate, and nothing else", () => {
    expect(lineAmount(BILL[0])).toBe(300_000);
    expect(lineAmount(BILL[2])).toBe(0);
  });

  it("reads junk as zero rather than NaN", () => {
    expect(lineAmount({ qty: "n/a", rate: 100 })).toBe(0);
    expect(lineAmount(null)).toBe(0);
  });
});
