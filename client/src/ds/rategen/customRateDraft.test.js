import { describe, it, expect } from "vitest";
import {
  CUSTOM_DEFAULT_OVERHEAD,
  CUSTOM_DEFAULT_PROFIT,
  draftProblem,
  draftToPayload,
  draftTotals,
  emptyDraft,
  newCustomRateId,
  slugify,
} from "./customRateDraft.js";

const draft = () => ({
  ...emptyDraft({ sectionKey: "finishes", sectionLabel: "Finishes" }),
  name: "  Ceramic floor tiling  ",
  unit: "m²",
  overhead: "12",
  profit: "8",
  description: "",
  lines: [
    { kind: "material", name: "Ceramic tile", unit: "m2", unitPrice: 6000, quantity: 1.05, refSn: 12 },
    { kind: "labour", name: "Tiling gang", unit: "day", unitPrice: 30000, quantity: 0.05, refSn: 4 },
    { kind: "plant", name: "Mixer", unit: "h", unitPrice: 2000, quantity: 0.1, refSn: null },
  ],
});

describe("slugify and newCustomRateId", () => {
  it("makes a readable slug", () => {
    expect(slugify("Ceramic floor tiling 300×300")).toBe("ceramic-floor-tiling-300-300");
  });

  it("never returns a bare slug, so two rates of the same name do not collide", () => {
    const a = newCustomRateId("Tiling");
    expect(a.startsWith("tiling-")).toBe(true);
    expect(a.length).toBeGreaterThan("tiling-".length);
  });

  it("falls back to a usable id when the name has nothing to slug", () => {
    expect(newCustomRateId("???").startsWith("rate-")).toBe(true);
  });
});

describe("draftTotals", () => {
  it("adds the lines and takes both percentages on net", () => {
    const t = draftTotals(draft());
    // 6300 + 1500 + 200
    expect(t.netCost).toBeCloseTo(8000, 6);
    expect(t.overheadValue).toBeCloseTo(960, 6);
    expect(t.profitValue).toBeCloseTo(640, 6);
    expect(t.totalCost).toBeCloseTo(9600, 6);
  });

  it("uses the server's own fallbacks when the boxes are left blank", () => {
    const d = { ...draft(), overhead: "", profit: "" };
    const t = draftTotals(d);
    expect(t.overheadPercent).toBe(CUSTOM_DEFAULT_OVERHEAD);
    expect(t.profitPercent).toBe(CUSTOM_DEFAULT_PROFIT);
    expect(t.totalCost).toBeCloseTo(8000 * 1.2, 6);
  });

  it("is zero for an empty draft rather than NaN", () => {
    expect(draftTotals(emptyDraft()).totalCost).toBe(0);
  });

  it("treats a negative quantity as zero rather than as a credit", () => {
    const d = { ...emptyDraft(), lines: [{ kind: "material", name: "X", unitPrice: 100, quantity: -5 }] };
    expect(draftTotals(d).netCost).toBe(0);
  });
});

describe("draftProblem", () => {
  it("passes a complete draft", () => {
    expect(draftProblem(draft())).toBe(null);
  });

  it("asks for a name first", () => {
    expect(draftProblem({ ...draft(), name: "   " })).toMatch(/name/i);
  });

  it("asks for a unit", () => {
    expect(draftProblem({ ...draft(), unit: "" })).toMatch(/unit/i);
  });

  it("refuses a rate with no lines", () => {
    expect(draftProblem({ ...draft(), lines: [] })).toMatch(/at least one/i);
  });

  it("refuses a line with nothing on it", () => {
    const d = draft();
    d.lines = [{ kind: "material", name: "", unitPrice: 1, quantity: 1 }];
    expect(draftProblem(d)).toMatch(/every line/i);
  });
});

describe("draftToPayload", () => {
  const p = draftToPayload(draft(), "ceramic-floor-tiling-abc12", 7);

  it("trims the name and uses it as the description when none was typed", () => {
    expect(p.title).toBe("Ceramic floor tiling");
    expect(p.description).toBe("Ceramic floor tiling");
  });

  it("sends materials and labour as their own arrays, for the plugins", () => {
    expect(p.materials).toHaveLength(1);
    expect(p.materials[0].rateType).toBe("material");
    expect(p.materials[0].refSn).toBe(12);
    expect(p.labour).toHaveLength(1);
    expect(p.labour[0].rateType).toBe("labour");
  });

  it("puts every line, plant included, in the breakdown with its kind", () => {
    expect(p.breakdown).toHaveLength(3);
    const plant = p.breakdown.find((b) => b.refKind === "plant");
    expect(plant.componentName).toBe("Mixer");
    expect(plant.lineTotal).toBeCloseTo(200, 6);
  });

  it("sends the net cost explicitly, so the plant line is not dropped from it", () => {
    // normalizeCustomRate falls back to materials + labour only. Sending
    // netCost is what keeps a plant line inside the rate's cost.
    expect(p.netCost).toBeCloseTo(8000, 6);
  });

  it("sends the percentages actually used, never a blank", () => {
    const blank = draftToPayload({ ...draft(), overhead: "", profit: "" }, "x", 1);
    expect(blank.overheadPercent).toBe(CUSTOM_DEFAULT_OVERHEAD);
    expect(blank.profitPercent).toBe(CUSTOM_DEFAULT_PROFIT);
  });

  it("carries the version guard so a concurrent desktop sync cannot be clobbered", () => {
    expect(p.customRatesBaseVersion).toBe(7);
  });

  it("keeps the trade the draft was filed under", () => {
    expect(p.sectionKey).toBe("finishes");
    expect(p.sectionLabel).toBe("Finishes");
  });
});
