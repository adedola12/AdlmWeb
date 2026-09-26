import { describe, it, expect } from "vitest";
import {
  STAGES,
  stageIndex,
  nextStage,
  pricedSplit,
  pricedPercent,
  completePercent,
  valueBySection,
  decisions,
  totalsFor,
} from "./overviewModel.js";

const item = (over = {}) => ({ qty: 10, rate: 1000, category: "Concrete", done: 0, ...over });

describe("the stage rail", () => {
  it("is his six, in his order", () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      "takeoff",
      "priced",
      "tendered",
      "locked",
      "valuing",
      "final",
    ]);
  });

  it("puts a project with no stage at the beginning rather than off the rail", () => {
    // -1 would leave no step marked "now", which reads as broken, not new.
    expect(stageIndex({})).toBe(0);
    expect(stageIndex({ stage: "nonsense" })).toBe(0);
    expect(stageIndex(null)).toBe(0);
  });

  it("finds the stage whatever the casing", () => {
    expect(stageIndex({ stage: " Locked " })).toBe(3);
  });

  it("offers the next stage, and none at the end", () => {
    expect(nextStage({ stage: "takeoff" }).id).toBe("priced");
    expect(nextStage({ stage: "final" })).toBeNull();
  });
});

describe("priced and complete", () => {
  it("counts a line with a rate as priced", () => {
    const items = [item(), item({ rate: 0 }), item({ rate: 0 })];
    expect(pricedSplit(items).priced).toHaveLength(1);
    expect(pricedSplit(items).unpriced).toHaveLength(2);
    expect(pricedPercent(items)).toBe(33);
  });

  it("is 0% priced on an empty bill rather than dividing by zero", () => {
    expect(pricedPercent([])).toBe(0);
    expect(pricedPercent(undefined)).toBe(0);
  });

  it("reports nothing complete before the contract is locked", () => {
    // His rule and ours: nothing is complete against a contract that does not
    // exist yet, however much work has been ticked.
    const items = [item({ done: 100 })];
    expect(completePercent({ stage: "priced", items })).toBe(0);
    expect(completePercent({ stage: "locked", items })).toBe(100);
  });

  it("weights completion by value, not by counting items", () => {
    // Fifteen cheap items finished and one expensive one outstanding is not
    // 94% of a contract.
    const items = [
      item({ qty: 1, rate: 100, done: 100 }),
      item({ qty: 1, rate: 900, done: 0 }),
    ];
    expect(completePercent({ stage: "locked", items })).toBe(10);
  });

  it("does not let a bad done value push completion past 100", () => {
    const items = [item({ done: 400 })];
    expect(completePercent({ stage: "locked", items })).toBe(100);
  });
});

describe("value by section", () => {
  it("groups on the section a line carries, biggest first", () => {
    const rows = valueBySection([
      item({ category: "Ground", qty: 1, rate: 100 }),
      item({ category: "Concrete", qty: 1, rate: 500 }),
      item({ category: "Ground", qty: 1, rate: 100 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Concrete", "Ground"]);
    expect(rows[0].value).toBe(500);
    expect(rows[1].value).toBe(200);
  });

  it("keeps work with no section instead of dropping it off the page", () => {
    // A bar chart that silently omits lines makes the page add up to less
    // than the bill.
    const rows = valueBySection([item({ category: "" }), item({ category: null })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Uncategorised");
    expect(rows[0].count).toBe(2);
  });

  it("draws an empty track for unpriced sections rather than a full one", () => {
    const rows = valueBySection([item({ rate: 0 }), item({ category: "Steel", rate: 0 })]);
    expect(rows.every((r) => r.valuePercent === 0)).toBe(true);
  });

  it("scales bars against the biggest section", () => {
    const rows = valueBySection([
      item({ category: "A", qty: 1, rate: 1000 }),
      item({ category: "B", qty: 1, rate: 250 }),
    ]);
    expect(rows[0].valuePercent).toBe(100);
    expect(rows[1].valuePercent).toBe(25);
  });
});

describe("what needs a decision", () => {
  it("names the unpriced lines and points at the tab that fixes them", () => {
    const d = decisions({ items: [item({ rate: 0 }), item({ rate: 0 })] });
    expect(d[0].text).toBe("2 items still need a rate");
    expect(d[0].tab).toBe("rates");
  });

  it("says 'item' rather than 'items' for one", () => {
    expect(decisions({ items: [item({ rate: 0 })] })[0].text).toBe("1 item still need a rate");
  });

  it("surfaces a valuation awaiting approval", () => {
    const d = decisions({ items: [], valuations: [{ no: 3, status: "awaiting" }] });
    expect(d[0].text).toContain("Valuation 3");
    expect(d[0].tab).toBe("valuations");
  });

  it("is empty when nothing is waiting, so the card can say so", () => {
    expect(decisions({ items: [item()] })).toEqual([]);
  });

  it("never invents the two his design counts and our server cannot", () => {
    // Model drift and rate-library staleness have no field behind them. An
    // entry that always reads zero is worse than no entry.
    const d = decisions({ items: [item()], model: { drift: [1, 2] }, stale: [1] });
    expect(d).toEqual([]);
  });

  it("only calls a task overdue when the project tells us what today is", () => {
    const tasks = [{ end: "2020-01-01", percentComplete: 10 }];
    expect(decisions({ items: [], tasks })).toEqual([]);
    const d = decisions({ items: [], tasks, today: "2026-09-26" });
    expect(d[0].tab).toBe("pm");
  });
});

describe("the money", () => {
  it("comes from projectTotals rather than a second implementation", () => {
    const t = totalsFor({ items: [item({ qty: 2, rate: 1000 })] });
    expect(t.measured).toBe(2000);
    expect(t).toHaveProperty("total");
    expect(t).toHaveProperty("prelims");
    expect(t).toHaveProperty("variations");
  });
});
