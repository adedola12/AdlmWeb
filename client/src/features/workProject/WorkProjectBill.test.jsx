import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectBill from "./WorkProjectBill.jsx";
import { EN_DASH } from "./workProjectFormat.js";

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

describe("arranging the bill's sections", () => {
  const arranged = {
    productKey: "revit",
    customCategories: ["Substructure", "Frames"],
    items: [
      { code: "BQ-1", category: "Frames", description: "Concrete column", qty: 1, rate: 100 },
      { code: "BQ-2", category: "Substructure", description: "Excavate", qty: 1, rate: 100 },
    ],
  };

  it("renders the sections in the project's own arrangement", () => {
    const c = render(<WorkProjectBill project={arranged} />).container;
    const names = [...c.querySelectorAll(".bsec .sh b")].map((b) => b.textContent);
    expect(names[0]).toContain("Substructure");
    expect(names[1]).toContain("Frames");
  });

  it("lets an editor drag a section, and saves the new order", () => {
    const onSave = vi.fn();
    const c = render(<WorkProjectBill project={arranged} canEdit onSave={onSave} />).container;
    const secs = [...c.querySelectorAll(".bsec")];
    expect(secs[0].getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(secs[1]);
    fireEvent.drop(secs[0]);
    expect(onSave.mock.calls[0][0].customCategories).toEqual(["Frames", "Substructure"]);
  });

  it("gives a view-only reader nothing to drag", () => {
    const c = render(<WorkProjectBill project={arranged} />).container;
    expect(c.querySelector(".bsec").getAttribute("draggable")).toBe("false");
  });

  it("offers to add a section", () => {
    const c = render(<WorkProjectBill project={arranged} canEdit onSave={vi.fn()} />).container;
    expect(within(c).getByText("Add a section")).toBeTruthy();
  });

  it("offers an arrangement only when it would change something", () => {
    // Substructure then Frames is already the engine's order.
    const tidy = render(<WorkProjectBill project={arranged} canEdit onSave={vi.fn()} />).container;
    expect(within(tidy).queryByText("Suggest an arrangement")).toBe(null);
    cleanup();
    const messy = render(
      <WorkProjectBill
        project={{ ...arranged, customCategories: ["Frames", "Substructure"] }}
        canEdit
        onSave={vi.fn()}
      />,
    ).container;
    expect(within(messy).getByText("Suggest an arrangement")).toBeTruthy();
  });

  it("hides the arranging controls on a filtered or searched view", () => {
    // They would reorder a bill the reader cannot see all of.
    const c = render(
      <WorkProjectBill project={arranged} canEdit onSave={vi.fn()} initialQuery="column" />,
    ).container;
    expect(within(c).queryByText("Add a section")).toBe(null);
    expect(c.querySelector(".bsec")?.getAttribute("draggable")).toBe("false");
  });
});

describe("the arranging controls actually do something (reported broken)", () => {
  const messy = {
    productKey: "revit",
    customCategories: ["Frames", "Substructure"],
    items: [
      { code: "BQ-1", category: "Frames", description: "Concrete column", qty: 1, rate: 100 },
      { code: "BQ-2", category: "Substructure", description: "Excavate", qty: 1, rate: 100 },
    ],
  };

  it("saves an arrangement when the control is pressed", () => {
    const onSave = vi.fn();
    const c = render(<WorkProjectBill project={messy} canEdit onSave={onSave} />).container;
    fireEvent.click(within(c).getByText("Suggest an arrangement"));
    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].customCategories).toEqual(["Substructure", "Frames"]);
  });

  it("starts a drag from the section header a QS actually grabs", () => {
    // The header is a <button> inside the draggable .bsec. A drag begun on the
    // button is what a person does; if the gesture never reaches the container
    // the feature is dead on a real page while passing a test that fires
    // dragStart on the container directly.
    const onSave = vi.fn();
    const c = render(<WorkProjectBill project={messy} canEdit onSave={onSave} />).container;
    const secs = [...c.querySelectorAll(".bsec")];
    fireEvent.dragStart(secs[0].querySelector(".sh"));
    fireEvent.drop(secs[1]);
    expect(onSave).toHaveBeenCalled();
  });
});

