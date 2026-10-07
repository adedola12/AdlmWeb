import { describe, it, expect, vi } from "vitest";
import {
  allTicked,
  tickedLines,
  totalOf,
  applyLabel,
  priceManyPath,
  priceManyBody,
  summariseResult,
  applyErrorMessage,
  rangeLabel,
  openAda,
  ADA_OPEN_EVENT,
  MAX_APPLY_LINES,
  isUserRateLine,
  isUserRateCard,
  splitLabel,
  sizeLabel,
  userRateHeading,
} from "./adaCardsModel.js";

// The confirm card under Ada's pricing proposal, and the report card. The
// card writes nothing until Apply, and Apply names rates, never prices.

const LINES = [
  { code: "B1", description: "Concrete in columns", qty: 12, unit: "m3", rateId: "r1", rateDescription: "RC 1:2:4 columns", rateUnit: "m3", unitPrice: 220000, amount: 2640000 },
  { code: "B2", description: "Blockwork", qty: 300, unit: "m2", rateId: "", rateDescription: "225mm blockwork", rateUnit: "m2", unitPrice: 13000, amount: 3900000 },
];

describe("pricing card", () => {
  it("opens with every line ticked and totals what it would add", () => {
    const ticks = allTicked(LINES);
    expect(ticks).toEqual({ B1: true, B2: true });
    expect(totalOf(tickedLines(LINES, ticks))).toBe(6540000);
  });

  it("unticking a line drops it from the total and the label", () => {
    const ticks = { ...allTicked(LINES), B2: false };
    const picked = tickedLines(LINES, ticks);
    expect(picked.map((l) => l.code)).toEqual(["B1"]);
    expect(applyLabel(picked.length)).toBe("Apply 1 rate");
    expect(applyLabel(2)).toBe("Apply 2 rates");
    expect(applyLabel(0)).toBe("Tick a line to apply");
  });

  it("posts to price-many on the ObjectId with the product key lowercased", () => {
    expect(priceManyPath({ id: "65f0c0ffee", productKey: "PlanSwift" })).toBe(
      "/projects/planswift/65f0c0ffee/bill/price-many",
    );
    expect(priceManyPath({ id: "", productKey: "revit" })).toBe("");
  });

  it("sends which rate on which line — the rate's description and unit, never a price", () => {
    const body = priceManyBody(LINES);
    expect(body).toEqual({
      lines: [
        { code: "B1", rateId: "r1", description: "RC 1:2:4 columns", unit: "m3" },
        { code: "B2", rateId: "", description: "225mm blockwork", unit: "m2" },
      ],
      via: "ada",
    });
    expect(JSON.stringify(body)).not.toMatch(/unitPrice|amount|220000/);
  });

  it("sends the dimension of a converted rate, never its factor", () => {
    const body = priceManyBody([
      { code: "W1", rateId: "c20", rateDescription: "Concrete", rateUnit: "m3", convert: { thickness: 0.23 }, unitPrice: 35630 },
    ]);
    expect(body.lines[0]).toEqual({
      code: "W1",
      rateId: "c20",
      description: "Concrete",
      unit: "m3",
      convert: { thickness: 0.23 },
    });
  });

  it("never sends more than the endpoint takes", () => {
    const many = Array.from({ length: MAX_APPLY_LINES + 3 }, (_, i) => ({ code: `L${i}`, rateId: "r" }));
    expect(priceManyBody(many).lines).toHaveLength(MAX_APPLY_LINES);
  });

  it("reports priced and skipped from the endpoint's answer", () => {
    const s = summariseResult(
      { _priced: ["B1"], _skipped: [{ code: "B2", reason: "Rate has no build-up" }], _rateWarnings: ["Sand has no price"] },
      2,
    );
    expect(s.headline).toBe("1 line priced, 1 skipped.");
    expect(s.skipped[0]).toEqual({ code: "B2", reason: "Rate has no build-up" });
    expect(s.warnings).toEqual(["Sand has no price"]);
    expect(summariseResult({}, 0).headline).toBe("0 lines priced.");
  });

  it("explains a refused Apply in words", () => {
    expect(applyErrorMessage({ status: 403, data: { code: "VIEW_ONLY" } })).toMatch(/view-only/);
    expect(applyErrorMessage({ status: 403, data: {} })).toMatch(/does not allow/);
    expect(applyErrorMessage({ status: 404 })).toMatch(/could not be found/);
    expect(applyErrorMessage({ message: "Too many lines" })).toBe("Too many lines");
    expect(applyErrorMessage(null)).toMatch(/Nothing was changed/);
  });
});

