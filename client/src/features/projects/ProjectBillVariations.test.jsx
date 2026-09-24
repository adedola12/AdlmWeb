// The Bill's variations section (S18).
//
// There were two editors for one thing: this section raised a variation that
// counted immediately, while the Valuation tab's Variations view raises one
// as PENDING and only counts it once somebody approves it. The two now tell
// the same story — a variation is raised waiting for approval, it is approved
// or rejected on the Valuation tab, and the Bill totals the approved ones
// only. This section keeps the working columns the Valuation view has no
// answer for (qty, rate, reference, and the executed-on-site tick).

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ProjectBillTable from "./ProjectBillTable.jsx";

// Two rows written before the status field existed (they read as approved),
// one waiting for approval and one rejected.
const VARIATIONS = [
  { description: "Extra manholes", qty: 1, unit: "item", rate: 450_000 },
  { description: "Omit the render", qty: 1, unit: "item", rate: -120_000 },
  {
    description: "Stair balustrade",
    qty: 1,
    unit: "item",
    rate: 300_000,
    status: "pending",
    reference: "AI-012",
  },
  {
    description: "Marble to lobby",
    qty: 1,
    unit: "item",
    rate: 900_000,
    status: "rejected",
  },
];

function renderBill(extra = {}) {
  return render(
    <ProjectBillTable
      items={[]}
      computedShown={[]}
      grossAmount={0}
      measuredAmount={10_000_000}
      provisionalSums={[]}
      variations={VARIATIONS}
      preliminaryPercent={7.5}
      contingencyPercent={5}
      taxPercent={7.5}
      onAddVariation={() => {}}
      onUpdateVariation={() => {}}
      onRemoveVariation={() => {}}
      {...extra}
    />,
  );
}

afterEach(cleanup);

// The section itself — the panel the "Variations, Site Instructions" heading
// sits in.
const section = () =>
  screen.getByText(/Variations, Site Instructions/).closest(".wk-panel");

describe("the Bill's variations section", () => {
  it("shows where each variation stands", () => {
    renderBill();
    const box = within(section());
    // A row with no status has always counted, so it reads as approved.
    expect(box.getAllByText("Approved").length).toBe(2);
    expect(box.getByText("Pending")).toBeTruthy();
    expect(box.getByText("Rejected")).toBeTruthy();
  });

  it("shows the status read-only — a decision is not something you type here", () => {
    renderBill();
    const pill = within(section()).getByText("Pending");
    expect(pill.tagName).toBe("SPAN");
    expect(pill.className).toContain("pj-stage");
    // No approve / reject control in the Bill: that lives on the Valuation tab.
    expect(within(section()).queryByText(/^Approve$/)).toBeNull();
    expect(within(section()).queryByText(/^Reject$/)).toBeNull();
    expect(within(section()).queryByRole("combobox")).toBeNull();
  });

  it("totals the approved variations only, and says what is waiting", () => {
    renderBill();
    const box = within(section());
    const foot = box.getByText("Total approved variations").closest("tr");
    // 450,000 - 120,000 = 330,000. The pending 300,000 and the rejected
    // 900,000 are in neither.
    expect(within(foot).getByText("330,000")).toBeTruthy();
    expect(box.getByText("1 waiting for approval, not counted")).toBeTruthy();
  });

  it("says a new one waits for approval before it counts", () => {
    renderBill();
    expect(
      within(section()).getByText(/waits for approval and moves nothing/),
    ).toBeTruthy();
  });

  it("sends the user to the Valuation tab to approve or reject", () => {
    const onOpenVariations = vi.fn();
    renderBill({ onOpenVariations });
    within(section()).getByText("Approve or reject").click();
    expect(onOpenVariations).toHaveBeenCalled();
  });

  it("still offers the add button, which raises one", () => {
    const onAddVariation = vi.fn();
    renderBill({ onAddVariation });
    within(section()).getByText("+ Add variation").click();
    expect(onAddVariation).toHaveBeenCalled();
  });

  it("keeps the working columns the Valuation view has no answer for", () => {
    renderBill();
    const box = within(section());
    // Quantity, rate, reference and the executed-on-site tick: the Valuation
    // view offers none of these, so taking them away would strand the QS.
    expect(box.getByDisplayValue("AI-012")).toBeTruthy();
    expect(box.getByText("Done")).toBeTruthy();
    expect(box.getAllByRole("checkbox").length).toBe(VARIATIONS.length);
  });
});

// ── When rates are hidden from this viewer ────────────────────────────────
// A collaborator without RateGen reads the whole project with every rate and
// amount zeroed. They may measure, mark progress, edit and add — the server
// keeps the owner's pricing on whatever they save — but a deletion it takes at
// its word, because a row removed is a row nobody carried the money for. They
// cannot see what a row is worth, so the delete controls are dead for them.
describe("when rates are hidden from this viewer", () => {
  const SUMS = [
    { kind: "pc", description: "Lift installation", amount: 3_000_000 },
    { kind: "provisional", description: "Drainage allowance", amount: 1_200_000 },
  ];
  const PRELIMS = [{ name: "Site accommodation", allocation: 10, actualAmount: 850_000 }];

  it("greys out every delete control, and says why", () => {
    renderBill({
      canSeeRates: false,
      provisionalSums: SUMS,
      preliminaryItems: PRELIMS,
      onRemoveProvisionalSum: () => {},
      onUpdatePreliminaryItem: () => {},
      onRemovePreliminaryItem: () => {},
    });
    const blocked = screen.getAllByTitle(/Rates are hidden on this project/);
    // One variation delete per row, the two sums, and the preliminary.
    expect(blocked.length).toBe(VARIATIONS.length + SUMS.length + PRELIMS.length);
    for (const btn of blocked) expect(btn.disabled).toBe(true);
  });

  it("does not fire the remove handler when the control is clicked anyway", () => {
    const onRemoveVariation = vi.fn();
    renderBill({ canSeeRates: false, onRemoveVariation });
    screen.getAllByTitle(/Rates are hidden on this project/)[0].click();
    expect(onRemoveVariation).not.toHaveBeenCalled();
  });

  it("leaves the controls alone for anyone who can see the rates", () => {
    const onRemoveVariation = vi.fn();
    renderBill({ provisionalSums: SUMS, preliminaryItems: PRELIMS, onRemoveVariation });
    expect(screen.queryAllByTitle(/Rates are hidden on this project/).length).toBe(0);
    const remove = screen.getAllByTitle("Remove this variation")[0];
    expect(remove.disabled).toBe(false);
    remove.click();
    expect(onRemoveVariation).toHaveBeenCalled();
  });
});
