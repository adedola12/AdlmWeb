// The stage strip offers the thing that actually moves a project on.
//
// WHAT WAS THERE
//
// A button reading "Move to <stage>" with no onClick at all. It did nothing
// when pressed — worse than not being there, because somebody clicks it and
// concludes the product is broken rather than that the action is elsewhere.
//
// It could not have been wired either. NOTHING in this codebase writes
// project.stage: no server route accepts it and no client sets it, because, as
// valuationsModel.js puts it, the stage is a label and the lock is the fact. A
// project reaches "Contract locked" by its contract being locked, not by
// somebody announcing it. So "move to the next stage" is not an operation that
// was missing an implementation — it is one that should not exist.
//
// What replaced it names the real action and goes to the tab where it is done.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";

import WorkProjectOverview from "./WorkProjectOverview.jsx";

afterEach(cleanup);

const project = (over = {}) => ({
  name: "Ikoyi duplex",
  items: [{ description: "Concrete", qty: 10, rate: 1000 }],
  contract: {},
  ...over,
});

const draw = (p, props = {}) =>
  render(<WorkProjectOverview project={p} toolName="QUIV" canEdit {...props} />).container;

describe("the stage strip", () => {
  it("offers the real next action, not 'move to' a label", () => {
    const c = draw(project({ stage: "tendered" }));
    // The next stage after Tendered is Contract locked, and what gets a project
    // there is locking the contract.
    expect(within(c).getByText(/Lock the contract/)).toBeTruthy();
    expect(within(c).queryByText(/^Move to/)).toBeNull();
  });

  it("takes the reader to the tab where that action lives", () => {
    const onGo = vi.fn();
    const c = draw(project({ stage: "tendered" }), { onGo });
    fireEvent.click(within(c).getByText(/Lock the contract/));
    expect(onGo).toHaveBeenCalledWith("valuations");
  });

  it("sends an unpriced project to the rates tab", () => {
    const onGo = vi.fn();
    const c = draw(project({ stage: "takeoff" }), { onGo });
    fireEvent.click(within(c).getByText(/Price the bill/));
    expect(onGo).toHaveBeenCalledWith("rates");
  });

  it("offers nothing where this build has nowhere to do it", () => {
    // Priced -> Tendered is "mark as tendered", which the new build cannot do.
    // Showing a control for it would put the dead button straight back.
    const c = draw(project({ stage: "priced" }));
    expect(within(c).queryByText(/^Move to/)).toBeNull();
    expect(within(c).queryByText(/Mark as tendered/)).toBeNull();
    // ...and the strip still says where the project has got to.
    expect(within(c).getByText("Tendered")).toBeTruthy();
  });

  it("offers a view-only reader no action at all", () => {
    const c = render(
      <WorkProjectOverview project={project({ stage: "tendered" })} toolName="QUIV" canEdit={false} />,
    ).container;
    expect(within(c).queryByText(/Lock the contract/)).toBeNull();
  });

  it("never renders a stage control with no handler", () => {
    // The exact shape of the original bug. Any control in the stage strip must
    // do something when pressed.
    for (const stage of ["takeoff", "priced", "tendered", "locked", "valuing"]) {
      cleanup();
      const onGo = vi.fn();
      const c = draw(project({ stage }), { onGo });
      const strip = c.querySelector(".pj-stages");
      const controls = [...strip.querySelectorAll("button")];
      for (const b of controls) {
        fireEvent.click(b);
        expect(
          onGo,
          `a control in the stage strip at "${stage}" did nothing when pressed`,
        ).toHaveBeenCalled();
        onGo.mockClear();
      }
    }
  });
});
