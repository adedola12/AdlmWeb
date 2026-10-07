// The gate after go-live: a pass-through.
//
// Until 1 October 2026 this gate held /manage/* and /work/* back from customers
// and sent them to the classic screen that did the same job. GATE_NEW_BUILD is
// now false, so it returns its children for everybody, and that is what this
// file tests — a regression here means somebody raised the gate again and put
// every customer back on the classic site.
//
// WHAT MOVED, AND WHERE IT IS STILL COVERED
//
// The redirect targets this file used to assert (/manage -> /dashboard,
// /manage/settings -> /profile, /work/tool/:t -> /projects/:tool, ...) are the
// classicFallbackFor mapping, and lib/classicPaths.test.js covers that mapping
// directly and still does. Nothing about it is unverified; it simply is not
// reachable through the gate while the gate is down.
//
// The <Navigate replace> check stays, because the redirect branch is still in
// the file: if the gate is ever raised again, Back must not bounce the customer
// forward into the wall. See newBuildGate.golive.test.js for the invariant that
// ties the gate to the /dashboard redirect and to AFTER_SIGN_IN — raising this
// flag without moving those two makes a customer's home an infinite loop.

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
const { GATE_NEW_BUILD } = await import("../lib/newBuildAccess.js");

// Render the gate at a given URL, with stand-ins for the classic screens it
// would redirect to if it were raised, so a redirect would be observable as
// "which screen won" rather than as a blank render.
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

describe("the gate is down", () => {
  it("is actually down, which every test below depends on", () => {
    expect(GATE_NEW_BUILD).toBe(false);
  });
});

describe("who gets through", () => {
  // Everyone, now. The four staff cases are kept because they were the reason
  // the gate used canViewPreview rather than isStaff, and because they are what
  // would break first if the flag came back.
  const VIEWERS = [
    ["a full administrator", { _id: "a", role: "admin" }],
    ["a mini-admin", { _id: "a", role: "mini_admin" }],
    ["a Design Access session", { _id: "a", designAccess: true }],
    ["Tech Support, holding only the preview area", { _id: "a", role: "tech_support", permissions: ["preview"] }],
    ["a customer, who used to be sent to classic", CUSTOMER],
  ];

  for (const [who, user] of VIEWERS) {
    it(`${who} sees the new build`, () => {
      auth = { accessToken: "t", user };
      at("/manage");
      expect(screen.getByText("NEW BUILD")).toBeTruthy();
      expect(screen.queryByText("CLASSIC DASHBOARD")).toBe(null);
    });
  }

  it("a customer reaches every screen the gate used to divert", () => {
    for (const url of [
      "/manage/settings",
      "/manage/support",
      "/work/tool/heron",
      "/work/project/planswift/ikoyi-tower",
    ]) {
      auth = { accessToken: "t", user: CUSTOMER };
      const { unmount } = at(url);
      expect(screen.getByText("NEW BUILD"), `${url} should render the new build`).toBeTruthy();
      unmount();
    }
  });
});

describe("the frames with no user", () => {
  // With the gate down these render the children rather than waiting, because
  // the flag is checked before `user` is looked at. Signing out is still
  // ProtectedRoute's job, not this one's.
  it("renders the new build while the user is still being withheld", () => {
    auth = { accessToken: "t", user: null };
    at("/manage");
    expect(screen.getByText("NEW BUILD")).toBeTruthy();
  });

  it("does not redirect when signed out, leaving that to ProtectedRoute", () => {
    auth = { accessToken: null, user: null };
    at("/manage");
    expect(screen.queryByText("CLASSIC DASHBOARD")).toBe(null);
  });
});

describe("if the gate is ever raised again", () => {
  it("still replaces the history entry, so Back does not return to the wall", () => {
    // <Navigate replace>: without it, pressing Back lands on the gated URL
    // again and bounces straight forward, trapping the customer. The branch is
    // dormant, not gone, so this stays a source check.
    const here = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    );
    const src = fs.readFileSync(path.join(here, "NewBuildGate.jsx"), "utf8");
    expect(src).toMatch(/<Navigate[^>]*\breplace\b/);
  });
});
