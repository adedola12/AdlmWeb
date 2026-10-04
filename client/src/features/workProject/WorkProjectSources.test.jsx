import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import {
  WorkProjectDrawings,
  WorkProjectModel,
  WorkProjectServices,
} from "./WorkProjectSources.jsx";

// The last three tabs. sourcesModel.js sets out which of his fixture's fields
// we carry and which we do not; these pin what the screens do with what we have.

afterEach(cleanup);

/* ───────────────────────────── Model ───────────────────────────── */

const modelled = (over = {}) => ({
  models: {
    architectural: {
      sourceFile: "ikoyi-arch.ifc",
      url: "https://r2/x.ifc",
      sizeBytes: 47_185_920,
      format: "ifc",
      uploadedAt: "2026-09-12",
      validation: { status: "valid", requiredCount: 412, matchedCount: 412, missingCount: 0, ifcElementCount: 9_140 },
    },
    structural: {
      sourceFile: "ikoyi-struct.ifc",
      url: "https://r2/y.ifc",
      sizeBytes: 12_582_912,
      format: "ifc",
      uploadedAt: "2026-09-14",
      validation: { status: "invalid", requiredCount: 180, matchedCount: 167, missingCount: 13, ifcElementCount: 3_002 },
    },
  },
  ...over,
});

describe("the Model tab", () => {
  it("lists each model with its file, size and element count", () => {
    const c = render(<WorkProjectModel project={modelled()} canEdit />).container;
    expect(within(c).getByText(/Architectural · ikoyi-arch\.ifc/)).toBeTruthy();
    expect(within(c).getByText(/45 MB/)).toBeTruthy();
    expect(within(c).getByText(/9,140 elements/)).toBeTruthy();
  });

  it("says whether each one still answers the bill", () => {
    const c = render(<WorkProjectModel project={modelled()} canEdit />).container;
    expect(within(c).getByText(/Matches the bill · 412\/412/)).toBeTruthy();
    expect(within(c).getByText(/Does not match the bill · 13 missing/)).toBeTruthy();
  });

  it("warns above the list when elements the bill needs have gone", () => {
    const c = render(<WorkProjectModel project={modelled()} canEdit />).container;
    const note = c.querySelector(".pj-note.warn");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain("13 elements");
    expect(note.textContent).toContain("Structural");
  });

  it("offers a way through to the bill from the warning", () => {
    const onGo = vi.fn();
    const c = render(<WorkProjectModel project={modelled()} canEdit onGo={onGo} />).container;
    fireEvent.click(within(c).getByText("Open the bill"));
    expect(onGo).toHaveBeenCalledWith("bill");
  });

  it("does not warn when every model matches", () => {
    const clean = modelled();
    clean.models.structural.validation = { status: "valid", requiredCount: 180, matchedCount: 180, missingCount: 0 };
    const c = render(<WorkProjectModel project={clean} canEdit />).container;
    expect(c.querySelector(".pj-note.warn")).toBe(null);
  });

  it("says so when no model has been uploaded", () => {
    const c = render(<WorkProjectModel project={{ models: {} }} canEdit />).container;
    expect(within(c).getByText("No model attached")).toBeTruthy();
    expect(within(c).getByText(/Export IFC from Revit/)).toBeTruthy();
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectModel project={null} />)).not.toThrow();
  });
});

/* ─────────────────────────── Drawings ─────────────────────────── */

const drawn = (over = {}) => ({
  items: [
    { code: "BQ-1", takeoffLine: "Ground floor plan", qty: 100, rate: 1_000 },
    { code: "BQ-2", takeoffLine: "Ground floor plan", qty: 50, rate: 2_000 },
    { code: "BQ-3", takeoffLine: "First floor plan", qty: 10, rate: 500 },
    { code: "BQ-4", qty: 5, rate: 100 },
  ],
  ...over,
});

describe("the Drawings tab", () => {
  it("lists where the bill was measured, busiest first", () => {
    const c = render(<WorkProjectDrawings project={drawn()} />).container;
    const rows = [...c.querySelectorAll(".pj-sheets .sh")];
    expect(rows[0].textContent).toContain("Ground floor plan");
    expect(rows[0].textContent).toContain("2 bill items");
    expect(rows[1].textContent).toContain("First floor plan");
    expect(rows[1].textContent).toContain("1 bill item");
  });

  it("says what was measured at each place", () => {
    const c = render(<WorkProjectDrawings project={drawn()} />).container;
    // 100 × 1,000 + 50 × 2,000 = ₦200k.
    expect(within(c).getByText(/₦200k/)).toBeTruthy();
  });

  it("jumps to the bill filtered to that place — his Show items", () => {
    const onOpenPlace = vi.fn();
    const c = render(
      <WorkProjectDrawings project={drawn()} onOpenPlace={onOpenPlace} />,
    ).container;
    fireEvent.click(c.querySelectorAll(".pj-sheets .sh .pj-lnk")[1]);
    expect(onOpenPlace).toHaveBeenCalledWith("First floor plan");
  });

  it("counts the lines that record no place", () => {
    const c = render(<WorkProjectDrawings project={drawn()} />).container;
    expect(within(c).getByText(/1 line records no place/)).toBeTruthy();
  });

  it("says where places come from when every line has one", () => {
    const all = drawn({ items: drawn().items.slice(0, 3) });
    const c = render(<WorkProjectDrawings project={all} />).container;
    expect(within(c).getByText(/Places sync when the takeoff is saved in HERON/)).toBeTruthy();
  });

  it("says so when nothing records where it was measured", () => {
    const c = render(
      <WorkProjectDrawings project={{ items: [{ code: "BQ-1", qty: 1, rate: 1 }] }} />,
    ).container;
    expect(within(c).getByText("Nothing says where it was measured")).toBeTruthy();
  });
});

