import { describe, it, expect } from "vitest";
import { agentPageContext } from "./agentPageContext.js";

// Ada is mounted on every route and used to send nothing about the page, so a
// QS standing on their own project asking "what is left to buy on this job" was
// asked which project they meant.

describe("what Ada is told about the page", () => {
  it("reads the new workspace's slug and product", () => {
    expect(agentPageContext({ pathname: "/work/project/planswift/planswift-takeoff" })).toEqual({
      productKey: "planswift",
      projectRef: "planswift-takeoff",
    });
  });

  it("ignores a tab or a sub-view after the project", () => {
    expect(
      agentPageContext({ pathname: "/work/project/revit/richard-house", search: "?tab=bill" }),
    ).toEqual({ productKey: "revit", projectRef: "richard-house" });
  });

  it("reads the classic workspace's ?project=, which may be an id", () => {
    expect(
      agentPageContext({ pathname: "/projects/planswift", search: "?project=6ab8701edd28ad4d9ed2e5bf" }),
    ).toEqual({ productKey: "planswift", projectRef: "6ab8701edd28ad4d9ed2e5bf" });
  });

  it("still names the product on the classic gallery, with no project", () => {
    // Narrows a name match to the right tool without claiming a project.
    expect(agentPageContext({ pathname: "/projects/revit" })).toEqual({
      productKey: "revit",
      projectRef: "",
    });
  });

  it("says nothing away from a project page", () => {
    for (const p of ["/", "/dashboard", "/work/projects", "/manage/billing", "/learn"]) {
      expect(agentPageContext({ pathname: p })).toEqual({ productKey: "", projectRef: "" });
    }
  });

  it("decodes an escaped slug rather than sending it raw", () => {
    expect(
      agentPageContext({ pathname: "/work/project/revit/my%20house" }).projectRef,
    ).toBe("my house");
  });

  it("does not throw on rubbish", () => {
    expect(agentPageContext(null)).toEqual({ productKey: "", projectRef: "" });
    expect(agentPageContext({})).toEqual({ productKey: "", projectRef: "" });
    expect(agentPageContext({ pathname: "/projects/x", search: "?%%%" }).productKey).toBe("x");
  });
});