describe("rearranging on a phone (native drag never fires on touch)", () => {
  const messy = {
    productKey: "revit",
    customCategories: ["Frames", "Substructure"],
    items: [
      { code: "BQ-1", category: "Frames", description: "Concrete column", qty: 1, rate: 100 },
      { code: "BQ-2", category: "Substructure", description: "Excavate", qty: 1, rate: 100 },
    ],
  };

  it("moves a section with a finger on the grip", () => {
    const onSave = vi.fn();
    const c = render(<WorkProjectBill project={messy} canEdit onSave={onSave} />).container;
    const secs = [...c.querySelectorAll(".bsec")];
    const grip = secs[1].querySelector(".grip");
    expect(grip).toBeTruthy();
    // jsdom has no layout; say which section is under the finger.
    const had = document.elementFromPoint;
    document.elementFromPoint = () => secs[0].querySelector(".sh");
    try {
      fireEvent.pointerDown(grip, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 300 });
      fireEvent.pointerMove(grip, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 200 });
      fireEvent.pointerUp(grip, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 200 });
    } finally {
      document.elementFromPoint = had;
    }
    expect(onSave.mock.calls[0][0].customCategories).toEqual(["Substructure", "Frames"]);
  });

  it("moves a section with the arrow keys on the grip", () => {
    const onSave = vi.fn();
    const c = render(<WorkProjectBill project={messy} canEdit onSave={onSave} />).container;
    fireEvent.keyDown(c.querySelectorAll(".grip")[0], { key: "ArrowDown" });
    expect(onSave.mock.calls[0][0].customCategories).toEqual(["Substructure", "Frames"]);
  });

  it("shows no grip to a view-only reader or on a searched view", () => {
    expect(render(<WorkProjectBill project={messy} />).container.querySelector(".grip")).toBe(null);
    cleanup();
    const c = render(
      <WorkProjectBill project={messy} canEdit onSave={vi.fn()} initialQuery="column" />,
    ).container;
    expect(c.querySelector(".grip")).toBe(null);
  });
});

