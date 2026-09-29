import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { WorkProjectBudgetView, WorkProjectBuyView } from "./WorkProjectBudget.jsx";

// The Budget and Buy schedule views. budgetModel.test.js pins the arithmetic;
// these pin what the screens do with it and what they will not let a reader do.

afterEach(cleanup);

const project = (over = {}) => ({
  budgetItems: [
    {
      componentKind: "Material",
      materialName: "Cement 42.5N",
      unit: "bags",
      qty: 420,
      rate: 7_500,
      billIdentity: "bq-1",
      takeoffLine: "Foundation plan",
    },
    {
      componentKind: "Material",
      materialName: "Reinforcement Y16",
      unit: "kg",
      qty: 1_000,
      rate: 1_200,
      procuredPercent: 50,
      billIdentity: "bq-2",
    },
    { componentKind: "Labour", description: "Mason gang", unit: "days", qty: 40, rate: 35_000 },
    { componentKind: "Plant", description: "Excavator 20t", unit: "days", qty: 12, rate: 180_000 },
  ],
  pm: {
    tasks: [{ name: "Foundations", startDate: "2026-10-05", linkedBoqIdentities: ["x::BQ-1"] }],
  },
  ...over,
});

/* ───────────────────────────── Budget ───────────────────────────── */

const budget = (props = {}) =>
  render(<WorkProjectBudgetView project={project()} {...props} />).container;

describe("the Budget view", () => {
  it("shows each class in its own panel", () => {
    // By heading: "Materials" is also the donut's label and a summary row.
    const headings = [...budget().querySelectorAll(".wk-ph h2")].map((h) => h.textContent);
    expect(headings).toContain("Materials");
    expect(headings).toContain("Labour");
    expect(headings).toContain("Plant");
  });

  it("gives plant its own panel rather than folding it into labour", () => {
    // Folded in it would be added to the single Labour row, and a plant figure
    // hidden inside labour is one a QS cannot check.
    const c = budget();
    const plant = [...c.querySelectorAll(".wk-panel")].find((s) =>
      s.textContent.startsWith("Plant"),
    );
    expect(plant.textContent).toContain("Excavator 20t");
    const labour = [...c.querySelectorAll(".wk-panel")].find((s) =>
      s.textContent.startsWith("Labour"),
    );
    expect(labour.textContent).not.toContain("Excavator");
  });

  it("puts the most valuable row first", () => {
    const rows = [...budget().querySelectorAll(".pj-bud .br")];
    expect(rows[0].textContent).toContain("Cement 42.5N");
  });

  it("says when a row is only part-ordered", () => {
    expect(within(budget()).getByText(/50% ordered/)).toBeTruthy();
  });

  it("gives a budget row the quantity and nothing else, as his does", () => {
    // What a row is FOR belongs in the buy schedule's own column. Putting it
    // here printed the bill description twice on a real HERON project.
    const row = [...budget().querySelectorAll(".pj-bud .br")][0];
    expect(row.querySelector("em").textContent).toBe("420 bags");
  });

  it("lets an editor tick a material bought, and sends every row back", () => {
    const onSave = vi.fn();
    const c = budget({ canEdit: true, onSave });
    fireEvent.click(within(c).getByLabelText("Bought: Cement 42.5N"));
    const patch = onSave.mock.calls[0][0];
    expect(patch.budgetItems[0].procured).toBe(true);
    expect(patch.budgetItems).toHaveLength(4);
  });

  it("offers no tick on labour or plant — neither is bought", () => {
    const c = budget({ canEdit: true, onSave: vi.fn() });
    expect(within(c).queryByLabelText("Bought: Mason gang")).toBe(null);
    expect(within(c).queryByLabelText("Bought: Excavator 20t")).toBe(null);
  });

  it("gives a view-only reader no checkboxes at all", () => {
    expect(budget().querySelector("input[type=checkbox]")).toBe(null);
  });

  it("holds the ticks while a save is in flight", () => {
    const c = budget({ canEdit: true, saving: true, onSave: vi.fn() });
    expect(within(c).getByLabelText("Bought: Cement 42.5N").disabled).toBe(true);
  });

  it("says there is no budget rather than drawing empty donuts", () => {
    const c = render(<WorkProjectBudgetView project={{ budgetItems: [] }} />).container;
    expect(within(c).getByText("No budget yet")).toBeTruthy();
    expect(c.querySelector(".pj-donut")).toBe(null);
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectBudgetView project={null} />)).not.toThrow();
  });
});

/* ─────────────────────────── Buy schedule ─────────────────────────── */

