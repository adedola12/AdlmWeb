import { describe, it, expect } from "vitest";
import { newBuildTab, newBuildPlaceHref, projectWorkspaceHref } from "./projectLinks.js";
import { tabsFor, resolveTab } from "../features/workProject/workProjectTabs.js";

// The join between the two builds' tab names. It is worth testing on its own
// because getting it wrong is SILENT: resolveTab answers a name it does not
// know with Overview, so a mistranslated link does not 404 and does not warn —
// it quietly shows a QS the project summary and lets them conclude there is
// nothing waiting for them on a project with a certificate waiting.

describe("translating a tab name", () => {
  it("maps every classic tab to one the new build has", () => {
    // The classic workspace's own ids (ProjectOpenView TAB_OPTIONS).
    const CLASSIC = ["dashboard", "bill", "budget", "valuation", "work", "model", "pm"];
    for (const id of CLASSIC) {
      const want = newBuildTab(id);
      // revit has every tab the new build offers except drawings, so it is the
      // product that can answer for the widest set.
      expect(resolveTab(want, "revit"), `classic "${id}" -> "${want}"`).toBe(want);
    }
  });

  it("names the three that actually differ", () => {
    expect(newBuildTab("dashboard")).toBe("overview");
    expect(newBuildTab("budget")).toBe("rates");
    expect(newBuildTab("valuation")).toBe("valuations");
  });

  it("passes a name already in the new spelling straight through", () => {
    // So it is safe to apply to either build's names, which is what lets one
    // stored place be read by both.
    for (const t of tabsFor("revit")) expect(newBuildTab(t.key)).toBe(t.key);
    for (const t of tabsFor("planswift")) expect(newBuildTab(t.key)).toBe(t.key);
  });

  it("answers the Work area with Overview, the one with no equivalent", () => {
    // The classic Work area put the model, the bill, the schedule and Ada on one
    // screen. Guessing at which half was wanted would be worse than the summary.
    expect(newBuildTab("work")).toBe("overview");
  });

  it("is not confused by case or stray space", () => {
    expect(newBuildTab(" Valuation ")).toBe("valuations");
    expect(newBuildTab("")).toBe("");
    expect(newBuildTab(null)).toBe("");
  });
});

describe("where a project opens at a tab, on the new build", () => {
  const p = { productKey: "revit", key: "block-a" };

  it("puts the tab in the URL the shell reads it from", () => {
    expect(newBuildPlaceHref({ ...p, tab: "valuation" })).toBe(
      "/work/project/revit/block-a?tab=valuations",
    );
  });

  it("writes Overview as no tab at all", () => {
    // WorkProjectShell deletes the parameter for Overview, so a link that set it
    // explicitly would differ from the address a reader gets by clicking — and
    // the two would not share a browser history entry or a cache key.
    expect(newBuildPlaceHref({ ...p, tab: "dashboard" })).toBe("/work/project/revit/block-a");
    expect(newBuildPlaceHref({ ...p, tab: "overview" })).toBe("/work/project/revit/block-a");
    expect(newBuildPlaceHref(p)).toBe("/work/project/revit/block-a");
  });

  it("carries a bill line only as its label", () => {
    expect(newBuildPlaceHref({ ...p, tab: "bill", lineLabel: "Mass concrete" })).toBe(
      "/work/project/revit/block-a?tab=bill&q=Mass+concrete",
    );
    expect(newBuildPlaceHref({ ...p, tab: "bill", line: "k42" })).toBe(
      "/work/project/revit/block-a?tab=bill",
    );
  });

  it("does not search for a label on a tab that has no search", () => {
    expect(newBuildPlaceHref({ ...p, tab: "pm", lineLabel: "Mass concrete" })).toBe(
      "/work/project/revit/block-a?tab=pm",
    );
  });

  it("leaves ArchiCAD and RateGen on their own screens, tab or no tab", () => {
    // Neither has a page under /work/project, so a tab on the end would be a
    // parameter a screen that does not read it would ignore.
    expect(newBuildPlaceHref({ productKey: "archicad", key: "villa", tab: "pm" })).toBe(
      "/archicad/villa/boq",
    );
    expect(newBuildPlaceHref({ productKey: "rategen", key: "x", tab: "bill" })).toBe("/rategen");
  });

  it("agrees with the plain helper when there is no tab", () => {
    // A tabbed link that disagreed with the card link would send two doors into
    // the same project to two different addresses.
    expect(newBuildPlaceHref(p)).toBe(
      projectWorkspaceHref({ productKey: "revit", slug: "block-a" }, { newBuild: true }),
    );
  });

  it("escapes a slug a URL would eat", () => {
    expect(newBuildPlaceHref({ productKey: "revit", key: "a b&c", tab: "bill" })).toBe(
      "/work/project/revit/a%20b%26c?tab=bill",
    );
  });

  it("falls back to the tool's list rather than a project-less address", () => {
    expect(newBuildPlaceHref({ productKey: "revit", tab: "bill" })).toBe("/projects/revit");
  });
});
