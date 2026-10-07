import { describe, it, expect } from "vitest";
import {
  PM_VIEWS,
  issueSeverity,
  likelyAndCostly,
  openIssues,
  openRisks,
  overdueTasks,
  pmKpis,
  resolvePmView,
  riskSeverity,
  sectionsForTasks,
  taskDays,
  taskIsLate,
  taskLines,
  taskProgress,
  timelineScale,
} from "./pmModel.js";
import { elementOf } from "./billModel.js";

// His pm() (work-proj.js:1263-1360). WORK.md §13: "PM dashboard is not Time
// Pro" — tasks from bill SECTIONS, risks, issues, a timeline with today's line,
// and plain-language schedule figures.
//
// Every date here is fixed and `now` is injected, so none of this drifts with
// the clock.

const NOW = new Date("2026-09-27T00:00:00Z");

const ITEMS = [
  // Substructure, finished.
  { code: "BQ-1", category: "Substructure", qty: 100, rate: 1_000, percentComplete: 100 },
  // Frame, half done, and the expensive one.
  { code: "BQ-2", category: "Frame", qty: 100, rate: 9_000, percentComplete: 50 },
  // Frame, not started.
  { code: "BQ-3", category: "Frame", qty: 10, rate: 1_000, percentComplete: 0 },
];

const task = (over = {}) => ({
  name: "Substructure",
  startDate: "2026-09-01",
  endDate: "2026-09-21",
  percentComplete: 0,
  linkedBoqIdentities: ["BQ-1"],
  ...over,
});

describe("his three views", () => {
  it("are Timeline, Risks and Issues", () => {
    expect(PM_VIEWS.map((v) => v.key)).toEqual(["timeline", "risks", "issues"]);
  });

  it("falls back to Timeline for anything else", () => {
    expect(resolvePmView("risks")).toBe("risks");
    expect(resolvePmView("nonsense")).toBe("timeline");
    expect(resolvePmView(null)).toBe("timeline");
  });
});

describe("a task's bill lines", () => {
  it("resolves our identities to lines, where his fixture used indexes", () => {
    const lines = taskLines(task({ linkedBoqIdentities: ["BQ-2", "BQ-3"] }), ITEMS);
    expect(lines.map((l) => l.index)).toEqual([1, 2]);
  });

  it("treats a missing weight as the whole line", () => {
    // Every task written before weighting shipped means the whole line by
    // silence, and must keep meaning it.
    expect(taskLines(task(), ITEMS)[0].weight).toBe(100);
  });

  it("honours a weight when one is given", () => {
    const t = task({ linkedBoqIdentities: ["BQ-2"], linkedBoqWeights: [70] });
    expect(taskLines(t, ITEMS)[0].weight).toBe(70);
  });

  it("ignores an identity no line answers to", () => {
    const t = task({ linkedBoqIdentities: ["BQ-1", "GONE"] });
    expect(taskLines(t, ITEMS).map((l) => l.index)).toEqual([0]);
  });

  it("matches an identity case-insensitively and trimmed", () => {
    expect(taskLines(task({ linkedBoqIdentities: [" bq-1 "] }), ITEMS)[0].index).toBe(0);
  });
});

describe("how far along a task is", () => {
  it("is value-weighted, not a count of ticked lines", () => {
    // BQ-2 is ₦900,000 at 50%; BQ-3 is ₦10,000 at 0%. One of two lines is
    // "half done", but by value it is 450,000 of 910,000 — 49%.
    const t = task({ linkedBoqIdentities: ["BQ-2", "BQ-3"] });
    expect(taskProgress(t, ITEMS)).toBe(49);
  });

  it("splits a line across tasks by its weight", () => {
    // The whole point of linkedBoqWeights: a windows line 70% to first fix and
    // 30% to final fix must not count twice.
    const first = task({ linkedBoqIdentities: ["BQ-2"], linkedBoqWeights: [70] });
    expect(taskProgress(first, ITEMS)).toBe(50);
  });

  it("falls back to the task's own figure when it links to nothing", () => {
    // An imported or hand-planned task has no bill lines behind it.
    const t = task({ linkedBoqIdentities: [], percentComplete: 65 });
    expect(taskProgress(t, ITEMS)).toBe(65);
  });

  it("clamps a nonsense figure rather than trusting it", () => {
    expect(taskProgress(task({ linkedBoqIdentities: [], percentComplete: 140 }), ITEMS)).toBe(100);
    expect(taskProgress(task({ linkedBoqIdentities: [], percentComplete: -5 }), ITEMS)).toBe(0);
  });

  it("still moves on a task made only of unpriced lines", () => {
    // His `|| 1`: value-weighting an unpriced line at zero would leave such a
    // task reading 0% for ever, however much of it was done.
    const unpriced = [{ code: "X-1", qty: 10, rate: 0, percentComplete: 100 }];
    const t = task({ linkedBoqIdentities: ["X-1"] });
    expect(taskProgress(t, unpriced)).toBe(100);
  });

  it("is at least a day long, so nothing divides by zero", () => {
    expect(taskDays({ startDate: "2026-09-01", endDate: "2026-09-01" })).toBe(1);
    expect(taskDays({})).toBe(1);
    expect(taskDays({ startDate: "2026-09-01", endDate: "2026-09-21" })).toBe(20);
  });
});

