// What the /work/project screen does, now that the ROUTE decides who may open it.
//
// This screen used to decide for itself — canViewPreview on a preview host,
// isStaff on adlmstudio.net — and redirected everyone else to /projects/:tool.
// components/NewBuildGate.jsx now gates every /work/* and /manage/* route until
// launch, so a second rule here could only disagree with it, and did: it bounced
// Tech Support, whose whole role is the "preview" area and who is deliberately
// not isStaff (utils/roles.js).
//
// So the screen no longer asks. That a CUSTOMER never lands in the new workspace
// is still pinned, in components/NewBuildGate.test.jsx, which drives this exact
// route and asserts the redirect to /projects/planswift?project=ikoyi-tower.
// What is left to test here is the screen's own behaviour.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let currentUser = null;
let currentToken = "";

vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ user: currentUser, accessToken: currentToken }),
}));

// The shell fetches the account's projects; this test is about the screen.
vi.mock("../ds/useProjects.js", () => ({
  useProjects: () => ({ projects: [], failed: false }),
}));

const { default: WorkProject } = await import("./WorkProject.jsx");

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/work/project/planswift/abc123"]}>
      <Routes>
        <Route path="/work/project/:productKey/:id" element={<WorkProject />} />
        <Route path="/projects/:tool" element={<p>THE FULL WORKSPACE</p>} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  currentUser = null;
  currentToken = "";
});

describe("the /work/project screen", () => {
  it("renders the new workspace for staff", () => {
    currentUser = { email: "admin@adlmstudio.net", role: "admin" };
    currentToken = "t";
    mount();
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.queryByText("THE FULL WORKSPACE")).toBeNull();
  });

  it("renders it for Tech Support too, on any host", () => {
    // The bug this replaces: isStaff on the live host locked out the role whose
    // entire purpose is looking at what customers are asking about. One rule now,
    // canViewPreview, and it lives on the route.
    currentUser = { email: "help@adlmstudio.net", role: "tech_support", permissions: ["preview"] };
    currentToken = "t";
    mount();
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
  });

  it("does not decide for itself who may be here", () => {
    // A customer reaching this component has already been let through by the
    // route, so the screen renders. Keeping a second opinion here is what made
    // the two disagree. The route is tested in NewBuildGate.test.jsx.
    currentUser = { email: "qs@example.com", role: "user" };
    currentToken = "t";
    mount();
    expect(screen.queryByText("THE FULL WORKSPACE")).toBeNull();
  });

  it("waits rather than rendering while the session is still hydrating", () => {
    // AuthProvider withholds `user` for a frame. The shell fetches on mount and
    // has no business doing that before there is a session to fetch with.
    currentToken = "t";
    currentUser = null;
    const { container } = mount();
    expect(container.textContent).toBe("");
  });

  it("renders nothing signed out, rather than fetching with no session", () => {
    currentToken = "";
    currentUser = null;
    const { container } = mount();
    expect(container.textContent).toBe("");
  });

  it("shows a HERON project its own tabs, not a Revit project's", () => {
    currentUser = { email: "admin@adlmstudio.net", role: "admin" };
    currentToken = "t";
    mount();
    expect(screen.getByRole("tab", { name: /Drawings/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /^Model/ })).toBeNull();
  });
});