describe("the actual columns, after a contract lock", () => {
  const locked = (over = {}) => ({
    contract: { locked: true },
    valuationSettings: { showActualColumns: true },
    items: [
      { code: "BQ-1", description: "Excavate", category: "Substructure", qty: 120, unit: "m3", rate: 4_500, actualQty: 134 },
      { code: "BQ-2", description: "Columns", category: "Frame", qty: 40, unit: "m3", rate: 72_000 },
    ],
    ...over,
  });

  const draw = (project, props = {}) =>
    render(<WorkProjectBill project={project} canEdit {...props} />).container;

  it("offers the switch only once the contract is locked", () => {
    // Before a lock the actuals are all empty and there is nothing to compare
    // against, so the switch itself would be noise.
    expect(within(draw(locked({ contract: {} }))).queryByText(/actuals/i)).toBe(null);
    expect(within(draw(locked())).getByText("Hide actuals")).toBeTruthy();
    expect(
      within(draw(locked({ valuationSettings: { showActualColumns: false } }))).getByText(
        "Show actuals",
      ),
    ).toBeTruthy();
  });

  it("names the frozen column CONTRACT qty once actuals are showing", () => {
    // "Qty" beside "Actual qty" does not say which one is the agreed figure.
    const c = draw(locked());
    expect(within(c).getByText("Contract qty")).toBeTruthy();
    expect(within(c).getByText("Actual qty")).toBeTruthy();
    expect(within(c).getByText("Variation")).toBeTruthy();
  });

  it("saves the switch to the project, not to this browser", () => {
    // Two people on the same locked contract must see the same columns.
    const onSave = vi.fn();
    const c = draw(locked({ valuationSettings: { showActualColumns: false, showDailyLog: true } }), {
      onSave,
    });
    fireEvent.click(within(c).getByText("Show actuals"));
    expect(onSave).toHaveBeenCalledWith({
      // And it keeps the other valuation settings, which the PUT would otherwise
      // fall back on.
      valuationSettings: { showDailyLog: true, showActualColumns: true },
    });
  });

  it("shows an unmeasured line as nothing, not as its contract figure", () => {
    // Repeating the contract amount in the actual column reads as a confirmed
    // measurement. BQ-2 has not been measured, so its three actual cells are
    // empty while BQ-1 carries real figures.
    const c = draw(locked({ items: [locked().items[1]] })); // BQ-2 alone
    const row = c.querySelector(".pj-bill.act .rw");
    expect(row).toBeTruthy();
    const cells = [...row.querySelectorAll("span")].map((n) => n.textContent.trim());
    // 40 x 72,000 = 2,880,000 appears ONCE, in the contract amount column.
    expect(cells.filter((t) => t.includes("2,880,000"))).toHaveLength(1);
    // The variation cell says nothing, not "agrees" and not a figure.
    expect(row.querySelector(".vr").textContent.trim()).toBe(EN_DASH);
  });

  it("shows a measured line's own figures and its variance", () => {
    const c = draw(locked({ items: [locked().items[0]] })); // BQ-1, measured 134
    const row = c.querySelector(".pj-bill.act .rw");
    const text = row.textContent;
    expect(text).toContain("120"); // the contract quantity, unchanged
    expect(text).toContain("134"); // what was measured
    expect(text).toContain("603,000"); // 134 x 4,500
    expect(row.querySelector(".vr").textContent).toContain("63,000");
    expect(row.querySelector(".vr.up")).toBeTruthy(); // over the contract
  });

  it("totals the contract against what has been measured, and says how much rests on it", () => {
    // 134 x 4,500 = 603,000 measured; BQ-2 stands at 2,880,000 either way.
    const c = draw(locked());
    expect(within(c).getByText(/1 of 2 lines re-measured/)).toBeTruthy();
    expect(within(c).getByText(/the rest stand as agreed/)).toBeTruthy();
    expect(within(c).getByText("Variation from measured work")).toBeTruthy();
  });

  it("says plainly when nothing has been re-measured", () => {
    // Otherwise two identical totals and a variation of zero read as a bill
    // that has been checked and found to agree.
    const c = draw(
      locked({
        items: [{ code: "BQ-1", description: "Excavate", qty: 120, unit: "m3", rate: 4_500 }],
      }),
    );
    expect(within(c).getByText(/nothing re-measured yet/)).toBeTruthy();
    expect(within(c).getByText("None")).toBeTruthy();
  });

  it("points new scope at the variations list rather than counting it here", () => {
    // Re-measured work and new scope are two different variations, and adding
    // them together on this strip would double-count against the contract.
    const c = draw(locked());
    expect(within(c).getByText(/New scope is a variation of its own/)).toBeTruthy();
  });

  it("does not let a viewer change what everybody sees", () => {
    const c = render(<WorkProjectBill project={locked()} canEdit={false} />).container;
    expect(within(c).getByText("Hide actuals").disabled).toBe(true);
  });
});