describe("what is overdue", () => {
  it("is past its end and not finished", () => {
    const late = task({ name: "Late", endDate: "2026-09-20", linkedBoqIdentities: ["BQ-2"] });
    expect(overdueTasks([late], ITEMS, NOW).map((t) => t.name)).toEqual(["Late"]);
  });

  it("is not overdue once it is finished, however late the date", () => {
    const done = task({ endDate: "2026-09-20", linkedBoqIdentities: ["BQ-1"] });
    expect(overdueTasks([done], ITEMS, NOW)).toEqual([]);
  });

  it("is not overdue while its end date is still ahead", () => {
    const ahead = task({ endDate: "2026-10-30", linkedBoqIdentities: ["BQ-2"] });
    expect(overdueTasks([ahead], ITEMS, NOW)).toEqual([]);
    expect(taskIsLate(ahead, ITEMS, NOW)).toBe(false);
  });

  it("ignores a task with no end date rather than calling it late", () => {
    expect(overdueTasks([task({ endDate: null })], ITEMS, NOW)).toEqual([]);
  });
});

describe("risks and issues", () => {
  const risks = [
    { title: "Rain", probability: "high", impact: "high", status: "open" },
    { title: "Late steel", probability: "high", impact: "medium", status: "mitigating" },
    { title: "Old one", probability: "high", impact: "high", status: "closed" },
    { title: "Accepted", probability: "low", impact: "low", status: "accepted" },
  ];
  const issues = [
    { title: "Water table", severity: "critical", status: "open" },
    { title: "Rebar spec", severity: "medium", status: "in-progress" },
    { title: "Sorted", severity: "high", status: "resolved" },
  ];

  it("counts anything not closed off as open", () => {
    expect(openRisks(risks).map((r) => r.title)).toEqual(["Rain", "Late steel"]);
    expect(openIssues(issues).map((i) => i.title)).toEqual(["Water table", "Rebar spec"]);
  });

  it("picks out the ones that are both likely and costly", () => {
    expect(likelyAndCostly(risks).map((r) => r.title)).toEqual(["Rain", "Late steel"]);
  });

  it("does not count a closed risk as likely and costly", () => {
    expect(likelyAndCostly(risks).some((r) => r.title === "Old one")).toBe(false);
  });

  it("grades a risk by likelihood and impact together", () => {
    expect(riskSeverity({ probability: "high", impact: "high" })).toBe("hi");
    expect(riskSeverity({ probability: "high", impact: "low" })).toBe("md");
    expect(riskSeverity({ probability: "low", impact: "high" })).toBe("md");
    expect(riskSeverity({ probability: "low", impact: "low" })).toBe("lo");
  });

  it("grades an issue by its severity, critical included", () => {
    // Ours has a fourth level his fixture did not.
    expect(issueSeverity({ severity: "critical" })).toBe("hi");
    expect(issueSeverity({ severity: "high" })).toBe("hi");
    expect(issueSeverity({ severity: "medium" })).toBe("md");
    expect(issueSeverity({ severity: "low" })).toBe("lo");
  });

  it("does not throw on nothing at all", () => {
    expect(openRisks(null)).toEqual([]);
    expect(openIssues(undefined)).toEqual([]);
  });
});

describe("the five figures across the top", () => {
  const tasks = [
    // Done, and it ran 1-21 Sep.
    task({ name: "Substructure", linkedBoqIdentities: ["BQ-1"] }),
    // Half done by value, running 15 Sep - 15 Oct, so partly planned by today.
    task({
      name: "Frame",
      startDate: "2026-09-15",
      endDate: "2026-10-15",
      linkedBoqIdentities: ["BQ-2", "BQ-3"],
    }),
  ];

  it("reports completion weighted by how long each task is", () => {
    const k = pmKpis({ tasks, items: ITEMS, risks: [], issues: [], now: NOW });
    // 20 days at 100% + 30 days at 49%, over 50 days.
    expect(Math.round(k.complete)).toBe(69);
  });

  it("reports what should have been done by today", () => {
    const k = pmKpis({ tasks, items: ITEMS, risks: [], issues: [], now: NOW });
    // Substructure is finished (20/20); Frame is 12 of its 30 days in.
    expect(Math.round(k.planned)).toBe(64);
  });

  it("turns the ratio into plain language, as he does", () => {
    const k = pmKpis({ tasks, items: ITEMS, risks: [], issues: [], now: NOW });
    expect(k.spi).toBeGreaterThan(1);
    expect(k.onTime).toBe(true);
    expect(k.scheduleWarn).toBe(false);
  });

  it("says how far behind when the work is behind the plan", () => {
    const behind = [
      task({ name: "Slow", startDate: "2026-09-01", endDate: "2026-09-21", linkedBoqIdentities: ["BQ-3"] }),
    ];
    const k = pmKpis({ tasks: behind, items: ITEMS, risks: [], issues: [], now: NOW });
    expect(k.onTime).toBe(false);
    expect(k.scheduleWarn).toBe(true);
    expect(k.behindPercent).toBe(100);
  });

  it("finds the bill lines no task covers, and what they are worth", () => {
    const k = pmKpis({
      tasks: [task({ linkedBoqIdentities: ["BQ-1"] })],
      items: ITEMS,
      risks: [],
      issues: [],
      now: NOW,
    });
    expect(k.uncoveredIndexes).toEqual([1, 2]);
    expect(k.uncoveredValue).toBe(900_000 + 10_000);
  });

  it("finds nothing uncovered once every line is in a task", () => {
    const k = pmKpis({ tasks, items: ITEMS, risks: [], issues: [], now: NOW });
    expect(k.uncoveredIndexes).toEqual([]);
    expect(k.uncoveredValue).toBe(0);
  });

  it("is safe on a project with no tasks at all", () => {
    const k = pmKpis({ tasks: [], items: ITEMS, risks: [], issues: [], now: NOW });
    expect(k.complete).toBe(0);
    expect(k.planned).toBe(0);
    expect(k.spi).toBe(1);
    expect(k.uncoveredIndexes).toEqual([0, 1, 2]);
  });
});

