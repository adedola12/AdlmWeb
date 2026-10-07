// server/util/deriveBillRates.lock.test.js
//
// A locked contract must not be re-priced from its cost plan.
//
// deriveBillRatesFromBudget had no idea the lock existed, and it runs on nine
// paths including the Budget & procurement save, which checks canEdit and
// nothing else. So editing a material price on a locked contract moved the
// BILL's rate — the agreed rate — with no variation raised and nothing on screen
// to say a contract figure had changed. That is exactly what the lock exists to
// stop: after it, a change becomes a variation or is diverted to actualRate,
// never a silent rewrite of what was agreed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBillRatesFromBudget } from "./deriveBillRates.js";

// One bill line with a priced build-up: 10 m3 at a cost of 1,000 a unit.
const project = (over = {}) => ({
  items: [{ code: "BQ-1", description: "Excavate", unit: "m3", qty: 10, rate: 7_500 }],
  budgetItems: [
    {
      componentKind: "Material",
      materialName: "Cement",
      unit: "bags",
      qty: 10,
      rate: 1_000,
      billIdentity: "BQ-1",
    },
  ],
  ...over,
});

test("an unlocked project is derived from its budget, as it always was", () => {
  const p = project();
  const out = deriveBillRatesFromBudget(p);
  assert.equal(out.updated, 1, "the line should be re-rated");
  assert.notEqual(p.items[0].rate, 7_500, "its rate should have moved");
  assert.ok(!out.lockedOut);
});

test("a LOCKED contract keeps the rate that was agreed", () => {
  const p = project({ contract: { locked: true, contractSum: 75_000 } });
  const before = p.items[0].rate;
  const out = deriveBillRatesFromBudget(p);
  assert.equal(p.items[0].rate, before, "a locked contract's rate must not move");
  assert.equal(out.updated, 0);
  assert.equal(out.lockedOut, true, "and the caller is told why nothing moved");
});

test("it leaves every other figure on a locked line alone too", () => {
  // netUnitCost, overhead% and profit% are written beside the rate. Writing
  // those while refusing the rate would leave a line whose stated build-up does
  // not produce its own rate.
  const p = project({ contract: { locked: true } });
  const out = deriveBillRatesFromBudget(p);
  assert.equal(p.items[0].netUnitCost, undefined);
  assert.equal(p.items[0].overheadPercent, undefined);
  assert.equal(p.items[0].profitPercent, undefined);
  assert.equal(out.skipped, 1, "the line is reported as skipped, not as absent");
});

test("locked is read off the contract, not guessed from anything else", () => {
  // contract.locked is the only flag the lock sets (projects.js:4597). A falsy
  // or missing one must derive, or an unlocked project silently stops pricing.
  for (const contract of [undefined, {}, { locked: false }, { contractSum: 10 }]) {
    const p = project({ contract });
    assert.equal(
      deriveBillRatesFromBudget(p).updated,
      1,
      `contract ${JSON.stringify(contract)} is not locked and must still derive`,
    );
  }
});

test("a locked project with no budget is still a no-op, not an error", () => {
  const p = project({ contract: { locked: true }, budgetItems: [] });
  const out = deriveBillRatesFromBudget(p);
  assert.equal(out.updated, 0);
  assert.equal(out.skipped, 0);
});

test("a locked project with no items does not throw", () => {
  const p = project({ contract: { locked: true }, items: undefined });
  assert.doesNotThrow(() => deriveBillRatesFromBudget(p));
  assert.equal(deriveBillRatesFromBudget(p).skipped, 0);
});
