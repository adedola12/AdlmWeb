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
