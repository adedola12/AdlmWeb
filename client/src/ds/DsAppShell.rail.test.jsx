// A customer's rail points at the new build, the same as anybody's.
//
// WHAT THIS REPLACED
//
// The shell used to compute canViewPreview(user) and, for anyone it answered
// false for — every role:"user" customer — rewrite fifteen of the seventeen
// rail leaves to their classic counterparts, and the brand mark and all three
// account-menu items with them. Nine of those landed on genuinely classic
// screens: the tool pages at /projects/*, the library at /rategen, billing and
// settings and activity at /profile, support at /support/request, the programme
// at /time-management.
//
// So flipping where a project OPENS was only half the job: a customer reached
// the new project page and then every click afterwards took them back out of
// the new build. This is the half that covers the whole navigation.
//
// WHY IT IS WORTH A TEST RATHER THAN A DIFF
//
// The rewrite is the kind of thing that comes back. It existed for a real
// reason once — the route gate used to bounce customers off these screens — so
// somebody reading railGate.js later will find a helper that looks load-bearing
// and wire it in again. These fail by destination when they do.
//
// The incoherence it left behind is also worth pinning: the app-bar search used
// the RAW rail, so a customer pressing Enter on "Billing" reached
// /manage/billing while clicking the menu item beside it went to /profile. One
// shell, two answers to the same question.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = { user: null, accessToken: "t", clear: () => {} };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
vi.mock("../api.js", () => ({ apiAuthed: () => new Promise(() => {}) }));

const DsAppShell = (await import("./DsAppShell.jsx")).default;

afterEach(cleanup);

const shell = () =>
  render(
    <MemoryRouter initialEntries={["/manage"]}>
      <DsAppShell title="Overview" page="dash-home">
        <p>screen</p>
      </DsAppShell>
    </MemoryRouter>,
  ).container;

/** Every destination the shell renders. */
const destinations = (c) =>
  [...c.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

// The classic screens the rewrite used to send customers to.
const CLASSIC = [
  "/projects/revit",
  "/projects/planswift",
  "/projects/mep",
  "/projects/civil3d",
  "/portfolio",
  "/rategen",
  "/rategen/material-constants",
  "/profile",
  "/support/request",
  "/time-management",
];

describe("an ordinary customer's navigation", () => {
  it("contains no classic destination at all", () => {
    auth.user = { email: "customer@example.com", role: "user" };
    const found = destinations(shell()).filter((h) =>
      CLASSIC.some((c) => h === c || h.startsWith(`${c}?`)),
    );
    expect(found).toEqual([]);
  });

  it("points the account menu at the new build", () => {
    auth.user = { email: "customer@example.com", role: "user" };
    const hrefs = destinations(shell());
    // These three were /profile, /profile and /profile for a customer — three
    // different destinations collapsed onto one classic screen.
    expect(hrefs).toContain("/manage");
    expect(hrefs).toContain("/manage/settings");
    expect(hrefs).toContain("/manage/billing");
  });

  it("gives a customer the same destinations as staff", () => {
    // The point of the change: one rail, one answer. Compared as sets because
    // staff may legitimately see MORE (the surface switch), never different
    // versions of the same thing.
    auth.user = { email: "customer@example.com", role: "user" };
    const asCustomer = new Set(destinations(shell()));
    cleanup();
    auth.user = { email: "staff@adlmstudio.net", role: "admin" };
    const asStaff = new Set(destinations(shell()));

    const customerOnly = [...asCustomer].filter((h) => !asStaff.has(h));
    expect(customerOnly).toEqual([]);
  });
});
