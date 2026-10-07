// The Budget & procurement rollup on the project PDF report.
//
// It costed each budget row at qty × budgetRate. A budget row's qty is a
// RESOURCE quantity — 224 bags of cement — while budgetRate is the derived
// PER-BILL-UNIT rate, so the multiplication was a category error and the whole
// cost plan on the report came out inflated by orders of magnitude.
//
// agentUserData.rowRate already carried a comment saying exactly this and
// deliberately using `rate`; this report was the one place that did not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectReport } from "./reportEngine.js";

// One bill line of concrete with its material build-up, as HERON pushes it.
// 224 bags at ₦9,500 is ₦2,128,000 of cement. The bill rate for the concrete
// is ₦65,000/m³, which is what lands in budgetRate.
const project = (over = {}) => ({
  name: "Ikoyi tower",
  productKey: "planswift",
  items: [
    {
      code: "BQ-2",
      description: "Reinforced concrete grade 25 in columns",
      unit: "m3",
      qty: 32,
      rate: 65_000,
    },
  ],
  budgetItems: [
    {
      billIdentity: "BQ-2",
      componentKind: "Material",
      materialName: "Cement (50kg)",
      trade: "Concrete",
      unit: "bags",
      qty: 224,
      rate: 9_500,
      budgetRate: 65_000,
    },
    {
      billIdentity: "BQ-2",
      componentKind: "Labour",
      materialName: "Mason",
      trade: "Concrete",
      unit: "m2",
      qty: 180,
      rate: 1_200,
      budgetRate: 65_000,
      procured: true,
    },
  ],
  ...over,
});

const NOW = new Date("2026-09-27T01:00:00Z");

test("a budget row is costed at its own rate, not at the bill's", () => {
  const report = buildProjectReport(project(), { now: NOW });
  // 224 × 9,500 + 180 × 1,200 = 2,128,000 + 216,000
  assert.equal(report.budget.budgetTotal, 2_344_000);
});

test("the inflated figure the report used to print is nowhere in it", () => {
  const report = buildProjectReport(project(), { now: NOW });
  // 224 × 65,000 + 180 × 65,000 = 26,260,000 — eleven times the real cost plan.
  assert.notEqual(report.budget.budgetTotal, 26_260_000);
});

test("procured value follows the corrected amount", () => {
  const report = buildProjectReport(project(), { now: NOW });
  // Only the labour row is procured: 180 × 1,200.
  assert.equal(report.budget.procuredValue, 216_000);
  assert.equal(report.budget.procuredCount, 1);
});

test("a partially procured row counts its percentage of the real amount", () => {
  const p = project();
  p.budgetItems[0].procuredPercent = 50;
  const report = buildProjectReport(p, { now: NOW });
  // 50% of 2,128,000 + all of 216,000.
  assert.equal(report.budget.procuredValue, 1_064_000 + 216_000);
});

test("a row with no budgetRate at all costs the same as one with", () => {
  // The old expression was `budgetRate ?? rate`, which only fell back on null.
  // The schema defaults budgetRate to 0, so a row that had never been given one
  // costed at zero rather than at its rate — the same bug in the other
  // direction. Both rows must now agree.
  const withRate = buildProjectReport(project(), { now: NOW });
  const p = project();
  delete p.budgetItems[0].budgetRate;
  p.budgetItems[1].budgetRate = 0;
  const without = buildProjectReport(p, { now: NOW });
  assert.equal(without.budget.budgetTotal, withRate.budget.budgetTotal);
});

test("rows are grouped by trade, with the corrected amounts", () => {
  const report = buildProjectReport(project(), { now: NOW });
  const concrete = report.budget.byGroup.find((g) => g.label === "Concrete");
  assert.ok(concrete, "expected a Concrete group");
  assert.equal(concrete.budget, 2_344_000);
});

test("a project with no budget rows has no budget section rather than a zero one", () => {
  const report = buildProjectReport(project({ budgetItems: [] }), { now: NOW });
  assert.equal(report.budget, null);
});
