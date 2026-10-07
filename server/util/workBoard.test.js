// server/util/workBoard.test.js — the proposal-first rule (docs/WORK_BOARD.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyVerdict,
  boardSummary,
  decideBlock,
  partitionDecidable,
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

// Deciding many at once must never approve what one-at-a-time would refuse.
//
// The dangerous failure here is silent: forty-five proposals go in, forty-five
// come back "approved", and nobody notices that some were never the caller's to
// decide. So the batch is split by the same rule as a single decision, and the
// refused ones come back named.
test("partitionDecidable applies the single-decision rule to every item", () => {
  const approver = "approver@adlm";
  const owner = "owner@adlm";
  const feature = (over = {}) => ({ _id: "x", kind: "feature", title: "t", ...over });

  const byOwner = feature({ _id: "a", submittedBy: owner });
  const byApprover = feature({ _id: "b", submittedBy: approver });
  const notNeedingApproval = feature({ _id: "c", kind: "fix", submittedBy: owner });

  // The approver: may decide the owner's proposal, may NOT decide their own,
  // and a fix needs no approval at all.
  const asApprover = partitionDecidable([byOwner, byApprover, notNeedingApproval], {
    isApprover: true,
    email: approver,
    approverEmail: approver,
  });
  assert.deepEqual(asApprover.decidable.map((i) => i._id), ["a"]);
  assert.deepEqual(asApprover.blocked.map((b) => b.item._id).sort(), ["b", "c"]);
  // Every refusal carries its reason, so the reply can say which and why.
  assert.ok(asApprover.blocked.every((b) => typeof b.reason === "string" && b.reason.length > 0));

  // A super-admin who is NOT the approver decides nothing of the owner's here:
  // this is the case that matters, because it is the account a batch would most
  // likely be fired from.
  const asSuperAdmin = partitionDecidable([byOwner, byApprover], {
    isSuperAdmin: true,
    email: owner,
    approverEmail: approver,
  });
  assert.deepEqual(asSuperAdmin.decidable.map((i) => i._id), ["b"]);
  assert.deepEqual(asSuperAdmin.blocked.map((b) => b.item._id), ["a"]);

  // Nothing in, nothing out — and it does not throw on a non-array.
  assert.deepEqual(partitionDecidable(null, { isApprover: true }), { decidable: [], blocked: [] });
});
