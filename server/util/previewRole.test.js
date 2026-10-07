// The client decides who passes the preview gate from the permissions the
// server serializes. A role holding only "preview" must pass that gate without
// counting as staff (no Admin link, no admin shell).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaff, canViewPreview } from "../../client/src/utils/roles.js";
import { isStaffGrantable } from "../config/permissions.js";

test("Tech Support views the preview but is not staff", () => {
  const u = { role: "tech_support", permissions: ["preview"] };
  assert.equal(canViewPreview(u), true);
  assert.equal(isStaff(u), false);
});

test("ticking another area on the role makes it staff as before", () => {
  const u = { role: "tech_support", permissions: ["preview", "support"] };
  assert.equal(isStaff(u), true);
  assert.equal(canViewPreview(u), true);
});

test("existing staff still view the preview; customers do not", () => {
  assert.equal(canViewPreview({ role: "admin", isSuperAdmin: true }), true);
  assert.equal(canViewPreview({ role: "mini_admin", permissions: ["users"] }), true);
  assert.equal(canViewPreview({ role: "design", designAccess: true }), true);
  assert.equal(canViewPreview({ role: "user", permissions: [] }), false);
  assert.equal(canViewPreview(null), false);
});

test("the preview area can be ticked in Roles & Access", () => {
  assert.equal(isStaffGrantable("preview"), true);
});
