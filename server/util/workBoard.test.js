// server/util/workBoard.test.js — the proposal-first rule (docs/WORK_BOARD.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyVerdict,
  boardSummary,
  decideBlock,
  initialDecision,
  missingBusinessCase,
  resubmitIfNeeded,
  stageBlock,
} from "./workBoard.js";

const FULL_CASE = {
  problem: "QSs retype client bills",
  whoBenefits: "Firms with their own bill format",
  value: "Hours saved per bill, stronger renewals",
  cost: "Two weeks, AI spend per bill",
  successMetric: "Bills filled per week",
};

test("a new feature needs its business case; a fix does not", () => {
  assert.deepEqual(missingBusinessCase("fix", {}), []);
  assert.ok(missingBusinessCase("feature", {}).includes("Problem it solves"));
  assert.ok(missingBusinessCase("button", { ...FULL_CASE, cost: " " }).includes("Cost and effort"));
  assert.deepEqual(missingBusinessCase("feature", FULL_CASE), []);
});

test("a feature starts pending, a fix starts not-required", () => {
  assert.equal(initialDecision("feature"), "pending");
  assert.equal(initialDecision("button"), "pending");
  assert.equal(initialDecision("fix"), "not-required");
});

test("an unapproved feature cannot be designed, built or shipped", () => {
  for (const stage of ["approved", "in-design", "building", "testing", "awaiting-signoff", "shipped"]) {
    assert.ok(stageBlock({ kind: "feature", decision: { status: "pending" } }, stage), stage);
    assert.ok(stageBlock({ kind: "button", decision: { status: "changes" } }, stage), stage);
  }
  assert.equal(stageBlock({ kind: "feature", decision: { status: "pending" } }, "on-hold"), null);
  assert.equal(stageBlock({ kind: "feature", decision: { status: "approved" } }, "building"), null);
  assert.equal(stageBlock({ kind: "feature", decision: { status: "grandfathered" } }, "shipped"), null);
  assert.equal(stageBlock({ kind: "fix", decision: { status: "not-required" } }, "shipped"), null);
  assert.ok(stageBlock({ kind: "fix" }, "nonsense"));
});

test("nobody approves their own proposal", () => {
  const approver = "richard@example.com";
  const owner = "owner@example.com";
  const byOwner = { kind: "feature", submittedBy: owner };
  const byApprover = { kind: "feature", submittedBy: approver };

  assert.equal(decideBlock({ isApprover: true, email: approver, approverEmail: approver, item: byOwner }), null);
  assert.ok(decideBlock({ isApprover: true, email: approver, approverEmail: approver, item: byApprover }));
  // The approver's own idea goes to the owner instead.
  assert.equal(decideBlock({ isSuperAdmin: true, email: owner, approverEmail: approver, item: byApprover }), null);
  // The owner cannot approve the owner's own idea, super-admin or not.
  assert.ok(decideBlock({ isSuperAdmin: true, email: owner, approverEmail: approver, item: byOwner }));
  assert.ok(decideBlock({ isApprover: true, email: approver, approverEmail: approver, item: { kind: "fix" } }));
});

test("verdicts move the stage", () => {
  const at = new Date(0);
  assert.equal(applyVerdict({ stage: "proposed" }, "approved", { by: "r", at }).stage, "approved");
  assert.equal(applyVerdict({ stage: "building" }, "approved", { by: "r", at }).stage, undefined);
  assert.equal(applyVerdict({ stage: "proposed" }, "declined", { by: "r", at }).stage, "declined");
  assert.equal(applyVerdict({ stage: "proposed" }, "changes", { by: "r", at, note: "  why  " })["decision.note"], "why");
});

test("an edited proposal that was sent back goes back to the approver", () => {
  assert.deepEqual(resubmitIfNeeded({ decision: { status: "approved" } }), {});
  assert.equal(resubmitIfNeeded({ decision: { status: "changes" } })["decision.status"], "pending");
  assert.equal(resubmitIfNeeded({ decision: { status: "declined" } }).stage, "proposed");
});

test("the summary counts what needs the approver", () => {
  const s = boardSummary([
    { kind: "feature", stage: "proposed", decision: { status: "pending" }, design: { status: "needed" } },
    { kind: "fix", stage: "building", decision: { status: "not-required" }, design: { status: "not-needed" } },
    { kind: "feature", stage: "awaiting-signoff", decision: { status: "grandfathered" }, design: { status: "in-progress" } },
  ]);
  assert.equal(s.awaitingDecision, 1);
  assert.equal(s.building, 1);
  assert.equal(s.awaitingSignoff, 1);
  assert.equal(s.inDesign, 1);
  assert.equal(s.designNeeded, 1);
});
