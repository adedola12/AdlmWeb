import { test } from "node:test";
import assert from "node:assert/strict";
import { projectIsOpen, projectStage, stageIsOpen, stageLabel } from "./projectStage.js";

// The same ladder the gallery uses (client/src/lib/projectGallery.js:38). These
// pin the ORDER, because the order is the rule: a certified job is "valuing"
// even though its contract is also locked.

test("a project with nothing on it is at takeoff", () => {
  assert.equal(projectStage({}), "takeoff");
  assert.equal(projectStage(null), "takeoff");
});

test("a priced bill reaches priced, from a document or from a rollup row", () => {
  assert.equal(projectStage({ totalCost: 500 }), "priced");
  assert.equal(projectStage({ items: [{ qty: 2, rate: 100 }] }), "priced");
  assert.equal(projectStage({ items: [{ qty: 2, rate: 0 }] }), "takeoff");
});

test("the ladder is read top down and the first hit wins", () => {
  // Everything true at once: final beats all.
  const all = {
    finalAccount: { finalized: true },
    certificates: [{}, {}],
    contract: { locked: true, tenderedAt: "2026-01-01" },
    totalCost: 9,
  };
  assert.equal(projectStage(all), "final");
  const noFinal = { ...all, finalAccount: { finalized: false } };
  assert.equal(projectStage(noFinal), "valuing");
  const noCerts = { ...noFinal, certificates: [] };
  assert.equal(projectStage(noCerts), "locked");
  const noLock = { ...noCerts, contract: { locked: false, tenderedAt: "2026-01-01" } };
  assert.equal(projectStage(noLock), "tendered");
});

test("both document and rollup shapes answer the same five questions", () => {
  assert.equal(projectStage({ finalized: true }), "final");
  assert.equal(projectStage({ certificateCount: 3 }), "valuing");
  assert.equal(projectStage({ contractLocked: true }), "locked");
  assert.equal(projectStage({ tenderedAt: "2026-01-01" }), "tendered");
});

test("a masked row answers from `priced`, never from its zeroed total", () => {
  // The rollup zeroes money on somebody else's project when the reader may not
  // see rates. Reading totalCost there would call a fully priced job "takeoff".
  assert.equal(projectStage({ priced: true, totalCost: 0 }), "priced");
  assert.equal(projectStage({ priced: false, totalCost: 0 }), "takeoff");
});

test("only a finalised account is closed", () => {
  for (const k of ["takeoff", "priced", "tendered", "locked", "valuing"]) {
    assert.equal(stageIsOpen(k), true, `${k} should be open`);
  }
  assert.equal(stageIsOpen("final"), false);
  assert.equal(projectIsOpen({ finalAccount: { finalized: true } }), false);
  assert.equal(projectIsOpen({ contractLocked: true }), true);
});

test("stages have the words a person uses", () => {
  assert.equal(stageLabel("locked"), "Contract locked");
  assert.equal(stageLabel("valuing"), "Valuations");
  assert.equal(stageLabel("nonsense"), "Takeoff");
});
