import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectRates from "./WorkProjectRates.jsx";

// His Rates & budget tab (work-proj.js:975-1040). WORK.md §13: it IS RateGen
// inside the project.

const project = (over = {}) => ({
  name: "Ikoyi Complex",
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
  provisionalSums: [],
  variations: [],
  budgetItems: [],
  items: [
    {
      code: "BQ-1",
      description: "Excavate foundation trench n.e. 1.5m deep",
      unit: "m3",
      qty: 120,
      rate: 2_500,
      appliedRateKey: "Excavation in firm soil n.e. 1.5m",
      rateLockedAt: "2026-09-20T10:00:00Z",
    },
    {
      code: "BQ-2",
      description: "Reinforced concrete grade 25 in columns",
      unit: "m3",
      qty: 32,
      rate: 72_000,
    },
    {
      code: "BQ-3",
      description: "Ceramic wall tiling 200x300 to toilets",
      takeoffLine: "First floor",
      unit: "m2",
      qty: 420,
      rate: 0,
    },
  ],
  ...over,
});

const draw = (props = {}) =>
  render(<WorkProjectRates project={project()} canEdit {...props} />).container;

afterEach(cleanup);

describe("his three views", () => {
  it("offers Rates, Budget and Buy schedule", () => {
    const c = draw();
    const seg = within(c).getByRole("group", { name: "View" });
    expect(within(seg).getByText("Rates").getAttribute("aria-pressed")).toBe("true");
    expect(within(seg).getByText("Budget")).toBeTruthy();
    expect(within(seg).getByText("Buy schedule")).toBeTruthy();
  });

  it("asks the caller to change view, so it can ride in the URL", () => {
    const onView = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onView={onView} />,
    ).container;
    fireEvent.click(within(c).getByText("Budget"));
    expect(onView).toHaveBeenCalledWith("budget");
  });

  it("says where Budget and Buy schedule live rather than showing an empty panel", () => {
    const c = draw({ view: "budget" });
    // "Budget" is both the segmented button and the heading of the empty state,
    // which is right — so this asks the empty state, not the page.
    const empty = c.querySelector(".pj-empty");
    expect(within(empty).getByText("Budget")).toBeTruthy();
    expect(within(empty).getByText(/not built here yet/)).toBeTruthy();
    expect(within(empty).getByText(/full workspace/)).toBeTruthy();
  });

  it("falls back to Rates for a view that does not exist", () => {
    const c = draw({ view: "nonsense" });
    expect(within(c).getByText("Priced")).toBeTruthy();
  });
});

describe("what still needs a rate", () => {
  it("lists the unpriced lines with their quantity and where they were measured", () => {
    const c = draw();
    const panel = within(c).getByText("Needs a rate").closest(".wk-panel");
    expect(within(panel).getByText("Ceramic wall tiling 200x300 to toilets")).toBeTruthy();
    expect(within(panel).getByText(/420 m2 · First floor/)).toBeTruthy();
  });

  it("counts them beside the heading", () => {
    const c = draw();
    expect(within(c).getByText("Needs a rate").textContent).toContain("1");
  });

  it("does not invent a suggested rate", () => {
    // His design shows a suggested library rate here, from a fixture field. We
    // have nothing that suggests one, and putting a figure in a QS's mouth on a
    // bill is not a small liberty — so the slot says what it is.
    const c = draw();
    expect(within(c).getByText(/No suggestion/)).toBeTruthy();
  });

  it("opens the line rather than offering an action that does nothing", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    fireEvent.click(within(c).getByText("Open the line"));
    expect(onOpenLine).toHaveBeenCalledWith(2);
  });

  it("offers no actions to somebody who may not edit", () => {
    const c = render(<WorkProjectRates project={project()} canEdit={false} />).container;
    expect(within(c).queryByText("Open the line")).toBe(null);
  });

  it("drops the whole section once everything is priced", () => {
    const all = project();
    all.items[2].rate = 9_000;
    const c = render(<WorkProjectRates project={all} canEdit />).container;
    expect(within(c).queryByText("Needs a rate")).toBe(null);
  });
});

describe("what is priced", () => {
  it("names a library rate by the description it was priced from", () => {
    const c = draw();
    expect(within(c).getByText("Excavation in firm soil n.e. 1.5m")).toBeTruthy();
  });

  it("tags where each rate came from", () => {
    const c = draw();
    const rows = c.querySelectorAll(".pj-rt .rr");
    expect(within(rows[0]).getByText("Library")).toBeTruthy();
    expect(within(rows[1]).getByText("Project rate")).toBeTruthy();
  });

  it("falls back to the line's description when there is no library name", () => {
    const c = draw();
    expect(within(c).getByText("Reinforced concrete grade 25 in columns")).toBeTruthy();
  });

  it("shows the rate and the amount", () => {
    const c = draw();
    const rows = c.querySelectorAll(".pj-rt .rr");
    expect(rows[0].textContent).toContain("₦2,500");
    expect(rows[0].textContent).toContain("₦300,000");
  });

  it("prints the estimated total beside the heading, from projectTotals", () => {
    const c = draw();
    const head = within(c).getByText("Priced").closest(".wk-ph");
    // 120 × 2,500 + 32 × 72,000 = 2,604,000 measured, then his cascade.
    expect(within(head).getByText(/Estimated total ₦/)).toBeTruthy();
  });

  it("opens a line's build-up in the side panel", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectRates project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    fireEvent.click(within(c).getByText("Excavation in firm soil n.e. 1.5m"));
    expect(onOpenLine).toHaveBeenCalledWith(0);
  });

  it("says so when nothing is priced", () => {
    const none = project();
    none.items.forEach((it) => { it.rate = 0; });
    const c = render(<WorkProjectRates project={none} canEdit />).container;
    expect(within(c).getByText("Nothing priced yet")).toBeTruthy();
  });
});

describe("a rate that no longer agrees with its build-up", () => {
  const disagreeing = () =>
    project({
      budgetItems: [
        {
          billIdentity: "BQ-1",
          componentKind: "Material",
          qty: 120,
          rate: 3_000,
          overheadPercent: 0,
          profitPercent: 0,
        },
      ],
    });

  it("marks the row, in words for what was actually checked", () => {
    // His tag reads "Library changed". We do not track the library's history —
    // this compares the applied rate with the build-up that prices it.
    const c = render(<WorkProjectRates project={disagreeing()} canEdit />).container;
    expect(within(c).getByText("Differs from build-up")).toBeTruthy();
  });

  it("says how many at the top", () => {
    const c = render(<WorkProjectRates project={disagreeing()} canEdit />).container;
    expect(within(c).getByText(/1 rate no longer agrees/)).toBeTruthy();
  });

  it("says nothing at all when every rate agrees", () => {
    const c = draw();
    expect(within(c).queryByText(/no longer agree/)).toBe(null);
    expect(within(c).queryByText("Differs from build-up")).toBe(null);
  });
});

describe("a project that has not loaded", () => {
  it("does not throw", () => {
    expect(() => render(<WorkProjectRates project={null} />)).not.toThrow();
  });
});
