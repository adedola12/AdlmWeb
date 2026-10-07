import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVariationStatus,
  isApprovedVariation,
  variationAmount,
  approvedVariationsTotal,
  approvedVariationsEarned,
  variationKpis,
} from "./variationStatus.js";
import { computeProjectScope } from "../services/pmCompute.js";

// The rows every existing project holds: no status field at all, because
// the field did not exist when they were written.
const legacyRows = [
  { description: "Extra windows", qty: 4, unit: "no", rate: 180_000 },
  { description: "Omit render", qty: 1, unit: "item", rate: -250_000 },
  {
    description: "Post-lock line",
    qty: 2,
    unit: "m2",
    rate: 45_000,
    source: "post-lock-new-item",
  },
];

// The old rule: every variation counted, full stop.
function oldTotal(list) {
  return list.reduce((a, v) => a + Number(v.qty) * Number(v.rate), 0);
}

test("a variation written before the status field existed still counts", () => {
  assert.equal(normalizeVariationStatus(undefined), "approved");
  assert.equal(normalizeVariationStatus(""), "approved");
  assert.equal(normalizeVariationStatus("nonsense"), "approved");
  assert.equal(isApprovedVariation({}), true);
  assert.equal(isApprovedVariation({ source: "post-lock-new-item" }), true);
});

test("no existing project's total moves: legacy rows total the same as before", () => {
  assert.equal(approvedVariationsTotal(legacyRows), oldTotal(legacyRows));
  assert.equal(approvedVariationsTotal(legacyRows), 560_000);
});

test("the three statuses read back as themselves", () => {
  assert.equal(normalizeVariationStatus("pending"), "pending");
  assert.equal(normalizeVariationStatus("REJECTED"), "rejected");
  assert.equal(normalizeVariationStatus(" approved "), "approved");
  assert.equal(isApprovedVariation({ status: "pending" }), false);
  assert.equal(isApprovedVariation({ status: "rejected" }), false);
});

test("a pending or rejected variation moves no money", () => {
  const rows = [
    ...legacyRows,
    { description: "Waiting", qty: 1, unit: "item", rate: 9_000_000, status: "pending" },
    { description: "Turned down", qty: 1, unit: "item", rate: 4_000_000, status: "rejected" },
  ];
  assert.equal(approvedVariationsTotal(rows), 560_000);
});

test("earned counts only what is approved AND executed on site", () => {
  const rows = [
    { qty: 1, unit: "item", rate: 100, completed: true }, // legacy, done
    { qty: 1, unit: "item", rate: 200, completed: false }, // legacy, not done
    { qty: 1, unit: "item", rate: 400, completed: true, status: "pending" },
    { qty: 1, unit: "item", rate: 800, completed: true, status: "approved" },
  ];
  assert.equal(approvedVariationsTotal(rows), 1100);
  assert.equal(approvedVariationsEarned(rows), 900);
});

test("a row with unusable numbers is worth nothing, not NaN", () => {
  assert.equal(variationAmount({ qty: "x", rate: 10 }), 0);
  assert.equal(variationAmount({ qty: 2, rate: null }), 0);
  assert.equal(approvedVariationsTotal(null), 0);
  assert.equal(approvedVariationsTotal([{ qty: "x", rate: "y" }]), 0);
});

test("the KPI row splits additions, omissions and what is waiting", () => {
  const k = variationKpis([
    { qty: 1, unit: "item", rate: 500_000 }, // legacy addition
    { qty: 1, unit: "item", rate: -120_000, status: "approved" },
    { qty: 1, unit: "item", rate: 300_000, status: "pending" },
    { qty: 1, unit: "item", rate: -50_000, status: "pending" },
    { qty: 1, unit: "item", rate: 700_000, status: "rejected" },
  ]);
  assert.equal(k.additions, 500_000);
  assert.equal(k.additionsCount, 1);
  assert.equal(k.omissions, -120_000);
  assert.equal(k.omissionsCount, 1);
  assert.equal(k.approvedNet, 380_000);
  assert.equal(k.pendingCount, 2);
  assert.equal(k.pendingNet, 250_000);
  assert.equal(k.rejectedCount, 1);
});

test("the PM scope puts a pending variation in neither the BAC nor the earned value", () => {
  const base = {
    productKey: "revit",
    items: [{ sn: 1, code: "A1", description: "Concrete", qty: 10, rate: 1000, percentComplete: 100, completed: true }],
    provisionalSums: [],
    preliminaryItems: [],
    contract: { preliminaryPercent: 0 },
  };
  const before = computeProjectScope({ ...base, variations: legacyRows });
  const after = computeProjectScope({
    ...base,
    variations: [
      ...legacyRows,
      { description: "Waiting", qty: 1, unit: "item", rate: 9_000_000, status: "pending", completed: true },
    ],
  });
  // The pending row is worth 9m and is ticked as executed: if it leaked into
  // either figure the totals would move. They must not.
  assert.equal(after.projectTotal, before.projectTotal);
  assert.equal(after.totalEarned, before.totalEarned);
  assert.equal(after.variations.total, before.variations.total);
  // …and it is not a virtual item a task could link to either.
  assert.equal(
    after.virtualItems.filter((v) => v.kind === "variation").length,
    before.virtualItems.filter((v) => v.kind === "variation").length,
  );
});