describe("renaming a section", () => {
  // withSectionRenamed has been written, exported and unit-tested since the
  // sections landed, and nothing called it — while add and reorder, the other two
  // thirds of the same feature, are both wired. A QS who mis-typed a section name
  // had to re-file every line under it by hand.
  const arranged = () => ({
    customCategories: ["Substructure", "Frame"],
    items: [
      { code: "BQ-1", description: "Excavate", unit: "m3", qty: 10, rate: 100, category: "Substructure" },
      { code: "BQ-2", description: "Columns", unit: "m3", qty: 5, rate: 200, category: "Frame" },
    ],
  });

  const draw = (props = {}) =>
    render(<WorkProjectBill project={arranged()} canEdit onSave={vi.fn()} {...props} />).container;

  const renamer = (c, name) => within(c).getByLabelText(`Rename ${name}`);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a rename control on each section", () => {
    const c = draw();
    expect(renamer(c, "Substructure")).toBeTruthy();
    expect(renamer(c, "Frame")).toBeTruthy();
  });

  it("renames the section AND re-files every line under it", () => {
    // Both, or the lines re-appear under the old name the moment orderedSections
    // reads the bill again.
    vi.spyOn(window, "prompt").mockReturnValue("Foundations");
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Substructure"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.customCategories).toEqual(["Foundations", "Frame"]);
    expect(patch.items[0].category).toBe("Foundations");
    expect(patch.items[1].category).toBe("Frame");
  });

  it("does nothing at all when the prompt is cancelled", () => {
    // null is "cancel". Treating it as an empty name would scold somebody who
    // changed their mind.
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Frame"));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).queryByText("A section needs a name.")).toBe(null);
  });

  it("says a section needs a name rather than saving a blank one", () => {
    vi.spyOn(window, "prompt").mockReturnValue("   ");
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Frame"));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).getByText("A section needs a name.")).toBeTruthy();
  });

  it("refuses a name the bill already uses, and says which", () => {
    // Two sections with one name is two sections a line cannot be told apart by.
    vi.spyOn(window, "prompt").mockReturnValue("Frame");
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Substructure"));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).getByText(/already has a section called "Frame"/)).toBeTruthy();
  });

  it("does not call a CASE-ONLY change a collision, because it is not one", () => {
    // withSectionRenamed compares case-insensitively, so "frames" -> "Frames"
    // returns null. The handler reported every null as a duplicate, and a group
    // takes its name from the bill LINES while the ordered list keeps the
    // project's spelling — so the section a QS SEES as lower case is exactly the
    // one they would try to capitalise, and they were sent hunting for a duplicate
    // that does not exist.
    vi.spyOn(window, "prompt").mockReturnValue("FRAME");
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Frame"));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).queryByText(/already has a section called/)).toBe(null);
    expect(
      within(c).getByText("A section's capitalisation cannot be changed on its own."),
    ).toBeTruthy();
  });

  it("does not wear the drag handle's cursor", () => {
    // .grip sets cursor:grab and touch-action:none because it was written for
    // dragging a section. The pencil has no pointer handlers at all, so it invited
    // a drag it cannot do, beside a handle that can.
    const c = draw();
    expect(renamer(c, "Frame").className).toContain("rnm");
  });

  it("cannot fire a second save while one is in flight", () => {
    // "Add a section" and "Suggest an arrangement" both pass disabled={saving};
    // this was the only one of the three that did not, so it could build a patch
    // from a project the server had already moved past.
    vi.spyOn(window, "prompt").mockReturnValue("Foundations");
    const onSave = vi.fn();
    const c = draw({ onSave, saving: true });
    const pencil = renamer(c, "Substructure");
    expect(pencil.getAttribute("tabindex")).toBe("-1");
    expect(pencil.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(pencil);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("stays quiet when the name is typed back unchanged", () => {
    vi.spyOn(window, "prompt").mockReturnValue("Frame");
    const onSave = vi.fn();
    const c = draw({ onSave });
    fireEvent.click(renamer(c, "Frame"));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(c).queryByText(/already has a section/)).toBe(null);
  });

  it("is not offered inside a search or a filter", () => {
    // Renaming a section while looking at a subset is the same hazard as
    // reordering one — it is the gate the drag grip already uses.
    const c = draw({ initialQuery: "Excavate" });
    expect(within(c).queryByLabelText("Rename Substructure")).toBe(null);
  });

  it("is not offered to a reader who cannot edit", () => {
    const c = render(<WorkProjectBill project={arranged()} canEdit={false} />).container;
    expect(within(c).queryByLabelText("Rename Frame")).toBe(null);
  });
});
