import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import TipChip from "./TipChip.jsx";
import { ADA_OPEN_EVENT } from "../ada/adaCardsModel.js";
import { DISMISS_KEY } from "./tipsModel.js";

// The live tip above a work-project tab: one at a time, dismissible, and its
// action either opens Ada with a question in the box or moves tab.

const project = {
  _id: "p1",
  items: [{ code: "A", qty: 1, rate: 0 }, { code: "B", qty: 1, rate: 0 }],
  contract: { locked: false },
  projectManagement: { tasks: [] },
};

beforeEach(() => {
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* jsdom without storage */
  }
});
afterEach(cleanup);

describe("TipChip", () => {
  it("shows the most urgent tip for the tab", () => {
    render(<TipChip project={project} tab="bill" />);
    expect(screen.getByRole("note").textContent).toMatch(/2 lines have no rate/);
  });

  it("opens Ada with the prompt in the box, not sent", () => {
    const seen = vi.fn();
    window.addEventListener(ADA_OPEN_EVENT, seen);
    render(<TipChip project={project} tab="bill" />);
    fireEvent.click(screen.getByText("Ask Ada to price them"));
    window.removeEventListener(ADA_OPEN_EVENT, seen);
    expect(seen.mock.calls[0][0].detail.prompt).toMatch(/unpriced lines/);
  });

  it("moves tab through onGo for a tab action", () => {
    const onGo = vi.fn();
    render(<TipChip project={project} tab="pm" onGo={onGo} />);
    fireEvent.click(screen.getByText("Plan from the bill"));
    expect(onGo).toHaveBeenCalledWith("pm");
  });

  it("dismissing shows the next tip and is remembered for the project", () => {
    const { unmount } = render(<TipChip project={project} tab="bill" />);
    fireEvent.click(screen.getByLabelText("Dismiss this tip"));
    expect(screen.getByRole("note").textContent).toMatch(/Contract not locked/);
    unmount();
    render(<TipChip project={project} tab="bill" />);
    expect(screen.getByRole("note").textContent).not.toMatch(/no rate/);
  });

  it("renders nothing when there is nothing to say", () => {
    const { container } = render(<TipChip project={null} tab="bill" />);
    expect(container.innerHTML).toBe("");
  });
});
