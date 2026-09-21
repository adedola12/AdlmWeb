// server/util/releaseGate.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { auditKey, isApprover, isGatedChange } from "./releaseGate.js";

const live = {
  productKey: "revit",
  version: "2.9.2",
  packageUri: "https://r2/heron-2.9.2.zip",
  packageKind: "zip",
  sha256: "a".repeat(64),
  operations: [{ type: "copyDirectory", source: ".", target: "C:/x" }],
  enabled: true,
  notes: "",
};

test("a new version is a release", () => {
  assert.equal(isGatedChange(live, { ...live, version: "2.9.3" }), true);
});

test("a new package or hash is a release even at the same version", () => {
  assert.equal(isGatedChange(live, { ...live, packageUri: "https://r2/other.zip" }), true);
  assert.equal(isGatedChange(live, { ...live, sha256: "b".repeat(64) }), true);
});

test("changed install operations are a release", () => {
  assert.equal(isGatedChange(live, { ...live, operations: [{ type: "runExe", target: "C:/evil.exe" }] }), true);
});

test("notes and display name alone are not a release", () => {
  assert.equal(isGatedChange(live, { ...live, notes: "typo fixed", displayName: "HERON" }), false);
});

test("switching a product OFF never waits for sign-off", () => {
  assert.equal(isGatedChange(live, { ...live, version: "9.9.9", enabled: false }), false);
});

test("switching a product back ON is a release", () => {
  assert.equal(isGatedChange({ ...live, enabled: false }, { ...live }), true);
});

test("a first deployment with a package is a release", () => {
  assert.equal(isGatedChange(null, { ...live }), true);
  assert.equal(isGatedChange(null, { ...live, packageUri: "" }), false);
});

test("fields the caller left out count as unchanged, not cleared", () => {
  const { sha256, ...withoutHash } = live;
  assert.equal(isGatedChange(live, withoutHash), false);
});

test("key order inside operations does not fake a change", () => {
  const reordered = [{ target: "C:/x", source: ".", type: "copyDirectory" }];
  assert.equal(isGatedChange(live, { ...live, operations: reordered }), false);
});

test("approver match is exact and case-insensitive, and nobody matches an empty config", () => {
  assert.equal(isApprover({ approverEmail: "enochrichard6@gmail.com" }, "EnochRichard6@gmail.com"), true);
  assert.equal(isApprover({ approverEmail: "enochrichard6@gmail.com" }, "someone@else.com"), false);
  assert.equal(isApprover({ approverEmail: "" }, ""), false);
  assert.equal(isApprover(null, "x@y.z"), false);
});

test("audit keys sort by time and carry the action", () => {
  const k = auditKey("release.emergency", new Date("2026-09-21T20:00:00Z"));
  assert.match(k, /^web\/2026\/09\/21\/2026-09-21T200000000Z-release\.emergency-[0-9a-f]{8}\.json$/);
});
