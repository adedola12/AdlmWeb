import { describe, it, expect } from "vitest";
import {
  budgetByBillLine,
  budgetColumns,
  budgetTotals,
  buyKpis,
  buyRows,
  classOf,
  heronTotals,
  costRateOf,
  rowAmount,
  taskStartsByLine,
  withRowProcured,
} from "./budgetModel.js";

// His budget() (work-proj.js:1209) and buy() (:1155) against budgetItems, which
// is what this codebase actually stores. budgetModel.js sets out where the two
// part; these pin the parts that are rules rather than layout.

const project = (over = {}) => ({
  budgetItems: [
    {
      componentKind: "Material",
      materialName: "Cement 42.5N",
      unit: "bags",
      qty: 420,
      rate: 7_500,
      procured: true,
      billIdentity: "bq-1",
      takeoffLine: "Foundation plan",
    },
    {
      componentKind: "Material",
      materialName: "Reinforcement Y16",
      unit: "kg",
      qty: 12_000,
      rate: 1_200,
      procuredPercent: 50,
      billIdentity: "bq-2",
    },
    {
      componentKind: "Labour",
      description: "Mason gang",
      unit: "days",
      qty: 40,
      rate: 35_000,
      billIdentity: "bq-1",
    },
    {
      componentKind: "Plant",
      description: "Excavator 20t",
      unit: "days",
      qty: 12,
      rate: 180_000,
      billIdentity: "bq-1",
    },
  ],
  ...over,
});

describe("which column a budget row belongs in", () => {
  it("reads componentKind", () => {
    expect(classOf({ componentKind: "Material" })).toBe("material");
    expect(classOf({ componentKind: "Labour" })).toBe("labour");
    expect(classOf({ componentKind: "Plant" })).toBe("plant");
  });

  it("puts consumables and equipment with materials — they are bought", () => {
    expect(classOf({ componentKind: "Consumable" })).toBe("material");
    expect(classOf({ componentKind: "Equipment" })).toBe("material");
  });

  it("takes the American spelling too — the plugins send both", () => {
    expect(classOf({ componentKind: "Labor" })).toBe("labour");
  });

  it("treats a row that says nothing as a material, not as labour", () => {
    // It has a qty and a unit and somebody has to buy it. In gang days it would
    // be counted as labour it is not.
    expect(classOf({})).toBe("material");
  });
});

describe("what a row is worth", () => {
  it("prefers the built-up cost rate over the bare one", () => {
    expect(costRateOf({ rate: 100, budgetRate: 140 })).toBe(140);
    expect(costRateOf({ rate: 100 })).toBe(100);
  });

  it("is qty times that rate", () => {
    expect(rowAmount({ qty: 10, budgetRate: 250 })).toBe(2_500);
  });

  it("is 0, not NaN, on a row with nothing on it", () => {
    expect(rowAmount({})).toBe(0);
    expect(rowAmount(null)).toBe(0);
  });
});

