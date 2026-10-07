// QUIV measures, the cloud prices (owner, 1 Oct 2026): a plugin re-save must not
// move a rate the QS set on the website, on the bill or through the budget.

import { test } from "node:test";
import assert from "node:assert/strict";
import { carryCloudRateLocks } from "./cloudRateLocks.js";
import { backfillBudgetLinks } from "./budgetBillLink.js";
import { ensureBillItemCoverage } from "./budgetCoverage.js";
import { deriveBillRatesFromBudget } from "./deriveBillRates.js";
import { preserveBudgetUserEdits } from "./budgetUserEdits.js";

const LOCK = "2026-09-30T10:00:00.000Z";

const stored = () => [
  { code: "a1", description: "Concrete in footing", unit: "m3", qty: 14.68, rate: 95000, rateLockedAt: LOCK, appliedRateKey: "Concrete 1:2:4" },
  { code: "a2", description: "Blinding", unit: "m3", qty: 8.16, rate: 60000 },   // derived, not locked
];

/** What QUIV sends: the same lines re-measured, no rateLockedAt field at all. */
const quivLines = () => [
  { code: "a1", description: "Concrete in footing", unit: "m3", qty: 15.1, rate: 0 },
  { code: "a2", description: "Blinding", unit: "m3", qty: 8.16, rate: 0 },
  { code: "a3", description: "New line", unit: "m2", qty: 10, rate: 0 },
];

test("a QUIV re-save keeps the rate and lock the QS set on the web", () => {
  const incoming = quivLines();
  const { kept } = carryCloudRateLocks(stored(), incoming);
  assert.equal(kept, 1);
  assert.equal(incoming[0].rate, 95000);
  assert.equal(incoming[0].rateLockedAt, LOCK);
  assert.equal(incoming[0].appliedRateKey, "Concrete 1:2:4");
  assert.equal(incoming[0].qty, 15.1, "the new measurement still lands");
});

test("unlocked and new lines are left as sent", () => {
  const incoming = quivLines();
  carryCloudRateLocks(stored(), incoming);
  assert.equal(incoming[1].rate, 0);
  assert.equal(incoming[1].rateLockedAt, undefined);
  assert.equal(incoming[2].rate, 0);
});

test("the website's own save decides its lock (set or cleared)", () => {
  const cleared = [{ code: "a1", qty: 14.68, rate: 50000, rateLockedAt: null }];
  carryCloudRateLocks(stored(), cleared);
  assert.equal(cleared[0].rate, 50000);
  assert.equal(cleared[0].rateLockedAt, null);
});

test("nothing locked, nothing touched", () => {
  const incoming = quivLines();
  assert.deepEqual(carryCloudRateLocks([{ code: "a1", rate: 1 }], incoming), { kept: 0 });
  assert.deepEqual(carryCloudRateLocks(null, null), { kept: 0 });
});

test("end to end: a QUIV PUT of bill + unpriced budget keeps every web price", () => {
  // The bill the QS priced on the web: a1 locked at 95,000, a2 derived from a
  // budget he priced (cement 5,000/bag typed on the Budget tab).
  const project = {
    items: stored(),
    budgetItems: [
      { sn: 1, billIdentity: "a2", materialName: "Cement", unit: "bag", componentKind: "Material", qty: 100, rate: 5000 },
    ],
  };

  // QUIV re-saves: lines re-measured, budget quantities only (no prices).
  const items = quivLines();
  carryCloudRateLocks(project.items, items);
  project.items = items;

  const budget = [
    { billIdentity: "a2", materialName: "Cement", unit: "bag", componentKind: "Material", qty: 110, rate: 0 },
    { billIdentity: "a3", materialName: "Sand", unit: "t", componentKind: "Material", qty: 3, rate: 0 },
  ];
  const previousBudget = project.budgetItems;
  backfillBudgetLinks(project.items, budget);
  const fresh = ensureBillItemCoverage(project.items, budget);
  preserveBudgetUserEdits(previousBudget, fresh);
  project.budgetItems = fresh;
  deriveBillRatesFromBudget(project);

  const byCode = Object.fromEntries(project.items.map((i) => [i.code, i]));
  assert.equal(byCode.a1.rate, 95000, "the web-set rate is untouched");
  const cement = project.budgetItems.find((b) => b.materialName === "Cement");
  assert.equal(cement.rate, 5000, "the typed budget price survives");
  assert.equal(cement.qty, 110, "with the new quantity");
  assert.ok(byCode.a2.rate > 0, "the derived bill rate follows the web budget, not zero");
  const sand = project.budgetItems.find((b) => b.materialName === "Sand");
  assert.equal(sand.rate, 0, "a new row waits to be priced on the cloud");
  assert.equal(byCode.a3.rate, 0);
});