/* ─────────────────────────── Services ─────────────────────────── */

const serviced = (over = {}) => ({
  linkedProjects: [
    { projectId: "s1", label: "Ikoyi — Services", linkType: "sum", discipline: "mep", addedAt: "2026-09-05" },
    { projectId: "m1", label: "Ikoyi — Structural", linkType: "merge" },
  ],
  linkedSummaries: [
    {
      projectId: "s1",
      name: "Ikoyi — Services",
      live: { total: 24_500_000, itemCount: 86, pricedPercent: 78 },
    },
  ],
  ...over,
});

describe("the Services tab", () => {
  it("says what services do to the estimate", () => {
    const c = render(<WorkProjectServices project={serviced()} canEdit />).container;
    expect(
      within(c).getByText(/Services measured in Revit MEP roll into this project/),
    ).toBeTruthy();
  });

  it("totals what they add", () => {
    const c = render(<WorkProjectServices project={serviced()} canEdit />).container;
    expect(within(c).getByText("₦24,500,000")).toBeTruthy();
  });

  it("shows a card per linked services project", () => {
    const c = render(<WorkProjectServices project={serviced()} canEdit />).container;
    const cards = c.querySelectorAll(".pj-grid .pj-card");
    // Only the summed link — the merged one is part of this bill, not a service.
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Ikoyi — Services");
    expect(cards[0].textContent).toContain("₦24.5m");
    expect(cards[0].textContent).toContain("86");
    expect(cards[0].textContent).toContain("78%");
  });

  it("marks a figure that is only a snapshot", () => {
    // A snapshot is what the total WAS, and the card must not pass it off as
    // what it is.
    const stale = serviced({
      linkedSummaries: [{ projectId: "s1", snapshot: { total: 20_000_000, itemCount: 80 } }],
    });
    const c = render(<WorkProjectServices project={stale} canEdit />).container;
    expect(within(c).getByText("Snapshot")).toBeTruthy();
  });

  it("does not mark a live figure as a snapshot", () => {
    const c = render(<WorkProjectServices project={serviced()} canEdit />).container;
    expect(within(c).queryByText("Snapshot")).toBe(null);
  });

  it("says so when nothing is linked", () => {
    const c = render(<WorkProjectServices project={{}} canEdit />).container;
    expect(within(c).getByText("No services linked")).toBeTruthy();
    expect(within(c).getByText(/measured in Revit MEP — by you or a consultant/)).toBeTruthy();
  });

  it("tells a view-only reader nothing about linking", () => {
    const c = render(<WorkProjectServices project={{}} canEdit={false} />).container;
    expect(within(c).queryByText(/Linking is done in the full workspace/)).toBe(null);
  });
});

/* ───────────────── Loading, as distinct from empty ───────────────── */

// WHY THESE EXIST
//
// WorkProjectShell holds two documents: a rollup that arrives with the projects
// list, and the full project fetched per id. Until the second lands it renders
// `project` as the rollup — which carries the head but NO models, NO linked
// services and NO bill lines. So for the whole of that fetch these three tabs
// read an empty array off a project that is not empty and announce "No model
// attached" / "No services linked" / "0 places", then change their minds.
//
// That is what the owner meant by a tab feeling stuck: not slowness, but the
// screen stating the wrong thing confidently while it waits. The fix is one
// `loading` prop, and the thing that can silently regress is the ORDER — put the
// check after the empty-list branch and it never runs.

