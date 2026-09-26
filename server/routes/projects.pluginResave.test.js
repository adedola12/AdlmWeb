// What a QUIV or HERON re-save does to a budget the QS has already worked on.
//
// saveProjectFull rebuilds budgetItems from the materials the plugin sends and
// assigns the result over whatever was there. The route needs a database and a
// signed-in user, so this drives the same composition the route performs, with
// the same helpers, on plain objects:
//
//     backfillBudgetLinks -> ensureBillItemCoverage
//       -> preserveBudgetUserEdits        <- the fix
//       -> deriveBillRatesFromBudget
//
// The last step is why this is a money bug and not a cosmetic one: the bill
// rate is derived from the budget immediately afterwards, so a budget rate the
// plugin overwrote drags the BILL back to the plugin's price.

import { test } from "node:test";
import assert from "node:assert/strict";
import { backfillBudgetLinks } from "../util/budgetBillLink.js";
import { ensureBillItemCoverage } from "../util/budgetCoverage.js";
import { deriveBillRatesFromBudget } from "../util/deriveBillRates.js";
import { preserveBudgetUserEdits } from "../util/budgetUserEdits.js";

const CODE = "A1";

/** One bill line, priced from its build-up. */
const billLine = () => ({
  code: CODE,
  description: "Concrete 1:2:4 in foundation",
  unit: "m3",
  qty: 100,
  rate: 0,
  sn: 12,
});

/** The budget as it stands after the QS has priced and bought. */
const qsBudget = () => [
  {
    sn: 1,
    billIdentity: CODE,
    materialName: "Cement",
    unit: "bag",
    componentKind: "Material",
    qty: 600,
    rate: 5000, // the QS typed this; the plugin thinks it is 4,000
    procured: true,
    procuredAt: new Date("2026-09-20T10:00:00Z"),
    procuredPercent: 60,
    supplier: "Dangote",
    targetDate: new Date("2026-10-05T00:00:00Z"),
  },
  {
    sn: 2,
    billIdentity: CODE,
    materialName: "Concrete hand",
    unit: "day",
    componentKind: "Labour",
    qty: 40,
    rate: 9000,
  },
];

/** What the plugin sends back on a re-sync: its own prices, no QS fields. */
const pluginMaterials = () => [
  {
    sn: 1,
    billIdentity: CODE,
    materialName: "Cement",
    unit: "bag",
    componentKind: "Material",
    qty: 600,
    rate: 4000,
  },
  {
    sn: 2,
    billIdentity: CODE,
    materialName: "Concrete hand",
    unit: "day",
    componentKind: "Labour",
    qty: 40,
    rate: 9000,
  },
];

/**
 * The route's sequence. `preserve` is the fix; turning it off reproduces
 * exactly what shipped before it.
 */
function resave({ preserve }) {
  const project = { items: [billLine()], budgetItems: qsBudget() };

  // Price the bill from the QS's build-up, as an open would have.
  deriveBillRatesFromBudget(project);
  const rateBefore = project.items[0].rate;

  const previousBudget = project.budgetItems;
  const incoming = pluginMaterials();
  backfillBudgetLinks(project.items, incoming);
  const fresh = ensureBillItemCoverage(project.items, incoming);
  const restored = preserve ? preserveBudgetUserEdits(previousBudget, fresh) : null;
  project.budgetItems = fresh;
  deriveBillRatesFromBudget(project);

  return { project, rateBefore, rateAfter: project.items[0].rate, restored };
}

test("a plugin re-save keeps the procurement the QS recorded", () => {
  const { project, restored } = resave({ preserve: true });
  const cement = project.budgetItems.find((b) => b.materialName === "Cement");

  assert.equal(cement.procured, true);
  assert.equal(cement.procuredPercent, 60);
  assert.equal(cement.supplier, "Dangote");
  assert.ok(cement.targetDate, "the buy-schedule slot survives too");
  assert.ok(restored.matched >= 1);
});

test("a plugin re-save does not drag the bill back to the plugin's price", () => {
  const { rateBefore, rateAfter } = resave({ preserve: true });

  // 600 × 5,000 + 40 × 9,000 = 3,360,000 over 100 m3
  assert.equal(rateBefore, 33600);
  assert.equal(rateAfter, rateBefore, "the QS's pricing is still what the bill says");
});

test("WITHOUT the preservation the bill silently loses ₦600,000 — this is the bug", () => {
  // Kept as a control so nobody can remove the preservation call and still
  // have a green suite. If this ever starts passing at rateBefore, the fix
  // has been undone.
  const { project, rateBefore, rateAfter } = resave({ preserve: false });

  assert.equal(rateBefore, 33600);
  assert.equal(rateAfter, 27600, "600 × 4,000 + 40 × 9,000 = 2,760,000 over 100 m3");
  assert.equal(
    (rateBefore - rateAfter) * 100,
    600000,
    "the difference on this one line, at its bill quantity",
  );

  const cement = project.budgetItems.find((b) => b.materialName === "Cement");
  // Not `=== false`: the plugin's row never carries the field at all, which is
  // precisely how the mark disappears without anything looking wrong.
  assert.ok(!cement.procured, "and the purchase record is gone with it");
});

test("the QS's own bill rate is still left alone, fix or no fix", () => {
  // deriveBillRatesFromBudget skips a line the QS priced himself
  // (rateLockedAt). The preservation must not change that contract.
  const project = {
    items: [{ ...billLine(), rate: 41000, rateLockedAt: new Date("2026-09-21T09:00:00Z") }],
    budgetItems: qsBudget(),
  };
  const incoming = pluginMaterials();
  backfillBudgetLinks(project.items, incoming);
  const fresh = ensureBillItemCoverage(project.items, incoming);
  preserveBudgetUserEdits(project.budgetItems, fresh);
  project.budgetItems = fresh;
  deriveBillRatesFromBudget(project);

  assert.equal(project.items[0].rate, 41000);
});
