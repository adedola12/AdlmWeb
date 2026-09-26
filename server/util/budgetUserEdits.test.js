import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectBudgetEdits,
  reapplyBudgetEdits,
  preserveBudgetUserEdits,
} from "./budgetUserEdits.js";

/** A budget row as the plugin re-sends it: derived fields only, no QS work. */
const rebuilt = (over = {}) => ({
  sn: 1,
  billIdentity: "A1",
  materialName: "Cement",
  unit: "bag",
  componentKind: "Material",
  qty: 100,
  rate: 4000,
  procured: false,
  procuredAt: null,
  procuredPercent: 0,
  targetDate: null,
  supplier: "",
  notes: "",
  overheadPercent: 0,
  profitPercent: 0,
  ...over,
});

/** The same row after the QS has worked on it. */
const edited = (over = {}) =>
  rebuilt({
    procured: true,
    procuredAt: new Date("2026-09-20T10:00:00Z"),
    procuredPercent: 60,
    targetDate: new Date("2026-10-05T00:00:00Z"),
    supplier: "Dangote",
    notes: "Collected from Ibadan depot",
    rate: 5000,
    overheadPercent: 7,
    profitPercent: 12,
    ...over,
  });

test("a plugin re-save no longer destroys what the QS bought and priced", () => {
  // The bug, in one assertion: this is saveProjectFull replacing budgetItems
  // with the plugin's own list. Before the fix every field below was lost.
  const fresh = [rebuilt()];
  const out = preserveBudgetUserEdits([edited()], fresh);

  assert.equal(fresh[0].procured, true);
  assert.equal(fresh[0].procuredPercent, 60);
  assert.equal(fresh[0].supplier, "Dangote");
  assert.equal(fresh[0].notes, "Collected from Ibadan depot");
  assert.equal(Number(fresh[0].rate), 5000, "the typed rate outranks the plugin's");
  assert.equal(fresh[0].overheadPercent, 7);
  assert.equal(fresh[0].profitPercent, 12);
  assert.deepEqual(out, { matched: 1, procurement: 2, pricing: 1 });
});

test("the typed rate surviving is what stops the BILL reverting", () => {
  // deriveBillRatesFromBudget runs immediately after the replace, so a lost
  // budget rate does not just blank a cell — it moves the bill back to the
  // plugin's price behind the QS.
  const fresh = [rebuilt({ rate: 4000 })];
  preserveBudgetUserEdits([edited({ rate: 5000 })], fresh);
  assert.equal(Number(fresh[0].rate), 5000);
});

test("re-sequencing does not move one QS's marks onto another line", () => {
  // The hazard that rules out keying on sn alone: the plugin inserts an item,
  // so every sn after it shifts by one. Keyed on sn, row 2's procurement
  // would land on row 3 — the wrong material marked bought.
  const previous = [
    edited({ sn: 1, billIdentity: "A1", materialName: "Cement" }),
    rebuilt({ sn: 2, billIdentity: "A2", materialName: "Sand" }),
  ];
  const fresh = [
    rebuilt({ sn: 1, billIdentity: "A0", materialName: "Hardcore" }),
    rebuilt({ sn: 2, billIdentity: "A1", materialName: "Cement" }),
    rebuilt({ sn: 3, billIdentity: "A2", materialName: "Sand" }),
  ];
  preserveBudgetUserEdits(previous, fresh);

  assert.equal(fresh[0].procured, false, "Hardcore was never bought");
  assert.equal(fresh[1].procured, true, "Cement keeps its own mark");
  assert.equal(Number(fresh[1].rate), 5000);
  assert.equal(fresh[2].procured, false);
});

test("a legacy row with no billIdentity still matches, on sn", () => {
  // Rows written before billIdentity was backfilled. Dropping the sn key
  // would have quietly stopped restoring edits on the oldest projects.
  const previous = [edited({ billIdentity: "" })];
  const fresh = [rebuilt({ billIdentity: "" })];
  const out = preserveBudgetUserEdits(previous, fresh);
  assert.equal(out.matched, 1);
  assert.equal(fresh[0].procured, true);
});

test("re-classing a row to Plant does not carry the old line's money across", () => {
  // componentKind is part of every merge key in this codebase for exactly
  // this reason — see docs/PLANT-IN-BUDGET.md.
  const previous = [edited({ componentKind: "Labour" })];
  const fresh = [rebuilt({ componentKind: "Plant" })];
  const out = preserveBudgetUserEdits(previous, fresh);
  assert.equal(out.matched, 0);
  assert.equal(fresh[0].procured, false);
  assert.equal(Number(fresh[0].rate), 4000);
});

test("nothing the QS did not set is written", () => {
  // A rebuild that got the row right must not be un-bought or zeroed by an
  // untouched previous row.
  const fresh = [rebuilt({ rate: 4200, procured: true, supplier: "BUA" })];
  const out = preserveBudgetUserEdits([rebuilt({ rate: 0 })], fresh);
  assert.equal(Number(fresh[0].rate), 4200, "a zero previous rate is not restored over a real one");
  assert.equal(fresh[0].procured, true);
  assert.equal(fresh[0].supplier, "BUA");
  assert.equal(out.pricing, 0);
});

test("an existing note is not overwritten by the old one", () => {
  const fresh = [rebuilt({ notes: "New note from the plugin" })];
  preserveBudgetUserEdits([edited()], fresh);
  assert.equal(fresh[0].notes, "New note from the plugin");
});

test("duplicate keys take the first row rather than silently the last", () => {
  const previous = [
    edited({ rate: 5000 }),
    edited({ rate: 9999, procuredPercent: 10 }),
  ];
  const fresh = [rebuilt()];
  preserveBudgetUserEdits(previous, fresh);
  assert.equal(Number(fresh[0].rate), 5000);
  assert.equal(fresh[0].procuredPercent, 60);
});

test("the collect/reapply pair can be reused across two rebuilds", () => {
  // The GET heal collects before it rebuilds, so the two halves are exposed
  // separately; this is that shape.
  const edits = collectBudgetEdits([edited()]);
  const first = [rebuilt()];
  const second = [rebuilt()];
  reapplyBudgetEdits(first, edits);
  reapplyBudgetEdits(second, edits);
  assert.equal(first[0].procured, true);
  assert.equal(second[0].procured, true);
});

test("empty and malformed input is survivable, because this runs inside a save", () => {
  assert.deepEqual(preserveBudgetUserEdits([], []), { matched: 0, procurement: 0, pricing: 0 });
  assert.deepEqual(preserveBudgetUserEdits(null, null), { matched: 0, procurement: 0, pricing: 0 });
  assert.deepEqual(preserveBudgetUserEdits([null, undefined], [null]), {
    matched: 0,
    procurement: 0,
    pricing: 0,
  });
});
