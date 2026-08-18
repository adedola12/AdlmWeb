// server/util/rbac.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAccess } from "./rbac.js";

test("super-admin is granted every area", () => {
  const sa = { isSuperAdmin: true, perms: new Set() };
  assert.equal(decideAccess(sa, "trainings"), true);
  assert.equal(decideAccess(sa, "settings"), true);
  assert.equal(decideAccess(sa, "anything-at-all"), true);
});

test("a role is granted only the areas it holds", () => {
  const trainer = { isSuperAdmin: false, perms: new Set(["trainings"]) };
  assert.equal(decideAccess(trainer, "trainings"), true);
  assert.equal(decideAccess(trainer, "rategen"), false);
  assert.equal(decideAccess(trainer, "invoices"), false);
});

test("an unknown role (no access record) is denied everything", () => {
  assert.equal(decideAccess(null, "trainings"), false);
  assert.equal(decideAccess(undefined, "settings"), false);
});

test("a demo role is granted every area, including admin-exclusive ones", () => {
  // Safe only because demoModeGuard has already forced the request read-only
  // and masked the response — this grants sight of the screen, nothing else.
  const demo = { isSuperAdmin: false, demoMode: true, perms: new Set() };
  assert.equal(decideAccess(demo, "trainings"), true);
  assert.equal(decideAccess(demo, "settings"), true);
  assert.equal(decideAccess(demo, "aiusage"), true);
});

test("demo access does not depend on the permission matrix", () => {
  const demo = { isSuperAdmin: false, demoMode: true, perms: new Set(["trainings"]) };
  assert.equal(decideAccess(demo, "invoices"), true);
});
