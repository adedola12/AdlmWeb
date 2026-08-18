// Export access tests.
//
// The first case is the regression that broke every BoQ export: the access
// token carries the user id as `id`, not `_id`, so a helper reading `_id` alone
// resolved undefined and the routes reported "project not found" for the
// caller's own projects.

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  requestUserId,
  normalizeId,
  canExportProject,
  userOwnsDoc,
} from "./exportAccess.js";

const oid = () => new mongoose.Types.ObjectId();

test("resolves the caller from the access token's `id`", () => {
  const id = oid();
  // Exactly what requireAuth assigns: the decoded JWT, with no `_id`.
  const req = { user: { id: String(id), email: "qs@example.com", role: "user" } };
  const resolved = requestUserId(req);
  assert.ok(resolved, "no user id resolved from the token payload");
  assert.equal(String(resolved), String(id));
});

test("still resolves a hydrated user's `_id`, and gives up on neither", () => {
  const id = oid();
  assert.equal(String(requestUserId({ user: { _id: id } })), String(id));
  assert.equal(requestUserId({ user: {} }), null);
  assert.equal(requestUserId({}), null);
  assert.equal(requestUserId({ user: { id: "not-an-objectid" } }), null);
});

test("the owner may export", () => {
  const me = oid();
  assert.equal(canExportProject({ userId: me }, me), true);
  assert.equal(userOwnsDoc({ userId: me }, me), true);
});

test("a full collaborator may export, a view-only one may not", () => {
  const me = oid();
  const owner = oid();
  const project = (accessLevel) => ({
    userId: owner,
    collaborators: [{ userId: me, accessLevel }],
  });

  assert.equal(canExportProject(project("full"), me), true);
  assert.equal(canExportProject(project("view"), me), false);
  assert.equal(userOwnsDoc(project("full"), me), true);
  assert.equal(userOwnsDoc(project("view"), me), false);
});

test("a stranger, and an anonymous caller, may not export anything", () => {
  const owner = oid();
  assert.equal(canExportProject({ userId: owner }, oid()), false);
  assert.equal(canExportProject({ userId: owner }, null), false);
  // A document with no ownership field is reachable only by an unguessable id,
  // but that is still no reason to serve it to a request with no user.
  assert.equal(userOwnsDoc({ items: [] }, null), false);
  assert.equal(userOwnsDoc({ items: [] }, oid()), true);
});

test("ids compare the same whether they arrive as ObjectId or string", () => {
  const id = oid();
  assert.equal(normalizeId(id), String(id));
  assert.equal(normalizeId(String(id)), String(id));
  assert.equal(normalizeId(null), "");
  assert.equal(canExportProject({ userId: String(id) }, id), true);
  assert.equal(canExportProject({ userId: id }, String(id)), true);
});
