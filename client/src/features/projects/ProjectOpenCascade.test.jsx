// What the project screen hands the contract panel (S18 review, finding A).
//
// ProjectOpenView receives two money figures from ProjectsGeneric and they are
// not the same thing:
//
//   grossAmount     the WHOLE project scope — measured work plus the sums plus
//                   preliminaries plus approved variations
//   measuredAmount  the measured work on its own
//
// The contract panel builds the grand summary itself: it takes what it is
// given as "measured", adds the sums, adds preliminaries, then cascades
// contingency and VAT. Handing it the whole scope therefore counted the sums,
// the preliminaries and the variations a second time, and every locked
// contract showed a fabricated over-run against its own contract sum.
//
// The panel must be handed the measured work, and every figure it is given
// must be the one the shared totals module works out — the same one the Bill's
// Summary box shows.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { projectTotals } from "./lib/projectTotals.js";

const captured = vi.hoisted(() => ({ contract: null }));

vi.mock("./ProjectContractPanel.jsx", () => ({
  default: (props) => {
    captured.contract = props;
    return null;
  },
}));
vi.mock("./ProjectValuationSummary.jsx", () => ({ default: () => null }));

// Imported after the mocks so the mocked children are the ones it renders.
const { default: ProjectOpenView } = await import("./ProjectOpenView.jsx");

const MEASURED = 40_000_000;
const SUMS = [
  { description: "Lift installation", amount: 5_000_000, kind: "pc" },
  { description: "Drainage allowance", amount: 2_000_000 },
];
const VARIATIONS = [
  { description: "Extra manholes", qty: 1, unit: "item", rate: 1_500_000 },
  { description: "Stair balustrade", qty: 1, unit: "item", rate: 900_000, status: "pending" },
];
const CONTRACT = {
  locked: true,
  contractSum: 57_030_093.75,
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
};

// What ProjectsGeneric computes as `fullProjectTotal` for exactly this project
// and passes down as `grossAmount`: 40,000,000 + 7,000,000 + 3,525,000 prelims
// + 1,500,000 approved variations.
const WHOLE_SCOPE = 52_025_000;

const expected = projectTotals({
  measured: MEASURED,
  provisionalSums: SUMS,
  variations: VARIATIONS,
  preliminaryPercent: 7.5,
  contingencyPercent: 5,
  taxPercent: 7.5,
});

function renderProject(extra = {}) {
  return render(
    <MemoryRouter initialEntries={["/projects/revit?tab=valuation"]}>
      <ProjectOpenView
        projectName="Ikoyi residence"
        productKey="revit"
        items={[]}
        computedShown={[]}
        grossAmount={WHOLE_SCOPE}
        measuredAmount={MEASURED}
        provisionalSums={SUMS}
        variations={VARIATIONS}
        contract={CONTRACT}
        contingencyPercent={CONTRACT.contingencyPercent}
        taxPercent={CONTRACT.taxPercent}
        valuedAmount={0}
        remainingAmount={WHOLE_SCOPE}
        preliminaryItems={[]}
        certificates={[]}
        {...extra}
      />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("the contract panel's figures", () => {
  it("is handed the measured work, not the whole project scope", () => {
    renderProject();
    expect(captured.contract.measured).toBe(MEASURED);
    expect(captured.contract.measured).not.toBe(WHOLE_SCOPE);
  });

  it("gets every figure from the same cascade the Bill's Summary shows", () => {
    renderProject();
    const p = captured.contract;
    expect(p.provisional).toBe(expected.sums);
    expect(p.preliminary).toBeCloseTo(expected.prelims, 6);
    expect(p.contingency).toBeCloseTo(expected.contingency, 6);
    expect(p.tax).toBeCloseTo(expected.tax, 6);
    expect(p.variations).toBe(expected.variations);
  });

  it("makes the final account's own arithmetic land on the estimated total", () => {
    renderProject();
    const p = captured.contract;
    const subtotal = p.measured + p.provisional + p.preliminary;
    const planned = subtotal + p.contingency + p.tax;
    expect(planned).toBeCloseTo(expected.planned, 6);
    expect(planned + p.variations).toBeCloseTo(expected.total, 6);
  });

  it("counts only the approved variations, so a pending one moves nothing", () => {
    renderProject();
    expect(captured.contract.variations).toBe(1_500_000);
  });

  it("prices a completed preliminary item off the real preliminary pool", () => {
    renderProject({
      preliminaryItems: [
        { description: "Site office", allocation: 40, completed: true },
        { description: "Insurances", allocation: 60 },
      ],
      valuedAmount: 0,
    });
    // 40% of the 3,525,000 pool, and nothing else has been earned.
    expect(captured.contract.actualSpent).toBeCloseTo(expected.prelims * 0.4, 6);
  });
});
