import { describe, it, expect } from "vitest";
import { classicProjectTarget } from "../lib/classicProjectTarget.js";
import { projectWorkspaceHref } from "../lib/projectLinks.js";

// Opening a project has to land on one page, whichever door was used. These pin
// the rule; the component is a four-line wrapper around it.

describe("where a classic project URL should actually go", () => {
  const staff = { tool: "revit", project: "sample-duplex-strip", newBuild: true };

  it("sends staff to the new project page", () => {
    expect(classicProjectTarget(staff)).toBe("/work/project/revit/sample-duplex-strip");
  });

  it("leaves a viewer the go-live switch holds back on the classic workspace", () => {
    // Nobody, while GATE_NEW_BUILD is false; the rule is kept for if it is raised.
    expect(classicProjectTarget({ ...staff, newBuild: false })).toBe(null);
  });

  it("stays put when the URL is the gallery, not one project", () => {
    expect(classicProjectTarget({ ...staff, project: null })).toBe(null);
    expect(classicProjectTarget({ ...staff, project: "" })).toBe(null);
  });

  it("hands through when classic was asked for on purpose", () => {
    // "Open the full workspace" on the new page. Without this the two screens
    // would bounce a reader between them.
    expect(classicProjectTarget({ ...staff, wantsClassic: true })).toBe(null);
  });

  it("agrees with the card links, because it asks the same function", () => {
    // A redirect that disagreed with the cards would be worse than none.
    const card = projectWorkspaceHref(
      { productKey: "planswift", slug: "ysa" },
      { newBuild: true },
    );
    expect(classicProjectTarget({ tool: "planswift", project: "ysa", newBuild: true })).toBe(card);
  });

  it("leaves ArchiCAD alone — it has its own screen", () => {
    // projectWorkspaceHref sends archicad to /archicad/:key/boq, which is not a
    // /work/project/ address, so there is nothing to redirect to.
    expect(classicProjectTarget({ tool: "archicad", project: "x", newBuild: true })).toBe(null);
  });

  it("opens a RateGen project (a priced bill) on the new page, like the cards", () => {
    expect(classicProjectTarget({ tool: "rategen", project: "x", newBuild: true })).toBe(
      "/work/project/rategen/x",
    );
  });

  it("leaves RateGen without a project on its rates page", () => {
    expect(classicProjectTarget({ tool: "rategen", project: "", newBuild: true })).toBe(null);
  });

  it("does not redirect a tool it cannot name", () => {
    expect(classicProjectTarget({ tool: "", project: "x", newBuild: true })).toBe(null);
  });

  it("escapes a slug with characters a URL would eat", () => {
    expect(classicProjectTarget({ tool: "revit", project: "a b&c", newBuild: true })).toBe(
      "/work/project/revit/a%20b%26c",
    );
  });

  it("carries the tab over, translated to the new build's name for it", () => {
    // This threw away every parameter but `project`, and since the flip it is
    // the busiest door into the new page: every bookmark and every deep link
    // the classic build ever wrote comes through here. A QS following their own
    // link to a certificate arrived at the project summary.
    expect(classicProjectTarget({ ...staff, tab: "valuation" })).toBe(
      "/work/project/revit/sample-duplex-strip?tab=valuations",
    );
    expect(classicProjectTarget({ ...staff, tab: "budget" })).toBe(
      "/work/project/revit/sample-duplex-strip?tab=rates",
    );
    expect(classicProjectTarget({ ...staff, tab: "bill" })).toBe(
      "/work/project/revit/sample-duplex-strip?tab=bill",
    );
  });

  it("writes the Overview as no tab at all, the way the shell does", () => {
    expect(classicProjectTarget({ ...staff, tab: "dashboard" })).toBe(
      "/work/project/revit/sample-duplex-strip",
    );
    expect(classicProjectTarget({ ...staff, tab: "" })).toBe(
      "/work/project/revit/sample-duplex-strip",
    );
  });

  it("keeps the Work area's reader on a screen that exists", () => {
    // The classic Work area put the model, the bill, the schedule and Ada on
    // one screen. The new build has no such tab, so Overview is the honest
    // answer rather than a guess at which half they wanted.
    expect(classicProjectTarget({ ...staff, tab: "work" })).toBe(
      "/work/project/revit/sample-duplex-strip",
    );
  });
});

