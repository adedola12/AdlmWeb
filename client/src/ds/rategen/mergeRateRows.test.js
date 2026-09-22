import { describe, it, expect } from "vitest";
import { mergeRateRows } from "./mergeRateRows.js";

const master = [
  { id: "a1", description: "Blockwork 225mm", sectionKey: "blockwork", sectionLabel: "Blockwork", totalCost: 1000 },
  { id: "a2", description: "Concrete 1:2:4", sectionKey: "concrete", sectionLabel: "Concrete Works", totalCost: 2000 },
];

describe("mergeRateRows", () => {
  it("shows published rates untouched when the user has none of their own", () => {
    const out = mergeRateRows(master, [], []);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.own === null)).toBe(true);
    expect(out[0].href).toBe("/work/rate/a1");
  });

  it("replaces a published rate with the user's copy rather than listing both", () => {
    const out = mergeRateRows(
      master,
      [{ rateId: "a1", description: "Blockwork 225mm", totalCost: 1150 }],
      [],
    );
    expect(out).toHaveLength(2);
    const row = out.find((r) => r.id === "a1");
    expect(row.totalCost).toBe(1150);
    expect(row.own).toBe("edited");
    // Still opens the master rate's build-up, where the override is edited.
    expect(row.href).toBe("/work/rate/a1");
  });

  it("keeps the published section label when the override carries none", () => {
    const out = mergeRateRows(master, [{ rateId: "a1", sectionLabel: "" }], []);
    expect(out.find((r) => r.id === "a1").sectionLabel).toBe("Blockwork");
  });

  it("appends the user's own rates, marked and addressed separately", () => {
    const out = mergeRateRows(master, [], [
      { customRateId: "tiling-abc", description: "Ceramic tiling", totalCost: 9000 },
    ]);
    expect(out).toHaveLength(3);
    const own = out[2];
    expect(own.own).toBe("custom");
    expect(own.id).toBe("custom:tiling-abc");
    expect(own.href).toBe("/work/rate/custom:tiling-abc");
  });

  it("ignores an override with no rate id rather than shadowing the wrong rate", () => {
    const out = mergeRateRows(master, [{ rateId: "", totalCost: 1 }], []);
    expect(out.every((r) => r.own === null)).toBe(true);
  });

  it("copes with every source being empty", () => {
    expect(mergeRateRows()).toEqual([]);
  });
});
