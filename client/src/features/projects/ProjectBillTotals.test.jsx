// The Bill's own totals row, and its "Summary by category" total (S18 review,
// finding B).
//
// One page, one story. The table's money columns list the MEASURED WORK — one
// row per item of work, priced qty x rate — so the row that closes those
// columns has to add up those columns. It used to print the whole project
// scope instead (measured work plus the sums plus preliminaries plus
// variations), which is a different and larger figure, so the Bill contradicted
// itself: the column said one thing, the line under it another.
//
// The estimated total, the cascade with preliminaries, contingency and VAT on
// top, belongs to the Summary box, which is separately labelled. Both are
// correct answers to different questions, and this file pins which is which.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ProjectBillTable from "./ProjectBillTable.jsx";
import { projectTotals } from "./lib/projectTotals.js";

// A small Nigerian bill: three priced lines in two work sections.
const ITEMS = [
  { description: "Excavate to reduce levels", qty: 800, unit: "m3", rate: 15_000 },
  { description: "Mass concrete fill", qty: 200, unit: "m3", rate: 40_000 },
  { description: "Reinforced concrete frame", qty: 250, unit: "m3", rate: 80_000 },
];

const SHOWN = ITEMS.map((it, i) => ({
  ...it,
  i,
  key: `line-${i}`,
  category: i < 2 ? "Substructure" : "Frame",
  percentComplete: 0,
  isMarked: false,
  valuationFactor: 0,
})).map((row, i) => ({
  ...row,
  fullAmount: [12_000_000, 8_000_000, 20_000_000][i],
  valuedAmount: [4_000_000, 0, 10_000_000][i],
  amount: [8_000_000, 8_000_000, 10_000_000][i],
}));

const MEASURED = 40_000_000; // what the three rows above add up to
const SUMS = [
  { description: "Lift installation", amount: 5_000_000, kind: "pc" },
  { description: "Drainage allowance", amount: 2_000_000 },
];
const VARIATIONS = [{ description: "Extra manholes", qty: 1, unit: "item", rate: 1_500_000 }];
const PERCENTS = { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 };

// What ProjectsGeneric hands the table as `grossAmount`: the whole project
// scope. Measured work + sums + preliminaries + approved variations.
const WHOLE_SCOPE = 52_025_000;

// The whole-project earned and outstanding figures, which include executed PC
// sums, prelims and variations, so they are deliberately NOT the sum of the
// table's own Deducted and Balance columns.
const WHOLE_VALUED = 20_000_000;
const WHOLE_REMAINING = 32_025_000;

const money = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

function renderBill(extra = {}) {
  return render(
    <ProjectBillTable
      items={ITEMS}
      computedShown={SHOWN}
      grossAmount={WHOLE_SCOPE}
      measuredAmount={MEASURED}
      valuedAmount={WHOLE_VALUED}
      remainingAmount={WHOLE_REMAINING}
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

afterEach(cleanup);

const cellsOf = (tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());

describe("the Bill's totals row", () => {
  it("adds up its own money columns, not the whole project scope", () => {
    renderBill();
    const row = screen.getByText(/^Totals/).closest("tr");
    const cells = cellsOf(row);
    // [ label, gross, deducted, balance, actions ]
    expect(cells[1]).toBe(money(MEASURED));
    expect(cells[1]).not.toBe(money(WHOLE_SCOPE));
    expect(cells[2]).toBe(money(14_000_000)); // 4,000,000 + 0 + 10,000,000
    expect(cells[3]).toBe(money(26_000_000)); // 8,000,000 + 8,000,000 + 10,000,000
  });

  it("says which figure it is, so it is not read as the project's total", () => {
    renderBill();
    expect(screen.getByText(/^Totals/).textContent).toMatch(/measured work/i);
  });
});

describe("the Summary by category total", () => {
  const panel = () => screen.getByText("Summary by category").closest(".wk-panel");

  it("equals the column of category figures above it", () => {
    renderBill();
    const foot = panel().querySelector("tfoot tr");
    const cells = cellsOf(foot);
    // [ label, items, gross, deducted, balance ]
    expect(cells[2]).toBe(money(MEASURED));
    expect(cells[2]).not.toBe(money(WHOLE_SCOPE));
    expect(cells[3]).toBe(money(14_000_000));
    expect(cells[4]).toBe(money(26_000_000));
  });

  it("names the figure measured work", () => {
    renderBill();
    expect(within(panel()).getByText(/Measured work total/i)).toBeTruthy();
  });

  it("still carries a linked project on its own line, outside the measured column", () => {
    renderBill({ linkedSummaries: [{ id: "l1", label: "MEP services", live: { total: 4_000_000 } }] });
    const foot = panel().querySelector("tfoot tr");
    const cells = cellsOf(foot);
    expect(cells[0]).toMatch(/Grand Total/i);
    expect(cells[2]).toBe(money(44_000_000)); // 40,000,000 measured + 4,000,000 linked
  });
});

describe("the Summary box, beside it", () => {
  it("keeps the estimated total — a different question, differently labelled", () => {
    renderBill();
    const expected = projectTotals({
      measured: MEASURED,
      provisionalSums: SUMS,
      variations: VARIATIONS,
      ...PERCENTS,
    });
    const box = within(screen.getByLabelText("Bill summary"));
    const row = box.getByText("Estimated total").closest(".r");
    expect(row.querySelector("b").textContent).toBe(money(expected.total));
    // The two figures are genuinely different, which is why each needs its name.
    expect(expected.total).not.toBe(MEASURED);
  });
});
