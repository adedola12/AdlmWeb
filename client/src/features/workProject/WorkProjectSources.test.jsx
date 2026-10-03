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
