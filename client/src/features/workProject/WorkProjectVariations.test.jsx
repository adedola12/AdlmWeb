import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import {
  WorkProjectFinalView,
  WorkProjectVariationsView,
} from "./WorkProjectVariations.jsx";

// variationsModel.test.js pins the arithmetic; these pin what the two screens
// say — particularly the two things his screen cannot say, because our data
// carries them: a variation approved but not executed, and linked services
// listed outside the total.

afterEach(cleanup);

/* ──────────────────────────── Variations ──────────────────────────── */

const project = (over = {}) => ({
  variations: [
    {
      description: "Extra manholes",
      reference: "AI-014",
      qty: 4,
      unit: "nr",
      rate: 225_000,
      status: "approved",
      completed: true,
      issuedAt: "2026-08-14",
    },
    {
      description: "Upgrade to granite sills",
      qty: 30,
      unit: "m",
      rate: 18_000,
      status: "approved",
    },
    { description: "Omit the rear canopy", qty: 1, rate: -1_400_000, status: "approved" },
    { description: "Additional car park bays", qty: 12, rate: 95_000, status: "pending" },
  ],
  ...over,
});

const vars = (props = {}) =>
  render(<WorkProjectVariationsView project={project()} {...props} />).container;

describe("the Variations view", () => {
  it("lists them newest first, numbered", () => {
    const rows = [...vars().querySelectorAll(".pj-vars .vr")];
    expect(rows[0].textContent).toContain("Additional car park bays");
    expect(rows[rows.length - 1].textContent).toContain("V1");
  });

  it("signs an addition and marks an omission as one", () => {
    const c = vars();
    expect(within(c).getByText("+₦900,000")).toBeTruthy();
    expect(c.querySelector(".pj-vars .n.om")).toBeTruthy();
  });

  it("shows each one's status", () => {
    const c = vars();
    expect(within(c).getByText("Pending")).toBeTruthy();
    expect(within(c).getAllByText("Approved").length).toBe(3);
  });

  it("says when an approved variation has not been executed", () => {
    // Money owed eventually, not money earned now — his screen cannot say this.
    const c = vars();
    // Both approved rows that are not completed say it — the granite sills and
    // the omission, which counts as executed only once it has been taken.
    expect(within(c).getAllByText(/Not yet executed/)).toHaveLength(2);
    // The completed one does not.
    expect(within(c).getByText(/AI-014 · 14 Aug 2026 · 4 nr/).textContent).not.toContain(
      "Not yet executed",
    );
  });

  it("keeps a pending variation out of the net and says what it would add", () => {
    const k = [...vars().querySelectorAll(".pj-kpi > div")];
    expect(k[0].textContent).toContain("Approved, net");
    // 900,000 + 540,000 − 1,400,000 = ₦40,000.
    expect(k[0].textContent).toContain("₦40,000");
    expect(k[3].textContent).toContain("not counted yet");
    expect(k[3].className).toBe("warn");
  });

  it("counts the approved rows awaiting execution below the list", () => {
    expect(within(vars()).getByText(/2 approved variations have not been marked executed/)).toBeTruthy();
  });

  it("opens one when it is clicked", () => {
    const onOpenVariation = vi.fn();
    const c = vars({ onOpenVariation });
    fireEvent.click(c.querySelectorAll(".pj-vars .vr")[0]);
    // Newest first, so the first row is the last variation — index 3.
    expect(onOpenVariation).toHaveBeenCalledWith(3);
  });

  it("says there are none rather than drawing four zeros", () => {
    const c = render(<WorkProjectVariationsView project={{ variations: [] }} />).container;
    expect(within(c).getByText("No variations yet")).toBeTruthy();
    expect(c.querySelector(".pj-kpi")).toBe(null);
  });

  it("does not throw on a project that has not loaded", () => {
    expect(() => render(<WorkProjectVariationsView project={null} />)).not.toThrow();
  });
});

/* ─────────────────────────── Final account ─────────────────────────── */

const totals = {
  measured: 120_000_000,
  prelims: 9_000_000,
  pc: 18_000_000,
  provisional: 4_000_000,
  linked: 24_500_000,
  contingency: 6_000_000,
  variations: 2_500_000,
  tax: 13_000_000,
  total: 172_500_000,
};

const final = (props = {}) =>
  render(
    <WorkProjectFinalView
      project={{ stage: "valuing" }}
      totals={totals}
      contractSum={165_000_000}
      certified={90_000_000}
      {...props}
    />,
  ).container;

describe("the Final account view", () => {
  it("breaks the account down and totals it", () => {
    const c = final();
    expect(within(c).getByText("Measured work")).toBeTruthy();
    expect(within(c).getByText("₦172,500,000")).toBeTruthy();
  });

  it("says linked services are valued separately", () => {
    // They are not in the total, and a breakdown that did not say so would read
    // as arithmetic that does not add up.
    expect(within(final()).getByText(/Linked services \(valued separately\)/)).toBeTruthy();
  });

  it("calls a higher account an over-run, against the contract", () => {
    const c = final();
    expect(within(c).getByText("Over-run")).toBeTruthy();
    expect(within(c).getByText("₦7,500,000")).toBeTruthy();
    expect(within(c).getByText(/4\.5% of the contract/)).toBeTruthy();
  });

  it("calls a lower one a saving", () => {
    const c = final({ contractSum: 200_000_000 });
    expect(within(c).getByText("Saving")).toBeTruthy();
    expect(c.querySelector(".big2.under")).toBeTruthy();
  });

  it("says what has been certified, as a share of the account", () => {
    expect(within(final()).getByText(/52% of the final account/)).toBeTruthy();
  });

  it("says a project with no contract sum is measured against the estimate", () => {
    const c = final({ contractSum: 0 });
    expect(within(c).getByText("No contract sum recorded yet")).toBeTruthy();
    expect(within(c).getByText(/Against the estimate, not a contract/)).toBeTruthy();
  });

  it("says whether the account is closed or live", () => {
    expect(within(final()).getByText(/Final account · live/)).toBeTruthy();
    cleanup();
    expect(within(final({ project: { stage: "final" } })).getByText(/Final account · closed/)).toBeTruthy();
  });
});
