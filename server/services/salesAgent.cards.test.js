// The estimator tools hand the chat a card (a pricing confirm list, a report
// button) beside the text they give the model. withCard is the seam: the model
// gets the text, the card is queued once per kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withCard } from "./salesAgent.js";

test("a plain string passes straight through and queues nothing", () => {
  const ctx = { pendingActions: [] };
  assert.equal(withCard("Ask which project.", ctx), "Ask which project.");
  assert.deepEqual(ctx.pendingActions, []);
});

test("an object answers with its text and queues its card", () => {
  const ctx = { pendingActions: [{ type: "nav", label: "x", to: "/" }] };
  const out = withCard({ text: "Proposed 3.", card: { type: "price-proposal", lines: [1, 2, 3] } }, ctx);
  assert.equal(out, "Proposed 3.");
  assert.deepEqual(ctx.pendingActions.map((a) => a.type), ["nav", "price-proposal"]);
});

test("a second card of the same kind replaces the first", () => {
  const ctx = { pendingActions: [] };
  withCard({ text: "a", card: { type: "price-proposal", n: 1 } }, ctx);
  withCard({ text: "b", card: { type: "price-proposal", n: 2 } }, ctx);
  withCard({ text: "c", card: { type: "project-report" } }, ctx);
  assert.deepEqual(ctx.pendingActions.map((a) => a.n ?? a.type), [2, "project-report"]);
});
