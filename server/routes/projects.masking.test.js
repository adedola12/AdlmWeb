// A save from a viewer who cannot see rates must not be able to move money.
//
// projectForClient() runs a collaborator without RateGen through maskRates(),
// which zeroes every rate on the payload. Nothing on the write side undid
// that: the client sent the masked document straight back and the server wrote
// those zeros over the owner's priced bill. These tests pin the other half of
// the contract — guardMaskedWrite() restores the stored money onto the
// incoming rows before anything is read, so the viewer's quantities,
// descriptions, units, order, ticks and notes still save while not one figure
// moves. maskRates() and MASKED_MONEY_BLANKS are mirror images; if a money
// field joins one and not the other, these tests are what notices.

import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const {
  preserveMaskedMoney,
  guardMaskedWrite,
  MASKED_MONEY_ARRAYS,
  sanitizeVariations,
  sanitizeProvisionalSums,
} = await import("./projects.js");

const MASKED = { role: "full", canEdit: true, canManage: false, canSeeRates: false };
const OWNER = { role: "owner", canEdit: true, canManage: true, canSeeRates: true };

// What maskRates() does to each array, so a test payload is built the same way
// the real client receives it.
const BLANK = {
  items: { rate: 0, actualRate: null, netUnitCost: null, overheadPercent: null, profitPercent: null },
  materialItems: { rate: 0, actualRate: null, netUnitCost: null, overheadPercent: null, profitPercent: null },
  budgetItems: { rate: 0, netUnitCost: 0, overheadPercent: 0, profitPercent: 0, budgetRate: 0 },
  provisionalSums: { amount: 0 },
  preliminaryItems: { actualAmount: 0 },
  variations: { rate: 0 },
};

function masked(kind, rows) {
  return rows.map((r) => ({ ...r, ...BLANK[kind] }));
}

/* ── the bug itself ─────────────────────────────────────────────────────── */

test("the masked payload really is destructive — the sanitizers write its zeros", () => {
  // This is what the save did before the guard existed, and still does to any
  // array that skips it: the sanitizer that replaces the stored array takes
  // the masked figures at face value. Nothing here is asserted about the fix;
  // it is the reason the fix has to sit in FRONT of these functions.
  const [sum] = sanitizeProvisionalSums([
    { description: "Lift installation", amount: 0, kind: "pc" },
  ]);
  assert.equal(sum.amount, 0);
  const [vo] = sanitizeVariations([
    { description: "Extra soakaway", reference: "VO-01", qty: 1, unit: "item", rate: 0 },
  ]);
  assert.equal(vo.rate, 0);
});

/* ── items ─────────────────────────────────────────────────────────────── */

const STORED_ITEMS = [
  {
    sn: 1, code: "A1", description: "Excavate trenches", unit: "m3", qty: 100,
    rate: 5000, actualRate: 5200, netUnitCost: 4000, overheadPercent: 10,
    profitPercent: 15, completed: false, percentComplete: 0,
  },
  {
    sn: 2, code: "A2", description: "Concrete 1:2:4", unit: "m3", qty: 50,
    rate: 180000, actualRate: null, netUnitCost: 150000, overheadPercent: 10,
    profitPercent: 10, completed: false, percentComplete: 0,
  },
];

test("a masked viewer's save leaves every protected money field at the stored value", () => {
  const incoming = masked("items", STORED_ITEMS);
  // The work they ARE allowed to do: a quantity, a description and a tick.
  incoming[0].qty = 137;
  incoming[0].description = "Excavate trenches (re-measured)";
  incoming[1].completed = true;
  incoming[1].percentComplete = 100;

  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);

  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[0].actualRate, 5200);
  assert.equal(body.items[0].netUnitCost, 4000);
  assert.equal(body.items[0].overheadPercent, 10);
  assert.equal(body.items[0].profitPercent, 15);
  assert.equal(body.items[1].rate, 180000);
  assert.equal(body.items[1].netUnitCost, 150000);

  // ...and their work still saves.
  assert.equal(body.items[0].qty, 137);
  assert.equal(body.items[0].description, "Excavate trenches (re-measured)");
  assert.equal(body.items[1].completed, true);
  assert.equal(body.items[1].percentComplete, 100);
});