describe("the three columns", () => {
  it("splits the rows and keeps each one's index", () => {
    const cols = budgetColumns(project());
    expect(cols.material.map((r) => r.index)).toEqual([1, 0]);
    expect(cols.labour.map((r) => r.index)).toEqual([2]);
    expect(cols.plant.map((r) => r.index)).toEqual([3]);
  });

  it("puts the most valuable first, as he sorts them", () => {
    const [first] = budgetColumns(project()).material;
    expect(first.name).toBe("Reinforcement Y16");
  });

  it("names a row by its material name, falling back to its description", () => {
    const cols = budgetColumns(project());
    expect(cols.material.some((r) => r.name === "Cement 42.5N")).toBe(true);
    expect(cols.labour[0].name).toBe("Mason gang");
  });

  it("clamps a nonsense procured percentage", () => {
    const odd = project({
      budgetItems: [{ componentKind: "Material", qty: 1, rate: 1, procuredPercent: 400 }],
    });
    expect(budgetColumns(odd).material[0].procuredPercent).toBe(100);
  });

  it("labels a row by its section, not by a takeoffLine that repeats its name", () => {
    // On a real HERON bill takeoffLine often holds the bill description
    // verbatim, and the row printed the same long text twice.
    const dup = {
      componentKind: "Material",
      description: "PC Sum for Mechanical Installations",
      takeoffLine: "PC Sum for Mechanical Installations",
      category: "Element 13 - Plumbing",
      qty: 1,
      rate: 9_000_000,
    };
    expect(budgetColumns({ budgetItems: [dup] }).material[0].forLine).toBe(
      "Element 13 - Plumbing",
    );
  });

  it("says nothing rather than repeating the name when there is no section", () => {
    const dup = {
      componentKind: "Material",
      description: "Cement 42.5N",
      takeoffLine: "cement 42.5n",
      qty: 1,
      rate: 1,
    };
    expect(budgetColumns({ budgetItems: [dup] }).material[0].forLine).toBe("");
  });

  it("falls back to the takeoffLine when it says something the name does not", () => {
    const row = {
      componentKind: "Material",
      materialName: "Cement 42.5N",
      takeoffLine: "Foundation plan",
      qty: 1,
      rate: 1,
    };
    expect(budgetColumns({ budgetItems: [row] }).material[0].forLine).toBe("Foundation plan");
  });

  it("is empty on a project with no budget", () => {
    const cols = budgetColumns({});
    expect(cols.material).toEqual([]);
    expect(cols.labour).toEqual([]);
    expect(cols.plant).toEqual([]);
  });
});

describe("the budget's totals", () => {
  const t = budgetTotals(project());

  it("totals each class", () => {
    expect(t.material).toBe(420 * 7_500 + 12_000 * 1_200);
    expect(t.labour).toBe(40 * 35_000);
    expect(t.plant).toBe(12 * 180_000);
  });

  it("counts plant in the whole, so the materials share is not overstated", () => {
    expect(t.all).toBe(t.material + t.labour + t.plant);
    expect(t.materialShare).toBeCloseTo((t.material / t.all) * 100, 5);
  });

  it("counts only materials as procured — labour is not bought", () => {
    // Cement in full, reinforcement at its 50%.
    expect(t.bought).toBe(420 * 7_500 + 12_000 * 1_200 * 0.5);
  });

  it("counts a part-ordered row for its part", () => {
    const half = project({
      budgetItems: [{ componentKind: "Material", qty: 10, rate: 100, procuredPercent: 25 }],
    });
    expect(budgetTotals(half).bought).toBe(250);
    expect(budgetTotals(half).procuredShare).toBe(25);
  });

  it("is zeros rather than NaN on an empty budget", () => {
    const none = budgetTotals({});
    expect(none.all).toBe(0);
    expect(none.materialShare).toBe(0);
    expect(none.procuredShare).toBe(0);
  });
});

describe("which task a material is needed for", () => {
  const tasks = [
    {
      name: "Foundations",
      startDate: "2026-10-05",
      linkedBoqIdentities: ["planswift::BQ-1"],
    },
    {
      name: "Early works",
      startDate: "2026-09-20",
      linkedBoqIdentities: ["planswift::BQ-1", "planswift::BQ-2"],
    },
    // No start — cannot date anything.
    { name: "Snagging", linkedBoqIdentities: ["planswift::BQ-3"] },
  ];

  it("takes the identity after the :: , as the classic budget tab does", () => {
    // If this stopped matching, every scheduled row would read as unscheduled.
    expect([...taskStartsByLine(tasks).keys()]).toEqual(["bq-1", "bq-2"]);
  });

  it("keeps the earliest task a line is in", () => {
    expect(taskStartsByLine(tasks).get("bq-1").name).toBe("Early works");
  });

  it("ignores a task with no start date", () => {
    expect(taskStartsByLine(tasks).has("bq-3")).toBe(false);
  });

  it("does not throw with no tasks at all", () => {
    expect(taskStartsByLine(null).size).toBe(0);
  });
});

