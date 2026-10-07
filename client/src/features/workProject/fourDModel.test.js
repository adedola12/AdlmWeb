import { describe, it, expect } from "vitest";
import {
  costSeries,
  dateAt,
  earnedValue,
  elementIdsAt,
  fractionOf,
  linesAt,
  plannedValueAt,
  procurementAt,
  scrubRange,
  snapshotAt,
  taskValue,
  tasksAt,
  tasksDoneBy,
} from "./fourDModel.js";

// The full workspace answers "what is true on this date". These pin the two
// rules that make that trustworthy: the dates come from the programme and
// nowhere else, and the planned-value arithmetic is the server's.

const d = (s) => new Date(`${s}T00:00:00.000Z`);

// Two lines, two tasks. Task A builds line 1 in March, task B line 2 in April.
const items = [
  { code: "BQ-1", description: "Excavate", qty: 10, rate: 100, percentComplete: 100, elementIds: [111, 112] },
  { code: "BQ-2", description: "Concrete", qty: 10, rate: 200, percentComplete: 0, elementIds: [222] },
];
const tasks = [
  {
    name: "Substructure",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    linkedBoqIdentities: ["BQ-1"],
  },
  {
    name: "Frame",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    linkedBoqIdentities: ["BQ-2"],
  },
];
const project = { items, pm: { tasks } };

