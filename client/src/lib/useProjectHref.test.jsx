import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { projectWorkspaceHref } from "./projectLinks.js";

let auth = { user: null };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
const { useProjectHref } = await import("./useProjectHref.js");

// Where a project card goes is decided per VIEWER, in one place
// (lib/newBuildAccess.js), and since go-live the answer is Richard's project
// page for everybody. Until 1 October 2026 a customer's card went to the
// classic workspace, and that branch outlived the gate it mirrored, so
// customers kept landing on classic after launch.
//
// The tests below are the ones that fail if a role check is put back, which is
// how a change like this gets quietly reverted: somebody restores
// canViewPreview while fixing something nearby. They assert the ANSWER, not the
// mechanism, so raising GATE_NEW_BUILD is still a one-line change.

function Probe({ project }) {
  const href = useProjectHref();
  return <a href={href(project)}>go</a>;
}

const hrefFor = (project) =>
  render(<Probe project={project} />).container.querySelector("a").getAttribute("href");

afterEach(() => {
  cleanup();
  auth = { user: null };
});

describe("the plain helper", () => {
  const p = { productKey: "planswift", slug: "ikoyi-complex" };

  it("gives the classic workspace by default, as it always has", () => {
    expect(projectWorkspaceHref(p)).toBe("/projects/planswift?project=ikoyi-complex");
  });

  it("gives the new project page when asked", () => {
    expect(projectWorkspaceHref(p, { newBuild: true })).toBe(
      "/work/project/planswift/ikoyi-complex",
    );
  });

  it("leaves ArchiCAD and RateGen alone either way", () => {
    // Neither has a page under /work/project, and both had their own home
    // before any of this.
    const arch = { productKey: "archicad", slug: "tower" };
    expect(projectWorkspaceHref(arch, { newBuild: true })).toBe("/archicad/tower/boq");
    expect(projectWorkspaceHref({ productKey: "rategen" }, { newBuild: true })).toBe("/rategen");
  });

  it("falls back to the tool's list when the project has no slug or id", () => {
    expect(projectWorkspaceHref({ productKey: "revit" }, { newBuild: true })).toBe(
      "/projects/revit",
    );
  });

  it("escapes a slug that needs it", () => {
    expect(
      projectWorkspaceHref({ productKey: "revit", slug: "a b&c" }, { newBuild: true }),
    ).toBe("/work/project/revit/a%20b%26c");
  });
});

describe("what a card links to", () => {
  const p = { productKey: "planswift", slug: "ikoyi-complex" };
  const NEW = "/work/project/planswift/ikoyi-complex";

  it("sends a PAYING CUSTOMER to the new project page", () => {
    // The one that was wrong. Every customer card pointed at the classic
    // workspace while ClassicProjectRedirect was already sending them the other
    // way, so each project opened cost a redirect and the cards disagreed with
    // the route about where a project lives.
    auth = { user: { _id: "u1", role: "user", permissions: [] } };
    expect(hrefFor(p)).toBe(NEW);
  });

  it("sends staff to the same place", () => {
    auth = { user: { _id: "a1", role: "admin" } };
    expect(hrefFor(p)).toBe(NEW);
  });

  it("sends Tech Support to the same place", () => {
    auth = { user: { _id: "t1", role: "tech_support", permissions: ["preview"] } };
    expect(hrefFor(p)).toBe(NEW);
  });

  it("answers the same with no session at all", () => {
    // The cards render before AuthProvider has hydrated. An answer that
    // depended on the user would be the classic address for one frame, which is
    // the address that would be in the DOM if somebody clicked in that frame.
    auth = { user: null };
    expect(hrefFor(p)).toBe(NEW);
  });

  it("still leaves ArchiCAD and RateGen on their own screens", () => {
    auth = { user: { _id: "u1", role: "user" } };
    expect(hrefFor({ productKey: "archicad", slug: "tower" })).toBe("/archicad/tower/boq");
    expect(hrefFor({ productKey: "rategen" })).toBe("/rategen");
  });
});