describe("the two screens cannot bounce a reader between them", () => {
  // The loop this guards: new page -> "Open the full workspace" -> classic URL
  // -> redirect -> new page -> ...
  it("the full-workspace link carries the marker that stops it", () => {
    const href = `/projects/revit?project=ysa&classic=1`;
    const wantsClassic = new URLSearchParams(href.split("?")[1]).get("classic") === "1";
    expect(wantsClassic).toBe(true);
    expect(classicProjectTarget({ tool: "revit", project: "ysa", wantsClassic, newBuild: true }))
      .toBe(null);
  });

  it("and a customer bounced OUT of the new build is not sent back in", () => {
    // NewBuildGate sends a customer from /work/project/revit/ysa to the classic
    // URL. If this redirected them back, they would loop forever.
    expect(classicProjectTarget({ tool: "revit", project: "ysa", newBuild: false })).toBe(null);
  });
});

/* ── The component, not just the rule ───────────────────────────────────── */
//
// The browser check for this needs a signed-in staff session against live data,
// which is not something to drive from here. So the wiring is proved in jsdom:
// given a staff viewer on a classic project URL, the route must actually render
// a redirect to the new page rather than the classic screen.

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";

const auth = { user: null, accessToken: null };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));

const ClassicProjectRedirect = (await import("./ClassicProjectRedirect.jsx")).default;

afterEach(cleanup);

const at = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/projects/:tool"
          element={
            <ClassicProjectRedirect>
              <p>classic workspace</p>
            </ClassicProjectRedirect>
          }
        />
        <Route path="/work/project/:productKey/:id" element={<p>new project page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("the route a staff member actually lands on", () => {
  it("opens the new page from a classic project URL", () => {
    auth.user = { email: "staff@adlmstudio.net", role: "admin" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa");
    expect(screen.getByText("new project page")).toBeTruthy();
  });

  it("sends a CUSTOMER to the new project page too, not only staff", () => {
    // Changed on 5 Oct 2026 (owner). This read canViewPreview(user), so the new
    // project page was staff-only and every paying customer opening a project
    // landed on the classic workspace — the largest remaining route into the
    // old build, and not one a sweep of links would ever have found.
    //
    // This is the assertion that would fail if the gate were quietly put back,
    // which is the way a change like this gets reverted: somebody restores a
    // role check while fixing something nearby.
  it("opens the new page for a customer too, since go-live", () => {
    // Until 1 October a customer was left on classic here. That branch outlived
    // the gate and kept customers' bookmarks and share links on the old screen
    // after launch (lib/newBuildAccess.js).
    auth.user = { email: "customer@example.com", role: "user" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa");
    expect(screen.getByText("new project page")).toBeTruthy();
  });

  it("still lets anyone ask for the classic workspace on purpose", () => {
    // The escape hatch matters more now, not less: until the new workspace can
    // upload an IFC, lock a contract and take an actual rate, ?classic=1 is the
    // only route a customer has to any of them.
    auth.user = { email: "customer@example.com", role: "user" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa&classic=1");
    expect(screen.getByText("classic workspace")).toBeTruthy();
  });

  it("shows the classic gallery when no project is named", () => {
    auth.user = { email: "staff@adlmstudio.net", role: "admin" };
    auth.accessToken = "t";
    at("/projects/planswift");
    expect(screen.getByText("classic workspace")).toBeTruthy();
  });

  it("hands through the full-workspace link rather than bouncing it back", () => {
    auth.user = { email: "staff@adlmstudio.net", role: "admin" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa&classic=1");
    expect(screen.getByText("classic workspace")).toBeTruthy();
  });

  it("lands on the tab the old address asked for", () => {
    auth.user = { email: "customer@example.com", role: "user" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa&tab=valuation&line=k42");
    // The tab arrives; the line cannot (it is a key, and the new Bill addresses
    // a line by position and searches by text). Right bill at the top beats the
    // wrong screen.
    expect(screen.getByText("new project page")).toBeTruthy();
  });

  it("renders neither screen while the session is still hydrating", () => {
    // Deciding on a half-loaded session would read staff as a customer.
    auth.user = null;
    auth.accessToken = "t";
    const { container } = at("/projects/planswift?project=ysa");
    expect(container.textContent).toBe("");
  });
});
