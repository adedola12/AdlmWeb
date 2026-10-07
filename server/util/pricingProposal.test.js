// Ada's pricing proposal: the rows behind the confirm card. The matching
// itself is util/rateSuggestions.js (tested there); these pin what the card
// gets — bill order, the amount each line would add, and honest counts of what
// could not be matched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPricingProposal, MAX_PROPOSAL_LINES } from "./pricingProposal.js";

const RATES = [
  { rateId: "r1", description: "Reinforced concrete 1:2:4 in columns", unit: "m3", unitPrice: 220000, source: "user-custom" },
  { rateId: "r2", description: "Reinforced concrete 1:2:4 in beams", unit: "m3", unitPrice: 210000, source: "master" },
  { rateId: "r3", description: "225mm sandcrete blockwork in walls", unit: "m2", unitPrice: 13000, source: "master" },
];

const BILL = [
  { code: "B1", description: "Reinforced concrete 1:2:4 in columns", unit: "m3", qty: 12, rate: 0 },
  { code: "B2", description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 300, rate: 0 },
  // Priced already: the QS's decision, never second-guessed.
  { code: "B3", description: "Reinforced concrete 1:2:4 in beams", unit: "m3", qty: 4, rate: 199000 },
  // Unit gate: concrete measured in m2 must not take a per-m3 rate.
  { code: "B4", description: "Reinforced concrete 1:2:4 in columns", unit: "m2", qty: 10, rate: 0 },
  // No code: the apply endpoint cannot address it.
  { code: "", description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 5, rate: 0 },
  // Same code twice is one line to the endpoint.
  { code: "b1", description: "Reinforced concrete 1:2:4 in columns", unit: "m3", qty: 99, rate: 0 },
];

test("proposes the best rate per unpriced line, in bill order, with the amount", () => {
  const p = buildPricingProposal(BILL, RATES);
  assert.deepEqual(p.lines.map((l) => l.code), ["B1", "B2"]);
  const b1 = p.lines[0];
  assert.equal(b1.rateId, "r1");
  assert.equal(b1.unitPrice, 220000);
  assert.equal(b1.amount, 12 * 220000);
  assert.equal(b1.own, true);
  assert.match(b1.why, /your own rate/);
  assert.equal(b1.rateUnit, "m3");
  assert.equal(p.totalToAdd, 12 * 220000 + 300 * 13000);
});

test("counts what it could not match, and why", () => {
  const p = buildPricingProposal(BILL, RATES);
  assert.equal(p.unpricedCount, 5);
  assert.equal(p.matchedCount, 2);
  assert.equal(p.noCodeCount, 1);
  // B4 (unit gate) and the duplicate b1 are the two left over.
  assert.equal(p.unmatchedCount, 2);
  assert.equal(p.truncated, false);
  assert.equal(p.libraryCount, 3);
});

test("caps the card at the endpoint's ceiling and says it did", () => {
  const many = Array.from({ length: MAX_PROPOSAL_LINES + 7 }, (_, i) => ({
    code: `L${i}`,
    description: "225mm sandcrete blockwork in walls",
    unit: "m2",
    qty: 1,
    rate: 0,
  }));
  const p = buildPricingProposal(many, RATES);
  assert.equal(p.lines.length, MAX_PROPOSAL_LINES);
  assert.equal(p.truncated, true);
  assert.equal(p.matchedCount, MAX_PROPOSAL_LINES + 7);
});

test("an empty library or bill proposes nothing and does not throw", () => {
  assert.equal(buildPricingProposal(BILL, []).lines.length, 0);
  assert.equal(buildPricingProposal(null, RATES).unpricedCount, 0);
});
