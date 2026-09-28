import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import WorkProjectLinePanel from "./WorkProjectLinePanel.jsx";

// His line panel (work-proj.js:891). Reading it is most of the panel; the two
// edits — recording progress and moving a line to another section — are what
// these mostly pin, because they are the only writes on the whole page.

afterEach(cleanup);

const project = (over = {}) => ({
  items: [
    {
      code: "BQ-1",
      description: "Excavate for foundations",
      qty: 120,
      unit: "m3",
      rate: 4_500,
      percentComplete: 25,
      category: "Substructure",
      trade: "Earthworks",
      takeoffLine: "Foundation plan",
    },
    {
      code: "BQ-2",
      description: "Reinforced concrete columns",
      qty: 40,
      unit: "m3",
      rate: 0,
      percentComplete: 0,
      category: "Frame",
    },
  ],
  ...over,
});

const panel = (props = {}) =>
  render(<WorkProjectLinePanel project={project()} index={0} {...props} />).container;

describe("what the panel says about a line", () => {
  it("leads with the quantity and its unit", () => {
    const c = panel();
    expect(within(c).getByText(/120/)).toBeTruthy();
    expect(within(c).getByText("m3")).toBeTruthy();
  });

  it("names where it was measured", () => {
    expect(within(panel()).getByText(/BQ-1 · Foundation plan/)).toBeTruthy();
  });

  it("shows the rate and what the line comes to", () => {
    const c = panel();
    expect(within(c).getByText(/₦4,500/)).toBeTruthy();
    // 120 × 4,500.
    expect(within(c).getByText("₦540,000")).toBeTruthy();
  });

  it("says an unpriced line is not in the total, rather than showing ₦0", () => {
    const c = render(<WorkProjectLinePanel project={project()} index={1} />).container;
    expect(within(c).getByText(/No rate yet — it is not counted/)).toBeTruthy();
    expect(within(c).queryByText("₦0")).toBe(null);
  });

  it("says progress only counts once the contract is locked", () => {
    expect(within(panel()).getByText(/Progress counts once the contract is locked/)).toBeTruthy();
    const locked = panel({ contractLocked: true });
    expect(within(locked).getByText(/Feeds the next valuation/)).toBeTruthy();
  });

  it("renders nothing for an index that is not a line", () => {
    const c = render(<WorkProjectLinePanel project={project()} index={9} />).container;
    expect(c.textContent).toBe("");
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectLinePanel project={null} index={0} />)).not.toThrow();
  });
});

describe("recording progress", () => {
  it("offers his five steps, with the line's own marked", () => {
    const c = panel({ canEdit: true });
    const steps = [...c.querySelectorAll(".pn-steps button")];
    expect(steps.map((b) => b.textContent)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(steps[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("saves the whole project with that one line changed", () => {
    const onSave = vi.fn();
    const c = panel({ canEdit: true, onSave });
    fireEvent.click(within(c).getByText("75%"));
    const patch = onSave.mock.calls[0][0];
    expect(patch.items[0].percentComplete).toBe(75);
    expect(patch.items[1].percentComplete).toBe(0);
  });

  it("sends every line, not just the one that changed", () => {
    // The PUT replaces items outright, so a patch holding one line would delete
    // the rest of the bill.
    const onSave = vi.fn();
    fireEvent.click(within(panel({ canEdit: true, onSave })).getByText("100%"));
    expect(onSave.mock.calls[0][0].items).toHaveLength(2);
  });

  it("offers no steps to a view-only reader", () => {
    expect(panel().querySelector(".pn-steps")).toBe(null);
  });

  it("does not let a second click in while a save is in flight", () => {
    const onSave = vi.fn();
    const c = panel({ canEdit: true, onSave, saving: true });
    expect([...c.querySelectorAll(".pn-steps button")].every((b) => b.disabled)).toBe(true);
    fireEvent.click(within(c).getByText("50%"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("moving a line to another section", () => {
  it("offers the sections this bill actually uses", () => {
    const sel = panel({ canEdit: true }).querySelector(".pn-sel");
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Frame", "Substructure"]);
    expect(sel.value).toBe("Substructure");
  });

  it("saves the line into the section picked", () => {
    const onSave = vi.fn();
    const sel = panel({ canEdit: true, onSave }).querySelector(".pn-sel");
    fireEvent.change(sel, { target: { value: "Frame" } });
    expect(onSave.mock.calls[0][0].items[0].category).toBe("Frame");
  });

  it("keeps a line's own section on the list even when no other line shares it", () => {
    // Otherwise the only line in a section could never be put back.
    const one = project({ items: [{ code: "BQ-1", qty: 1, rate: 1, category: "Roofing" }] });
    const sel = render(
      <WorkProjectLinePanel project={one} index={0} canEdit />,
    ).container.querySelector(".pn-sel");
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Roofing"]);
  });

  it("shows a view-only reader the section as text, not a picker", () => {
    const c = panel();
    expect(c.querySelector(".pn-sel")).toBe(null);
    expect(within(c).getByText("Substructure")).toBeTruthy();
  });
});

describe("getting to the next line", () => {
  it("steps forward and back by index", () => {
    const onGoToLine = vi.fn();
    const c = panel({ onGoToLine });
    fireEvent.click(within(c).getByText("Next line"));
    expect(onGoToLine).toHaveBeenCalledWith(1);
  });

  it("stops at each end of the bill", () => {
    const first = panel();
    expect(within(first).getByText("Previous line").disabled).toBe(true);
    const last = render(<WorkProjectLinePanel project={project()} index={1} />).container;
    expect(within(last).getByText("Next line").disabled).toBe(true);
  });
});
