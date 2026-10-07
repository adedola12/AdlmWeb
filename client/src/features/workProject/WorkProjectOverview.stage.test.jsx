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
import { render, cleanup, fireEvent, within, waitFor } from "@testing-library/react";

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

  it("MARKS THE BILL AS TENDERED, which this build could not do before", () => {
    // Priced -> Tendered was the one step with no control, on the grounds that the
    // new build had nowhere to do it. The route records a date and moves no money,
    // so it carries no step-up — and it was the thing standing in front of the
    // lock: lockChecklist wants a tender date and nothing here could set one, so a
    // project that had only ever been opened in this build could never reach the
    // stage where locking is offered.
    const onTender = vi.fn().mockResolvedValue({});
    const c = draw(project({ stage: "priced" }), { onTender });
    fireEvent.click(within(c).getByText(/Mark as tendered/));
    expect(onTender).toHaveBeenCalledWith(true);
  });

  it("does it HERE rather than sending the reader to a tab", () => {
    // It is an act, not a destination. There is no screen to go to.
    const onGo = vi.fn();
    const onTender = vi.fn().mockResolvedValue({});
    const c = draw(project({ stage: "priced" }), { onGo, onTender });
    fireEvent.click(within(c).getByText(/Mark as tendered/));
    expect(onGo).not.toHaveBeenCalled();
  });

  it("offers nothing at all when there is no handler for it", () => {
    // The strip must never show a control that cannot act — the exact shape of the
    // original dead button.
    const c = draw(project({ stage: "priced" }));
    expect(within(c).queryByText(/^Move to/)).toBeNull();
    expect(within(c).queryByText(/Mark as tendered/)).toBeNull();
    // ...and the strip still says where the project has got to.
    expect(within(c).getByText("Tendered")).toBeTruthy();
  });

  it("keeps the server's refusal on screen", async () => {
    // "This contract is already locked, which is past the tender stage." means the
    // copy on screen is behind, and it is the only thing that says so.
    const onTender = vi
      .fn()
      .mockRejectedValue(new Error("This contract is already locked, which is past the tender stage."));
    const c = draw(project({ stage: "priced" }), { onTender });
    fireEvent.click(within(c).getByText(/Mark as tendered/));
    await waitFor(() =>
      expect(within(c).getByText(/already locked, which is past the tender stage/)).toBeTruthy(),
    );
  });

  it("offers a view-only reader no tender control", () => {
    const c = render(
      <WorkProjectOverview
        project={project({ stage: "priced" })}
        toolName="QUIV"
        canEdit={false}
        onTender={vi.fn()}
      />,
    ).container;
    expect(within(c).queryByText(/Mark as tendered/)).toBeNull();
  });

  it("offers a view-only reader no action at all", () => {
    const c = render(
      <WorkProjectOverview project={project({ stage: "tendered" })} toolName="QUIV" canEdit={false} />,
    ).container;
    expect(within(c).queryByText(/Lock the contract/)).toBeNull();
  });

  it("never renders a stage control with no handler", () => {
    // The exact shape of the original bug. Any control in the stage strip must
    // do something when pressed — whichever handler that is. Both are passed,
    // because "Mark as tendered" acts here and the rest navigate.
    for (const stage of ["takeoff", "priced", "tendered", "locked", "valuing"]) {
      cleanup();
      const onGo = vi.fn();
      const onTender = vi.fn().mockResolvedValue({});
      const c = draw(project({ stage }), { onGo, onTender });
      const strip = c.querySelector(".pj-stages");
      const controls = [...strip.querySelectorAll("button")];
      for (const b of controls) {
        fireEvent.click(b);
        expect(
          onGo.mock.calls.length + onTender.mock.calls.length,
          `a control in the stage strip at "${stage}" did nothing when pressed`,
        ).toBeGreaterThan(0);
        onGo.mockClear();
        onTender.mockClear();
      }
    }
  });
});
