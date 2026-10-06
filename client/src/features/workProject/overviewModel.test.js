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

// `percentComplete`, NOT his fixture's `done`. These fixtures used to say
// `done`, which is what let the bug through: the model read `it.done` too, so
// test and code agreed with each other while the screen showed 0 on every real
// project, because no bill line has ever carried that field.
const item = (over = {}) => ({
  qty: 10,
  rate: 1000,
  category: "Concrete",
  percentComplete: 0,
  ...over,
});

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
    const items = [item({ percentComplete: 100 })];
    expect(completePercent({ stage: "priced", items })).toBe(0);
    expect(completePercent({ stage: "locked", items })).toBe(100);
  });

  it("weights completion by value, not by counting items", () => {
    // Fifteen cheap items finished and one expensive one outstanding is not
    // 94% of a contract.
    const items = [
      item({ qty: 1, rate: 100, percentComplete: 100 }),
      item({ qty: 1, rate: 900, percentComplete: 0 }),
    ];
    expect(completePercent({ stage: "locked", items })).toBe(10);
  });

  it("does not let a bad done value push completion past 100", () => {
    const items = [item({ percentComplete: 400 })];
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

describe("the field a line's progress actually lives in", () => {
  // The bug this pins: his fixture calls it `done`, ours calls it
  // `percentComplete`, and the model read his name. Nothing failed, because the
  // tests used his name too — so the Complete donut and the value-by-section
  // bars read 0 on every real project while the suite stayed green.
  it("reads percentComplete, which is what a real bill line carries", () => {
    const locked = { contract: { locked: true }, stage: "locked" };
    const items = [{ qty: 10, rate: 1000, percentComplete: 100, category: "X" }];
    expect(completePercent({ ...locked, items })).toBe(100);
  });

  it("does not read `done`, which nothing writes", () => {
    const locked = { contract: { locked: true }, stage: "locked" };
    const items = [{ qty: 10, rate: 1000, done: 100, category: "X" }];
    expect(completePercent({ ...locked, items })).toBe(0);
  });

  it("uses the same reader in the section bars", () => {
    const rows = valueBySection([
      { qty: 10, rate: 1000, percentComplete: 50, category: "Concrete" },
    ]);
    expect(rows[0].donePercent).toBe(50);
  });
});

describe("linked services in the project's total", () => {
  // The raw linkedProjects array is DELETED from every payload by
  // routes/projects.js; linkedSummaries is the client-facing shape, and is what
  // the Services tab reads. Reading the wrong one made the Overview's total
  // smaller than the Services tab's figure on the same page.
  const linked = (over = {}) => ({
    items: [{ qty: 10, rate: 1_000 }],
    linkedSummaries: [{ projectId: "s1", live: { total: 5_000_000 } }],
    ...over,
  });

  it("reports what the linked services add", () => {
    // Before this was read from the right field it was always 0, so the
    // Overview breakdown's "Linked services" row never appeared.
    expect(totalsFor(linked()).linked).toBe(5_000_000);
  });

  it("keeps them out of the total, as projectTotals requires", () => {
    // A linked project carries its own preliminaries, contingency and VAT and
    // is valued on its own certificates, so it is reported beside the total,
    // "never folded into total".
    expect(totalsFor(linked()).total).toBe(10_000);
  });

  it("does not read linkedProjects — the server never sends it", () => {
    const wrong = totalsFor({
      items: [{ qty: 10, rate: 1_000 }],
      linkedProjects: [{ projectId: "s1", live: { total: 5_000_000 } }],
    });
    expect(wrong.linked).toBe(0);
  });

  it("falls back to a snapshot total when there is no live figure", () => {
    expect(totalsFor(linked({
      linkedSummaries: [{ projectId: "s1", snapshot: { total: 2_000_000 } }],
    })).linked).toBe(2_000_000);
  });

  it("is 0 on a project with nothing linked", () => {
    expect(totalsFor({ items: [] }).linked).toBe(0);
  });
});

describe("the stage, when nothing sends one", () => {
  // NOTHING SENDS project.stage. Not the project GET, not the list, not the
  // rollup — the server emits contractLocked / tenderedAt / finalized /
  // certificateCount instead. So the lookup missed on every real project and the
  // fallback answered Takeoff: the header pill read "Takeoff" on a locked
  // contract with four certificates, and progressPercent (0 below stage 3) was 0
  // for everybody.
  //
  // It passed because every fixture in this file injects `stage` by hand — the
  // same way worksBaseFor kept its coverage while reading a field that does not
  // exist.

  it("reads a locked contract as locked, from the document", () => {
    expect(stageIndex({ contract: { locked: true } })).toBe(3);
  });

  it("reads it from the rollup's flat flags too", () => {
    // The workspace holds both shapes: the rollup summary under the full
    // document. A project opened by a direct link may have only one.
    expect(stageIndex({ contractLocked: true })).toBe(3);
    expect(stageIndex({ tenderedAt: "2026-08-01" })).toBe(2);
    expect(stageIndex({ certificateCount: 2 })).toBe(4);
    expect(stageIndex({ finalized: true })).toBe(5);
  });

  it("reads certificates and a final account off the document", () => {
    expect(stageIndex({ certificates: [{ number: 1 }] })).toBe(4);
    expect(stageIndex({ finalAccount: { finalized: true } })).toBe(5);
  });

  it("answers with the LATEST thing that is true", () => {
    // A locked contract with certificates against it is valuing, not locked, and
    // a finalised one is final whatever else also holds.
    const busy = {
      contract: { locked: true, tenderedAt: "2026-08-01" },
      certificates: [{ number: 1 }],
    };
    expect(stageIndex(busy)).toBe(4);
    expect(stageIndex({ ...busy, finalAccount: { finalized: true } })).toBe(5);
  });

  it("reads a priced bill as priced, and an unpriced one as takeoff", () => {
    expect(stageIndex({ items: [{ rate: 1000 }] })).toBe(1);
    expect(stageIndex({ items: [{ rate: 0 }] })).toBe(0);
    expect(stageIndex({ items: [] })).toBe(0);
    expect(stageIndex({ totalCost: 5_000_000 })).toBe(1);
  });

  it("does not read a WITHHELD total as an unpriced bill", () => {
    // A masked row carries `priced` instead of a figure. Reading the zeroed
    // totalCost would label a fully priced job somebody else owns "takeoff".
    expect(stageIndex({ priced: true, totalCost: 0 })).toBe(1);
    expect(stageIndex({ priced: false, totalCost: 0 })).toBe(0);
  });

  it("still lets an explicit stage win, so nothing that sends one changes", () => {
    expect(stageIndex({ stage: "final", items: [] })).toBe(5);
    expect(stageIndex({ stage: "takeoff", contract: { locked: true } })).toBe(0);
  });
});
