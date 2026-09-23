// Unit tests for the rate-mask write guard.
//
// The hazard these exist for: a collaborator without RateGen reads a project
// with every rate and amount zeroed, the web editor initialises its state from
// that payload, and saving anything at all — a progress tick, a quantity, a
// note — sent the zeros back. The PUT replaced items / provisionalSums /
// variations / preliminaryItems wholesale, so one save by a site engineer
// wiped the pricing off the project owner's bill.
//
// A second rule rides with it: a masked caller cannot DELETE a row either.
// Removing a priced line destroys its money just as surely as zeroing the rate
// would, and they cannot see what they are removing.
//
// guardMaskedWrite() is what stands between the masked payload and the write.

import test from "node:test";
import assert from "node:assert/strict";

import { guardMaskedWrite, itemIdentity, MONEY_FIELDS } from "./rateMaskGuard.js";

// The guard returns { body, restored }; most tests only care about the body.
const guard = (stored, body) => guardMaskedWrite(stored, body).body;

// A stored project, priced. Mirrors the shape sanitizeItems() persists.
function storedProject() {
  return {
    items: [
      {
        sn: 1,
        code: "BQ-1",
        description: "Reinforced concrete grade 25 in columns",
        unit: "m3",
        qty: 32,
        rate: 65_000,
        actualRate: 66_500,
        netUnitCost: 52_000,
        overheadPercent: 8,
        profitPercent: 12,
        percentComplete: 0,
        completed: false,
        category: "111: Insitu Concrete Works",
      },
      {
        sn: 2,
        code: "BQ-2",
        description: "Remove existing roof covering and cart away",
        unit: "Item",
        qty: 1,
        rate: 250_000,
        actualRate: null,
        netUnitCost: null,
        overheadPercent: null,
        profitPercent: null,
        percentComplete: 0,
        completed: false,
        category: "Demolition And Alteration",
      },
    ],
    budgetItems: [
      {
        sn: 1,
        billIdentity: "BQ-1",
        componentKind: "Material",
        materialName: "Cement (50kg)",
        description: "Cement (50kg)",
        unit: "bags",
        qty: 224,
        rate: 9_500,
        netUnitCost: 9_500,
        budgetRate: 9_500,
        overheadPercent: 8,
        profitPercent: 12,
        procured: false,
        procuredPercent: 0,
      },
      {
        sn: 2,
        billIdentity: "BQ-1",
        componentKind: "Labour",
        materialName: "Carpenter",
        description: "Carpenter",
        unit: "m2",
        qty: 180,
        rate: 1_200,
        netUnitCost: 1_200,
        budgetRate: 1_200,
        overheadPercent: 8,
        profitPercent: 12,
        procured: false,
        procuredPercent: 0,
      },
    ],
    provisionalSums: [
      { description: "Piling by specialist", amount: 4_500_000, completed: false },
      { description: "Lift installation", amount: 12_000_000, completed: false },
    ],
    variations: [
      {
        description: "Extra blockwork to rear",
        qty: 40,
        unit: "m2",
        rate: 7_500,
        reference: "VO-01",
      },
    ],
    preliminaryItems: [
      { name: "Site accommodation", allocation: 10, actualAmount: 850_000, completed: false },
      { name: "Insurances", allocation: 5, actualAmount: 300_000, completed: false },
    ],
  };
}

// What maskRates() serves that collaborator, and therefore what the editor
// echoes back on save.
function maskedEcho(stored) {
  return {
    items: stored.items.map((it) => ({
      ...it,
      rate: 0,
      actualRate: null,
      netUnitCost: null,
      overheadPercent: null,
      profitPercent: null,
    })),
    budgetItems: stored.budgetItems.map((b) => ({
      ...b,
      rate: 0,
      netUnitCost: 0,
      budgetRate: 0,
      overheadPercent: 0,
      profitPercent: 0,
    })),
    provisionalSums: stored.provisionalSums.map((p) => ({ ...p, amount: 0 })),
    variations: stored.variations.map((v) => ({ ...v, rate: 0 })),
    preliminaryItems: stored.preliminaryItems.map((p) => ({ ...p, actualAmount: 0 })),
  };
}

