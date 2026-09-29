import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectPm from "./WorkProjectPm.jsx";

// His pm() (work-proj.js:1263-1360). WORK.md §13: "PM dashboard is not Time
// Pro" — tasks from bill SECTIONS, risks, issues, a timeline with today's line,
// and plain-language schedule figures.
//
// `now` is injected everywhere, so none of this drifts with the clock.

const NOW = new Date("2026-09-27T00:00:00Z");

const project = (over = {}) => ({
  name: "Ikoyi Complex",
  items: [
    { code: "BQ-1", category: "Substructure", qty: 100, rate: 1_000, percentComplete: 100 },
    { code: "BQ-2", category: "Frame", qty: 100, rate: 9_000, percentComplete: 50 },
    { code: "BQ-3", category: "Frame", qty: 10, rate: 1_000, percentComplete: 0 },
  ],
  pm: {
    projectStart: null,
    projectFinish: null,
    tasks: [
      {
        taskId: "t1",
        name: "Substructure",
        startDate: "2026-09-01",
        endDate: "2026-09-21",
        assignedTo: "Chidi",
        linkedBoqIdentities: ["BQ-1"],
      },
      {
        taskId: "t2",
        name: "Frame",
        startDate: "2026-09-15",
        endDate: "2026-10-15",
        assignedTo: "Adaeze",
        priority: "critical",
        linkedBoqIdentities: ["BQ-2", "BQ-3"],
      },
    ],
    risks: [
      { riskId: "r1", title: "Rain stops concreting", probability: "high", impact: "high", status: "open", owner: "Chidi", mitigation: "Tent the pour" },
      { riskId: "r2", title: "Old one", probability: "high", impact: "high", status: "closed" },
    ],
    issues: [
      { issueId: "i1", title: "Water table higher than survey", severity: "critical", status: "open", owner: "Adaeze" },
    ],
  },
  ...over,
});

const draw = (props = {}) =>
  render(<WorkProjectPm project={project()} canEdit now={NOW} {...props} />).container;

afterEach(cleanup);

describe("his three views", () => {
  it("offers Timeline, Risks and Issues with their counts", () => {
    const c = draw();
    const seg = within(c).getByRole("group", { name: "View" });
    expect(within(seg).getByText("Timeline").textContent).toContain("2");
    // Only the OPEN risk counts — the closed one does not.
    expect(within(seg).getByText("Risks").textContent).toContain("1");
    expect(within(seg).getByText("Issues").textContent).toContain("1");
  });

  it("asks the caller to change view, so it can ride in the URL", () => {
    const onView = vi.fn();
    const c = render(
      <WorkProjectPm project={project()} canEdit now={NOW} onView={onView} />,
    ).container;
    fireEvent.click(within(c).getByText("Risks"));
    expect(onView).toHaveBeenCalledWith("risks");
  });
});

describe("his five figures", () => {
  it("reports completion and what was planned by today", () => {
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    expect(within(kpi).getByText("Complete")).toBeTruthy();
    expect(within(kpi).getByText("69%")).toBeTruthy();
    expect(within(kpi).getByText(/Planned by today: 64%/)).toBeTruthy();
  });

  it("puts the schedule in plain language, with the ratio underneath", () => {
    // His own gloss — the tile says "On time", not "SPI 1.08".
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    expect(within(kpi).getByText("On time")).toBeTruthy();
    expect(within(kpi).getByText(/Work done ÷ work planned =/)).toBeTruthy();
  });

  it("says how far behind, and warns, when the work is behind", () => {
    const p = project();
    // A single task that should be finished and has not started.
    p.pm.tasks = [
      { taskId: "t1", name: "Slow", startDate: "2026-09-01", endDate: "2026-09-21", linkedBoqIdentities: ["BQ-3"] },
    ];
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    expect(within(c).getByText("100% behind")).toBeTruthy();
    expect(c.querySelector(".pj-kpi .warn")).toBeTruthy();
  });

  it("says when every bill line is in a task", () => {
    const c = draw();
    expect(within(c).getByText("Every line is in a task")).toBeTruthy();
  });

  it("values the bill lines no task covers, and warns", () => {
    const p = project();
    p.pm.tasks = [p.pm.tasks[0]];
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    const kpi = c.querySelector(".pj-kpi");
    // 100 × 9,000 + 10 × 1,000 = 910,000.
    expect(within(kpi).getByText("₦910k")).toBeTruthy();
    expect(within(kpi).getByText("2 lines")).toBeTruthy();
  });

  it("counts overdue tasks and names the first", () => {
    const p = project();
    p.pm.tasks[1].endDate = "2026-09-20";
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    const kpi = c.querySelector(".pj-kpi");
    expect(within(kpi).getByText("Overdue tasks")).toBeTruthy();
    expect(within(kpi).getByText("Frame")).toBeTruthy();
  });

  it("says none are overdue when none are", () => {
    const c = draw();
    expect(within(c).getByText("None past their end date")).toBeTruthy();
  });

  it("counts the open risks and issues, and the ones that are both likely and costly", () => {
    const c = draw();
    const kpi = c.querySelector(".pj-kpi");
    expect(within(kpi).getByText("1 · 1")).toBeTruthy();
    expect(within(kpi).getByText("1 likely and costly")).toBeTruthy();
  });
});

