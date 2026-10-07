import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// His work-project.html is a bare <div id="pj-app"> inside the shell: no tab
// strip above the breadcrumb, because the project page carries its own
// (.pj-tabs — Overview, Bill, Rates & budget, …) directly beneath it. R03 added
// the section strip to every screen for reachability on a phone, which on this
// one screen stacks two tab rows in the same place. That is not a spacing
// problem, it is two navigations competing, so the strip is suppressed here.

const auth = {
  user: { email: "staff@adlmstudio.net", role: "admin" },
  accessToken: "t",
  clear: () => {},
};
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
// The shell fetches rail counts and notifications on mount; neither is what
// this is about.
vi.mock("../api.js", () => ({ apiAuthed: () => new Promise(() => {}) }));

const DsAppShell = (await import("./DsAppShell.jsx")).default;

afterEach(cleanup);

const shell = (props) =>
  render(
    <MemoryRouter initialEntries={["/work/projects"]}>
      <DsAppShell title="A project" page="work-projects" {...props}>
        <p>screen</p>
      </DsAppShell>
    </MemoryRouter>,
  ).container;

describe("the section tab strip", () => {
  it("is there by default, as it is on every other work screen", () => {
    expect(shell().querySelector(".dsh-sectabs")).toBeTruthy();
  });

  it("is gone on a screen that brings its own tabs", () => {
    expect(shell({ sectionTabs: false }).querySelector(".dsh-sectabs")).toBe(null);
  });

  it("still renders the screen either way", () => {
    expect(shell({ sectionTabs: false }).textContent).toContain("screen");
  });
});
