import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectBudgetHeron from "./WorkProjectBudgetHeron.jsx";

// HERON 3.0's Budget (View/MaterialView.xaml). Its question is not "what must I
// buy" but "is this line making money". budgetModel.test.js pins the arithmetic;
// these pin what the screen says, especially where it must refuse to say it.

afterEach(cleanup);

const job = (over = {}) => ({
  items: [
    { code: "BQ-1", description: "Excavate foundations", unit: "m3", qty: 100, rate: 5_000 },
    { code: "BQ-2", description: "Reinforced columns", unit: "m3", qty: 10, rate: 20_000 },
  ],
  budgetItems: [
    { componentKind: "Material", materialName: "Cement", unit: "bags", qty: 100, rate: 2_000, billIdentity: "BQ-1" },
    { componentKind: "Labour", description: "Gang", unit: "days", qty: 50, rate: 2_000, billIdentity: "BQ-1" },
    { componentKind: "Material", materialName: "Rebar", unit: "kg", qty: 100, rate: 2_500, billIdentity: "BQ-2" },
  ],
  ...over,
});

const view = (props = {}) =>
  render(<WorkProjectBudgetHeron project={job()} {...props} />).container;

describe("HERON's three figures", () => {
  it("shows cost, take-off value and overhead + profit", () => {
    const k = [...view().querySelectorAll(".pj-kpi > div")];
    expect(k[0].textContent).toContain("Project cost");
    expect(k[1].textContent).toContain("Take-off value");
    expect(k[2].textContent).toContain("Overhead + profit");
  });

  it("says what share of the bill is profit", () => {
    // 700,000 billed, 550,000 cost -> 21.4%.
    expect(within(view()).getByText(/21\.4% of the bill/)).toBeTruthy();
  });

  it("marks the job when it loses money", () => {
    const bad = job();
    bad.budgetItems.push({ componentKind: "Material", materialName: "Overrun", qty: 1, rate: 5_000_000 });
    const c = render(<WorkProjectBudgetHeron project={bad} />).container;
    expect(within(c).getByText(/Losing/)).toBeTruthy();
    expect(c.querySelectorAll(".pj-kpi > div.warn").length).toBe(1);
  });
});

describe("one card per bill line", () => {
  it("names each line and what it costs against what it is billed at", () => {
    const c = view();
    const card = [...c.querySelectorAll(".pj-vars .vr")][0];
    expect(card.textContent).toContain("Excavate foundations");
    expect(card.textContent).toContain("billed ₦500,000");
    expect(card.textContent).toContain("costs ₦300,000");
  });

  it("puts HERON's margin chip on each line, with his wording", () => {
    const chip = view().querySelector(".pj-vars .vr .pj-stage");
    expect(chip.textContent).toBe("40.0%");
    expect(chip.getAttribute("title")).toBe(
      "Proposed profit margin = (BoQ rate − material − labour) ÷ BoQ rate",
    );
  });

  it("colours a losing line differently from a profitable one", () => {
    const bad = job();
    bad.budgetItems.push({ componentKind: "Material", materialName: "Extra", qty: 1, rate: 400_000, billIdentity: "BQ-2" });
    const c = render(<WorkProjectBudgetHeron project={bad} />).container;
    const chips = [...c.querySelectorAll(".pj-vars .vr .pj-stage")];
    expect(chips.some((x) => x.className.includes("s-final"))).toBe(true);
    expect(chips.some((x) => x.className.includes("v-rejected"))).toBe(true);
  });

  it("lists the material and labour behind the line", () => {
    const card = [...view().querySelectorAll(".pj-vars .vr")][0];
    expect(card.textContent).toContain("Cement");
    expect(card.textContent).toContain("Gang");
  });
});

describe("what it will not claim", () => {
  it("states no margin at all when the bill is not priced", () => {
    // Otherwise every line reads as a 100% loss, which is a lie about the job.
    const unpriced = job();
    unpriced.items = unpriced.items.map((i) => ({ ...i, rate: 0 }));
    const c = render(<WorkProjectBudgetHeron project={unpriced} />).container;
    expect(within(c).getAllByText("No margin yet").length).toBe(2);
    expect(within(c).getByText(/there is no margin to show yet/)).toBeTruthy();
  });

  it("still shows the costs on an unpriced bill, because they are real", () => {
    const unpriced = job();
    unpriced.items = unpriced.items.map((i) => ({ ...i, rate: 0 }));
    const c = render(<WorkProjectBudgetHeron project={unpriced} />).container;
    expect(within(c).getByText("Cement")).toBeTruthy();
  });

  it("owns up to cost that belongs to no bill line", () => {
    const stray = job();
    stray.budgetItems.push({ componentKind: "Material", materialName: "Site hut", qty: 1, rate: 90_000 });
    const c = render(<WorkProjectBudgetHeron project={stray} />).container;
    expect(within(c).getByText(/1 budget row belongs to no bill line/)).toBeTruthy();
  });
});

describe("marking what has been bought", () => {
  it("ticks a material, and sends every row back", () => {
    const onSave = vi.fn();
    const c = render(<WorkProjectBudgetHeron project={job()} canEdit onSave={onSave} />).container;
    fireEvent.click(within(c).getByLabelText("Bought: Cement"));
    expect(onSave.mock.calls[0][0].budgetItems).toHaveLength(3);
  });

  it("offers no tick on labour — nobody buys a gang", () => {
    const c = render(<WorkProjectBudgetHeron project={job()} canEdit onSave={vi.fn()} />).container;
    expect(within(c).queryByLabelText("Bought: Gang")).toBe(null);
  });

  it("gives a view-only reader no checkboxes", () => {
    expect(view().querySelector("input[type=checkbox]")).toBe(null);
  });
});