test("a masked viewer re-ordering the bill does not swap the rates over", () => {
  // Dragged the second line above the first, and the client renumbered sn.
  const incoming = masked("items", [
    { ...STORED_ITEMS[1], sn: 1 },
    { ...STORED_ITEMS[0], sn: 2 },
  ]);

  const { body } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body.items[0].code, "A2");
  assert.equal(body.items[0].rate, 180000);
  assert.equal(body.items[1].code, "A1");
  assert.equal(body.items[1].rate, 5000);
});

test("a line a masked viewer adds carries no money at all", () => {
  const incoming = masked("items", STORED_ITEMS).concat([
    // A hand-crafted request could put any figure here; it must not stick.
    { sn: 3, code: "A3", description: "Hardcore filling", unit: "m2", qty: 20, rate: 999999 },
  ]);

  const { body } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body.items[2].rate, 0);
  assert.equal(body.items[2].actualRate, null);
  assert.equal(body.items[2].qty, 20);
  // The two real lines are untouched.
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].rate, 180000);
});

test("a masked viewer cannot raise a rate by hand either", () => {
  const incoming = masked("items", STORED_ITEMS);
  incoming[0].rate = 50000;
  incoming[0].profitPercent = 80;

  const { body } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[0].profitPercent, 15);
});

/* ── the owner is untouched ─────────────────────────────────────────────── */

test("an owner's save still writes rates normally, including a deliberate zero", () => {
  const incoming = [
    { ...STORED_ITEMS[0], rate: 7250, actualRate: 7300, netUnitCost: 6000 },
    // Deliberately unpricing a line: 0 must be written, not treated as masked.
    { ...STORED_ITEMS[1], rate: 0, netUnitCost: 0, overheadPercent: 0, profitPercent: 0 },
  ];
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: OWNER,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 7250);
  assert.equal(body.items[0].actualRate, 7300);
  assert.equal(body.items[1].rate, 0);
  assert.equal(body.items[1].netUnitCost, 0);
});

test("with no access object at all the body is passed through (owner-served paths)", () => {
  const incoming = [{ ...STORED_ITEMS[0], rate: 4242 }];
  const { body } = guardMaskedWrite({ project: { items: STORED_ITEMS }, body: { items: incoming } });
  assert.equal(body.items[0].rate, 4242);
});

/* ── every other money array ────────────────────────────────────────────── */

test("budgetItems keep their rate, net cost, O&P and budget rate", () => {
  const stored = [
    {
      billIdentity: "A1", componentKind: "Material", description: "Cement", unit: "bag",
      qty: 40, rate: 9500, netUnitCost: 9500, overheadPercent: 10, profitPercent: 15,
      budgetRate: 9500, procured: false, procuredPercent: 0,
    },
    {
      billIdentity: "A1", componentKind: "Labour", description: "Mason", unit: "hr",
      qty: 16, rate: 2500, netUnitCost: 2500, overheadPercent: 10, profitPercent: 15,
      budgetRate: 2500, procured: false, procuredPercent: 0,
    },
  ];
  const incoming = masked("budgetItems", stored);
  incoming[0].procured = true;          // the procurement mark they came to make
  incoming[1].qty = 24;
  incoming[1].notes = "night shift";

  const { body } = guardMaskedWrite({
    project: { budgetItems: stored },
    access: MASKED,
    body: { budgetItems: incoming },
  });
  assert.equal(body.budgetItems[0].rate, 9500);
  assert.equal(body.budgetItems[0].netUnitCost, 9500);
  assert.equal(body.budgetItems[0].budgetRate, 9500);
  assert.equal(body.budgetItems[0].overheadPercent, 10);
  assert.equal(body.budgetItems[0].profitPercent, 15);
  assert.equal(body.budgetItems[1].rate, 2500);
  assert.equal(body.budgetItems[0].procured, true);
  assert.equal(body.budgetItems[1].qty, 24);
  assert.equal(body.budgetItems[1].notes, "night shift");
});

