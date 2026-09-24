// The Bill's Summary box (S18, PR2-01/02/05).
//
// The arithmetic itself is tested next to the module (lib/projectTotals.test.js).
// What is tested here is the part a customer touches: that the box shows the
// same estimated total the module works out, that it splits the one stored
// list into his two named groups, and that a locked contract turns the whole
// thing read-only and offers the way through to variations instead.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ProjectBillTable from "./ProjectBillTable.jsx";
import { projectTotals } from "./lib/projectTotals.js";

const SUMS = [
  { description: "Lift installation", amount: 5_000_000, kind: "pc" },
  { description: "Drainage allowance", amount: 750_000 },
];
const VARIATIONS = [
  { description: "Extra manholes", qty: 1, unit: "item", rate: 450_000 },
  { description: "Omit the render", qty: 1, unit: "item", rate: -120_000 },
];

const PERCENTS = { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 };

function renderBill(extra = {}) {
  return render(
    <ProjectBillTable
      items={[]}
      computedShown={[]}
      grossAmount={99_999_999} // the whole-scope figure the table is handed
      measuredAmount={10_000_000} // the measured work the Summary must use
      provisionalSums={SUMS}
      variations={VARIATIONS}
      {...PERCENTS}
      onAddProvisionalSum={() => {}}
      onUpdateProvisionalSum={() => {}}
      onRemoveProvisionalSum={() => {}}
      onPreliminaryPercentChange={() => {}}
      onContingencyPercentChange={() => {}}
      onTaxPercentChange={() => {}}
      {...extra}
    />,
  );
}

// vitest runs without `globals`, so testing-library's automatic cleanup never
// hooks itself in; without this every render piles up in the same document.
afterEach(cleanup);

const summary = () => screen.getByLabelText("Bill summary");

// The figures the module works out for exactly this project.
const expected = projectTotals({
  measured: 10_000_000,
  provisionalSums: SUMS,
  variations: VARIATIONS,
  ...PERCENTS,
});
const money = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

describe("the Summary box", () => {
  it("shows the measured work, not the whole scope it is handed", () => {
    renderBill();
    const row = within(summary()).getByText("Measured work").closest(".r");
    expect(row.querySelector("b").textContent).toBe(money(10_000_000));
  });

  it("shows the estimated total the shared module works out", () => {
    renderBill();
    const row = within(summary()).getByText("Estimated total").closest(".r");
    expect(row.querySelector("b").textContent).toBe(money(expected.total));
  });

  it("splits the one stored list into his two named groups", () => {
    renderBill();
    const box = within(summary());
    const pc = box.getByText("PC sums").closest(".grp");
    const prov = box.getByText("Provisional sums").closest(".grp");
    expect(within(pc).getByDisplayValue("Lift installation")).toBeTruthy();
    expect(within(prov).getByDisplayValue("Drainage allowance")).toBeTruthy();
    // A row with no kind is a provisional sum, which is what every row saved
    // before S18 is.
    expect(within(pc).queryByDisplayValue("Drainage allowance")).toBeNull();
  });

  it("offers both add links while the contract is open", () => {
    renderBill();
    const box = within(summary());
    expect(box.getByText("+ Add a PC sum")).toBeTruthy();
    expect(box.getByText("+ Add a provisional sum")).toBeTruthy();
  });

  it("adds into the group whose link was clicked", () => {
    const onAdd = vi.fn();
    renderBill({ onAddProvisionalSum: onAdd });
    within(summary()).getByText("+ Add a PC sum").click();
    expect(onAdd).toHaveBeenCalledWith("pc");
    within(summary()).getByText("+ Add a provisional sum").click();
    expect(onAdd).toHaveBeenCalledWith("provisional");
  });

  it("hides the approved-variations row until the contract is locked", () => {
    renderBill();
    expect(within(summary()).queryByText("Approved variations")).toBeNull();
  });
});

describe("the Summary box, once the contract is locked", () => {
  const locked = {
    contractLocked: true,
    contractLockedAt: "2026-09-18T10:00:00.000Z",
    contractSum: 12_345_678,
    onOpenVariations: () => {},
  };

  it("says so, and says changes go through variations", () => {
    renderBill(locked);
    expect(within(summary()).getByText(/changes go through variations/)).toBeTruthy();
  });

  it("shows the approved variations with a way through to them", () => {
    renderBill(locked);
    const box = within(summary());
    const row = box.getByText(/Approved variations/).closest(".r");
    expect(row.querySelector("b").textContent).toBe(money(330_000));
    expect(box.getByText("See variations")).toBeTruthy();
  });

  it("takes every input away", () => {
    renderBill(locked);
    expect(summary().querySelectorAll("input").length).toBe(0);
    expect(within(summary()).queryByText("+ Add a PC sum")).toBeNull();
  });

  it("still explains each percentage as text", () => {
    renderBill(locked);
    const row = within(summary()).getByText(/Preliminaries/).closest(".r");
    expect(row.textContent).toContain("7.5%");
  });

  it("does not offer Mark as tendered, which is past", () => {
    renderBill({ ...locked, onMarkTendered: () => {} });
    expect(within(summary()).queryByText("Mark as tendered")).toBeNull();
  });
});

describe("the tender mark", () => {
  it("is offered on a priced bill that has not gone out", () => {
    renderBill({ onMarkTendered: () => {} });
    expect(within(summary()).getByText("Mark as tendered")).toBeTruthy();
  });

  it("becomes the date once it has", () => {
    renderBill({ onMarkTendered: () => {}, tenderedAt: "2026-09-20T09:00:00.000Z" });
    const box = within(summary());
    expect(box.getByText(/^Tendered /)).toBeTruthy();
    expect(box.getByText("Not tendered after all")).toBeTruthy();
  });
});

describe("linked services", () => {
  it("are reported outside the total, with the reason", () => {
    renderBill({ linkedSummaries: [{ live: { total: 4_000_000 } }] });
    const box = within(summary());
    expect(box.getByText("priced and valued on their own project")).toBeTruthy();
    // The estimated total is untouched by the link.
    const row = box.getByText("Estimated total").closest(".r");
    expect(row.querySelector("b").textContent).toBe(money(expected.total));
  });
});