describe("the timeline", () => {
  it("draws a row per task with its owner and dates", () => {
    const c = draw();
    const gantt = c.querySelector(".pj-gantt");
    expect(within(gantt).getByText("Substructure")).toBeTruthy();
    expect(within(gantt).getByText(/Chidi/)).toBeTruthy();
  });

  it("puts today's line on every row — the line his design is built around", () => {
    const c = draw();
    expect(c.querySelectorAll(".pj-gantt .today").length).toBe(2);
  });

  it("marks a critical task", () => {
    const c = draw();
    expect(c.querySelector(".pj-gantt .crit")).toBeTruthy();
  });

  it("marks a late task", () => {
    const p = project();
    p.pm.tasks[1].endDate = "2026-09-20";
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    expect(c.querySelector(".pj-gantt .gr.late")).toBeTruthy();
  });

  it("shows a milestone as a diamond, and says whether it was met", () => {
    const p = project();
    p.pm.tasks[0] = {
      taskId: "m1",
      name: "Foundations signed off",
      startDate: "2026-09-21",
      endDate: "2026-09-21",
      isMilestone: true,
      linkedBoqIdentities: ["BQ-1"],
    };
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    expect(c.querySelector(".pj-gantt .gr.ms")).toBeTruthy();
    expect(c.querySelector(".pj-gantt .dm")).toBeTruthy();
    expect(within(c).getByText("Met")).toBeTruthy();
  });

  it("prints the span and says where progress comes from", () => {
    const c = draw();
    expect(within(c).getByText(/the blue line is today/)).toBeTruthy();
    expect(within(c).getByText(/record it on the Bill/)).toBeTruthy();
  });

  it("says so when the tasks have no dates to place", () => {
    const p = project();
    p.pm.tasks = [{ taskId: "x", name: "No dates" }];
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    expect(within(c).getByText("No dates to draw")).toBeTruthy();
  });
});

describe("the registers", () => {
  it("lists risks with their likelihood, impact, owner and plan", () => {
    const c = draw({ view: "risks" });
    const reg = c.querySelector(".pj-reg");
    expect(within(reg).getByText("Rain stops concreting")).toBeTruthy();
    expect(within(reg).getByText(/Likelihood high · impact high · Chidi · Tent the pour/)).toBeTruthy();
  });

  it("grades a risk that is both likely and costly as the worst", () => {
    const c = draw({ view: "risks" });
    expect(c.querySelector(".pj-reg .sv.hi")).toBeTruthy();
  });

  it("lists issues by severity", () => {
    const c = draw({ view: "issues" });
    const reg = c.querySelector(".pj-reg");
    expect(within(reg).getByText("Water table higher than survey")).toBeTruthy();
    expect(within(reg).getByText(/Severity critical · Adaeze/)).toBeTruthy();
  });

  it("says so when a register is empty", () => {
    const p = project();
    p.pm.issues = [];
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} view="issues" />).container;
    expect(within(c).getByText("No issues recorded")).toBeTruthy();
  });
});

describe("a project with nothing planned", () => {
  it("offers his empty state, saying where tasks come from", () => {
    const p = project();
    p.pm.tasks = [];
    const c = render(<WorkProjectPm project={p} canEdit now={NOW} />).container;
    expect(within(c).getByText(/Plan the work for Ikoyi Complex/)).toBeTruthy();
    expect(within(c).getByText(/come from the bill/)).toBeTruthy();
  });

  it("offers a view-only reader no actions", () => {
    const p = project();
    p.pm.tasks = [];
    const c = render(<WorkProjectPm project={p} canEdit={false} now={NOW} />).container;
    expect(within(c).getByText("No tasks have been planned yet.")).toBeTruthy();
    expect(within(c).queryByText("Back to the bill")).toBe(null);
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectPm project={null} now={NOW} />)).not.toThrow();
  });
});

describe("planning the work from the bill", () => {
  // The missing middle of the chain. With no tasks nothing has a date, so the
  // buy schedule cannot work out a buy-by (earliest linked task start less the
  // lead time), the PM dashboard has no KPIs and there is no cashflow.
  const unplanned = { name: "Richard House", items: [{ code: "BQ-1", qty: 1, rate: 100 }], pm: { tasks: [] } };

  it("offers to plan it, to someone who can edit", () => {
    const c = render(<WorkProjectPm project={unplanned} canEdit onPlan={() => {}} />).container;
    expect(within(c).getByText("Plan the work from the bill")).toBeTruthy();
  });

  it("says planning again will not disturb a task already changed", () => {
    const c = render(<WorkProjectPm project={unplanned} canEdit onPlan={() => {}} />).container;
    expect(within(c).getByText(/never touches a task you have already changed/)).toBeTruthy();
  });

  it("asks the shell to plan when pressed", () => {
    const onPlan = vi.fn();
    const c = render(<WorkProjectPm project={unplanned} canEdit onPlan={onPlan} />).container;
    fireEvent.click(within(c).getByText("Plan the work from the bill"));
    expect(onPlan).toHaveBeenCalled();
  });

  it("will not plan a project with no bill to plan from", () => {
    const c = render(
      <WorkProjectPm project={{ items: [], pm: { tasks: [] } }} canEdit onPlan={() => {}} />,
    ).container;
    expect(within(c).getByText("Plan the work from the bill").disabled).toBe(true);
  });

  it("holds the button while the server is working", () => {
    const c = render(<WorkProjectPm project={unplanned} canEdit onPlan={() => {}} planning />).container;
    expect(within(c).getByText("Planning…").disabled).toBe(true);
  });

  it("says so when it failed, and that nothing changed", () => {
    const c = render(
      <WorkProjectPm project={unplanned} canEdit onPlan={() => {}} planFailed="It could not be generated. Nothing was changed." />,
    ).container;
    expect(within(c).getByText(/Nothing was changed/)).toBeTruthy();
  });

  it("offers a view-only reader nothing to press", () => {
    const c = render(<WorkProjectPm project={unplanned} canEdit={false} />).container;
    expect(within(c).queryByText("Plan the work from the bill")).toBe(null);
    expect(within(c).getByText("No tasks have been planned yet.")).toBeTruthy();
  });
});