describe("the buy schedule", () => {
  const tasks = [
    { name: "Foundations", startDate: "2026-10-05", linkedBoqIdentities: ["x::BQ-1"] },
  ];
  const withTasks = () => project({ pm: { tasks } });

  it("lists materials only — nobody orders a bricklayer", () => {
    const rows = buyRows(withTasks());
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.name !== "Mason gang")).toBe(true);
  });

  it("dates a row from its task's start less the lead time", () => {
    const row = buyRows(withTasks(), { leadDays: 14 }).find((r) => r.name === "Cement 42.5N");
    expect(row.needBy.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(row.buyBy.toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("re-dates when the lead time changes", () => {
    const row = buyRows(withTasks(), { leadDays: 30 }).find((r) => r.name === "Cement 42.5N");
    expect(row.buyBy.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("leaves a row whose line is in no task with no date at all", () => {
    const row = buyRows(withTasks()).find((r) => r.name === "Reinforcement Y16");
    expect(row.buyBy).toBe(null);
    expect(row.needBy).toBe(null);
  });

  it("puts the dated rows first, soonest first", () => {
    const rows = buyRows(withTasks());
    expect(rows[0].name).toBe("Cement 42.5N");
    expect(rows[1].buyBy).toBe(null);
  });

  it("names the task each row is for", () => {
    expect(buyRows(withTasks())[0].taskName).toBe("Foundations");
  });

  it("treats a fully ordered row as done", () => {
    const rows = buyRows(withTasks());
    expect(rows.find((r) => r.name === "Cement 42.5N").done).toBe(true);
    expect(rows.find((r) => r.name === "Reinforcement Y16").done).toBe(false);
  });

  it("counts late, this week and unscheduled against a real today", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    const rows = buyRows(
      project({
        pm: { tasks: [{ name: "T", startDate: "2026-10-05", linkedBoqIdentities: ["x::BQ-2"] }] },
      }),
      { leadDays: 0 },
    );
    const k = buyKpis(rows, now);
    // BQ-2's reinforcement is due 5 Oct — within the week and not yet bought.
    expect(k.week.map((r) => r.name)).toEqual(["Reinforcement Y16"]);
    // The cement is in no task.
    expect(k.unscheduled.map((r) => r.name)).toEqual(["Cement 42.5N"]);
    expect(k.late).toEqual([]);
  });
});

describe("marking a row bought", () => {
  it("ticks that row and no other", () => {
    const patch = withRowProcured(project(), 1, true);
    expect(patch.budgetItems[1].procured).toBe(true);
    expect(patch.budgetItems[0].procured).toBe(true);
    expect(patch.budgetItems[2].procured).toBeFalsy();
  });

  it("keeps the tick and the percentage consistent", () => {
    // 100 left behind on an un-ticked row would read as bought everywhere else.
    expect(withRowProcured(project(), 1, true).budgetItems[1].procuredPercent).toBe(100);
    expect(withRowProcured(project(), 1, false).budgetItems[1].procuredPercent).toBe(0);
  });

  it("sends every row back, whole — the array is replaced by what is sent", () => {
    const patch = withRowProcured(project(), 0, false);
    expect(patch.budgetItems).toHaveLength(4);
    expect(patch.budgetItems[2]).toMatchObject({ componentKind: "Labour", qty: 40, rate: 35_000 });
  });

  it("does not mutate the project it was given", () => {
    const p = project();
    withRowProcured(p, 0, false);
    expect(p.budgetItems[0].procured).toBe(true);
  });

  it("refuses an index that is not a row", () => {
    expect(withRowProcured(project(), 9, true)).toBe(null);
    expect(withRowProcured({}, 0, true)).toBe(null);
  });
});

/* ───────────── HERON 3.0's shape: cost against value, per bill line ───────── */

describe("the budget read the way HERON reads it", () => {
  // Its question is not "what must I buy" but "is this line making money".
  const job = () => ({
    items: [
      { code: "BQ-1", description: "Excavate foundations", unit: "m3", qty: 100, rate: 5_000 },
      { code: "BQ-2", description: "Reinforced columns", unit: "m3", qty: 10, rate: 20_000 },
    ],
    budgetItems: [
      { componentKind: "Material", materialName: "Cement", qty: 100, rate: 2_000, billIdentity: "BQ-1" },
      { componentKind: "Labour", description: "Gang", qty: 50, rate: 2_000, billIdentity: "BQ-1" },
      { componentKind: "Material", materialName: "Rebar", qty: 100, rate: 2_500, billIdentity: "BQ-2" },
    ],
  });

  it("groups the budget by bill line, in bill order", () => {
    const { lines } = budgetByBillLine(job());
    expect(lines.map((l) => l.code)).toEqual(["BQ-1", "BQ-2"]);
    expect(lines[0].description).toBe("Excavate foundations");
  });

  it("sets each line's cost against what it is billed at", () => {
    const [one] = budgetByBillLine(job()).lines;
    expect(one.value).toBe(100 * 5_000);
    expect(one.material).toBe(100 * 2_000);
    expect(one.labour).toBe(50 * 2_000);
    expect(one.cost).toBe(300_000);
    expect(one.margin).toBe(200_000);
  });

  it("gives the margin HERON's tooltip describes", () => {
    // (BoQ rate − material − labour) ÷ BoQ rate, as a percentage of value.
    const [one] = budgetByBillLine(job()).lines;
    expect(one.marginPercent).toBeCloseTo(40, 6);
  });

  it("marks a line that loses money", () => {
    const bad = job();
    bad.budgetItems.push({ componentKind: "Material", materialName: "Extra", qty: 1, rate: 400_000, billIdentity: "BQ-2" });
    const two = budgetByBillLine(bad).lines.find((l) => l.code === "BQ-2");
    expect(two.cost).toBeGreaterThan(two.value);
    expect(two.margin).toBeLessThan(0);
    expect(two.marginPercent).toBeLessThan(0);
  });

  it("refuses to state a margin on a line that is not billed", () => {
    // An unpriced bill would otherwise read as a 100% loss on every line.
    const unpriced = job();
    unpriced.items = unpriced.items.map((i) => ({ ...i, rate: 0 }));
    for (const l of budgetByBillLine(unpriced).lines) {
      expect(l.marginPercent).toBe(null);
      expect(l.priced).toBe(false);
    }
  });

  it("keeps cost that belongs to no bill line rather than dropping it", () => {
    // Silently omitting real cost is worse than admitting it is unplaced.
    const stray = job();
    stray.budgetItems.push({ componentKind: "Material", materialName: "Site hut", qty: 1, rate: 90_000 });
    const { lines, orphans } = budgetByBillLine(stray);
    expect(orphans).toHaveLength(1);
    expect(lines.reduce((a, l) => a + l.cost, 0)).toBe(300_000 + 250_000);
  });

  it("gives HERON's three figures across the top", () => {
    const t = heronTotals(job());
    expect(t.cost).toBe(300_000 + 250_000);
    expect(t.boq).toBe(100 * 5_000 + 10 * 20_000);
    expect(t.overheadProfit).toBe(t.boq - t.cost);
    expect(t.isProfit).toBe(true);
  });

  it("says the job loses money when it does", () => {
    const bad = job();
    bad.budgetItems.push({ componentKind: "Material", materialName: "Extra", qty: 1, rate: 5_000_000 });
    const t = heronTotals(bad);
    expect(t.isProfit).toBe(false);
    expect(t.overheadProfit).toBeLessThan(0);
  });

  it("states no project margin when nothing is billed yet", () => {
    expect(heronTotals({ items: [], budgetItems: [] }).marginPercent).toBe(null);
  });
});