test("a masked echo cannot zero a single stored rate or amount", () => {
  const stored = storedProject();
  const guarded = guard(stored, maskedEcho(stored));

  assert.deepEqual(
    guarded.items.map((i) => i.rate),
    [65_000, 250_000],
  );
  assert.equal(guarded.items[0].actualRate, 66_500);
  assert.equal(guarded.items[0].netUnitCost, 52_000);
  assert.equal(guarded.items[0].overheadPercent, 8);
  assert.equal(guarded.items[0].profitPercent, 12);

  assert.deepEqual(
    guarded.budgetItems.map((b) => [b.rate, b.netUnitCost, b.budgetRate]),
    [
      [9_500, 9_500, 9_500],
      [1_200, 1_200, 1_200],
    ],
  );
  assert.deepEqual(
    guarded.provisionalSums.map((p) => p.amount),
    [4_500_000, 12_000_000],
  );
  assert.equal(guarded.variations[0].rate, 7_500);
  assert.deepEqual(
    guarded.preliminaryItems.map((p) => p.actualAmount),
    [850_000, 300_000],
  );
});

test("the edits the masked save was actually for still go through", () => {
  const stored = storedProject();
  const echo = maskedEcho(stored);

  // A site engineer marks progress, re-measures a line, reclassifies another,
  // marks a material procured and annotates a preliminary.
  echo.items[0].percentComplete = 45;
  echo.items[0].actualQty = 30;
  echo.items[1].completed = true;
  echo.items[1].category = "Demolition";
  echo.budgetItems[0].procured = true;
  echo.budgetItems[0].procuredPercent = 100;
  echo.budgetItems[0].supplier = "Dangote";
  echo.provisionalSums[0].completed = true;
  echo.preliminaryItems[0].notes = "Cabin delivered 12 Sep";

  const guarded = guard(stored, echo);

  assert.equal(guarded.items[0].percentComplete, 45);
  assert.equal(guarded.items[0].actualQty, 30);
  assert.equal(guarded.items[1].completed, true);
  assert.equal(guarded.items[1].category, "Demolition");
  assert.equal(guarded.budgetItems[0].procured, true);
  assert.equal(guarded.budgetItems[0].procuredPercent, 100);
  assert.equal(guarded.budgetItems[0].supplier, "Dangote");
  assert.equal(guarded.provisionalSums[0].completed, true);
  assert.equal(guarded.preliminaryItems[0].notes, "Cabin delivered 12 Sep");

  // …and the money still did not move.
  assert.equal(guarded.items[0].rate, 65_000);
  assert.equal(guarded.budgetItems[0].rate, 9_500);
  assert.equal(guarded.provisionalSums[0].amount, 4_500_000);
});

test("a masked caller cannot price a line it has just added", () => {
  const stored = storedProject();
  const echo = maskedEcho(stored);
  echo.items.push({
    sn: 3,
    code: "BQ-9",
    description: "Invented line",
    unit: "m2",
    qty: 10,
    rate: 999_999,
    netUnitCost: 900_000,
  });
  echo.provisionalSums.push({ description: "Invented sum", amount: 50_000_000 });
  echo.variations.push({ description: "Invented VO", qty: 1, unit: "Item", rate: 80_000 });

  const guarded = guard(stored, echo);

  // The line survives — a full collaborator may add scope — but unpriced.
  assert.equal(guarded.items[2].description, "Invented line");
  assert.equal(guarded.items[2].qty, 10);
  assert.equal(guarded.items[2].rate, 0);
  assert.equal(guarded.items[2].netUnitCost, null);
  assert.equal(guarded.provisionalSums[2].amount, 0);
  assert.equal(guarded.variations[1].rate, 0);
});