describe("the span the scrubber runs over", () => {
  it("is the first start to the last finish", () => {
    const r = scrubRange(tasks);
    expect(new Date(r.from).toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(new Date(r.to).toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("is null when nothing is dated — the signal to show the empty state", () => {
    // A project with a bill and no programme. Nothing on a bill line says when
    // it is built, so there is no timeline to draw and saying so is the answer.
    expect(scrubRange([{ name: "No dates" }])).toBe(null);
    expect(scrubRange([])).toBe(null);
    expect(scrubRange(null)).toBe(null);
  });

  it("never collapses to zero width, so the scrubber cannot divide by zero", () => {
    const r = scrubRange([{ startDate: "2026-03-01", endDate: "2026-03-01" }]);
    expect(r.to).toBeGreaterThan(r.from);
  });
});

describe("moving the scrubber", () => {
  const range = scrubRange(tasks);

  it("turns a position into a date and back again", () => {
    const mid = dateAt(range, 0.5);
    expect(fractionOf(range, mid)).toBeCloseTo(0.5, 5);
  });

  it("clamps outside the span rather than running off the end", () => {
    expect(dateAt(range, -2).getTime()).toBe(range.from);
    expect(dateAt(range, 9).getTime()).toBe(range.to);
    expect(fractionOf(range, d("2020-01-01"))).toBe(0);
    expect(fractionOf(range, d("2030-01-01"))).toBe(1);
  });
});

describe("what is happening on a date", () => {
  it("lists the tasks running then", () => {
    expect(tasksAt(tasks, d("2026-03-15")).map((t) => t.name)).toEqual(["Substructure"]);
    expect(tasksAt(tasks, d("2026-04-15")).map((t) => t.name)).toEqual(["Frame"]);
  });

  it("counts a task as running on its first and last day", () => {
    expect(tasksAt(tasks, d("2026-03-01"))).toHaveLength(1);
    expect(tasksAt(tasks, d("2026-03-31"))).toHaveLength(1);
  });

  it("says what is finished by then", () => {
    expect(tasksDoneBy(tasks, d("2026-04-15")).map((t) => t.name)).toEqual(["Substructure"]);
  });

  it("gives the bill lines being built", () => {
    expect(linesAt(tasks, items, d("2026-03-15"))).toEqual([0]);
    expect(linesAt(tasks, items, d("2026-04-15"))).toEqual([1]);
  });

  it("gives the model elements to light up", () => {
    expect(elementIdsAt(tasks, items, d("2026-03-15"))).toEqual([111, 112]);
    expect(elementIdsAt(tasks, items, d("2026-04-15"))).toEqual([222]);
  });

  it("lights up nothing on a bill that carries no element ids", () => {
    // A HERON project: quantities and takeoff lines, never Revit element ids.
    const heron = [{ code: "BQ-1", qty: 1, rate: 1 }];
    expect(elementIdsAt(tasks, heron, d("2026-03-15"))).toEqual([]);
  });

  it("is empty outside the programme rather than throwing", () => {
    expect(tasksAt(tasks, d("2026-01-01"))).toEqual([]);
    expect(linesAt(tasks, items, null)).toEqual([]);
  });
});

describe("planned value", () => {
  it("is nothing before a task starts and its whole value after it ends", () => {
    expect(plannedValueAt(tasks, items, d("2026-02-01"))).toBe(0);
    // Both tasks done: 10x100 + 10x200.
    expect(plannedValueAt(tasks, items, d("2026-05-01"))).toBe(3000);
  });

  it("spreads a task evenly across its own span, as the server's burndown does", () => {
    // Task A is 30 days and worth 1,000. Halfway through, 500 of it counts.
    const half = plannedValueAt(tasks, items, d("2026-03-16"));
    expect(half).toBeGreaterThan(450);
    expect(half).toBeLessThan(550);
  });

  it("ignores a task with no dates rather than counting it as done", () => {
    const withUndated = [...tasks, { name: "Someday", linkedBoqIdentities: ["BQ-1"] }];
    expect(plannedValueAt(withUndated, items, d("2026-05-01"))).toBe(3000);
  });
});

describe("earned value", () => {
  it("is what the lines say is built, not what the calendar says", () => {
    // BQ-1 is 100% done (1,000), BQ-2 is 0%.
    expect(earnedValue(tasks, items)).toBe(1000);
  });

  it("weights a task by the value of its lines", () => {
    expect(taskValue(tasks[0], items)).toBe(1000);
    expect(taskValue(tasks[1], items)).toBe(2000);
  });
});

describe("procurement on a date", () => {
  const rows = [
    { name: "Cement", amount: 100, buyBy: d("2026-03-01"), done: true },
    { name: "Sand", amount: 50, buyBy: d("2026-03-10"), done: false },
    { name: "Steel", amount: 400, buyBy: d("2026-04-20"), done: false },
    { name: "Paint", amount: 25, buyBy: null, done: false },
  ];

  it("separates what is bought from what is still to buy", () => {
    const p = procurementAt(rows, d("2026-03-15"));
    expect(p.bought).toBe(100);
    expect(p.toBuy).toBe(475);
  });

  it("flags what should have been bought by then and was not", () => {
    const p = procurementAt(rows, d("2026-03-15"));
    expect(p.overdue).toBe(50);
  });

  it("names the next thing to pay for", () => {
    expect(procurementAt(rows, d("2026-03-15")).next.name).toBe("Steel");
  });

  it("has nothing overdue before anything is due", () => {
    expect(procurementAt(rows, d("2026-02-01")).overdue).toBe(0);
  });

  it("does not throw on a project with no buy schedule", () => {
    const p = procurementAt([], d("2026-03-15"));
    expect(p).toMatchObject({ bought: 0, toBuy: 0, overdue: 0, next: null });
  });
});

describe("the cost curve", () => {
  const rows = [{ name: "Cement", amount: 100, buyBy: d("2026-03-01"), done: true }];

  it("runs the whole span and rises", () => {
    const s = costSeries(tasks, items, rows, { steps: 8 });
    expect(s).toHaveLength(9);
    expect(s[0].planned).toBe(0);
    expect(s[s.length - 1].planned).toBe(3000);
    expect(s[s.length - 1].planned).toBeGreaterThan(s[0].planned);
  });

  it("is empty when there is no programme, so the chart says so", () => {
    expect(costSeries([], items, rows)).toEqual([]);
  });
});

describe("the snapshot the panels read", () => {
  const rows = [{ name: "Sand", amount: 50, buyBy: d("2026-03-10"), done: false }];

  it("answers every panel from one date", () => {
    const s = snapshotAt(project, d("2026-03-15"), { rows });
    expect(s.tasks.map((t) => t.name)).toEqual(["Substructure"]);
    expect(s.lineIndexes).toEqual([0]);
    expect(s.elementIds).toEqual([111, 112]);
    expect(s.linesValue).toBe(1000);
    expect(s.total).toBe(2);
    expect(s.procurement.overdue).toBe(50);
  });

  it("reports value variance, ahead positive and behind negative", () => {
    // By 1 May everything is planned (3,000) and only 1,000 is built.
    expect(snapshotAt(project, d("2026-05-01"), { rows }).variance).toBe(-2000);
    // On 1 March nothing is planned yet and 1,000 is already built.
    expect(snapshotAt(project, d("2026-03-01"), { rows }).variance).toBe(1000);
  });

  it("survives a project with no programme at all", () => {
    const s = snapshotAt({ items }, d("2026-03-15"), { rows: [] });
    expect(s.tasks).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.planned).toBe(0);
  });
});