describe("while the full project is still loading", () => {
  it("the Model tab says it is reading, not that there is no model", () => {
    const { getByText, queryByText } = render(<WorkProjectModel project={{}} loading />);
    expect(getByText(/Loading/)).toBeTruthy();
    expect(queryByText("No model attached")).toBeNull();
  });

  it("the Services tab says it is reading, not that nothing is linked", () => {
    const { getByText, queryByText } = render(<WorkProjectServices project={{}} loading />);
    expect(getByText(/Loading/)).toBeTruthy();
    expect(queryByText("No services linked")).toBeNull();
  });

  it("the Drawings tab does not claim zero places", () => {
    const { getByText, queryByText } = render(<WorkProjectDrawings project={{}} loading />);
    expect(getByText(/Loading/)).toBeTruthy();
    expect(queryByText(/0 places/)).toBeNull();
  });

  it("does not hide content it already has", () => {
    // The rollup can be superseded mid-flight by a cached full document. If
    // loading hid real rows the screen would flicker backwards.
    const { getByText, queryByText } = render(<WorkProjectModel project={modelled()} loading />);
    expect(getByText(/ikoyi-arch\.ifc/)).toBeTruthy();
    // Matched on StillLoading's own words, not on /Loading/: this fixture has a
    // model url, so the 3D viewer below also renders and its Suspense fallback
    // says "Loading the model…" quite legitimately. A loose matcher here would
    // fail on that and look like a regression in the tab.
    expect(queryByText(/Reading this project/)).toBeNull();
  });
});

describe("once loading is done", () => {
  it("a genuinely empty project still says so", () => {
    // The loading state must not swallow the real empty state — somebody with
    // no model needs to be told how to add one.
    const { getByText } = render(<WorkProjectModel project={{}} loading={false} />);
    expect(getByText("No model attached")).toBeTruthy();
  });

  it("a genuinely empty services list still says so", () => {
    const { getByText } = render(<WorkProjectServices project={{}} loading={false} />);
    expect(getByText("No services linked")).toBeTruthy();
  });
});

describe("the classic workspace is reachable, not just named", () => {
  it("the Model tab links it rather than only mentioning it", () => {
    const href = "/projects/revit?project=abc&classic=1";
    const { getByText } = render(
      <WorkProjectModel project={{}} canEdit classicHref={href} />,
    );
    const link = getByText("the classic workspace");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(href);
  });

  it("the Services tab does too", () => {
    const href = "/projects/revit?project=abc&classic=1";
    const { getByText } = render(
      <WorkProjectServices project={{}} canEdit classicHref={href} />,
    );
    const link = getByText("the classic workspace");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(href);
  });

  it("without an href it is still a sentence, not a broken link", () => {
    const { queryByText, getByText } = render(<WorkProjectModel project={{}} canEdit />);
    expect(getByText(/Uploading is done in/)).toBeTruthy();
    const maybe = queryByText("the classic workspace");
    if (maybe) expect(maybe.tagName).not.toBe("A");
  });
});

/* ───────────────── The model, drawn ───────────────── */

// The viewer (lib/ifcViewer.js + features/projects/ModelViewer.jsx) worked and
// was mounted on the classic project view, the work area and the 4D workspace —
// everywhere except the tab called Model, which listed the files and drew none
// of them. Somebody opening it to look at their model found a table.
//
// It is lazy, so these assert the SUSPENSE BOUNDARY and the conditions, not the
// three.js canvas: pulling the real viewer into jsdom would test WebGL, not this
// decision. What can regress here is mounting it when there is nothing to draw
// (a row is "attached" on a filename alone, with no url to fetch) and paying the
// three.js download on a tab that cannot use it.

describe("the 3D viewer on the Model tab", () => {
  const withUrl = () => ({
    models: {
      architectural: {
        sourceFile: "ikoyi-arch.ifc",
        url: "https://r2/x.ifc",
        format: "ifc",
        validation: { status: "valid", requiredCount: 5, matchedCount: 5 },
      },
    },
  });
  const noUrl = () => ({
    models: {
      architectural: {
        sourceFile: "ikoyi-arch.ifc",
        format: "ifc",
        validation: { status: "valid", requiredCount: 5, matchedCount: 5 },
      },
    },
  });

  it("is mounted when there is a model to draw", () => {
    const { getByText } = render(<WorkProjectModel project={withUrl()} />);
    expect(getByText("The model")).toBeTruthy();
    // The lazy chunk has not resolved in this tick, so the boundary is showing.
    expect(getByText(/Loading the model/)).toBeTruthy();
  });

  it("is NOT mounted when the row has no url to fetch", () => {
    // A model row counts as attached on a filename alone. Mounting the viewer
    // for one would download three.js to render nothing.
    const { queryByText, getByText } = render(<WorkProjectModel project={noUrl()} />);
    expect(queryByText("The model")).toBeNull();
    expect(queryByText(/Loading the model/)).toBeNull();
    // ...and the list is still there, so the tab has not lost anything.
    expect(getByText(/ikoyi-arch\.ifc/)).toBeTruthy();
  });

  it("says what is downloading, not just that something is", () => {
    // A bare rectangle on a slow connection is indistinguishable from a failure,
    // which is the complaint this tab started with.
    const { getByText } = render(<WorkProjectModel project={withUrl()} />);
    expect(getByText(/large download/i)).toBeTruthy();
  });

  it("is not mounted on a project with no models at all", () => {
    const { queryByText, getByText } = render(<WorkProjectModel project={{}} />);
    expect(queryByText("The model")).toBeNull();
    expect(getByText("No model attached")).toBeTruthy();
  });
});
