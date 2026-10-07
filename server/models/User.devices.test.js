// server/models/User.devices.test.js
//
// The device schema is strict: a field it does not declare is silently
// dropped on save. The provenance fields the seat rules depend on
// (util/deviceBinding.js) must therefore be declared, survive a load/save
// round trip, and NOT be defaulted onto older rows, whose "absent" is what
// marks them as written before provenance existed.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { User } from "./User.js";
import { entitlementsWithoutDeviceProvenance } from "../util/deviceIdentity.js";

const at = new Date("2026-09-19T10:00:00Z");
const PROVENANCE = {
  source: "app",
  scheme: "mgu2",
  client: "ADLM-RevitPlugin/3.0.1",
  installerFingerprint: "a1".repeat(32),
  installerName: "PC-A",
  adoptedAt: at,
  appSeenAt: at,
};

const device = (extra = {}) => ({
  fingerprint: "a2".repeat(32),
  name: "",
  boundAt: at,
  lastSeenAt: at,
  revokedAt: null,
  fpVersion: 2,
  ...extra,
});

test("provenance fields validate and survive toObject / hydrate / re-save", () => {
  const doc = new User({
    email: "qs@example.com",
    entitlements: [{ productKey: "revit", status: "active", devices: [device(PROVENANCE)] }],
  });
  assert.equal(doc.validateSync(), undefined);

  const saved = doc.toObject({ depopulate: true });
  assert.deepEqual(
    Object.fromEntries(Object.keys(PROVENANCE).map((k) => [k, saved.entitlements[0].devices[0][k]])),
    PROVENANCE,
  );

  // As if read back from Mongo, edited by a route, and serialised for save.
  const loaded = User.hydrate(saved);
  loaded.entitlements[0].devices[0].lastSeenAt = new Date("2026-09-20T10:00:00Z");
  loaded.entitlements = loaded.entitlements.map((e) => e); // routes do reassign
  const again = loaded.toObject();
  for (const [k, v] of Object.entries(PROVENANCE)) {
    assert.deepEqual(again.entitlements[0].devices[0][k], v, k);
  }
  assert.equal(loaded.validateSync(), undefined);
});

test("rows written before provenance get no defaults on load", () => {
  const legacy = User.hydrate({
    _id: new mongoose.Types.ObjectId(),
    email: "old@example.com",
    entitlements: [{ productKey: "revit", status: "active", seats: 1, devices: [device({ name: "PC-A" })] }],
  });
  const row = legacy.toObject().entitlements[0].devices[0];
  for (const k of Object.keys(PROVENANCE)) {
    assert.equal(row[k], undefined, `${k} must stay absent on a legacy row`);
  }
});

test("a row pushed with provenance keeps it (the path enforceDeviceBinding takes)", () => {
  const doc = new User({ email: "qs@example.com", entitlements: [{ productKey: "mep", status: "active" }] });
  doc.entitlements[0].devices.push(device({ source: "installer-hub", scheme: "hw2", client: "installer-hub" }));
  const row = doc.toObject().entitlements[0].devices[0];
  assert.equal(row.source, "installer-hub");
  assert.equal(row.scheme, "hw2");
  assert.equal(row.client, "installer-hub");
});

test("the delta sent to Mongo on save carries the new fields", () => {
  const doc = User.hydrate({
    _id: new mongoose.Types.ObjectId(),
    email: "qs@example.com",
    entitlements: [{ productKey: "revit", status: "active", seats: 1, devices: [device({ name: "PC-A" })] }],
  });
  const row = doc.entitlements[0].devices[0];
  Object.assign(row, { fingerprint: "b2".repeat(32), ...PROVENANCE, name: "" });
  const [, delta] = doc.$__delta();
  const text = JSON.stringify(delta);
  for (const k of Object.keys(PROVENANCE)) assert.ok(text.includes(k), `${k} missing from ${text}`);
});

test("the auth payload's entitlements serialise exactly as before, minus provenance (Mongoose documents)", () => {
  const legacy = device({ name: "PC-A" });
  const doc = new User({
    email: "qs@example.com",
    entitlements: [
      { productKey: "revit", status: "active", seats: 2, devices: [legacy, device({ fingerprint: "b2".repeat(32) })] },
      { productKey: "mep", status: "active" },
    ],
  });

  // No provenance anywhere: byte-identical to what `user.entitlements`
  // serialised to in the token and the body before this change.
  assert.equal(JSON.stringify(entitlementsWithoutDeviceProvenance(doc.entitlements)), JSON.stringify(doc.entitlements));

  // Stamp one row (as a sign-in would): the payload is unchanged, the
  // document keeps the fields for save.
  const expected = JSON.stringify(doc.entitlements);
  Object.assign(doc.entitlements[0].devices[1], PROVENANCE);
  assert.equal(JSON.stringify(entitlementsWithoutDeviceProvenance(doc.entitlements)), expected);
  assert.equal(doc.entitlements[0].devices[1].installerFingerprint, PROVENANCE.installerFingerprint);
  assert.ok(JSON.stringify(doc.entitlements).length > expected.length + 200, "the rows it strips are the heavy ones");
});
