import { describe, it, expect } from "vitest";
import {
  amountOf,
  chipCounts,
  doneOf,
  elementOf,
  foldLabel,
  groupBill,
  identityCode,
  isPriced,
  matches,
  measuredAt,
  sectionOpen,
  tradeOf,
} from "./billModel.js";

// A bill as it really arrives, not as his fixture had it: `description` not
// `desc`, `takeoffLine` not `el`, `percentComplete` not `done`, and the rate is
// the VALUE rather than an id into a library.
const BILL = [
  {
    code: "BQ-1",
    description: "Excavate foundation trench n.e. 1.5m deep",
    takeoffLine: "Grid A-D",
    category: "Substructure",
    trade: "Earthworks",
    unit: "m3",
    qty: 120,
    rate: 2_500,
    percentComplete: 100,
  },
  {
    code: "BQ-2",
    description: "Plain in-situ concrete grade 15 in blinding",
    takeoffLine: "Grid A-D",
    category: "Substructure",
    trade: "Concrete",
    unit: "m2",
    qty: 85,
    rate: 4_200,
    percentComplete: 40,
  },
  {
    code: "BQ-3",
    description: "Reinforced concrete grade 25 in columns",
    takeoffLine: "Ground floor",
    category: "Frame",
    trade: "Concrete",
    unit: "m3",
    qty: 32,
    // Unpriced.
    rate: 0,
    percentComplete: 0,
  },
];

describe("reading a line", () => {
  it("takes the section from the bill's own category, not a guessed table", () => {
    // His elementOf falls back to a trade→element table his fixture carried. A
    // real bill states its own sections, and that beats any guess at one.
    expect(elementOf(BILL[0])).toBe("Substructure");
    expect(elementOf({ trade: "Concrete" })).toBe("Concrete");
    expect(elementOf({})).toBe("Uncategorised");
  });

  it("keeps where the quantity was measured, which is half the search", () => {
    expect(measuredAt(BILL[0])).toBe("Grid A-D");
  });

  it("calls a line priced only when it has a rate", () => {
    expect(isPriced(BILL[0])).toBe(true);
    expect(isPriced(BILL[2])).toBe(false);
    expect(isPriced({ rate: null })).toBe(false);
  });

  it("clamps progress to 0-100 rather than trusting the field", () => {
    expect(doneOf({ percentComplete: 40 })).toBe(40);
    expect(doneOf({ percentComplete: 140 })).toBe(100);
    expect(doneOf({ percentComplete: -5 })).toBe(0);
    expect(doneOf({})).toBe(0);
  });

  it("amounts to qty × rate, and nothing else", () => {
    expect(amountOf(BILL[0])).toBe(300_000);
    expect(amountOf(BILL[2])).toBe(0);
    expect(amountOf({ qty: "12", rate: "1000" })).toBe(12_000);
    expect(amountOf({ qty: "n/a", rate: 1000 })).toBe(0);
  });

  it("falls back to the trade when there is no section", () => {
    expect(tradeOf({ trade: " Concrete " })).toBe("Concrete");
    expect(tradeOf({})).toBe("Uncategorised");
  });
});

describe("the filter chips", () => {
  it("counts each of his four", () => {
    const c = chipCounts(BILL, { 1: { note: "qty changed" } });
    expect(c.all).toBe(3);
    expect(c.unpriced).toBe(1);
    expect(c.changed).toBe(1);
    // Started and not finished: only BQ-2 at 40%.
    expect(c.progress).toBe(1);
  });

  it("counts no model changes when there is no drift list", () => {
    expect(chipCounts(BILL).changed).toBe(0);
  });

  it("filters to unpriced", () => {
    expect(matches(BILL[0], { filter: "unpriced" })).toBe(false);
    expect(matches(BILL[2], { filter: "unpriced" })).toBe(true);
  });

  it("filters to in progress, excluding both ends", () => {
    expect(matches(BILL[1], { filter: "progress" })).toBe(true);
    expect(matches(BILL[0], { filter: "progress" }), "100% is finished").toBe(false);
    expect(matches(BILL[2], { filter: "progress" }), "0% has not started").toBe(false);
  });

  it("filters to changed only with the drift for that line", () => {
    expect(matches(BILL[1], { filter: "changed", changed: { q: 1 } })).toBe(true);
    expect(matches(BILL[1], { filter: "changed", changed: null })).toBe(false);
  });

  it("searches the description and where it was measured", () => {
    expect(matches(BILL[0], { query: "trench" })).toBe(true);
    expect(matches(BILL[0], { query: "grid a" })).toBe(true);
    expect(matches(BILL[0], { query: "columns" })).toBe(false);
  });

  it("is case and space insensitive", () => {
    expect(matches(BILL[2], { query: "  COLUMNS " })).toBe(true);
  });
});

