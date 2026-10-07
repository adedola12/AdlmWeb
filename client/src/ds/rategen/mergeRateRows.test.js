import { describe, it, expect } from "vitest";
import { mergeRateRows } from "./mergeRateRows.js";

const master = [
  { id: "a1", description: "Blockwork 225mm", sectionKey: "blockwork", sectionLabel: "Blockwork", totalCost: 1000 },
  { id: "a2", description: "Concrete 1:2:4", sectionKey: "concrete", sectionLabel: "Concrete Works", totalCost: 2000 },
];

// A published rate that IS itemised: 800 of net explained by two lines.
const itemisedMaster = [
  {
    ...master[0],
    netCost: 800,
    breakdown: [
      { componentName: "Sandcrete block", refKind: "material", quantity: 10, unit: "no", unitPrice: 60, lineTotal: 600 },
      { componentName: "Mason gang", refKind: "labour", quantity: 0.01, unit: "day", unitPrice: 20000, lineTotal: 200 },
    ],
    composition: {
      netCost: 800,
      components: [
        { name: "Sandcrete block", kind: "material", quantity: 10, unit: "no", unitPrice: 60, totalCost: 600 },
        { name: "Mason gang", kind: "labour", quantity: 0.01, unit: "day", unitPrice: 20000, totalCost: 200 },
      ],
    },
  },
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

// ── S18 review, finding 3 ───────────────────────────────────────────────────
// An override with no build-up of its own used to inherit the master's lines
// through the spread, because an absent key does not overwrite a present one.
// The card then listed components adding to 800 against a net cost of 1,200.
describe("an override with no build-up of its own", () => {
  const bare = [{ rateId: "a1", description: "Blockwork 225mm", netCost: 1200, totalCost: 1500, breakdown: [] }];

  it("does not inherit the published rate's components", () => {
    const row = mergeRateRows(itemisedMaster, bare, []).find((r) => r.id === "a1");
    expect(row.composition).toBe(null);
    expect(row.breakdown).toEqual([]);
    expect(row.netCost).toBe(1200);
  });

  it("does not inherit them when the override omits breakdown entirely", () => {
    const noKey = [{ rateId: "a1", description: "Blockwork 225mm", netCost: 1200, totalCost: 1500 }];
    const row = mergeRateRows(itemisedMaster, noKey, []).find((r) => r.id === "a1");
    expect(row.composition).toBe(null);
    expect(row.breakdown).toEqual([]);
  });

  it("keeps the customer's own lines when they have them", () => {
    const own = [
      {
        rateId: "a1",
        netCost: 900,
        totalCost: 1100,
        breakdown: [
          { componentName: "Sandcrete block", refKind: "material", quantity: 15, unit: "no", unitPrice: 60, lineTotal: 900 },
        ],
        composition: {
          netCost: 900,
          components: [
            { name: "Sandcrete block", kind: "material", quantity: 15, unit: "no", unitPrice: 60, totalCost: 900 },
          ],
        },
      },
    ];
    const row = mergeRateRows(itemisedMaster, own, []).find((r) => r.id === "a1");
    expect(row.composition.components).toHaveLength(1);
    expect(row.breakdown[0].lineTotal).toBe(900);
  });

  it("leaves a published rate's own build-up alone", () => {
    const row = mergeRateRows(itemisedMaster, [], []).find((r) => r.id === "a1");
    expect(row.composition.components).toHaveLength(2);
  });
});
