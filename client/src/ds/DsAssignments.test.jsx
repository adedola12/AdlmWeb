// Assignments, on a brand-new account and on a dead call (item 13).
//
// The screen used to swallow a failed read into an empty array, so a course
// list that could not be reached looked exactly like a learner with nothing
// set. "Nothing to do" is a fine thing to tell somebody whose tutor has not
// set anything; it is a lie when the call fell over, and a first morning is
// not the moment to be told the tabs will sort themselves out.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let answer = async () => ({ items: [] });

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => answer(path, opts)),
}));
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t", user: {} }) }));

const { default: DsAssignments } = await import("./DsAssignments.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsAssignments />
    </MemoryRouter>,
  );

const assignment = (extra) => ({
  courseSku: "quiv-101",
  courseTitle: "QUIV for quantity surveyors",
  moduleCode: "m1",
  moduleTitle: "Measure a block of flats",
  state: "submitted",
  submission: { submittedAt: "2026-09-20T10:00:00Z", fileName: "week-1.pdf" },
  ...extra,
});

beforeEach(() => {
  answer = async () => ({ items: [] });
});
afterEach(cleanup);

describe("what an empty Assignments page says", () => {
  it("tells a new account what the page is for and where courses start", async () => {
    mount();
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
    // The one action that fills the screen, with somewhere to go.
    const link = screen.getByRole("link", { name: "See what is taught" });
    expect(link.getAttribute("href")).toBe("/learn");
  });

  it("does not tell a new account its work is moving between tabs", async () => {
    mount();
    await screen.findByText("No assignments yet");
    expect(screen.queryByText(/move between these tabs/i)).toBeNull();
  });

  it("says the list could not be read rather than that nothing is set", async () => {
    answer = async () => {
      throw new Error("nope");
    };
    mount();
    expect(await screen.findByText("Your assignments could not be loaded")).toBeTruthy();
    // The old screen showed the first-run words here, so a broken read read as
    // an empty account and nobody went looking for the fault.
    expect(screen.queryByText("No assignments yet")).toBeNull();
  });

  it("keeps the per-tab wording once the account does have assignments", async () => {
    answer = async () => ({ items: [assignment()] });
    mount();
    // The submitted one lands on "To do" empty, but the account is not new.
    expect(await screen.findByText("Nothing to do")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("No assignments yet")).toBeNull());
  });
});