test("re-wording a line does not cost it its rate — the bill code carries it", () => {
  const stored = storedProject();
  const echo = maskedEcho(stored);
  echo.items[0].description = "Reinforced concrete grade 25 in columns (revised)";

  const guarded = guard(stored, echo);
  assert.equal(guarded.items[0].rate, 65_000, "the bill code should have matched it home");
  assert.equal(
    guarded.items[0].description,
    "Reinforced concrete grade 25 in columns (revised)",
  );
});

test("lines sharing an identity pair up in order, not all onto the first rate", () => {
  const stored = {
    items: [
      { sn: 1, code: "", description: "Sundries", unit: "Item", qty: 1, rate: 10_000 },
      { sn: 1, code: "", description: "Sundries", unit: "Item", qty: 1, rate: 20_000 },
      { sn: 1, code: "", description: "Sundries", unit: "Item", qty: 1, rate: 30_000 },
    ],
  };
  const echo = { items: stored.items.map((i) => ({ ...i, rate: 0 })) };

  const guarded = guard(stored, echo);
  assert.deepEqual(
    guarded.items.map((i) => i.rate),
    [10_000, 20_000, 30_000],
  );
});

test("a money-only row the masked client could not render is carried, not lost", () => {
  // sanitizeProvisionalSums keeps a row with an amount and no description.
  // Masked it becomes blank-and-zero, and the client drops it on the way back,
  // so nothing in the payload accounts for it. Rule 2 covers it like any other
  // dropped row.
  const stored = {
    provisionalSums: [
      { description: "Piling by specialist", amount: 4_500_000 },
      { description: "", amount: 900_000 },
    ],
  };
  const guarded = guard(stored, {
    provisionalSums: [{ description: "Piling by specialist", amount: 0 }],
  });

  assert.equal(guarded.provisionalSums.length, 2);
  assert.equal(guarded.provisionalSums[0].amount, 4_500_000);
  assert.equal(guarded.provisionalSums[1].amount, 900_000);
});

test("a row the masked caller dropped is put back, with its money", () => {
  const stored = storedProject();
  const guarded = guard(stored, {
    provisionalSums: [{ description: "Piling by specialist", amount: 0 }],
  });
  // "Lift installation" was dropped from the payload. It is worth ₦12m, and
  // the caller could not see that, so the deletion is not theirs to make.
  assert.equal(guarded.provisionalSums.length, 2);
  assert.deepEqual(
    guarded.provisionalSums.map((p) => [p.description, p.amount]),
    [
      ["Piling by specialist", 4_500_000],
      ["Lift installation", 12_000_000],
    ],
  );
});

test("a row removed from the middle of a bill goes back in the middle", () => {
  const stored = {
    items: [
      { sn: 1, code: "A", description: "First", unit: "m", qty: 1, rate: 100 },
      { sn: 2, code: "B", description: "Second", unit: "m", qty: 1, rate: 200 },
      { sn: 3, code: "C", description: "Third", unit: "m", qty: 1, rate: 300 },
    ],
  };
  const guarded = guard(stored, {
    items: [
      { sn: 1, code: "A", description: "First", unit: "m", qty: 1, rate: 0 },
      { sn: 3, code: "C", description: "Third", unit: "m", qty: 1, rate: 0 },
    ],
  });

  assert.deepEqual(
    guarded.items.map((i) => [i.code, i.rate]),
    [
      ["A", 100],
      ["B", 200],
      ["C", 300],
    ],
    "the restored row should not be orphaned at the end",
  );
});

test("clearing a whole array restores every row of it", () => {
  const stored = storedProject();
  const guarded = guard(stored, {
    items: [],
    provisionalSums: [],
    variations: [],
    preliminaryItems: [],
    budgetItems: [],
  });

  assert.equal(guarded.items.length, stored.items.length);
  assert.equal(guarded.budgetItems.length, stored.budgetItems.length);
  assert.deepEqual(
    guarded.provisionalSums.map((p) => p.amount),
    [4_500_000, 12_000_000],
  );
  assert.deepEqual(guarded.variations.map((v) => v.rate), [7_500]);
  assert.deepEqual(
    guarded.preliminaryItems.map((p) => p.actualAmount),
    [850_000, 300_000],
  );
});

