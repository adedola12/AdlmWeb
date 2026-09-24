// The Overview's headline tiles (S18 review, finding C).
//
// Three tiles sit side by side and a reader adds them up without being asked:
// the estimated total, what has been earned so far, and what is outstanding.
// The headline read the shared cascade while the two beside it were still
// derived the old way, so the row did not reconcile — the outstanding tile was
// short by the contingency and the VAT.
//
// All three now come off one projectTotals() result, so completed plus
// outstanding is the estimated total, exactly.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProjectDashboardSummary from "./ProjectDashboardSummary.jsx";
import { projectTotals } from "./lib/projectTotals.js";

const MEASURED = 40_000_000;
const SUMS = [
  { description: "Lift installation", amount: 5_000_000, kind: "pc" },
  { description: "Drainage allowance", amount: 2_000_000 },
];
const VARIATIONS = [{ description: "Extra manholes", qty: 1, unit: "item", rate: 1_500_000 }];
const PERCENTS = { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 };

// The whole project scope as ProjectsGeneric computes it, and the old
// outstanding figure derived from it. Both leave out contingency and VAT.
const WHOLE_SCOPE = 52_025_000;
const EARNED = 14_000_000;
const OLD_REMAINING = WHOLE_SCOPE - EARNED;

const expected = projectTotals({
  measured: MEASURED,
  provisionalSums: SUMS,
  variations: VARIATIONS,
  ...PERCENTS,
});

const unmoney = (text) => Number(String(text).replace(/,/g, ""));

function renderOverview(extra = {}) {
  return render(
    <ProjectDashboardSummary
      grossAmount={WHOLE_SCOPE}
      measuredAmount={MEASURED}
      provisionalSums={SUMS}
      variations={VARIATIONS}
      {...PERCENTS}
      valuedAmount={EARNED}
      remainingAmount={OLD_REMAINING}
      progressCount={2}
      progressTotal={5}
      progressPercent={40}
      comparisonRows={[]}
      {...extra}
    />,
  );
}

afterEach(cleanup);

const tile = (label) => screen.getByText(label).closest(".dsh-stat");
const figure = (label) => unmoney(tile(label).querySelector("b").textContent);

describe("the three headline tiles", () => {
  it("add up: completed plus outstanding is the estimated total", () => {
    renderOverview();
    const total = figure("Estimated total");
    const done = figure("Completed to date");
    const left = figure("Outstanding balance");
    expect(total).toBeCloseTo(expected.total, 2);
    expect(done).toBe(EARNED);
    expect(done + left).toBeCloseTo(total, 2);
  });

  it("no longer leaves the outstanding tile short by the contingency and VAT", () => {
    renderOverview();
    expect(figure("Outstanding balance")).not.toBe(OLD_REMAINING);
  });

  it("keeps linked services out of all three, and says where they are", () => {
    renderOverview({ linkedSummaries: [{ live: { total: 4_000_000 } }] });
    const total = figure("Estimated total");
    const done = figure("Completed to date");
    const left = figure("Outstanding balance");
    expect(total).toBeCloseTo(expected.total, 2);
    expect(done + left).toBeCloseTo(total, 2);
    expect(tile("Outstanding balance").textContent).toMatch(/linked services/i);
  });
});
