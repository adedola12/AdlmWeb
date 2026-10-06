import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import {
  WorkProjectRaiseVariation,
  WorkProjectDecideVariation,
} from "./WorkProjectVariationPanels.jsx";

// variationDraft.test.js pins the rules and the fold. These pin what the two
// panels do with them — and the states that matter: a refusal has to stay on
// screen, and approving has to say what it costs BEFORE the click.

afterEach(cleanup);

/* ───────────────────────────── Raise one ───────────────────────────── */

describe("raising a variation", () => {
  const form = (props = {}) =>
    render(<WorkProjectRaiseVariation onRaise={vi.fn()} {...props} />).container;

  const fill = (c, { description = "Extra manholes", amount = "225000", kind } = {}) => {
    if (description != null)
      fireEvent.change(within(c).getByLabelText("The change"), {
        target: { value: description },
      });
    if (amount != null)
      fireEvent.change(within(c).getByLabelText("Value"), { target: { value: amount } });
    if (kind) fireEvent.change(within(c).getByLabelText("Adds or takes away"), {
      target: { value: kind },
    });
  };

  it("asks what changed, its reference, the direction and the value", () => {
    const c = form();
    expect(within(c).getByLabelText("The change")).toBeTruthy();
    expect(within(c).getByLabelText("Instruction reference")).toBeTruthy();
    expect(within(c).getByLabelText("Adds or takes away")).toBeTruthy();
    expect(within(c).getByLabelText("Value")).toBeTruthy();
  });

  it("offers NO rate or quantity field", () => {
    // A rate is built in RateGen and never typed here. And the server ignores
    // `kind` in its qty/rate branch, so an omission entered that way would be
    // stored as an addition.
    const c = form();
    expect(within(c).queryByLabelText("Rate")).toBe(null);
    expect(within(c).queryByLabelText("Quantity")).toBe(null);
    expect(within(c).queryByLabelText("Unit")).toBe(null);
  });

  it("will not raise an empty form, and says what is missing", () => {
    const onRaise = vi.fn();
    const c = form({ onRaise });
    expect(within(c).getByText("Say what changed.")).toBeTruthy();
    expect(within(c).getByText("Raise it").disabled).toBe(true);
    fireEvent.click(within(c).getByText("Raise it"));
    expect(onRaise).not.toHaveBeenCalled();
  });

  it("asks for the value once the change is described", () => {
    const c = form();
    fill(c, { amount: null });
    expect(within(c).getByText("Enter the value of the variation.")).toBeTruthy();
    expect(within(c).getByText("Raise it").disabled).toBe(true);
  });

  it("sends the four fields, with the direction as kind", () => {
    const onRaise = vi.fn().mockResolvedValue({});
    const c = form({ onRaise });
    fill(c, { kind: "omission" });
    fireEvent.change(within(c).getByLabelText("Instruction reference"), {
      target: { value: "AI-014" },
    });
    fireEvent.click(within(c).getByText("Raise it"));
    return waitFor(() => {
      expect(onRaise).toHaveBeenCalledWith({
        description: "Extra manholes",
        reference: "AI-014",
        kind: "omission",
        amount: 225_000,
      });
    });
  });

  it("closes once the variation exists", async () => {
    const onDone = vi.fn();
    const c = form({ onRaise: vi.fn().mockResolvedValue({}), onDone });
    fill(c);
    fireEvent.click(within(c).getByText("Raise it"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does NOT close when the server refused, and keeps its words", async () => {
    // A collaborator without RateGen is refused outright: a variation is a value,
    // and this is the one route where a new one is born, so there is no stored
    // figure to fall back on.
    const onDone = vi.fn();
    const onRaise = vi
      .fn()
      .mockRejectedValue(
        new Error("Rates are hidden on this shared project, so you cannot raise a variation."),
      );
    const c = form({ onRaise, onDone });
    fill(c);
    fireEvent.click(within(c).getByText("Raise it"));
    await waitFor(() =>
      expect(within(c).getByText(/so you cannot raise a variation/)).toBeTruthy(),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("announces that refusal, so it reaches a screen reader", async () => {
    const onRaise = vi.fn().mockRejectedValue(new Error("Server error"));
    const c = form({ onRaise });
    fill(c);
    fireEvent.click(within(c).getByText("Raise it"));
    await waitFor(() =>
      expect(within(c).getByText("Server error").getAttribute("role")).toBe("status"),
    );
  });

  it("says it counts for nothing until it is approved", () => {
    expect(within(form()).getByText(/counts toward nothing/)).toBeTruthy();
  });
});

/* ──────────────────────────── Decide one ──────────────────────────── */

describe("deciding a variation", () => {
  const job = (over = {}) => ({
    variations: [
      {
        description: "Extra manholes",
        reference: "AI-014",
        qty: 1,
        unit: "item",
        rate: 225_000,
        status: "pending",
        issuedAt: "2026-08-14",
      },
    ],
    ...over,
  });

  const panel = (props = {}) =>
    render(
      <WorkProjectDecideVariation
        project={job()}
        index={0}
        canEdit
        estimatedTotal={100_000_000}
        onDecide={vi.fn()}
        {...props}
      />,
    ).container;

  it("shows what it is and what it is worth", () => {
    const c = panel();
    expect(within(c).getByText("Extra manholes")).toBeTruthy();
    expect(within(c).getByText(/V1 · AI-014/)).toBeTruthy();
    expect(within(c).getByText(/Adds/)).toBeTruthy();
  });

  it("says what the works would stand at if it is approved", () => {
    const c = panel();
    expect(within(c).getByText(/would stand at this/)).toBeTruthy();
  });

  it("WARNS BEFORE THE CLICK that approving cannot be undone", () => {
    // The classic panel approves on one click with no warning at all; the only
    // hint of consequence is a figure. An approved variation counts toward the
    // contract value, and certificates are issued against it.
    expect(within(panel()).getByText(/cannot be undone here afterwards/)).toBeTruthy();
  });

  it("records an approval", async () => {
    const onDecide = vi.fn().mockResolvedValue({});
    const c = panel({ onDecide });
    fireEvent.click(within(c).getByText("Approve it"));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(0, "approved"));
  });

  it("records a rejection", async () => {
    const onDecide = vi.fn().mockResolvedValue({});
    const c = panel({ onDecide });
    fireEvent.click(within(c).getByText("Reject it"));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(0, "rejected"));
  });

  it("keeps the server's refusal on screen and stays open", async () => {
    const onDone = vi.fn();
    const onDecide = vi
      .fn()
      .mockRejectedValue(new Error("Only a variation waiting for approval can be decided."));
    const c = panel({ onDecide, onDone });
    fireEvent.click(within(c).getByText("Approve it"));
    await waitFor(() =>
      expect(
        within(c).getByText("Only a variation waiting for approval can be decided."),
      ).toBeTruthy(),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("offers no decision on one already decided", () => {
    const decided = job({
      variations: [{ description: "x", qty: 1, unit: "item", rate: 1, status: "approved" }],
    });
    const c = render(
      <WorkProjectDecideVariation project={decided} index={0} canEdit onDecide={vi.fn()} />,
    ).container;
    expect(within(c).queryByText("Approve it")).toBe(null);
    expect(within(c).getByText("This variation has been approved.")).toBeTruthy();
  });

  it("offers no decision to a reader who cannot edit, and says why", () => {
    const c = panel({ canEdit: false });
    expect(within(c).queryByText("Approve it")).toBe(null);
    expect(within(c).getByText(/not yours to record/)).toBeTruthy();
  });

  it("says so when the variation is no longer there", () => {
    // The panel can outlive the row: another session removes it, or the list is
    // re-read. Rendering nothing would read as a broken panel.
    const c = render(
      <WorkProjectDecideVariation project={job()} index={9} canEdit onDecide={vi.fn()} />,
    ).container;
    expect(within(c).getByText("Not here any more")).toBeTruthy();
  });

  it("does not throw before the project has loaded", () => {
    expect(() =>
      render(<WorkProjectDecideVariation project={null} index={0} onDecide={vi.fn()} />),
    ).not.toThrow();
  });
});
