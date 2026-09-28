import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectBill from "./WorkProjectBill.jsx";

// His Bill tab (work-proj.js:708-823) on a real bill. These pin the STRUCTURE —
// his toolbar, his grouped table, his summary box — and the two figures that
// must never be recomputed anywhere but projectTotals().
//
// vitest has no globals:true here, so cleanup is explicit and queries are scoped
// to the render, or two tests' output answers one query.

const project = (over = {}) => ({
  name: "Ikoyi Complex",
  productKey: "planswift",
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
  contract: { locked: false },
  provisionalSums: [
    { description: "Lift installation", amount: 18_000_000, kind: "pc" },
    { description: "Drainage allowance", amount: 4_500_000 },
  ],
  variations: [],
  items: [
    {
      code: "BQ-1",
      description: "Excavate foundation trench n.e. 1.5m deep",
      takeoffLine: "Grid A-D",
      category: "Substructure",
      trade: "Earthworks",
      unit: "m3",
      qty: 1_240,
      rate: 2_500,
      percentComplete: 100,
    },
    {
      code: "BQ-2",
      description: "Reinforced concrete grade 25 in columns",
      takeoffLine: "Ground floor",
      category: "Frame",
      trade: "Concrete",
      unit: "m3",
      qty: 184,
      rate: 72_000,
      percentComplete: 35,
    },
    {
      code: "BQ-3",
      description: "Ceramic wall tiling 200x300 to toilets",
      takeoffLine: "First floor",
      category: "Finishes",
      trade: "Finishes",
      unit: "m2",
      qty: 420,
      rate: 0,
      percentComplete: 0,
    },
  ],
  ...over,
});

const draw = (props = {}) =>
  render(<WorkProjectBill project={project()} canEdit {...props} />).container;

afterEach(cleanup);

describe("his toolbar", () => {
  it("searches descriptions and elements", () => {
    const c = draw();
    expect(
      within(c).getByPlaceholderText("Search descriptions and elements"),
    ).toBeTruthy();
  });

  it("shows a chip per filter, each with its count", () => {
    const c = draw();
    const chips = within(c).getByRole("group", { name: "Show" });
    expect(within(chips).getByText("All").textContent).toContain("3");
    expect(within(chips).getByText("Unpriced").textContent).toContain("1");
  });

  it("hides a chip with nothing behind it, except All", () => {
    // His rule (work-proj.js:731). No model drift is passed, so there is nothing
    // "Changed in model" to show.
    const c = draw();
    const chips = within(c).getByRole("group", { name: "Show" });
    expect(within(chips).queryByText("Changed in model")).toBe(null);
    expect(within(chips).getByText("All")).toBeTruthy();
  });

  it("offers his two groupings", () => {
    const c = draw();
    const seg = within(c).getByRole("group", { name: "Group by" });
    expect(within(seg).getByText("By element").getAttribute("aria-pressed")).toBe("true");
    expect(within(seg).getByText("By trade")).toBeTruthy();
  });

  it("prints the measured total, from projectTotals and nowhere else", () => {
    // 1,240 × 2,500 + 184 × 72,000 + 420 × 0 = 3,100,000 + 13,248,000.
    // It appears twice on purpose — in the toolbar and as the summary's first
    // row — so this is scoped to the toolbar rather than loosened.
    const c = draw();
    const bar = c.querySelector(".pj-tb .tot");
    expect(bar.textContent).toContain("₦16,348,000");
  });
});

