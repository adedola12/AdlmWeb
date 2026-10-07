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

test("a description edited on a line that also moved is refused, not guessed at", () => {
  // This case USED to pass, by pairing the two leftovers in order on the
  // grounds that both sides had one left. That reasoning was wrong: equal
  // leftover counts do not make two rows the same row. The very same shape —
  // one row unmatched on each side, at different indexes — is what a viewer
  // produces by deleting one line and adding another, and there the old
  // pairing handed the new line the deleted line's rate.
  //
  // Nothing here distinguishes the two, so the save is refused. The viewer
  // reloads and saves the rename and the move separately, and each of those
  // on its own still works (see the re-order and in-place-edit tests above).
  const incoming = masked("items", [
    { ...STORED_ITEMS[1] },
    { ...STORED_ITEMS[0], description: "Excavate trenches n.e. 1.5m deep" },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body, undefined);
  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_UNSAFE_MERGE");
});

/* ── one save that deletes a line and adds another ──────────────────────── */

// The shape that made this review: in ONE save a full-access collaborator
// without RateGen deletes a priced line and adds a new one. Identity pairs
// everything else, leaving exactly one row unmatched on each side — which the
// old third pass read as "these two must be each other" and paired, so the new
// line was written carrying the deleted line's rate, net cost and O&P. Nobody
// typed that money; it simply appeared on a quantity the viewer chose.
//
// Every array the guard covers is reachable this way (the bill and variations
// from the bill screen, the budget from the budget PUT, provisional sums from
// the contract panel), so each one is pinned here.
const DELETE_AND_ADD = {
  items: {
    stored: [
      { sn: 1, code: "A1", description: "Excavate trenches", unit: "m3", qty: 100, rate: 5000, netUnitCost: 4000, overheadPercent: 10, profitPercent: 15 },
      { sn: 2, code: "A2", description: "Concrete 1:2:4", unit: "m3", qty: 50, rate: 180000, netUnitCost: 150000, overheadPercent: 10, profitPercent: 10 },
      { sn: 3, code: "A3", description: "Hardcore filling", unit: "m2", qty: 30, rate: 9000, netUnitCost: 8000, overheadPercent: 10, profitPercent: 10 },
    ],
    // Deleted the middle line; added a line of their own at the end.
    added: { sn: 3, code: "A9", description: "Sand blinding", unit: "m2", qty: 20 },
    money: "rate",
  },
  budgetItems: {
    stored: [
      { billIdentity: "A1", componentKind: "Material", description: "Cement", unit: "bag", qty: 40, rate: 9500, netUnitCost: 9500, budgetRate: 9500 },
      { billIdentity: "A1", componentKind: "Labour", description: "Mason", unit: "hr", qty: 16, rate: 2500, netUnitCost: 2500, budgetRate: 2500 },
      { billIdentity: "A2", componentKind: "Material", description: "Sharp sand", unit: "m3", qty: 8, rate: 45000, netUnitCost: 45000, budgetRate: 45000 },
    ],
    added: { billIdentity: "A2", componentKind: "Labour", description: "Labourer", unit: "hr", qty: 24 },
    money: "rate",
  },
  provisionalSums: {
    stored: [
      { description: "Lift installation", kind: "pc", amount: 5_000_000 },
      { description: "Statutory fees", kind: "provisional", amount: 750_000 },
      { description: "Landscaping", kind: "pc", amount: 2_000_000 },
    ],
    added: { description: "External signage", kind: "pc" },
    money: "amount",
  },
  variations: {
    stored: [
      { reference: "VO-01", description: "Extra soakaway", unit: "item", qty: 1, rate: 1_250_000 },
      { reference: "VO-02", description: "Omit render", unit: "item", qty: 1, rate: -300_000 },
      { reference: "VO-03", description: "Additional manhole", unit: "nr", qty: 2, rate: 400_000 },
    ],
    added: { reference: "VO-04", description: "Re-route services", unit: "item", qty: 1 },
    money: "rate",
  },
};

for (const [kind, fixture] of Object.entries(DELETE_AND_ADD)) {
  test(`${kind}: deleting one row and adding another in one save is refused`, () => {
    const kept = [fixture.stored[0], fixture.stored[2]];
    const incoming = masked(kind, kept).concat(masked(kind, [fixture.added]));

    const { body, error } = guardMaskedWrite({
      project: { [kind]: fixture.stored },
      access: MASKED,
      body: { [kind]: incoming },
    });

    assert.equal(body, undefined, "the save must not be applied");
    assert.equal(error.status, 409);
    assert.equal(error.body.code, "RATES_MASKED_UNSAFE_MERGE");
    assert.equal(error.body.details.array, kind);
  });

  test(`${kind}: the same save from someone who can see rates writes what they typed`, () => {
    // The other half of the rule: none of this applies to a user with RateGen.
    // Same delete-and-add, their own figures — including a deliberate 0, which
    // must be written as 0 and not mistaken for a masked blank.
    const f = fixture.money;
    const incoming = [
      { ...fixture.stored[0], [f]: 7250 },
      { ...fixture.stored[2], [f]: 0 },
      { ...fixture.added, [f]: 123456 },
    ];
    const { body, error } = guardMaskedWrite({
      project: { [kind]: fixture.stored },
      access: OWNER,
      body: { [kind]: incoming },
    });
    assert.equal(error, undefined);
    assert.equal(body[kind][0][f], 7250);
    assert.equal(body[kind][1][f], 0);
    assert.equal(body[kind][2][f], 123456);
  });
}

test("two rows swapped in order keep their own rates, not each other's", () => {
  // A pure re-order matches on identity, so the money travels with the row.
  const stored = [
    { ...STORED_ITEMS[0] },
    { ...STORED_ITEMS[1] },
    { sn: 3, code: "A3", description: "Hardcore filling", unit: "m2", qty: 30, rate: 9000 },
  ];
  const incoming = masked("items", [
    { ...stored[1], sn: 1 },
    { ...stored[0], sn: 2 },
    { ...stored[2], sn: 3 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: stored },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.deepEqual(
    body.items.map((r) => [r.code, r.rate]),
    [["A2", 180000], ["A1", 5000], ["A3", 9000]],
  );
});

test("a row edited into another row's identity is refused, not paired by order", () => {
  // The second shape the old third pass got wrong. Editing line A1 so that it
  // reads exactly like line A2 makes both incoming rows claim A2's identity;
  // one of them wins it, and the old code then handed the loser whatever was
  // left over — so the two rates came back exchanged. Now it refuses.
  const incoming = masked("items", [
    { ...STORED_ITEMS[0], code: "A2", description: "Concrete 1:2:4", unit: "m3" },
    { ...STORED_ITEMS[1] },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body, undefined);
  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_UNSAFE_MERGE");
});

test("an unmatched row is never handed another row's money", () => {
  // The general statement of the fix, one level below the routes: whatever
  // cannot be paired is NEW, and new means blank. Here there is nothing priced
  // left over, so the save is allowed — and the added line carries nothing.
  const stored = [
    { ...STORED_ITEMS[0] },
    // An unpriced line: deleting it loses no money, so it is not worth a 409.
    { sn: 2, code: "A2", description: "Concrete 1:2:4", unit: "m3", qty: 50, rate: 0, netUnitCost: null },
  ];
  const incoming = masked("items", [
    stored[0],
    { sn: 2, code: "A9", description: "Sand blinding", unit: "m2", qty: 20, rate: 999999 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: stored },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].code, "A9");
  assert.equal(body.items[1].rate, 0);
});

test("a row replaced in its own slot keeps that slot's money — the known limit", () => {
  // Pinned deliberately, so the limit is a decision and not a surprise. These
  // rows have no stable id (every money subdocument is _id:false), so "row 2
  // was replaced" and "row 2's description and unit were edited" arrive as the
  // same request. The guard reads it as the edit, which is the common case.
  //
  // What that is worth to a viewer who cannot see rates is exactly what the
  // feature already lets them do — edit a line's text and its quantity — and
  // no more: money still never moves from one POSITION to another, which is
  // the transplant this review closed. A client-supplied row id is what would
  // close the rest.
  const incoming = masked("items", [
    STORED_ITEMS[0],
    { sn: 2, code: "A9", description: "Sand blinding", unit: "m2", qty: 20 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: STORED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[1].rate, 180000);
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

/* ── the row id ─────────────────────────────────────────────────────────── */
//
// Every money subdocument is `_id: false`, so for a long time a row had no
// name of its own and the guard could only pair on the row's text and its
// position. lineId is that name: the server mints it on write, the web client
// hands it back untouched, and the desktop plugins neither send nor see it.
//
// These tests hold both halves of that. A payload that names its rows gets the
// tighter reading — a row nobody named is a row that was just created, so it
// never inherits the money of whatever used to sit in its slot. A payload that
// names nothing gets the old reading, unchanged, because that is what every
// plugin posts today.

const ID_A = "ln-aaaaaaaa-1111";
const ID_B = "ln-bbbbbbbb-2222";

// The same two stored lines, now carrying the ids a save would have minted.
const NAMED_ITEMS = [
  { ...STORED_ITEMS[0], lineId: ID_A },
  { ...STORED_ITEMS[1], lineId: ID_B },
];

test("a named row keeps its own money when its text AND its position change at once", () => {
  // The case no amount of text-matching or position-matching could get right:
  // the second line is re-worded and dragged to the top in one save. Its key
  // changed, so pass 1 cannot find it; it moved, so pass 2 cannot either. Its
  // id did not change, and that is enough.
  const incoming = masked("items", [
    { ...NAMED_ITEMS[1], description: "Concrete 1:2:4 (revised mix)", qty: 61 },
    NAMED_ITEMS[0],
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  // Each line kept ITS OWN rate across the move, and the quantity the viewer
  // is allowed to change still saved.
  assert.equal(body.items[0].rate, 180000);
  assert.equal(body.items[0].qty, 61);
  assert.equal(body.items[1].rate, 5000);
});

test("a row replaced in its own slot no longer inherits that slot's money", () => {
  // The limit the previous review pinned, now closed. Same payload as that
  // test — line 2 swapped for a different line at the same index — except the
  // rows are named. The added row carries no id in a payload whose other row
  // does, which is the client saying it is new; it never reaches the position
  // pass, so it cannot pick up the concrete rate.
  //
  // What is left over is a priced stored row nobody carried forward, and the
  // guard's standing rule for that is to refuse rather than silently drop a
  // figure the viewer was never allowed to see.
  const incoming = masked("items", [
    NAMED_ITEMS[0],
    { sn: 2, code: "A9", description: "Sand blinding", unit: "m2", qty: 20 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(body, undefined);
  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_UNSAFE_MERGE");
  assert.equal(error.body.details.array, "items");
});

test("an unnamed payload still lands on the old reading — the plugins are untouched", () => {
  // The SAME replacement as the test above, from a client that does not speak
  // ids: every desktop plugin, which deserializes into its own DTOs and drops
  // the field. The stored rows are named; the payload is not, and the payload
  // is what decides. Position still pairs, so the new row still takes the
  // slot's rate — exactly as it did before lineId existed.
  const incoming = masked("items", [
    { ...NAMED_ITEMS[0], lineId: undefined },
    { sn: 2, code: "A9", description: "Sand blinding", unit: "m2", qty: 20 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[1].rate, 180000);
});

test("a named row that is only deleted is still an ordinary save", () => {
  // Deleting is not replacing: the money goes with the line, nothing is left
  // holding someone else's figure, and no 409 is owed.
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: masked("items", [NAMED_ITEMS[0]]) },
  });
  assert.equal(error, undefined);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].rate, 5000);
});

test("a named row added alongside the others is new, and gets blanks", () => {
  const incoming = masked("items", [
    ...NAMED_ITEMS,
    { sn: 3, code: "A3", description: "Hardcore filling", unit: "m3", qty: 12 },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].rate, 180000);
  assert.equal(body.items[2].rate, 0);
  assert.equal(body.items[2].netUnitCost, null);
});

test("a duplicated id pairs one-for-one — the copy is a new row, not a second claim", () => {
  // Copying a line in the editor can copy its id too. The first row to claim
  // an id gets it and the stored row is spent; the copy falls through and is
  // read as new. Two rows must never both be paid the same stored rate.
  const stored = [NAMED_ITEMS[0]];
  const incoming = masked("items", [
    NAMED_ITEMS[0],
    { ...NAMED_ITEMS[0], sn: 2, description: "Excavate trenches (copy)" },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: stored },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].rate, 0);
});

test("an id that is not a well-formed id reads as no id at all", () => {
  // Rubbish in the field must not become a key, or two rows that both sent
  // rubbish would pair with each other. "x" is too short for LINE_ID_RE, so
  // this payload names nothing and falls through to the old passes.
  const incoming = masked("items", [
    { ...STORED_ITEMS[0], lineId: "x" },
    { ...STORED_ITEMS[1], lineId: { not: "a string" } },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: NAMED_ITEMS },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].rate, 180000);
});

test("a masked save that arrives unnamed still comes out named", () => {
  // A plugin's save strips the ids. Whatever the guard pairs, it hands the
  // stored row's id back to the row that paired with it, so the ids the web
  // client is holding survive a save it did not make. Without this the next
  // masked save would be back to guessing.
  const incoming = masked("items", STORED_ITEMS); // no ids anywhere
  const { rows, unsafe } = preserveMaskedMoney(NAMED_ITEMS, incoming, "items");
  assert.equal(unsafe, false);
  assert.equal(rows[0].lineId, ID_A);
  assert.equal(rows[1].lineId, ID_B);
});

test("a row that sent its own id keeps it — the stored id never overwrites it", () => {
  const incoming = masked("items", NAMED_ITEMS);
  const { rows } = preserveMaskedMoney(NAMED_ITEMS, incoming, "items");
  assert.equal(rows[0].lineId, ID_A);
  assert.equal(rows[1].lineId, ID_B);
});

test("every money array pairs on the id, not just the bill", () => {
  // The id is on all five subdocuments, so the pass has to work for each of
  // them. Re-word and re-order one row of each and check its own figure
  // followed it. preliminaryItems is keyed on `name` alone, so a rename there
  // was previously unmatchable in any position but its own.
  const cases = {
    provisionalSums: [
      { lineId: ID_A, description: "Lift installation", amount: 4_000_000, kind: "pc" },
      { lineId: ID_B, description: "Soakaway", amount: 250_000, kind: "provisional" },
    ],
    variations: [
      { lineId: ID_A, reference: "VO-01", description: "Extra soakaway", unit: "item", qty: 1, rate: 90_000 },
      { lineId: ID_B, reference: "VO-02", description: "Omit fence", unit: "m", qty: 10, rate: -4_000 },
    ],
    preliminaryItems: [
      { lineId: ID_A, name: "Site security", actualAmount: 300_000 },
      { lineId: ID_B, name: "Insurances", actualAmount: 120_000 },
    ],
    budgetItems: [
      { lineId: ID_A, billIdentity: "A1", description: "Cement", unit: "bag", qty: 100, rate: 9_000, budgetRate: 9_000 },
      { lineId: ID_B, billIdentity: "A2", description: "Sand", unit: "m3", qty: 20, rate: 15_000, budgetRate: 15_000 },
    ],
  };
  const renamed = {
    provisionalSums: (r) => ({ ...r, description: "Lift installation (revised)" }),
    variations: (r) => ({ ...r, description: "Extra soakaway (revised)", reference: "VO-01A" }),
    preliminaryItems: (r) => ({ ...r, name: "Site security (night only)" }),
    budgetItems: (r) => ({ ...r, description: "Cement (42.5R)", billIdentity: "A1x" }),
  };
  const figure = {
    provisionalSums: "amount",
    variations: "rate",
    preliminaryItems: "actualAmount",
    budgetItems: "rate",
  };

  for (const [kind, stored] of Object.entries(cases)) {
    // Re-word row one and move it to the bottom, in one save.
    const incoming = masked(kind, [stored[1], renamed[kind](stored[0])]);
    const { rows, unsafe, reason } = preserveMaskedMoney(stored, incoming, kind);
    assert.equal(unsafe, false, `${kind}: ${reason}`);
    assert.equal(rows[0][figure[kind]], stored[1][figure[kind]], kind);
    assert.equal(rows[1][figure[kind]], stored[0][figure[kind]], kind);
  }
});

test("a forged id reaches no further than a copied description already did", () => {
  // Pinned so the limit is a decision, not a surprise. A collaborator who
  // cannot see rates CAN point a line at another line's stored price, by
  // sending that line's id — just as they could by copying its description
  // and unit, which has always worked. Nothing here shows them a figure, and
  // nothing here lets them type one: the money still comes from the store.
  // Re-arranging which line money sits on is edit access, which the owner
  // granted; the guard's job is to stop a masked save WRITING money.
  const incoming = masked("items", [
    { ...STORED_ITEMS[0], lineId: ID_B }, // claims to be the concrete line
  ]);
  const { rows } = preserveMaskedMoney(NAMED_ITEMS, incoming, "items");
  assert.equal(rows[0].rate, 180000);
});

test("a row the server synthesised is unnamed, and still pairs on position", () => {
  // Not every stored row went through a sanitizer: ensureBillItemCoverage()
  // makes the Labour and Material lines a bill item is missing, and every row
  // written before this field existed has no id either. Those rows are stored
  // unnamed, and an unnamed incoming row sitting against one is NOT the "a
  // client that names its rows left this one out" case — there was no id for
  // it to echo. Position still speaks for them, which is what keeps the Budget
  // tab saving on a project whose rows are only half named.
  const stored = [
    { ...STORED_ITEMS[0], lineId: ID_A },
    { ...STORED_ITEMS[1] }, // synthesised: no id, and priced
  ];
  const incoming = masked("items", [
    stored[0],
    { ...stored[1], description: "Concrete 1:2:4 (re-worded)" },
  ]);
  const { body, error } = guardMaskedWrite({
    project: { items: stored },
    access: MASKED,
    body: { items: incoming },
  });
  assert.equal(error, undefined);
  assert.equal(body.items[0].rate, 5000);
  assert.equal(body.items[1].rate, 180000);
  // …and having paired, the unnamed stored row still has nothing to lend it,
  // so the row stays unnamed until a sanitizer names it on the way to disk.
  assert.equal(body.items[1].lineId, undefined);
});
