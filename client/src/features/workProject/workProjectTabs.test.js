import { describe, it, expect } from "vitest";
import { tabsFor, resolveTab, tabCount, tabNeedsAttention } from "./workProjectTabs.js";

const keys = (k) => tabsFor(k).map((t) => t.key);

describe("which tabs a project gets", () => {
  it("gives every project the five that always have something to show", () => {
    expect(keys("rategen")).toEqual(["overview", "bill", "rates", "pm", "valuations"]);
  });

  it("gives a Revit job the Model tab and a PlanSwift job the Drawings tab, not both", () => {
    expect(keys("revit")).toContain("model");
    expect(keys("revit")).not.toContain("drawings");
    expect(keys("planswift")).toContain("drawings");
    expect(keys("planswift")).not.toContain("model");
  });

  it("offers Services only where a services project can be linked in", () => {
    expect(keys("revit")).toContain("services");
    expect(keys("planswift")).toContain("services");
    expect(keys("mep")).not.toContain("services");
    expect(keys("rategen")).not.toContain("services");
  });

  it("does not care how the product key is cased or spaced", () => {
    expect(keys(" Revit ")).toContain("model");
  });
});

describe("the tab a URL asks for", () => {
  it("is honoured when the project has it", () => {
    expect(resolveTab("valuations", "revit")).toBe("valuations");
  });

  it("falls back to Overview rather than dead-ending on a tab this project lacks", () => {
    // A ?tab=model link copied from a Revit job, opened on a PlanSwift one.
    expect(resolveTab("model", "planswift")).toBe("overview");
  });

  it("falls back for junk, empty and missing input", () => {
    expect(resolveTab("", "revit")).toBe("overview");
    expect(resolveTab(undefined, "revit")).toBe("overview");
    expect(resolveTab("'; drop", "revit")).toBe("overview");
  });
});

describe("the count beside a tab", () => {
  it("counts bill lines, from either shape the API returns", () => {
    expect(tabCount("bill", { itemCount: 65 })).toBe(65);
    expect(tabCount("bill", { items: [1, 2, 3] })).toBe(3);
  });

  it("is null when we do not know, so the tab prints nothing rather than '0 lines'", () => {
    expect(tabCount("bill", {})).toBeNull();
    expect(tabCount("bill", null)).toBeNull();
  });

  it("is null on every other tab, which would only be recounting the same lines", () => {
    for (const t of ["overview", "rates", "pm", "valuations", "model"]) {
      expect(tabCount(t, { itemCount: 65 })).toBeNull();
    }
  });

  it("reports a genuinely empty bill as 0, which is different from not knowing", () => {
    expect(tabCount("bill", { itemCount: 0 })).toBe(0);
  });
});

describe("the attention dot", () => {
  it("lights on the counts we actually have", () => {
    expect(tabNeedsAttention("rates", { unpricedCount: 4 })).toBe(true);
    expect(tabNeedsAttention("valuations", { valuationsAwaiting: 1 })).toBe(true);
    expect(tabNeedsAttention("pm", { overdueTasks: 2 })).toBe(true);
  });

  it("stays dark at zero and on a project we know nothing about", () => {
    expect(tabNeedsAttention("rates", { unpricedCount: 0 })).toBe(false);
    expect(tabNeedsAttention("rates", {})).toBe(false);
    expect(tabNeedsAttention("pm", null)).toBe(false);
  });

  it("never lights the two whose counts have no server field yet", () => {
    // Rate staleness and model drift are in his design and not in our data.
    // They must stay dark rather than be faked — a dot that cannot go out is
    // worse than no dot.
    expect(tabNeedsAttention("model", { drift: 3 })).toBe(false);
    expect(tabNeedsAttention("bill", { stale: 5 })).toBe(false);
  });
});
