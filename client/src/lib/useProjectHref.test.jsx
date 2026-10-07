import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { projectWorkspaceHref } from "./projectLinks.js";

let auth = { user: null };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
const { useProjectHref } = await import("./useProjectHref.js");

// Where a project card goes is decided per VIEWER (lib/newBuildAccess.js), and
// since go-live (1 October 2026) the answer is Richard's project page for
// everybody. Until then a customer's card went to the classic workspace, and
// that branch outlived the gate it mirrored: customers kept landing on classic.

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

  it("sends a customer to the new project page, now the new build is the build", () => {
    auth = { user: { _id: "u1", role: "user", permissions: [] } };
    expect(hrefFor(p)).toBe("/work/project/planswift/ikoyi-complex");
  });

  it("sends staff to the new project page", () => {
    auth = { user: { _id: "a1", role: "admin" } };
    expect(hrefFor(p)).toBe("/work/project/planswift/ikoyi-complex");
  });

  it("sends Tech Support there too, as the gate does", () => {
    // A card that disagreed with the gate is how somebody ends up in a redirect
    // they cannot explain.
    auth = { user: { _id: "t1", role: "tech_support", permissions: ["preview"] } };
    expect(hrefFor(p)).toBe("/work/project/planswift/ikoyi-complex");
  });

  it("sends a signed-out visitor there too — the route asks them to sign in first", () => {
    // Both /work/project and /projects/:tool sit behind ProtectedRoute, which
    // carries ?next back to the page asked for, so there is nothing gained by
    // pointing a signed-out visitor somewhere else.
    auth = { user: null };
    expect(hrefFor(p)).toBe("/work/project/planswift/ikoyi-complex");
  });

  it("still leaves ArchiCAD and RateGen-without-a-project on their own screens", () => {
    auth = { user: { _id: "u1", role: "user" } };
    expect(hrefFor({ productKey: "archicad", slug: "tower" })).toBe("/archicad/tower/boq");
    expect(hrefFor({ productKey: "rategen" })).toBe("/rategen");
  });
});