// A rate the USER stated to Ada: windows by area, or a figure on named lines.
const SPLIT = { material: 60, labour: 20, overheadProfit: 20 };
const AREA_LINES = [
  { code: "W1", description: "Window W1 (1200×1500)", qty: 4, unit: "nr", sizeLabel: "1200×1500", areaM2: 1.8, ratePerM2: 88000, userRate: 158400, amount: 633600, split: SPLIT, splitAmounts: { material: 95040, labour: 31680, overheadProfit: 31680 } },
  { code: "W2", description: "Window W2 (600x600)", qty: 2, unit: "nr", sizeLabel: "600×600", areaM2: 0.36, ratePerM2: 88000, userRate: 31680, amount: 63360, split: SPLIT, currentRate: 30000 },
];
const RATE_LINES = [
  { code: "B14", description: "225mm blockwork", qty: 120, unit: "m2", userRate: 9500, rateUnit: "m2", amount: 1140000, split: { material: 70, labour: 30, overheadProfit: 0 } },
];

describe("stated-rate card", () => {
  it("tells a stated-rate line from a library one", () => {
    expect(isUserRateLine(AREA_LINES[0])).toBe(true);
    expect(isUserRateLine(RATE_LINES[0])).toBe(true);
    expect(isUserRateLine(LINES[0])).toBe(false);
    expect(isUserRateCard({ mode: "user-rate" })).toBe(true);
    expect(isUserRateCard({ type: "price-proposal" })).toBe(false);
  });

  it("an opening sends the rate per m2 and the split, never its own figure or size", () => {
    const body = priceManyBody(AREA_LINES);
    expect(body).toEqual({
      lines: [
        { code: "W1", ratePerM2: 88000, split: SPLIT },
        { code: "W2", ratePerM2: 88000, split: SPLIT },
      ],
      via: "ada",
    });
    expect(JSON.stringify(body)).not.toMatch(/158400|areaM2|amount|1200/);
  });

  it("a named line sends the stated rate, its unit and the split", () => {
    expect(priceManyBody(RATE_LINES).lines).toEqual([
      { code: "B14", userRate: 9500, unit: "m2", split: { material: 70, labour: 30, overheadProfit: 0 } },
    ]);
    // No unit stated, no split: neither is invented.
    expect(priceManyBody([{ code: "B9", userRate: 2000 }]).lines).toEqual([{ code: "B9", userRate: 2000 }]);
  });

  it("totals and ticks work the same as for library rates", () => {
    expect(totalOf(tickedLines(AREA_LINES, { W1: true }))).toBe(633600);
    expect(allTicked(AREA_LINES)).toEqual({ W1: true, W2: true });
  });

  it("labels the split, the size and the heading", () => {
    expect(splitLabel(SPLIT)).toBe("60% material · 20% labour · 20% overhead & profit");
    expect(splitLabel({ material: 33.333, labour: 33.333, overheadProfit: 33.334 })).toBe(
      "33.33% material · 33.33% labour · 33.33% overhead & profit",
    );
    expect(splitLabel(null)).toBe("");
    expect(sizeLabel(AREA_LINES[0])).toBe("1200×1500 mm · 1.8 m²");
    expect(sizeLabel(RATE_LINES[0])).toBe("");
    const naira = (v) => `N${v}`;
    expect(userRateHeading({ basis: "area", category: "windows", ratePerM2: 88000 }, naira)).toBe(
      "Windows at N88000 per m²",
    );
    expect(userRateHeading({ basis: "area", category: "doors", ratePerM2: 65000 }, naira)).toBe(
      "Doors at N65000 per m²",
    );
    expect(userRateHeading({ basis: "rate", rate: 9500, unit: "m2" }, naira)).toBe(
      "N9500 per m2 on the lines you named",
    );
  });
});

describe("report card", () => {
  it("labels a range in British dates, with an en dash for nothing", () => {
    expect(rangeLabel("2026-09-01", "2026-09-30")).toBe("1 Sept 2026 to 30 Sept 2026");
    expect(rangeLabel("2026-09-01", "2026-09-01")).toBe("1 Sept 2026");
    expect(rangeLabel("", "2026-09-30")).toBe("Up to 30 Sept 2026");
    expect(rangeLabel("", "")).toBe("–");
  });
});

describe("openAda", () => {
  it("dispatches the open event with the prompt", () => {
    const seen = vi.fn();
    window.addEventListener(ADA_OPEN_EVENT, seen);
    openAda("  Price my bill ");
    window.removeEventListener(ADA_OPEN_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].detail).toEqual({ prompt: "Price my bill" });
  });
});
