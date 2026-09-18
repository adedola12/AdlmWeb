import { describe, it, expect } from "vitest";
import { activeRailId } from "./railActive.js";
import { railItems } from "../ds/railConfig.js";

const at = (pathname, extra = {}) => activeRailId({ pathname, ...extra });

describe("rail active state (R04)", () => {
  it("Guides and Downloads never light up together", () => {
    expect(at("/manage/downloads")).toBe("dash-downloads");
    expect(at("/manage/guides")).toBe("dash-guides");
  });

  it("matches the exact route, not a prefix", () => {
    expect(at("/manage")).toBe("dash-home");
    expect(at("/manage/billing")).toBe("dash-billing");
    // A route under /manage that is not in the rail is not "Overview".
    expect(at("/manage/something-new")).toBeNull();
    expect(at("/work")).toBe("work-home");
  });

  it("lights the tool whose projects are open, not Projects", () => {
    expect(at("/projects/revit")).toBe("tool-quiv");
    expect(at("/projects/planswift", { search: "?project=block-a" })).toBe("tool-heron");
    expect(at("/projects/mep")).toBe("tool-mep");
    expect(at("/projects/civil3d")).toBe("tool-civiq");
  });

  it("keeps other project pages under Projects and a course under My learning", () => {
    expect(at("/work/project/revit/abc123")).toBe("work-projects");
    expect(at("/projects/archicad-materials")).toBe("work-projects");
    expect(at("/dash-course/BIM101")).toBe("dash-learning");
    expect(at("/work/rate/r1")).toBe("work-library");
  });

  it("falls back to the page name only when the route is not in the rail", () => {
    expect(at("/preview/dash-downloads", { page: "dash-downloads" })).toBe("dash-downloads");
    expect(at("/somewhere", { page: "dash-course" })).toBe("dash-learning");
    // An exact route beats a page name that says otherwise.
    expect(at("/manage/guides", { page: "dash-downloads" })).toBe("dash-guides");
  });

  it("never marks Sign out or the brand", () => {
    expect(at("/")).toBeNull();
  });

  it("gives every item a unique id", () => {
    const ids = railItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every route resolves to at most one item", () => {
    for (const it of railItems()) {
      if (it.action || it.aliasOnly) continue;
      const search = it.query ? `?${new URLSearchParams(it.query)}` : "";
      expect(at(it.to, { search })).toBe(it.id);
    }
  });
});
