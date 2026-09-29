import { describe, it, expect } from "vitest";
import {
  misfiledLines,
  orderedSections,
  sectionCounts,
  sectionsOnBill,
  suggestSectionFor,
  suggestedArrangement,
  withLineSection,
  withSectionAdded,
  withSectionMoved,
  withSectionRenamed,
} from "./sectionsModel.js";

// The order lives in `customCategories`, which the project already had and the
// PUT already accepts. These pin the two rules that make that safe: a section
// the bill uses is never hidden because the list forgot it, and a patch is
// never produced for a change that changes nothing.

const project = (over = {}) => ({
  productKey: "revit",
  customCategories: ["Substructure", "Frames"],
  items: [
    { code: "BQ-1", category: "Frames", description: "Reinforced concrete column" },
    { code: "BQ-2", category: "Substructure", description: "Excavate for foundations" },
    { code: "BQ-3", category: "Roofing", description: "Roof covering" },
  ],
  ...over,
});

describe("what sections the bill uses", () => {
  it("lists them in the order the lines first use them", () => {
    expect(sectionsOnBill(project().items)).toEqual(["Frames", "Substructure", "Roofing"]);
  });

  it("counts the lines in each", () => {
    const c = sectionCounts(project().items);
    expect(c.get("frames")).toBe(1);
    expect(c.get("roofing")).toBe(1);
  });

  it("does not throw on a project with no bill", () => {
    expect(sectionsOnBill(null)).toEqual([]);
  });
});

describe("the order a project's sections are in", () => {
  it("is the listed order first", () => {
    expect(orderedSections(project()).slice(0, 2)).toEqual(["Substructure", "Frames"]);
  });

  it("never hides a section the bill actually uses", () => {
    // Roofing is on a line but not in customCategories. Dropping it would hide
    // every line filed under it.
    expect(orderedSections(project())).toContain("Roofing");
  });

  it("keeps a listed section that no line uses yet", () => {
    // That is how a section a QS just added survives until something is filed
    // under it.
    const p = project({ customCategories: ["Substructure", "Frames", "Finishes"] });
    expect(orderedSections(p)).toContain("Finishes");
  });

  it("does not list one section twice when the casing differs", () => {
    const p = project({ customCategories: ["frames"] });
    const got = orderedSections(p).filter((s) => s.toLowerCase() === "frames");
    expect(got).toHaveLength(1);
  });
});

describe("moving a section", () => {
  it("moves it and keeps the rest in order", () => {
    // Substructure, Frames, Roofing -> Roofing first.
    const patch = withSectionMoved(project(), 2, 0);
    expect(patch.customCategories).toEqual(["Roofing", "Substructure", "Frames"]);
  });

  it("writes nothing when a drag ends where it started", () => {
    expect(withSectionMoved(project(), 1, 1)).toBe(null);
  });

  it("refuses an index that is not a section", () => {
    expect(withSectionMoved(project(), 9, 0)).toBe(null);
    expect(withSectionMoved(project(), 0, -1)).toBe(null);
  });

  it("carries the sections the list had not named, so they are not lost", () => {
    expect(withSectionMoved(project(), 0, 1).customCategories).toContain("Roofing");
  });
});

describe("adding a section", () => {
  it("appends it", () => {
    expect(withSectionAdded(project(), "Finishes").customCategories).toEqual([
      "Substructure",
      "Frames",
      "Roofing",
      "Finishes",
    ]);
  });

  it("refuses a blank name", () => {
    expect(withSectionAdded(project(), "   ")).toBe(null);
  });

  it("refuses one the project already has, whatever the casing", () => {
    // Two sections differing only by case group as one on every screen.
    expect(withSectionAdded(project(), "frames")).toBe(null);
    expect(withSectionAdded(project(), "ROOFING")).toBe(null);
  });

  it("trims what it is given", () => {
    expect(withSectionAdded(project(), "  Finishes  ").customCategories).toContain("Finishes");
  });
});

describe("renaming a section", () => {
  it("renames the list entry and every line filed under it", () => {
    // Both, or the lines bring the old name straight back.
    const patch = withSectionRenamed(project(), "Frames", "Superstructure");
    expect(patch.customCategories).toContain("Superstructure");
    expect(patch.customCategories).not.toContain("Frames");
    expect(patch.items.find((i) => i.code === "BQ-1").category).toBe("Superstructure");
  });

  it("leaves the other lines alone", () => {
    const patch = withSectionRenamed(project(), "Frames", "Superstructure");
    expect(patch.items.find((i) => i.code === "BQ-2").category).toBe("Substructure");
  });

  it("refuses to rename onto a section that already exists", () => {
    expect(withSectionRenamed(project(), "Frames", "Roofing")).toBe(null);
  });

  it("writes nothing for a rename to the same name", () => {
    expect(withSectionRenamed(project(), "Frames", "frames")).toBe(null);
  });
});

describe("what the bill engine suggests", () => {
  it("files a line the way the server would file it", () => {
    // Same classifier the server runs on every save, so a suggestion here and
    // what the next save does cannot disagree.
    expect(suggestSectionFor({ description: "Excavate for pile caps" }, "revit")).toBe(
      "Substructure",
    );
    expect(suggestSectionFor({ description: "Reinforced concrete beam" }, "revit")).toBe("Frames");
  });

  it("says nothing when the engine does not know", () => {
    // Uncategorized is the engine admitting it cannot tell, not an answer.
    expect(suggestSectionFor({ description: "Sundries" }, "revit")).toBe("");
  });

  it("points out only the lines it is confident are in the wrong place", () => {
    const p = project({
      items: [
        { code: "BQ-1", category: "Substructure", description: "Reinforced concrete column" },
        { code: "BQ-2", category: "Substructure", description: "Excavate for foundations" },
        { code: "BQ-3", category: "Substructure", description: "Sundries" },
      ],
    });
    const out = misfiledLines(p, "revit");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 0, now: "Substructure", suggested: "Frames" });
  });
});

describe("suggesting an arrangement", () => {
  it("puts the engine's own order first, keeping the rest after it", () => {
    const p = project({ customCategories: ["Frames", "Roofing", "Substructure"] });
    expect(suggestedArrangement(p, "revit").customCategories).toEqual([
      "Substructure",
      "Frames",
      "Roofing",
    ]);
  });

  it("keeps the project's spelling, not the engine's", () => {
    const p = project({ customCategories: ["frames", "substructure"], items: [] });
    expect(suggestedArrangement(p, "revit").customCategories).toEqual(["substructure", "frames"]);
  });

  it("says there is nothing to change when it is already arranged", () => {
    const p = project({ customCategories: ["Substructure", "Frames"], items: [] });
    expect(suggestedArrangement(p, "revit")).toBe(null);
  });
});

describe("dropping a line into a section", () => {
  it("files it there", () => {
    expect(withLineSection(project(), 0, "Roofing").items[0].category).toBe("Roofing");
  });

  it("leaves every other line alone", () => {
    const patch = withLineSection(project(), 0, "Roofing");
    expect(patch.items[1].category).toBe("Substructure");
    expect(patch.items).toHaveLength(3);
  });

  it("writes nothing when the line is already there", () => {
    expect(withLineSection(project(), 0, "Frames")).toBe(null);
  });

  it("refuses a blank section or an index that is not a line", () => {
    expect(withLineSection(project(), 0, "  ")).toBe(null);
    expect(withLineSection(project(), 9, "Roofing")).toBe(null);
  });
});