describe("the timeline's geometry", () => {
  const tasks = [
    task({ startDate: "2026-09-01", endDate: "2026-09-21" }),
    task({ startDate: "2026-10-01", endDate: "2026-11-30" }),
  ];

  it("spans the earliest start to the latest finish", () => {
    const s = timelineScale(tasks, { now: NOW });
    expect(s.pos("2026-09-01")).toBe(0);
    expect(s.pos("2026-11-30")).toBe(100);
  });

  it("prefers the project's own start and finish when it has them", () => {
    const s = timelineScale(tasks, { start: "2026-08-01", finish: "2026-12-31", now: NOW });
    expect(s.pos("2026-08-01")).toBe(0);
    expect(s.pos("2026-09-01")).toBeGreaterThan(0);
  });

  it("clamps a date outside the span rather than drawing off the chart", () => {
    const s = timelineScale(tasks, { now: NOW });
    expect(s.pos("2020-01-01")).toBe(0);
    expect(s.pos("2030-01-01")).toBe(100);
  });

  it("puts a tick on each month inside the span, left to right", () => {
    // The label comes from toLocaleDateString("en-GB", { month: "short" }),
    // which is his call — and which gives "Sept" on a modern ICU and "Sep" on
    // an older one. Asserting the exact string would pin the test to whichever
    // Node it first ran on, so this asserts the shape instead.
    const s = timelineScale(tasks, { now: NOW });
    expect(s.months.length).toBe(3);
    expect(s.months[0].label).toMatch(/^Sep/);
    expect(s.months[1].label).toBe("Oct");
    expect(s.months[2].label).toBe("Nov");
    const lefts = s.months.map((m) => m.left);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it("places today, which is the line his design is built around", () => {
    const s = timelineScale(tasks, { now: NOW });
    expect(s.today).toBeGreaterThan(0);
    expect(s.today).toBeLessThan(100);
  });

  it("returns nothing to draw when there are no dates", () => {
    expect(timelineScale([], {})).toBe(null);
    expect(timelineScale([{ name: "No dates" }], {})).toBe(null);
  });
});

describe("planning from the bill", () => {
  it("offers one task per section, in the bill's own order", () => {
    // His rule, and WORK.md's: tasks come from SECTIONS, not one per line.
    expect(sectionsForTasks(ITEMS, elementOf)).toEqual(["Substructure", "Frame"]);
  });

  it("does not repeat a section", () => {
    expect(sectionsForTasks([...ITEMS, ...ITEMS], elementOf)).toEqual(["Substructure", "Frame"]);
  });
});

describe("a missing date is absent, not the epoch", () => {
  // `new Date(null)` is 1 January 1970, not an invalid date, so a bare
  // Number.isFinite test reads a missing projectStart as a real date and draws
  // a timeline fifty-six years wide. Our schema defaults projectStart and
  // projectFinish to null, so this is the ordinary case rather than an edge.
  it("draws nothing when the tasks have no dates, even with a null project start", () => {
    const undated = [{ taskId: "x", name: "No dates" }];
    expect(timelineScale(undated, { start: null, finish: null })).toBe(null);
  });

  it("does not let a null project start drag the span back to 1970", () => {
    const tasks = [task({ startDate: "2026-09-01", endDate: "2026-09-21" })];
    const s = timelineScale(tasks, { start: null, finish: null, now: NOW });
    expect(s).not.toBe(null);
    expect(new Date(s.from).getUTCFullYear()).toBe(2026);
  });

  it("treats an empty string the same way", () => {
    expect(timelineScale([{ taskId: "x", startDate: "", endDate: "" }], {})).toBe(null);
  });

  it("ignores a task with a null end rather than calling it overdue in 1970", () => {
    expect(overdueTasks([task({ endDate: null })], ITEMS, NOW)).toEqual([]);
  });
});
