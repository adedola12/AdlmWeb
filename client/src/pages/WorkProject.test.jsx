// Who gets the new project workspace and who keeps the old redirect.
//
// /work/project/:productKey/:id was a bare redirect to /projects/:tool. It
// still is for everyone who is not staff — that path is in links and
// bookmarks and must not change while Richard's view is being adopted behind
// it. Getting this wrong in either direction is bad: a customer dropped into a
// half-built workspace, or staff bounced out of the one they are building.

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

// The shell fetches the account's projects; this test is about the gate.
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

describe("the /work/project route", () => {
  it("sends a customer to the workspace they have always used", () => {
    currentUser = { email: "qs@example.com", role: "user" };
    currentToken = "t";
    mount();
    expect(screen.getByText("THE FULL WORKSPACE")).toBeTruthy();
  });

  it("sends a signed-out visitor there too, rather than showing a building site", () => {
    mount();
    expect(screen.getByText("THE FULL WORKSPACE")).toBeTruthy();
  });

  it("gives staff the new workspace", () => {
    currentUser = { email: "admin@adlmstudio.net", role: "admin" };
    currentToken = "t";
    mount();
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.queryByText("THE FULL WORKSPACE")).toBeNull();
  });

  it("does NOT give tech_support the new workspace on the LIVE host", () => {
    // jsdom serves these tests from localhost, which isGatedHost treats as a
    // live host — so this is the adlmstudio.net rule. There /work is
    // staff-only, and Tech Support is the preview site and nothing else.
    // On a preview host the answer flips; see the next test.
    currentUser = { email: "help@adlmstudio.net", role: "tech_support", permissions: ["preview"] };
    currentToken = "t";
    mount();
    expect(screen.getByText("THE FULL WORKSPACE")).toBeTruthy();
  });

  it("waits rather than redirecting while the session is still hydrating", () => {
    // AuthProvider withholds `user` for a frame. Redirecting in that frame
    // would bounce a staff member out of the page they asked for.
    currentToken = "t";
    currentUser = null;
    const { container } = mount();
    expect(screen.queryByText("THE FULL WORKSPACE")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("DOES give tech_support the new workspace on a preview host", () => {
    // PreviewHostGate has already turned away everyone who is not staff or
    // Tech Support by the time this route renders, so re-checking isStaff
    // there only locks out the people the preview exists for — which is
    // exactly what happened to the owner's own account.
    const original = window.location;
    delete window.location;
    window.location = { ...original, hostname: "preview.adlmstudio.net" };
    currentUser = { email: "help@adlmstudio.net", role: "tech_support", permissions: ["preview"] };
    currentToken = "t";
    try {
      mount();
      expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
      expect(screen.queryByText("THE FULL WORKSPACE")).toBeNull();
    } finally {
      window.location = original;
    }
  });

  it("shows a HERON project its own tabs, not a Revit project's", () => {
    currentUser = { email: "admin@adlmstudio.net", role: "admin" };
    currentToken = "t";
    mount();
    expect(screen.getByRole("tab", { name: /Drawings/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /^Model/ })).toBeNull();
  });
});
