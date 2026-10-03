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

  it("leaves a customer on the classic workspace", () => {
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

  it("leaves RateGen alone for the same reason", () => {
    expect(classicProjectTarget({ tool: "rategen", project: "x", newBuild: true })).toBe(null);
  });

  it("does not redirect a tool it cannot name", () => {
    expect(classicProjectTarget({ tool: "", project: "x", newBuild: true })).toBe(null);
  });

  it("escapes a slug with characters a URL would eat", () => {
    expect(classicProjectTarget({ tool: "revit", project: "a b&c", newBuild: true })).toBe(
      "/work/project/revit/a%20b%26c",
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

  it("leaves a customer on the classic workspace", () => {
    auth.user = { email: "customer@example.com", role: "user" };
    auth.accessToken = "t";
    at("/projects/planswift?project=ysa");
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

  it("renders neither screen while the session is still hydrating", () => {
    // Deciding on a half-loaded session would read staff as a customer.
    auth.user = null;
    auth.accessToken = "t";
    const { container } = at("/projects/planswift?project=ysa");
    expect(container.textContent).toBe("");
  });
});