test("materialItems keep their rate and build-up", () => {
  const stored = [
    {
      sn: 1, code: "A1", description: "Cement", materialName: "Cement", unit: "bag",
      qty: 40, rate: 9500, actualRate: 9800, netUnitCost: 8000,
      overheadPercent: 10, profitPercent: 15,
    },
  ];
  const incoming = masked("materialItems", stored);
  incoming[0].qty = 44;

  const { body } = guardMaskedWrite({
    project: { materialItems: stored },
    access: MASKED,
    body: { materialItems: incoming },
  });
  assert.equal(body.materialItems[0].rate, 9500);
  assert.equal(body.materialItems[0].actualRate, 9800);
  assert.equal(body.materialItems[0].netUnitCost, 8000);
  assert.equal(body.materialItems[0].qty, 44);
});

test("provisional sums keep their amount", () => {
  const stored = [
    { description: "Lift installation", amount: 5_000_000, kind: "pc", completed: false },
    { description: "Statutory fees", amount: 750_000, kind: "provisional", completed: false },
  ];
  const incoming = masked("provisionalSums", stored);
  incoming[1].completed = true;

  const { body } = guardMaskedWrite({
    project: { provisionalSums: stored },
    access: MASKED,
    body: { provisionalSums: incoming },
  });
  assert.equal(body.provisionalSums[0].amount, 5_000_000);
  assert.equal(body.provisionalSums[1].amount, 750_000);
  assert.equal(body.provisionalSums[1].completed, true);
});

test("variations keep their rate", () => {
  const stored = [
    { description: "Extra soakaway", reference: "VO-01", unit: "item", qty: 1, rate: 1_250_000, status: "approved" },
    { description: "Omit render", reference: "VO-02", unit: "item", qty: 1, rate: -300_000, status: "pending" },
  ];
  const incoming = masked("variations", stored);
  incoming[0].completed = true;

  const { body } = guardMaskedWrite({
    project: { variations: stored },
    access: MASKED,
    body: { variations: incoming },
  });
  assert.equal(body.variations[0].rate, 1_250_000);
  assert.equal(body.variations[1].rate, -300_000);
  assert.equal(body.variations[0].completed, true);
});

test("preliminary items keep the spend recorded against them", () => {
  const stored = [
    { name: "Site security", allocation: 10, actualAmount: 480_000, completed: false },
    { name: "Insurances", allocation: 5, actualAmount: 1_100_000, completed: false },
  ];
  const incoming = masked("preliminaryItems", stored);
  incoming[0].completed = true;
  incoming[0].notes = "guards demobilised";

  const { body } = guardMaskedWrite({
    project: { preliminaryItems: stored },
    access: MASKED,
    body: { preliminaryItems: incoming },
  });
  assert.equal(body.preliminaryItems[0].actualAmount, 480_000);
  assert.equal(body.preliminaryItems[1].actualAmount, 1_100_000);
  assert.equal(body.preliminaryItems[0].completed, true);
  assert.equal(body.preliminaryItems[0].notes, "guards demobilised");
});

/* ── refusals ───────────────────────────────────────────────────────────── */

test("a save that cannot be paired back to the stored rows is refused, not guessed", () => {
  // Deleted one line AND renamed another in the same save: two stored rows are
  // left over against one incoming row, so which rate belongs to the renamed
  // line is a guess. Refuse loudly instead.
  const incoming = masked("items", [
    { ...STORED_ITEMS[1], description: "Concrete 1:2:4 (revised mix)" },
  ]);
  const { error, body } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body, undefined);
  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_UNSAFE_MERGE");
  assert.equal(error.body.details.array, "items");
});

test("deleting a line is not a refusal — the rows that remain keep their rates", () => {
  const incoming = masked("items", [STORED_ITEMS[1]]);
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].rate, 180000);
});

