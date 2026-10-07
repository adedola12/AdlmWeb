import { describe, expect, it } from "vitest";
import { levelOf, lineKey, pricedSentence, similarLines } from "./similarLines.js";

// The descriptions a QUIV bill really carries (Shonibare, Oct 2026). The server
// mirror (server/util/rateSuggestions.usage.test.js) uses the same three.
const L01 = "Blockwork - Lintel Concrete [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]";
const L02 = "Blockwork - Lintel Concrete [L:02 GROUND FLOOR | T:Generic - 230mm]";
const L03_150 = "Blockwork - Lintel Concrete [L:03 FIRST FLOOR | T:Generic - 150mm]";

describe("lineKey", () => {
  it("drops the level and keeps the type", () => {
    expect(lineKey(L01)).toBe(lineKey(L02));
    expect(lineKey(L01)).not.toBe(lineKey(L03_150));
    expect(lineKey(L01)).toBe("blockwork - lintel concrete [t:generic - 230mm]");
  });

  it("matches the server's reading of a plain description", () => {
    expect(lineKey("  Excavate   to reduce level ")).toBe("excavate to reduce level");
    expect(lineKey("Column [L:01 GROUND]")).toBe("column");
  });
});

describe("levelOf", () => {
  it("reads the level a QUIV line names", () => {
    expect(levelOf(L02)).toBe("02 GROUND FLOOR");
    expect(levelOf("Excavate")).toBe("");
  });
});

describe("similarLines", () => {
  const bill = [
    { code: "A.1", description: L01, unit: "m3", qty: 1.26, rate: 0 },
    { code: "A.2", description: L02, unit: "Cu.m", qty: 0.11, rate: 0 },
    { code: "A.3", description: L03_150, unit: "m3", qty: 0.15, rate: 0 },
    { code: "A.4", description: L02.replace("L:02", "L:04"), unit: "m3", qty: 3.25, rate: 9000 },
    { code: "A.5", description: L02.replace("L:02", "L:05"), unit: "m2", qty: 3, rate: 0 },
    { code: "", description: L02, unit: "m3", qty: 1, rate: 0 },
  ];

  it("finds the same item in the same unit, unpriced, with a code, not itself", () => {
    const got = similarLines(bill, bill[0]);
    expect(got.map((l) => l.code)).toEqual(["A.2"]);
    expect(got[0]).toMatchObject({ index: 1, level: "02 GROUND FLOOR", qty: 0.11 });
  });

  it("never offers a priced line unless asked", () => {
    expect(similarLines(bill, bill[0], { unpricedOnly: false }).map((l) => l.code)).toEqual([
      "A.2",
      "A.4",
    ]);
  });

  it("offers nothing for a line with no unit", () => {
    expect(similarLines(bill, { ...bill[0], unit: "" })).toEqual([]);
  });
});

describe("pricedSentence", () => {
  it("says how many were priced and skipped", () => {
    expect(pricedSentence({ _priced: ["a", "b"], _skipped: [] })).toBe("Priced 2 lines.");
    expect(pricedSentence({ _priced: ["a"], _skipped: [{}] })).toBe("Priced 1 line. 1 line skipped.");
    expect(pricedSentence({ _priced: [], _skipped: [{}, {}] })).toBe(
      "No lines were priced. 2 lines skipped.",
    );
    expect(pricedSentence({})).toBe("");
  });
});