describe("grouping the bill", () => {
  it("groups by section in first-appearance order, lettered A, B, C", () => {
    const g = groupBill(BILL);
    expect(g.map((s) => s.name)).toEqual(["Substructure", "Frame"]);
    expect(g.map((s) => s.letter)).toEqual(["A", "B"]);
  });

  it("groups by trade when asked", () => {
    const g = groupBill(BILL, { by: "trade" });
    expect(g.map((s) => s.name)).toEqual(["Earthworks", "Concrete"]);
  });

  it("keeps each line's original index, which is its identity", () => {
    // The side panel, a progress write and the drift list all address a line by
    // its index in the project's items array. Grouping must not renumber it.
    const g = groupBill(BILL, { by: "trade" });
    expect(g[0].indexes).toEqual([0]);
    expect(g[1].indexes).toEqual([1, 2]);
  });

  it("numbers a row within its section, as A.1, A.2", () => {
    const g = groupBill(BILL);
    expect(g[0].rows.map((r) => r.ref)).toEqual(["A.1", "A.2"]);
    expect(g[1].rows.map((r) => r.ref)).toEqual(["B.1"]);
  });

  it("totals the WHOLE section, so searching does not change its value", () => {
    const whole = groupBill(BILL)[0].total;
    const searched = groupBill(BILL, { query: "trench" })[0].total;
    expect(whole).toBe(300_000 + 357_000);
    expect(searched).toBe(whole);
  });

  it("drops the rows that do not match but keeps the section", () => {
    const g = groupBill(BILL, { query: "trench" });
    const sub = g.find((s) => s.name === "Substructure");
    expect(sub.indexes).toEqual([0]);
    const frame = g.find((s) => s.name === "Frame");
    expect(frame.indexes).toEqual([]);
  });

  it("renumbers refs within the filtered set, as his does", () => {
    const g = groupBill(BILL, { by: "trade", filter: "unpriced" });
    const concrete = g.find((s) => s.name === "Concrete");
    // Only BQ-3 survives, so it is the first row of its section.
    expect(concrete.rows).toEqual([{ index: 2, ref: "B.1" }]);
  });

  it("does not throw on an empty or missing bill", () => {
    expect(groupBill([])).toEqual([]);
    expect(groupBill(null)).toEqual([]);
  });
});

describe("which sections start open", () => {
  it("opens everything on a normal bill", () => {
    expect(sectionOpen({ name: "Substructure", itemCount: 12 })).toBe(true);
  });

  it("closes them on a big one — his threshold is 80 lines", () => {
    expect(sectionOpen({ name: "Substructure", itemCount: 81 })).toBe(false);
    expect(sectionOpen({ name: "Substructure", itemCount: 80 })).toBe(true);
  });

  it("forces a section open while searching or filtering, even on a big bill", () => {
    // A hit you cannot see is the same as no hit.
    expect(sectionOpen({ name: "X", itemCount: 900, query: "trench" })).toBe(true);
    expect(sectionOpen({ name: "X", itemCount: 900, filter: "unpriced" })).toBe(true);
  });

  it("lets an explicit choice win over the default", () => {
    expect(sectionOpen({ name: "X", itemCount: 900, openMap: { X: true } })).toBe(true);
    expect(sectionOpen({ name: "X", itemCount: 4, openMap: { X: false } })).toBe(false);
  });
});

describe("the fold button", () => {
  it("offers Collapse all while anything is open", () => {
    const g = groupBill(BILL);
    expect(foldLabel(g, {})).toBe("Collapse all");
    expect(foldLabel(g, { Substructure: false })).toBe("Collapse all");
  });

  it("offers Expand all once every section is shut", () => {
    const g = groupBill(BILL);
    expect(foldLabel(g, { Substructure: false, Frame: false })).toBe("Expand all");
  });

  it("does not claim everything is shut when there is nothing", () => {
    expect(foldLabel([], {})).toBe("Collapse all");
  });
});