test("the guard reports what it put back, so the user can be told", () => {
  const stored = storedProject();
  const { restored } = guardMaskedWrite(stored, {
    items: [],
    provisionalSums: [{ description: "Piling by specialist", amount: 0 }],
  });

  assert.deepEqual(restored, { items: 2, provisionalSums: 1 });

  // Nothing put back means nothing to report.
  const clean = guardMaskedWrite(stored, {
    provisionalSums: stored.provisionalSums.map((p) => ({ ...p, amount: 0 })),
  });
  assert.deepEqual(clean.restored, {});
});

test("adding and editing still work — only removal is blocked", () => {
  const stored = storedProject();
  const echo = maskedEcho(stored);
  echo.provisionalSums[0].description = "Piling by specialist";
  echo.provisionalSums.push({ description: "New allowance", amount: 0 });
  echo.items[0].qty = 40;
  echo.items[0].percentComplete = 25;

  const guarded = guard(stored, echo);

  assert.equal(guarded.provisionalSums.length, 3, "the new row should be kept");
  assert.equal(guarded.provisionalSums[2].description, "New allowance");
  assert.equal(guarded.items[0].qty, 40, "a re-measure should stand");
  assert.equal(guarded.items[0].percentComplete, 25);
  assert.equal(guarded.items[0].rate, 65_000);
});

test("arrays the payload omits are left alone, and the caller's body is not mutated", () => {
  const stored = storedProject();
  const body = { name: "Renamed", items: maskedEcho(stored).items };
  const snapshot = JSON.parse(JSON.stringify(body));

  const guarded = guard(stored, body);

  assert.equal(guarded.name, "Renamed");
  assert.equal(guarded.budgetItems, undefined, "an untouched array must stay untouched");
  assert.equal(guarded.provisionalSums, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), snapshot, "the caller's body was mutated");
});

test("a project with nothing stored yet does not throw", () => {
  const guarded = guard(
    {},
    { items: [{ sn: 1, code: "A", description: "x", qty: 1, rate: 500 }] },
  );
  assert.equal(guarded.items[0].rate, 0);
  assert.doesNotThrow(() => guardMaskedWrite(null, {}));
  assert.doesNotThrow(() => guardMaskedWrite(undefined, undefined));
});

test("itemIdentity is built only from fields the masking leaves alone", () => {
  const priced = {
    sn: 1,
    code: "BQ-1",
    description: "Concrete",
    takeoffLine: "",
    materialName: "",
    unit: "m3",
    rate: 65_000,
  };
  const masked = { ...priced, rate: 0, actualRate: null, netUnitCost: null };
  assert.equal(itemIdentity(priced, 0), itemIdentity(masked, 0));
});

test("the guarded field list still matches what the masking blanks", () => {
  // If maskRates() learns to blank a new field, this is the reminder to teach
  // the guard about it too.
  assert.deepEqual(MONEY_FIELDS.items, [
    "rate",
    "actualRate",
    "netUnitCost",
    "overheadPercent",
    "profitPercent",
  ]);
  assert.deepEqual(MONEY_FIELDS.budgetItems, [
    "rate",
    "netUnitCost",
    "overheadPercent",
    "profitPercent",
    "budgetRate",
  ]);
  assert.deepEqual(MONEY_FIELDS.provisionalSums, ["amount"]);
  assert.deepEqual(MONEY_FIELDS.variations, ["rate"]);
  assert.deepEqual(MONEY_FIELDS.preliminaryItems, ["actualAmount"]);
  assert.deepEqual(MONEY_FIELDS.materialItems, MONEY_FIELDS.items);
});
