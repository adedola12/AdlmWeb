import { describe, it, expect } from "vitest";
import {
  applicableCount,
  isOwnRate,
  normaliseUnit,
  rateAmount,
  rateIdOf,
  searchRates,
  unitsAgree,
} from "./rateSearch.js";

// The fixtures are the REAL merged shape: mergeRatesWithUserData builds every
// rate through toUserRateDefinition, which records ownership as
// `source: "master" | "user-override" | "user-custom"` and carries the sell
// price as `totalCost`. There is no `unitPrice` and no `isCustom` field.

const master = (over = {}) => ({
  id: "m1",
  rateId: "m1",
  customRateId: null,
  source: "master",
  description: "Blockwork 225mm thick in cement mortar",
  unit: "m2",
  netCost: 8000,
  totalCost: 9600,
  ...over,
});
const mine = (over = {}) => master({ id: "c1", rateId: null, customRateId: "c1", source: "user-custom", ...over });

const LIBRARY = [
  master(),
  mine({ customRateId: "c1", totalCost: 11_500 }),
  master({ id: "m2", rateId: "m2", description: "Hollow clay block infill to slab", unit: "m2", totalCost: 7_200 }),
  master({ id: "m3", rateId: "m3", description: "Concrete grade 25 in columns", unit: "m3", totalCost: 72_000 }),
  master({ id: "m4", rateId: "m4", description: "Blockwork 225mm in foundation", unit: "m3", totalCost: 14_000 }),
  master({ id: "m5", rateId: "m5", description: "Reinforcement bar high yield", unit: "tonne", totalCost: 950_000 }),
];

describe("finding a rate by name", () => {
  it("finds a rate on a word from its description", () => {
    const out = searchRates(LIBRARY, "blockwork", { unit: "m2" });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].description).toMatch(/Blockwork/);
  });

  it("needs EVERY typed word, so a phrase narrows rather than widens", () => {
    expect(searchRates(LIBRARY, "blockwork foundation", { unit: "m3" })[0].description).toBe(
      "Blockwork 225mm in foundation",
    );
    expect(searchRates(LIBRARY, "blockwork nonsense", { unit: "m2" })).toEqual([]);
  });

  it("puts a match at the START of the name first", () => {
    // "block" should find "Blockwork 225mm" before "Hollow clay block infill".
    const out = searchRates(LIBRARY, "block", { unit: "m2" });
    expect(out[0].description).toMatch(/^Blockwork/);
  });

  it("offers the QS's OWN rate before an identical master one", () => {
    const out = searchRates(LIBRARY, "blockwork 225mm thick", { unit: "m2" });
    expect(out[0].own).toBe(true);
    expect(out[0].amount).toBe(11_500);
    expect(out[0].why).toBe("Your own rate");
  });

  it("reads the price off totalCost, because the merged shape has no unitPrice", () => {
    // Reading unitPrice alone would price every rate at zero and offer none.
    expect(rateAmount({ totalCost: 9600 })).toBe(9600);
    expect(rateAmount({ unitPrice: 500, totalCost: 9600 })).toBe(500);
    expect(rateAmount({ netCost: 8000 })).toBe(0);
  });

  it("skips a rate with no money in it", () => {
    const out = searchRates([master({ totalCost: 0 })], "blockwork", { unit: "m2" });
    expect(out).toEqual([]);
  });

  it("says nothing for an empty search", () => {
    expect(searchRates(LIBRARY, "")).toEqual([]);
    expect(searchRates(LIBRARY, "   ")).toEqual([]);
    expect(searchRates(null, "block")).toEqual([]);
  });
});

describe("the unit gate", () => {
  it("SHOWS a rate in another unit but will not let it be applied", () => {
    // Hiding it leaves somebody hunting for a rate they can see in RateGen.
    // Offering it lets them price an m2 line at an m3 rate in one click — wrong
    // by the thickness, and it looks entirely reasonable on the bill.
    const out = searchRates(LIBRARY, "blockwork", { unit: "m2" });
    const wrongUnit = out.find((r) => r.unit === "m3");
    expect(wrongUnit).toBeTruthy();
    expect(wrongUnit.canApply).toBe(false);
    expect(wrongUnit.why).toMatch(/Measured in m3 — this line is m2/);
  });

  it("puts everything applicable above everything that is not", () => {
    const out = searchRates(LIBRARY, "blockwork", { unit: "m2" });
    const firstBad = out.findIndex((r) => !r.canApply);
    const lastGood = out.map((r) => r.canApply).lastIndexOf(true);
    if (firstBad !== -1) expect(firstBad).toBeGreaterThan(lastGood - 1);
  });

  it("counts what could actually be used, so a screen can say so", () => {
    const out = searchRates(LIBRARY, "blockwork", { unit: "m2" });
    expect(applicableCount(out)).toBe(2);
    expect(applicableCount(searchRates(LIBRARY, "blockwork", { unit: "kg" }))).toBe(0);
    expect(applicableCount(null)).toBe(0);
  });

  it("matches units as bills actually spell them", () => {
    // The same table the server uses. A spelling it does not know would make a
    // perfectly good rate unapplicable with no way to tell why.
    for (const [bill, lib] of [
      ["Nos.", "Nr"], ["Sq.m", "m2"], ["Cu.m", "m3"], ["Lin.m", "m"],
      ["pcs", "No"], ["tonnes", "tonne"], ["ITEM", "nr"],
    ]) {
      expect(unitsAgree(bill, lib), `${bill} vs ${lib}`).toBe(true);
    }
    expect(unitsAgree("m2", "m3")).toBe(false);
    expect(unitsAgree("kg", "tonne")).toBe(false);
    expect(normaliseUnit("Sq.m")).toBe("m2");
  });

  it("applies no gate at all when the line has no unit", () => {
    const out = searchRates(LIBRARY, "blockwork", {});
    expect(out.every((r) => r.canApply)).toBe(true);
  });
});

