import React from "react";
import { describe, it, expect } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import DsSectionTabs from "./DsSectionTabs.jsx";
import { sectionTabs } from "../lib/railActive.js";
import { RAIL } from "./railConfig.js";

const labels = (id, owned = null) => sectionTabs(RAIL, id, owned).map((t) => t.label);

describe("section tabs (R03)", () => {
  it("shows every Manage destination on a Manage screen", () => {
    expect(labels("dash-billing")).toEqual([
      "Overview",
      "Products & seats",
      "Team",
      "Billing & invoices",
      "Downloads",
      "Support",
    ]);
  });

  it("opens My tools out into the Work tabs, only for tools the account owns", () => {
    expect(labels("work-home", new Set(["revit", "planswift"]))).toEqual([
      "Overview",
      "QUIV",
      "HERON",
      "RateGen",
      "Projects",
    ]);
  });

  it("shows every Learn destination, Assignments included now it is built", () => {
    expect(labels("dash-learning")).toEqual([
      "My learning",
      "Assignments",
      "Certificates",
      "Lessons & events",
      "Guides & docs",
    ]);
  });

  it("shows nothing off the rail", () => {
    expect(labels(null)).toEqual([]);
    expect(labels("dash-settings")).toEqual([]);
  });

  it("marks the current tab and navigates on click", () => {
    let where;
    const Spy = () => {
      where = useLocation().pathname;
      return null;
    };
    const { container, getByText } = render(
      <MemoryRouter initialEntries={["/manage"]}>
        <DsSectionTabs activeId="dash-home" />
        <Routes>
          <Route path="*" element={<Spy />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector(".wk-tabs button.on").textContent).toBe("Overview");
    fireEvent.click(getByText("Billing & invoices"));
    expect(where).toBe("/manage/billing");
    cleanup();
  });
});