const NOW = new Date("2026-10-01T09:00:00Z");
const buy = (props = {}) =>
  render(<WorkProjectBuyView project={project()} now={NOW} {...props} />).container;

describe("the Buy schedule view", () => {
  it("lists the materials, dated ones first", () => {
    const rows = [...buy().querySelectorAll(".pj-buy .rw")];
    expect(rows[0].textContent).toContain("Cement 42.5N");
    expect(rows[1].textContent).toContain("Not scheduled");
  });

  it("says when each has to be bought, and when it is needed on site", () => {
    const first = buy().querySelector(".pj-buy .rw");
    // 5 Oct start less the 14-day default.
    expect(first.textContent).toContain("21 Sep");
    expect(first.textContent).toContain("on site 5 Oct");
  });

  it("marks a row already past its buy-by as late", () => {
    // Against 1 Oct, a 21 Sep buy-by has gone.
    expect(buy().querySelector(".pj-buy .rw.late")).toBeTruthy();
  });

  it("marks an undated row rather than dating it", () => {
    const none = buy().querySelector(".pj-buy .rw.none");
    expect(none.textContent).toContain("Reinforcement Y16");
  });

  it("counts late, this week and unscheduled above the list", () => {
    const k = [...buy().querySelectorAll(".pj-kpi > div")];
    expect(k[0].textContent).toContain("Should already be bought");
    expect(k[0].className).toBe("warn");
    expect(k[2].textContent).toContain("Not yet scheduled");
  });

  it("re-dates the list when the lead time is changed", () => {
    const c = buy({ canEdit: true, onSave: vi.fn() });
    fireEvent.change(within(c).getByLabelText("Lead time in days"), { target: { value: "30" } });
    expect(c.querySelector(".pj-buy .rw").textContent).toContain("5 Sep");
  });

  it("shows a view-only reader the lead time as text, not a field", () => {
    const c = buy();
    expect(within(c).queryByLabelText("Lead time in days")).toBe(null);
    expect(within(c).getByText("14 days")).toBeTruthy();
  });

  it("ticks a row bought from here too", () => {
    const onSave = vi.fn();
    const c = buy({ canEdit: true, onSave });
    fireEvent.click(within(c).getByLabelText("Bought: Cement 42.5N"));
    expect(onSave.mock.calls[0][0].budgetItems[0].procured).toBe(true);
  });

  it("says how many are dated and why the rest are not", () => {
    expect(within(buy()).getByText(/1 of 2 dated/)).toBeTruthy();
    expect(within(buy()).getByText(/no date rather than a guessed one/)).toBeTruthy();
  });

  it("says there is nothing to buy on a project with no budget", () => {
    const c = render(<WorkProjectBuyView project={{}} now={NOW} />).container;
    expect(within(c).getByText("Nothing to buy yet")).toBeTruthy();
  });
});

describe("a budget that exists but is not priced yet", () => {
  // Found on a real QUIV project: 271 rows of material and labour, every one
  // linked to its bill line, and the screen said "No budget yet" — because the
  // empty state tested the total VALUE, and an unpriced bill makes that 0.
  // Whether there is a budget is a question about rows.
  const unpriced = {
    budgetItems: [
      { componentKind: "Material", materialName: "Cement", unit: "bags", qty: 9.91, rate: 0, billIdentity: "e48c" },
      { componentKind: "Material", materialName: "Sharp sand", unit: "tons", qty: 1.1, rate: 0, billIdentity: "e48c" },
      { componentKind: "Labour", description: "Mason gang", unit: "days", qty: 4, rate: 0 },
    ],
  };

  it("shows the rows instead of claiming there is no budget", () => {
    const c = render(<WorkProjectBudgetView project={unpriced} />).container;
    expect(within(c).queryByText("No budget yet")).toBe(null);
    expect(c.querySelectorAll(".pj-bud .br").length).toBe(3);
    expect(within(c).getByText("Cement")).toBeTruthy();
  });

  it("says why every figure is a quantity and not money", () => {
    const c = render(<WorkProjectBudgetView project={unpriced} />).container;
    expect(within(c).getByText(/3 rows of material and labour/)).toBeTruthy();
    expect(within(c).getByText(/None of it carries a cost rate yet/)).toBeTruthy();
  });

  it("marks an unpriced row rather than printing ₦0", () => {
    const c = render(<WorkProjectBudgetView project={unpriced} />).container;
    expect(within(c).getAllByText("Not priced").length).toBe(3);
  });

  it("still says there is no budget when there are genuinely no rows", () => {
    const c = render(<WorkProjectBudgetView project={{ budgetItems: [] }} />).container;
    expect(within(c).getByText("No budget yet")).toBeTruthy();
  });
});
