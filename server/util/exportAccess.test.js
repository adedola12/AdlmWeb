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
  mayExportRates,
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

/* ── may the export carry the money? ──────────────────────────────────────── */

// canExportProject kept a view-only collaborator out and stopped there. A FULL
// collaborator without RateGen read the project with every rate masked to zero
// and then downloaded a workbook containing all of them, because nothing on the
// export path asked the rates question at all.
const rateGen = { hasRateGen: async () => true };
const noRateGen = { hasRateGen: async () => false };

test("the owner is never gated on their own bill", async () => {
  const uid = new mongoose.Types.ObjectId();
  assert.equal(await mayExportRates({ userId: uid }, uid, noRateGen), true);
});

test("a full collaborator needs an active RateGen subscription", async () => {
  const uid = new mongoose.Types.ObjectId();
  const doc = {
    userId: new mongoose.Types.ObjectId(),
    collaborators: [{ userId: uid, accessLevel: "full" }],
  };
  assert.equal(await mayExportRates(doc, uid, rateGen), true);
  assert.equal(await mayExportRates(doc, uid, noRateGen), false);
});

test("a sample is published teaching material and exports freely", async () => {
  const uid = new mongoose.Types.ObjectId();
  const doc = { isSample: true, userId: new mongoose.Types.ObjectId() };
  assert.equal(await mayExportRates(doc, uid, noRateGen), true);
});

test("a caller that forgets the entitlement check denies rather than grants", async () => {
  const uid = new mongoose.Types.ObjectId();
  const doc = {
    userId: new mongoose.Types.ObjectId(),
    collaborators: [{ userId: uid, accessLevel: "full" }],
  };
  assert.equal(await mayExportRates(doc, uid), false);
});

test("no document and no user mean no export", async () => {
  assert.equal(await mayExportRates(null, new mongoose.Types.ObjectId(), rateGen), false);
  assert.equal(await mayExportRates({ userId: "x" }, null, rateGen), false);
});