describe("identifying a rate to the server", () => {
  it("uses the id the apply endpoint resolves by", () => {
    // resolvePickedRate matches on `rateId || id`. A custom rate has rateId null
    // and carries its id on customRateId, so reading rateId alone would send an
    // empty string and the server would answer RATE_NOT_FOUND.
    expect(rateIdOf({ rateId: "m1", id: "m1" })).toBe("m1");
    expect(rateIdOf({ rateId: null, id: "c1", customRateId: "c1" })).toBe("c1");
    expect(rateIdOf({ customRateId: "c9" })).toBe("c9");
    expect(rateIdOf({})).toBe("");
  });

  it("knows whose rate it is from the field the merge actually emits", () => {
    expect(isOwnRate({ source: "user-custom" })).toBe(true);
    expect(isOwnRate({ source: "user-override" })).toBe(true);
    expect(isOwnRate({ source: "master" })).toBe(false);
    // And still reads a raw customRates row, for a caller that passes one.
    expect(isOwnRate({ customRateId: "c1" })).toBe(true);
  });

  it("carries the id through the search results", () => {
    const out = searchRates(LIBRARY, "blockwork 225mm thick", { unit: "m2" });
    expect(out[0].rateId).toBe("c1");
    expect(out.find((r) => !r.own).rateId).toBe("m1");
  });
});

describe("what the real library taught it", () => {
  // Checked against the 150 rates on the live account. Searching "block" finds
  // 12 rates whose description says so and 18 more that merely sit in a section
  // called Blockwork — "Mortar Mix (1:3)". The blockwall rates are the answer.
  const REAL = [
    { id: "s1", rateId: "s1", source: "user-custom", description: "Mortar Mix (1:3)", sectionLabel: "Blockwork", unit: "m3", totalCost: 166_739 },
    { id: "s2", rateId: "s2", source: "user-custom", description: "Mortar Mix (1:4)", sectionLabel: "Blockwork", unit: "m3", totalCost: 139_895 },
    { id: "n1", rateId: "n1", source: "user-custom", description: "225mm blockwall in cement and sand mortar (1:6)", sectionLabel: "Blockwork", unit: "m2", totalCost: 26_466 },
    { id: "u1", rateId: "u1", source: "user-custom", description: "Help me build up rate for 225mm blockwork", sectionLabel: "", unit: "", totalCost: 24_704 },
  ];

  it("a rate whose NAME matches beats one that only sits in that section", () => {
    const out = searchRates(REAL, "block", { unit: "m2" });
    expect(out[0].description).toMatch(/blockwall/);
  });

  it("still offers the section matches, below", () => {
    // They are real rates in the right section; a QS pricing an m3 line may well
    // want the mortar mix.
    const out = searchRates(REAL, "block", { unit: "m3" });
    expect(out[0].description).toMatch(/Mortar Mix/);
    expect(out[0].canApply).toBe(true);
  });

  it("a rate with NO unit does not render as 'Measured in  —'", () => {
    // Several real rates carry an empty unit. The sentence has to still read.
    const out = searchRates(REAL, "help me build", { unit: "m2" });
    expect(out[0].canApply).toBe(false);
    expect(out[0].why).toBe("No unit set on this rate — this line is m2");
    expect(out[0].why).not.toMatch(/Measured in {2}/);
  });
});

describe("rates in another unit, with conversions on", () => {
  const lib = [
    { rateId: "c", description: "Concrete grade 20", unit: "m3", totalCost: 154_916 },
    { rateId: "b", description: "Concrete blocks", unit: "m2", totalCost: 12_000 },
    { rateId: "k", description: "Concrete reinforcement bars", unit: "kg", totalCost: 1_200 },
  ];

  it("makes a convertible rate applicable, with the dimension read off the line", () => {
    const out = searchRates(lib, "concrete", {
      unit: "m2",
      convert: true,
      description: "Lintel Concrete [L:01 | T:Generic - 230mm]",
    });
    const c = out.find((r) => r.rateId === "c");
    expect(c.canApply).toBe(true);
    expect(c.convert).toMatchObject({ rateUnit: "m3", needs: ["thickness"], dims: { thickness: 0.23 } });
    expect(c.why).toBe("Converts to m2 at 230 mm thick");
    // A rate already in the line's unit still comes first.
    expect(out[0].rateId).toBe("b");
    // kg cannot become m2.
    expect(out.find((r) => r.rateId === "k").canApply).toBe(false);
  });

  it("leaves the old hard gate in place when conversions are off", () => {
    const out = searchRates(lib, "concrete", { unit: "m2" });
    expect(out.find((r) => r.rateId === "c").canApply).toBe(false);
  });
});
