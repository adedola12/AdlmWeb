// S18 bill — the two additive fields on TakeoffProject.
//
// Rule 7 of this pass: the desktop plugins (QUIV, HERON, Rate Gen, ArchiCAD)
// read and write these documents, so a new field must be optional, must carry
// a safe default, and a document saved before it existed must behave exactly
// as it does today. These tests hold that line. No database is needed — a
// Mongoose document applies its defaults and casts on construction.

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const { TakeoffProject } = await import("./TakeoffProject.js");

const base = () => ({
  userId: new mongoose.Types.ObjectId(),
  productKey: "planswift",
  name: "Pavillion",
});

test("a provisional sum saved before S18 reads as a provisional sum", () => {
  const p = new TakeoffProject({
    ...base(),
    provisionalSums: [{ description: "Statutory fees", amount: 180_000 }],
  });
  assert.equal(p.provisionalSums[0].kind, "provisional");
  assert.equal(p.provisionalSums[0].amount, 180_000);
});

test("a PC sum keeps its kind", () => {
  const p = new TakeoffProject({
    ...base(),
    provisionalSums: [{ description: "Lift installation", amount: 5_000_000, kind: "pc" }],
  });
  assert.equal(p.provisionalSums[0].kind, "pc");
});

test("kind only accepts the two named groups", () => {
  const p = new TakeoffProject({
    ...base(),
    provisionalSums: [{ description: "Odd one", amount: 1, kind: "something-else" }],
  });
  const err = p.validateSync();
  assert.ok(err, "an unknown kind must not validate");
  assert.ok(String(err.message).includes("kind"));
});

test("splitting the list by kind still adds up to the one figure", () => {
  const p = new TakeoffProject({
    ...base(),
    provisionalSums: [
      { description: "Lift", amount: 5_000_000, kind: "pc" },
      { description: "Drainage allowance", amount: 750_000 },
      { description: "Statutory fees", amount: 180_000, kind: "provisional" },
    ],
  });
  const total = p.provisionalSums.reduce((a, s) => a + s.amount, 0);
  const pc = p.provisionalSums
    .filter((s) => s.kind === "pc")
    .reduce((a, s) => a + s.amount, 0);
  const prov = p.provisionalSums
    .filter((s) => s.kind !== "pc")
    .reduce((a, s) => a + s.amount, 0);
  assert.equal(pc, 5_000_000);
  assert.equal(prov, 930_000);
  assert.equal(pc + prov, total);
});

test("a project that was never tendered has no tender date", () => {
  const p = new TakeoffProject(base());
  assert.equal(p.contract.tenderedAt, null);
});

test("a tender date round-trips and no other contract figure is touched", () => {
  const when = new Date("2026-09-20T09:00:00.000Z");
  const p = new TakeoffProject({
    ...base(),
    contract: { contractSum: 1_234_567, tenderedAt: when },
  });
  assert.equal(p.contract.tenderedAt.getTime(), when.getTime());
  assert.equal(p.contract.contractSum, 1_234_567);
  assert.equal(p.contract.locked, false);
});
