// Money on a project somebody else owns.
//
// The three figures under test here — totalCost, valuedAmount,
// remainingAmount — were deliberately left OFF the mask, on the reasoning that
// they predated it and the screens would withhold them themselves. Three
// screens did not, and one of them defeated the mask outright: the work
// overview's headline read `workValue > 0 ? workValue : totalCost`, so zeroing
// workValue fell straight through to the unmasked totalCost and printed the
// real figure. Withholding a derived total while shipping its biggest input is
// not withholding anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maskSharedMoney,
  ROLLUP_MONEY_FIELDS,
  PROJECT_LIST_MONEY_FIELDS,
  MERGED_CONTRACT_MONEY_FIELDS,
} from "./sharedMoney.js";

const sharedRow = (over = {}) => ({
  id: "p1",
  name: "Ikoyi tower",
  shared: true,
  itemCount: 412,
  totalCost: 184_000_000,
  valuedAmount: 61_000_000,
  remainingAmount: 123_000_000,
  workValue: 205_000_000,
  certifiedToDate: 58_000_000,
  estimatedTotal: 230_000_000,
  contractSum: 210_000_000,
  ...over,
});

test("the measured total, the valued amount and the balance are all withheld", () => {
  const [row] = maskSharedMoney([sharedRow()], false);
  assert.equal(row.totalCost, 0);
  assert.equal(row.valuedAmount, 0);
  assert.equal(row.remainingAmount, 0);
});

test("workValue cannot be reconstructed from what is left on the row", () => {
  // The exact leak: workValue was masked, totalCost was not, and the screen's
  // fallback read totalCost. Both have to go or neither is hidden.
  const [row] = maskSharedMoney([sharedRow()], false);
  assert.equal(row.workValue, 0);
  assert.equal(row.totalCost, 0, "the fallback the screen reads must be gone too");
});

test("what is NOT money survives, because the reader is meant to see the project", () => {
  const [row] = maskSharedMoney([sharedRow()], false);
  assert.equal(row.name, "Ikoyi tower");
  assert.equal(row.itemCount, 412);
  assert.equal(row.moneyHidden, true);
});

test("the row still says whether the job is priced, as a state not an amount", () => {
  // Without this, masking totalCost would relabel a shared, fully priced job
  // "takeoff" in the gallery — the stage is read from whether there is money
  // on the bill, and that question survives the figure being withheld.
  const [priced] = maskSharedMoney([sharedRow()], false);
  assert.equal(priced.priced, true);

  const [unpriced] = maskSharedMoney(
    [sharedRow({ totalCost: 0, contractSum: 0 })],
    false,
  );
  assert.equal(unpriced.priced, false);
});

test("a contract sum alone counts as priced", () => {
  // A locked contract with no measured lines yet is still a priced job.
  const [row] = maskSharedMoney([sharedRow({ totalCost: 0 })], false);
  assert.equal(row.priced, true);
});

test("the reader's own rows are never touched", () => {
  const mine = { ...sharedRow(), shared: false };
  const [row] = maskSharedMoney([mine], false);
  assert.equal(row.totalCost, 184_000_000);
  assert.equal(row.moneyHidden, undefined);
  assert.equal(row.priced, undefined, "no substitute is needed when nothing is hidden");
});

test("a reader who may see rates gets the rows through untouched", () => {
  const rows = [sharedRow()];
  assert.equal(maskSharedMoney(rows, true), rows);
});

test("the per-product list masks the same three", () => {
  const [row] = maskSharedMoney([sharedRow()], false, PROJECT_LIST_MONEY_FIELDS);
  assert.equal(row.totalCost, 0);
  assert.equal(row.valuedAmount, 0);
  assert.equal(row.remainingAmount, 0);
  assert.equal(row.contractSum, 0);
});

test("both list shapes agree on the three, so one surface cannot lag the other", () => {
  for (const f of ["totalCost", "valuedAmount", "remainingAmount"]) {
    assert.ok(ROLLUP_MONEY_FIELDS.includes(f), `${f} missing from the rollup list`);
    assert.ok(PROJECT_LIST_MONEY_FIELDS.includes(f), `${f} missing from the project list`);
  }
});

test("a merged contract row masks only the two figures a container holds", () => {
  // The container has no bill of its own — its sources do — so the narrower
  // list is correct here and is pinned so a later edit does not widen it by
  // accident onto fields the row never carries.
  const row = { shared: true, certifiedToDate: 58_000_000, approvedVariationsTotal: 4_000_000 };
  const [out] = maskSharedMoney([row], false, MERGED_CONTRACT_MONEY_FIELDS);
  assert.equal(out.certifiedToDate, 0);
  assert.equal(out.approvedVariationsTotal, 0);
  assert.equal(out.moneyHidden, true);
});

test("a null row does not throw inside a response", () => {
  assert.deepEqual(maskSharedMoney([null], false), [null]);
});
