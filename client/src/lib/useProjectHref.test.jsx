import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { projectWorkspaceHref } from "./projectLinks.js";

let auth = { user: null };
vi.mock("../store.jsx", () => ({ useAuth: () => auth }));
const { useProjectHref } = await import("./useProjectHref.js");

// Where a project card goes depends on the VIEWER, not the project: until
// 1 October only staff may open Richard's project page, and a customer linked
// there is bounced back to the classic workspace by NewBuildGate. Right
// destination, but an extra hop on the journey a QS makes most.

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

  it("sends a customer to the classic workspace, with no redirect in between", () => {
    auth = { user: { _id: "u1", role: "user", permissions: [] } };
    expect(hrefFor(p)).toBe("/projects/planswift?project=ikoyi-complex");
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

  it("sends a signed-out visitor to classic", () => {
    auth = { user: null };
    expect(hrefFor(p)).toBe("/projects/planswift?project=ikoyi-complex");
  });
});