describe("the bill follows the project's arrangement", () => {
  const items = [
    { code: "BQ-1", category: "Roofing", qty: 1, rate: 1 },
    { code: "BQ-2", category: "Substructure", qty: 1, rate: 1 },
    { code: "BQ-3", category: "Frames", qty: 1, rate: 1 },
  ];

  it("orders the sections the way the project arranges them", () => {
    const g = groupBill(items, { order: ["Substructure", "Frames", "Roofing"] });
    expect(g.map((x) => x.name)).toEqual(["Substructure", "Frames", "Roofing"]);
  });

  it("keeps first-appearance order when the project has no arrangement", () => {
    expect(groupBill(items, {}).map((x) => x.name)).toEqual([
      "Roofing",
      "Substructure",
      "Frames",
    ]);
  });

  it("never hides a section the arrangement does not name", () => {
    // It goes after the named ones, in the order the bill uses it. Dropping it
    // would hide every line filed under it.
    const g = groupBill(items, { order: ["Frames"] });
    expect(g.map((x) => x.name)).toEqual(["Frames", "Roofing", "Substructure"]);
  });

  it("ignores casing when matching a section to the arrangement", () => {
    const g = groupBill(items, { order: ["substructure", "frames"] });
    expect(g.map((x) => x.name).slice(0, 2)).toEqual(["Substructure", "Frames"]);
  });

  it("leaves 'by trade' alone — that is a different question", () => {
    const g = groupBill(items, { by: "trade", order: ["Substructure", "Frames", "Roofing"] });
    expect(g.length).toBeGreaterThan(0);
  });
});

// THE BUG THIS PINS
//
// "Add a section" writes the name to customCategories and the bill never drew
// it: groupBill built its buckets from the ITEMS alone, so a section with no
// lines did not exist to render. The save worked; the button looked broken.
describe("a section the project names but no line uses", () => {
  const items = [
    { code: "BQ-1", category: "Frames", description: "Column", qty: 1, rate: 100 },
    { code: "BQ-2", category: "Substructure", description: "Excavate", qty: 1, rate: 50 },
  ];
  const order = ["Substructure", "Frames", "Finishes"];

  it("is drawn, so adding one is visible", () => {
    const names = groupBill(items, { order }).map((g) => g.name);
    expect(names).toContain("Finishes");
  });

  it("is marked empty, so the bill can tell it from one a filter emptied", () => {
    const g = groupBill(items, { order }).find((x) => x.name === "Finishes");
    expect(g.empty).toBe(true);
    expect(g.indexes).toEqual([]);
    expect(g.total).toBe(0);
  });

  it("keeps its place in the arrangement", () => {
    const p2 = groupBill(items, { order: ["Finishes", "Substructure", "Frames"] });
    expect(p2.map((g) => g.name)).toEqual(["Finishes", "Substructure", "Frames"]);
  });

  it("does not appear inside a search — there, an empty section is noise", () => {
    const names = groupBill(items, { order, query: "column" }).map((g) => g.name);
    expect(names).not.toContain("Finishes");
  });

  it("does not appear under a filter either", () => {
    const names = groupBill(items, { order, filter: "unpriced" }).map((g) => g.name);
    expect(names).not.toContain("Finishes");
  });

  it("never duplicates a section the lines already use, whatever the casing", () => {
    const names = groupBill(items, { order: ["frames", "SUBSTRUCTURE"] }).map((g) => g.name);
    expect(names.filter((n) => n.toLowerCase() === "frames")).toHaveLength(1);
    expect(names.filter((n) => n.toLowerCase() === "substructure")).toHaveLength(1);
  });

  it("a section a filter emptied is NOT marked empty", () => {
    const g = groupBill(items, { order, filter: "unpriced" }).find((x) => x.name === "Frames");
    expect(g?.empty).toBe(false);
  });
});

// THE BUG THIS PINS
//
// A programme task stores WHOLE bill identities in linkedBoqIdentities —
// `sn::code::description::takeoffLine::materialName::unit`. Two places joined a
// task back to its lines and they disagreed: the buy schedule split on `::` and
// took [1] (right), while pmModel.taskLines compared the whole string to
// item.code (never matches). Every generated task therefore appeared to cover
// no bill lines, so task progress, task value, planned value and the PM
// dashboard's uncovered-lines figure all read zero on a real programme.
describe("the code inside a bill identity", () => {
  const REAL =
    "2::gf:vibrated hollow sancrete blocks in cement mortar (1:6)|guid:01a861ac::vibrated hollow::::::sq m";

  it("takes the second field of a composite", () => {
    expect(identityCode(REAL)).toBe(
      "gf:vibrated hollow sancrete blocks in cement mortar (1:6)|guid:01a861ac",
    );
  });

  it("keeps a bare code, which is what older tasks store", () => {
    expect(identityCode("BQ-1")).toBe("bq-1");
  });

  it("lower-cases, because the join is case-insensitive either side", () => {
    expect(identityCode("1::BQ-1::Excavate::::::m3")).toBe("bq-1");
  });

  it("answers empty for nothing, rather than matching the first line", () => {
    expect(identityCode("")).toBe("");
    expect(identityCode(null)).toBe("");
    expect(identityCode(undefined)).toBe("");
  });

  it("copes with an identity whose code field is empty", () => {
    expect(identityCode("1::::--- gf ---::::::")).toBe("");
  });
});
