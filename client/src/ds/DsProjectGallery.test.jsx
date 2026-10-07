// His project gallery, on our rollup rows (S18 review, 22 Sep 2026).
//
// What is checked here is what the gallery SAYS about money: the figure it
// calls "Estimated" has to be the estimate the Bill shows, and a project whose
// money the reader may not see has to read as withheld — never as a figure,
// never as a zero, and never quietly inside the total at the top.
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DsProjectGallery from "./DsProjectGallery.jsx";

const project = (extra) => ({
  id: "p1",
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi",
  productKey: "planswift",
  baseProductKey: "planswift",
  updatedAt: "2026-09-20T10:00:00Z",
  totalCost: 40_000_000,
  estimatedTotal: 51_000_000,
  progressPercent: 25,
  ...extra,
});

const mount = (projects) =>
  render(
    <MemoryRouter>
      <DsProjectGallery projects={projects} />
    </MemoryRouter>,
  );

const summary = () => document.querySelector(".pj-sum").textContent;

afterEach(cleanup);

describe("the project gallery's money", () => {
  it("shows the estimate the server sends, not measured work", async () => {
    mount([project()]);
    // "Estimated" used to be qty x rate with no prelims, contingency, VAT or
    // approved variations in it, because the rollup sent no estimate at all.
    const card = (await screen.findByText("MOREMI ESTATE BLOCK A")).closest(".pj-card");
    expect(within(card).getByText("₦51.0m")).toBeTruthy();
    expect(within(card).queryByText("₦40.0m")).toBeNull();
    expect(summary()).toContain("₦51.0m");
  });

  it("withholds the figure on a project whose money is hidden", async () => {
    mount([
      project(),
      project({
        id: "p2",
        slug: "ikeja",
        name: "IKEJA OFFICES",
        shared: true,
        moneyHidden: true,
        estimatedTotal: 0,
        totalCost: 90_000_000,
      }),
    ]);
    const card = (await screen.findByText("IKEJA OFFICES")).closest(".pj-card");
    // An en dash, not ₦0: the figure is withheld, not nothing.
    expect(within(card).getByText("–")).toBeTruthy();
    expect(within(card).getByText("Money hidden")).toBeTruthy();
    expect(within(card).queryByText("₦90.0m")).toBeNull();
    expect(within(card).queryByText("₦0")).toBeNull();
  });

  it("leaves it out of the total, and says the total leaves it out", async () => {
    mount([
      project(),
      project({ id: "p2", slug: "ikeja", name: "IKEJA OFFICES", moneyHidden: true }),
    ]);
    await screen.findByText("IKEJA OFFICES");
    const line = summary();
    expect(line).toContain("2 projects");
    // Not ₦102.0m: only the project it may actually total is in it.
    expect(line).toContain("₦51.0m");
    expect(line).toContain("1 with money hidden is not counted");
  });

  it("has no total at all when every project's money is hidden", async () => {
    mount([project({ moneyHidden: true })]);
    await screen.findByText("MOREMI ESTATE BLOCK A");
    const line = summary();
    expect(line).toContain("–");
    expect(line).not.toContain("₦");
    expect(line).toContain("1 with money hidden is not counted");
  });
});