describe("his grouped table", () => {
  it("is a table with his six columns", () => {
    const c = draw();
    const table = within(c).getByRole("table", { name: "Bill of quantities" });
    for (const h of ["Ref", "Description", "Qty", "Rate", "Amount", "Done"]) {
      expect(within(table).getByText(h), h).toBeTruthy();
    }
  });

  it("letters the sections A, B, C in the bill's own order", () => {
    const c = draw();
    expect(within(c).getByText("A · Substructure")).toBeTruthy();
    expect(within(c).getByText("B · Frame")).toBeTruthy();
    expect(within(c).getByText("C · Finishes")).toBeTruthy();
  });

  it("regroups by trade when asked", () => {
    const c = draw();
    fireEvent.click(within(c).getByText("By trade"));
    expect(within(c).getByText("A · Earthworks")).toBeTruthy();
    expect(within(c).getByText("B · Concrete")).toBeTruthy();
  });

  it("numbers a row within its section", () => {
    const c = draw();
    expect(within(c).getByText("A.1")).toBeTruthy();
    expect(within(c).getByText("B.1")).toBeTruthy();
  });

  it("marks an unpriced line and gives it no amount", () => {
    const c = draw();
    expect(within(c).getByText("Needs rate")).toBeTruthy();
    // An en dash, not a zero: it is absent, not nil. House rule, and the one
    // deliberate departure from his markup, which prints an em dash.
    expect(within(c).getAllByText("–").length).toBeGreaterThan(0);
  });

  it("shows the quantity with its unit and the line's progress", () => {
    const c = draw();
    // num() gives a quantity thousands separators, as his does.
    expect(within(c).getByText("1,240")).toBeTruthy();
    expect(within(c).getAllByText("m3").length).toBeGreaterThan(0);
    expect(within(c).getByText("35%")).toBeTruthy();
  });

  it("filters to the unpriced lines", () => {
    const c = draw();
    fireEvent.click(within(c).getByText("Unpriced"));
    expect(within(c).getByText("Ceramic wall tiling 200x300 to toilets")).toBeTruthy();
    expect(within(c).queryByText("Reinforced concrete grade 25 in columns")).toBe(null);
  });

  it("searches on where a line was measured, not only its description", () => {
    const c = draw();
    fireEvent.change(within(c).getByPlaceholderText("Search descriptions and elements"), {
      target: { value: "ground floor" },
    });
    expect(within(c).getByText("Reinforced concrete grade 25 in columns")).toBeTruthy();
    expect(within(c).queryByText("Excavate foundation trench n.e. 1.5m deep")).toBe(null);
  });

  it("says so when nothing matches, rather than showing an empty table", () => {
    const c = draw();
    fireEvent.change(within(c).getByPlaceholderText("Search descriptions and elements"), {
      target: { value: "zzzz" },
    });
    expect(within(c).getByText("No lines match")).toBeTruthy();
  });

  it("opens a line in the side panel — his L5, never a new page", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectBill project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    fireEvent.click(within(c).getByText("Reinforced concrete grade 25 in columns"));
    // The line's own index in the project, which is its identity everywhere.
    expect(onOpenLine).toHaveBeenCalledWith(1);
  });

  it("opens a line from the keyboard too", () => {
    const onOpenLine = vi.fn();
    const c = render(
      <WorkProjectBill project={project()} canEdit onOpenLine={onOpenLine} />,
    ).container;
    const row = within(c).getByText("A.1").closest(".rw");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpenLine).toHaveBeenCalledWith(0);
  });

  it("collapses and expands every section", () => {
    const c = draw();
    expect(within(c).getByText("Collapse all")).toBeTruthy();
    fireEvent.click(within(c).getByText("Collapse all"));
    expect(within(c).getByText("Expand all")).toBeTruthy();
    expect(within(c).queryByText("A.1")).toBe(null);
  });
});

describe("his summary box", () => {
  it("runs his cascade in his order", () => {
    const c = draw();
    const box = within(c).getByRole("heading", { name: "Summary" }).closest(".pj-sumbox");
    const labels = [...box.querySelectorAll(".r .l")].map((n) => n.textContent.trim());
    expect(labels[0]).toBe("Measured work");
    expect(labels.some((l) => l.startsWith("Preliminaries"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Contingency"))).toBe(true);
    expect(labels.some((l) => l.startsWith("VAT"))).toBe(true);
    expect(labels[labels.length - 1]).toBe("Estimated total");
  });

  it("prints the percentage beside each of the three", () => {
    const c = draw();
    expect(within(c).getByText(/Preliminaries · 7\.5%/)).toBeTruthy();
    expect(within(c).getByText(/Contingency · 5%/)).toBeTruthy();
    expect(within(c).getByText(/VAT · 7\.5%/)).toBeTruthy();
  });

  it("lists the PC and provisional sums separately, as he does", () => {
    const c = draw();
    expect(within(c).getByText("PC sums")).toBeTruthy();
    expect(within(c).getByText("Lift installation")).toBeTruthy();
    expect(within(c).getByText("Provisional sums")).toBeTruthy();
    expect(within(c).getByText("Drainage allowance")).toBeTruthy();
  });

  it("hides approved variations until the contract is locked", () => {
    const open = draw();
    expect(within(open).queryByText(/Approved variations/)).toBe(null);
    cleanup();
    const locked = render(
      <WorkProjectBill project={project({ contract: { locked: true } })} canEdit />,
    ).container;
    expect(within(locked).getByText(/Approved variations/)).toBeTruthy();
  });

  it("says the contract is locked rather than offering edits", () => {
    const c = render(
      <WorkProjectBill project={project({ contract: { locked: true } })} canEdit />,
    ).container;
    expect(
      within(c).getByText("Contract locked — changes go through variations"),
    ).toBeTruthy();
  });
});

describe("a bill with nothing in it", () => {
  it("says so instead of drawing an empty table", () => {
    const c = render(<WorkProjectBill project={project({ items: [] })} />).container;
    expect(within(c).getByText("No lines yet")).toBeTruthy();
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectBill project={null} />)).not.toThrow();
  });
});
