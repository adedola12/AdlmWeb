import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import fs from "node:fs";
import path from "node:path";

// The gate reads the auth context. Driven by this object so each test can be a
// different kind of viewer.
let auth = { accessToken: null, user: null };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));

const { default: NewBuildGate } = await import("./NewBuildGate.jsx");

// Render the gate at a given URL, with stand-ins for the classic screens it can
// redirect to, so a redirect is observable as "which screen won".
function at(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {[
          "/manage",
          "/manage/settings",
          "/manage/support",
          "/work",
          "/work/tool/:t",
          "/work/project/:productKey/:id",
        ].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <NewBuildGate>
                <div>NEW BUILD</div>
              </NewBuildGate>
            }
          />
        ))}
        <Route path="/dashboard" element={<div>CLASSIC DASHBOARD</div>} />
        <Route path="/profile" element={<div>CLASSIC PROFILE</div>} />
        <Route path="/support/request" element={<div>CLASSIC SUPPORT</div>} />
        <Route path="/projects/:tool" element={<div>CLASSIC WORKSPACE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CUSTOMER = { _id: "u1", role: "user", permissions: [] };

beforeEach(() => {
  auth = { accessToken: null, user: null };
});
afterEach(cleanup);

describe("who gets through", () => {
  it("a full administrator sees the new build", () => {
    auth = { accessToken: "t", user: { _id: "a", role: "admin" } };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("a mini-admin sees the new build", () => {
    auth = { accessToken: "t", user: { _id: "a", role: "mini_admin" } };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("a Design Access session sees the new build", () => {
    auth = { accessToken: "t", user: { _id: "a", designAccess: true } };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("Tech Support sees the new build, holding only the preview area", () => {
    // tech_support is deliberately NOT isStaff (utils/roles.js), so a gate built
    // on isStaff would lock out the people who answer tickets about these very
    // screens. The gate uses canViewPreview for that reason.
    auth = { accessToken: "t", user: { _id: "a", role: "tech_support", permissions: ["preview"] } };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("a customer does not, and lands on classic instead", () => {
    auth = { accessToken: "t", user: CUSTOMER };
    at("/manage");
    expect(screen.queryByText("NEW BUILD")).toBe(null);
    expect(screen.getByText("CLASSIC DASHBOARD")).toBeTruthy();
  });
});

describe("the hydrating frame", () => {
  it("waits rather than redirecting while the user is still being withheld", () => {
    // AuthProvider withholds `user` for exactly one frame so the first client
    // render agrees with the server-rendered HTML (store.jsx:145). A gate that
    // decides on that frame bounces the studio's own staff to /dashboard on
    // every single load — the exact bug DsPreviewGate carries a comment about.
    auth = { accessToken: "t", user: null };
    at("/manage");
    expect(screen.queryByText("NEW BUILD")).toBe(null);
    expect(screen.queryByText("CLASSIC DASHBOARD")).toBe(null);
  });

  it("then lets the administrator in once the user arrives", () => {
    auth = { accessToken: "t", user: null };
    const { unmount } = at("/manage");
    expect(screen.queryByText("CLASSIC DASHBOARD")).toBe(null);
    unmount();
    auth = { accessToken: "t", user: { _id: "a", role: "admin" } };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("renders nothing when signed out, leaving that to ProtectedRoute", () => {
    // ProtectedRoute wraps this gate and has already sent them to sign in with a
    // ?next back to here. Redirecting as well would have the two gates fighting
    // over the same frame, and would lose the ?next.
    auth = { accessToken: null, user: null };
    at("/manage");
    expect(screen.queryByText("NEW BUILD")).toBe(null);
    expect(screen.queryByText("CLASSIC DASHBOARD")).toBe(null);
  });
});

describe("where a customer lands", () => {
  beforeEach(() => {
    auth = { accessToken: "t", user: CUSTOMER };
  });

  it("account settings go to the classic account screen", () => {
    at("/manage/settings");
    expect(screen.getByText("CLASSIC PROFILE")).toBeTruthy();
  });

  it("support goes to the classic support desk", () => {
    at("/manage/support");
    expect(screen.getByText("CLASSIC SUPPORT")).toBeTruthy();
  });

  it("a tool page goes to that tool's classic workspace", () => {
    at("/work/tool/heron");
    expect(screen.getByText("CLASSIC WORKSPACE")).toBeTruthy();
  });

  it("one project goes to the classic workspace with the project on it", () => {
    at("/work/project/planswift/ikoyi-tower");
    expect(screen.getByText("CLASSIC WORKSPACE")).toBeTruthy();
  });

  it("replaces the history entry, so Back does not return to the wall", () => {
    // <Navigate replace>: without it, pressing Back lands on the gated URL
    // again and bounces straight forward, trapping the customer.
    const here = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    );
    const src = fs.readFileSync(path.join(here, "NewBuildGate.jsx"), "utf8");
    expect(src).toMatch(/<Navigate[^>]*\breplace\b/);
  });
});
