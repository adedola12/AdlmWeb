import { describe, it, expect } from "vitest";
import {
  activityTotals,
  labourActivities,
  peakWeek,
  taskByLineCode,
  taskSpanDays,
  weeklyLoad,
} from "./activityModel.js";

// The activity schedule joins labour money to programme dates. These pin the
// join, and the rule that nothing here is invented: no man-days, no gang sizes,
// no output rates, because a project holds none of them.

const project = {
  items: [
    { code: "BQ-1", description: "Excavate for foundations", category: "Substructure", qty: 10, rate: 100, percentComplete: 100 },
    { code: "BQ-2", description: "Reinforced concrete columns", category: "Frames", qty: 5, rate: 400, percentComplete: 0 },
    { code: "BQ-3", description: "Wall rendering", category: "Superstructure", qty: 20, rate: 50 },
  ],
  budgetItems: [
    { componentKind: "labour", materialName: "Excavation gang", unit: "m3", qty: 10, rate: 30, billIdentity: "BQ-1" },
    { componentKind: "labour", materialName: "Concrete gang", unit: "m3", qty: 5, rate: 120, billIdentity: "BQ-2" },
    { componentKind: "labour", materialName: "Plasterer", unit: "m2", qty: 20, rate: 15, billIdentity: "BQ-3" },
    { componentKind: "material", materialName: "Cement", unit: "bags", qty: 40, rate: 9000, billIdentity: "BQ-2" },
  ],
  pm: {
    tasks: [
      {
        name: "Substructure",
        startDate: "2026-03-01",
        endDate: "2026-03-15",
        linkedBoqIdentities: ["1::BQ-1::Excavate::::::m3"],
      },
      {
        name: "Frame",
        startDate: "2026-03-10",
        endDate: "2026-04-10",
        linkedBoqIdentities: ["2::BQ-2::Columns::::::m3"],
      },
    ],
  },
};

describe("joining labour to the programme", () => {
  it("indexes a task by the bill code it builds, through the composite identity", () => {
    const map = taskByLineCode(project.pm.tasks);
    expect(map.get("bq-1").name).toBe("Substructure");
    expect(map.get("bq-2").name).toBe("Frame");
  });

  it("gives a task's span in whole days, never zero", () => {
    expect(taskSpanDays({ startDate: "2026-03-01", endDate: "2026-03-15" })).toBe(14);
    expect(taskSpanDays({ startDate: "2026-03-01", endDate: "2026-03-01" })).toBe(1);
    expect(taskSpanDays({})).toBe(0);
  });
});

describe("the activity rows", () => {
  const rows = labourActivities(project);

  it("lists labour only — a material is not an activity", () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.trade)).not.toContain("Cement");
  });

  it("says what the labour is actually doing, from its bill line", () => {
    const dig = rows.find((r) => r.trade === "Excavation gang");
    expect(dig.activity).toBe("Excavate for foundations");
    expect(dig.section).toBe("Substructure");
  });

  it("takes its dates from the task that builds the line", () => {
    const dig = rows.find((r) => r.trade === "Excavation gang");
    expect(dig.scheduled).toBe(true);
    expect(dig.days).toBe(14);
  });

  it("still lists work no task covers, marked unscheduled", () => {
    // The most useful thing this screen can say: this has to happen and nobody
    // has planned it.
    const render = rows.find((r) => r.trade === "Plasterer");
    expect(render.scheduled).toBe(false);
    expect(render.days).toBe(0);
  });

  it("puts scheduled work first, in date order, and unscheduled last", () => {
    expect(rows.map((r) => r.trade)).toEqual([
      "Excavation gang",
      "Concrete gang",
      "Plasterer",
    ]);
  });

  it("carries the money and the measured quantity, and invents no man-days", () => {
    const dig = rows.find((r) => r.trade === "Excavation gang");
    expect(dig.amount).toBe(300);
    expect(dig.qty).toBe(10);
    expect(dig.unit).toBe("m3");
    // Nothing in a project holds an output rate, so there is no such field.
    expect("manDays" in dig).toBe(false);
    expect("gang" in dig).toBe(false);
  });

  it("does not throw on a project with no budget or no programme", () => {
    expect(labourActivities({ items: [] })).toEqual([]);
    expect(labourActivities(null)).toEqual([]);
  });
});

describe("the figures above the schedule", () => {
  const t = activityTotals(labourActivities(project));

  it("separates planned work from work nobody has scheduled", () => {
    expect(t.count).toBe(3);
    expect(t.scheduled).toBe(2);
    expect(t.unscheduled).toBe(1);
    expect(t.unscheduledCost).toBe(300);
  });

  it("totals the labour cost", () => {
    expect(t.cost).toBe(300 + 600 + 300);
  });

  it("counts distinct trades, which is a different fact from activities", () => {
    expect(t.trades).toBe(3);
  });

  it("spans first start to last finish, ignoring unscheduled rows", () => {
    expect(new Date(t.from).toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(new Date(t.to).toISOString().slice(0, 10)).toBe("2026-04-10");
  });
});

describe("how many trades run at once", () => {
  const load = weeklyLoad(labourActivities(project));

  it("reports week by week, not day by day", () => {
    expect(load.length).toBeGreaterThan(0);
    expect(load.length).toBeLessThan(10);
  });

  it("finds the week two trades overlap", () => {
    // Substructure runs 1-15 Mar, Frame 10 Mar-10 Apr: they collide.
    const peak = peakWeek(load);
    expect(peak.count).toBe(2);
    expect(peak.trades).toHaveLength(2);
  });

  it("is empty when nothing is scheduled, so the panel says so", () => {
    expect(weeklyLoad([{ scheduled: false }])).toEqual([]);
    expect(peakWeek([])).toBe(null);
  });
});