test("a description edited on a line that also moved still finds its own rate", () => {
  // Equal leftovers on both sides, but not at the same index: pass 3 pairs
  // them in order, which is the only pairing that keeps them in sequence.
  const incoming = masked("items", [
    { ...STORED_ITEMS[1] },
    { ...STORED_ITEMS[0], description: "Excavate trenches n.e. 1.5m deep" },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].code, "A2");
  assert.equal(body.items[0].rate, 180000);
  assert.equal(body.items[1].code, "A1");
  assert.equal(body.items[1].rate, 5000);
});

test("a masked line save against a merged project is refused outright", () => {
  // A merge container holds none of the lines — they live on the discipline
  // projects — so there is nothing here to restore the rates from.
  const { error } = guardMaskedWrite({
    project: { items: [] },
    access: MASKED,
    body: { items: masked("items", STORED_ITEMS) },
    isMergeContainer: true,
  });
  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_MERGE_UNSUPPORTED");
  assert.deepEqual(error.body.details.arrays, ["items"]);
});

test("a merged project still takes the fields it does own from a masked viewer", () => {
  const stored = [{ name: "Site security", allocation: 10, actualAmount: 480_000 }];
  const { body, error } = guardMaskedWrite({
    project: { preliminaryItems: stored },
    access: MASKED,
    body: { name: "Tower C", preliminaryItems: masked("preliminaryItems", stored) },
    isMergeContainer: true,
  });
  assert.equal(error, undefined);
  assert.equal(body.name, "Tower C");
  assert.equal(body.preliminaryItems[0].actualAmount, 480_000);
});

test("an owner's merged save is not refused", () => {
  const { error, body } = guardMaskedWrite({
    project: { items: [] },
    access: OWNER,
    body: { items: STORED_ITEMS },
    isMergeContainer: true,
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
});

/* ── share codes, the collaborator roster and the lock PIN hash ─────────── */

test("a round-tripped payload can never write share codes, collaborators or the lock PIN", () => {
  // projectForClient() strips these and replaces lockPinHash with a boolean,
  // so a payload coming back carries only the shapes below. None of them may
  // reach a document — for a masked viewer OR an owner.
  for (const access of [MASKED, OWNER]) {
    const { body } = guardMaskedWrite({
      project: { items: [] },
      access,
      body: {
        name: "Tower C",
        shareCodes: [],                       // owner saw a shaped list; a collaborator saw none
        collaborators: [],                    // ditto
        lockPinHash: "",
        contract: { hasLockPin: true, lockPinHash: "", preliminaryPercent: 7.5 },
      },
    });
    assert.equal(body.name, "Tower C");
    assert.equal("shareCodes" in body, false);
    assert.equal("collaborators" in body, false);
    assert.equal("lockPinHash" in body, false);
    assert.equal("lockPinHash" in body.contract, false);
    // Nothing else on the contract is touched.
    assert.equal(body.contract.preliminaryPercent, 7.5);
  }
});

test("stripping the contract's PIN hash does not mutate the caller's body", () => {
  const original = { contract: { lockPinHash: "x" }, shareCodes: [{ id: "1" }] };
  guardMaskedWrite({ project: {}, access: MASKED, body: original });
  assert.equal(original.contract.lockPinHash, "x");
  assert.equal(original.shareCodes.length, 1);
});

/* ── the mirror-image invariant ─────────────────────────────────────────── */

test("every array maskRates() blanks is an array the guard restores", () => {
  // If this list and maskRates() ever drift, a masked save starts writing
  // zeros again. Kept as a literal so adding an array is a deliberate act.
  assert.deepEqual(
    [...MASKED_MONEY_ARRAYS].sort(),
    ["budgetItems", "items", "materialItems", "preliminaryItems", "provisionalSums", "variations"],
  );
});

test("preserveMaskedMoney refuses an array it does not know the money of", () => {
  const { unsafe, rows } = preserveMaskedMoney([], [{}], "certificates");
  assert.equal(unsafe, true);
  assert.equal(rows, null);
});

test("preserveMaskedMoney copes with a project that has no stored array yet", () => {
  const { rows, unsafe } = preserveMaskedMoney(undefined, masked("items", STORED_ITEMS), "items");
  assert.equal(unsafe, false);
  assert.equal(rows[0].rate, 0);
  assert.equal(rows[1].rate, 0);
});
