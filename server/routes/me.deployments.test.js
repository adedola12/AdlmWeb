// server/routes/me.deployments.test.js
//
// POST /me/deployments/bind-device, the call the Installer Hub makes after
// every install/update. Driven over real HTTP with a real signed token; only
// Mongo is stubbed (User.findById returns a real, unsaved User document and
// save() is counted instead of written).
//
// The Hub's id is hw2. For QUIV (revit) and ArchiCAD that id is never the
// app's, so a row written here took the customer's own seat: those products
// must now be answered 2xx without touching the device list. Every other
// product keeps its exact previous behaviour, plus provenance on new rows.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { default: deploymentsRouter } = await import("./me.deployments.js");

const USER_ID = new mongoose.Types.ObjectId();
const HUB_A = "a1".repeat(32);
const HUB_B = "b1".repeat(32);
const day = (n) => new Date(Date.UTC(2026, 8, n, 9));

let current = null;
let saves = 0;
User.findById = async (id) => (String(id) === String(USER_ID) ? current : null);

function userWith(entitlements) {
  const doc = new User({ _id: USER_ID, email: "qs@example.com", entitlements });
  doc.save = async () => {
    saves += 1;
    return doc;
  };
  saves = 0;
  current = doc;
  return doc;
}

const ent = (productKey, devices = [], seats = 1) => ({
  productKey,
  status: "active",
  seats,
  licenseType: seats > 1 ? "organization" : "personal",
  organizationName: seats > 1 ? "Firm Ltd" : "",
  expiresAt: day(28),
  devices,
  deviceFingerprint: devices[0]?.fingerprint,
});

async function bind(body, { fpVersion = "2" } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/me/deployments", deploymentsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const token = signAccess({ _id: String(USER_ID), email: "qs@example.com", role: "user" });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/me/deployments/bind-device`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-adlm-client": "installer-hub",
        "x-adlm-fp-version": fpVersion,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const devicesOf = (doc, key) =>
  doc.entitlements.find((e) => e.productKey === key).toObject().devices;

function withSwitch(value, fn) {
  const prev = process.env.DEVICE_SCHEME_AWARE_BINDING;
  if (value === undefined) delete process.env.DEVICE_SCHEME_AWARE_BINDING;
  else process.env.DEVICE_SCHEME_AWARE_BINDING = value;
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.DEVICE_SCHEME_AWARE_BINDING;
    else process.env.DEVICE_SCHEME_AWARE_BINDING = prev;
  });
}

test("revit: 200 deferredToApp, and the device list is not touched", () =>
  withSwitch(undefined, async () => {
    const quivRow = { fingerprint: "a2".repeat(32), name: "", boundAt: day(1), lastSeenAt: day(3), fpVersion: 2 };
    const doc = userWith([ent("revit", [quivRow])]);
    const before = devicesOf(doc, "revit");

    const r = await bind({ productKey: "revit", fingerprint: HUB_A, deviceName: "PC-A" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, bound: false, deferredToApp: true });
    assert.deepEqual(devicesOf(doc, "revit"), before);
    assert.equal(saves, 0, "nothing written");
  }));

test("revit: an empty licence stays empty (no Hub row takes the seat), and no lone-v1 swap runs", () =>
  withSwitch(undefined, async () => {
    const doc = userWith([ent("revit", [])]);
    assert.equal((await bind({ productKey: "Revit", fingerprint: HUB_A, deviceName: "PC-A" })).status, 200);
    assert.deepEqual(devicesOf(doc, "revit"), []);

    const v1 = { fingerprint: "a0".repeat(32), name: "", boundAt: day(1), lastSeenAt: day(3), fpVersion: 1 };
    const doc2 = userWith([ent("revit", [v1])]);
    await bind({ productKey: "revit", fingerprint: HUB_A, deviceName: "PC-A" });
    assert.equal(devicesOf(doc2, "revit")[0].fingerprint, v1.fingerprint);
    assert.equal(devicesOf(doc2, "revit")[0].fpVersion, 1);
    assert.equal(saves, 0);
  }));

test("archicad is deferred the same way", () =>
  withSwitch(undefined, async () => {
    userWith([ent("archicad", [])]);
    const r = await bind({ productKey: "archicad", fingerprint: HUB_A, deviceName: "PC-A" });
    assert.deepEqual(r.body, { ok: true, bound: false, deferredToApp: true });
    assert.equal(saves, 0);
  }));

test("mep: binds as before, new row stamped as the Hub's", () =>
  withSwitch(undefined, async () => {
    const doc = userWith([ent("mep", [])]);
    const r = await bind({ productKey: "mep", fingerprint: HUB_A, deviceName: "PC-A" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, bound: true, devicesUsed: 1, maxSeats: 1 });
    const [row] = devicesOf(doc, "mep");
    assert.equal(row.fingerprint, HUB_A);
    assert.equal(row.name, "PC-A");
    assert.equal(row.fpVersion, 2);
    assert.equal(row.source, "installer-hub");
    assert.equal(row.scheme, "hw2");
    assert.equal(row.client, "installer-hub");
    assert.equal(row.appSeenAt, undefined);
    assert.equal(doc.entitlements[0].deviceFingerprint, HUB_A);
    assert.equal(saves, 1);
  }));

test("mep: re-bind, lone-v1 swap and the seat limit all behave exactly as before", () =>
  withSwitch(undefined, async () => {
    // Already bound: lastSeenAt/name refresh, alreadyBound.
    const doc = userWith([ent("mep", [{ fingerprint: HUB_A, name: "", boundAt: day(1), lastSeenAt: day(3), fpVersion: 2 }])]);
    let r = await bind({ productKey: "mep", fingerprint: HUB_A.toUpperCase(), deviceName: "PC-A" });
    assert.deepEqual(r.body, { ok: true, alreadyBound: true });
    assert.equal(devicesOf(doc, "mep")[0].name, "PC-A");
    assert.equal(devicesOf(doc, "mep")[0].source, undefined, "existing rows are not re-labelled");

    // Lone v1 on a single seat: swapped in place.
    const doc2 = userWith([ent("mep", [{ fingerprint: "a0".repeat(32), name: "", boundAt: day(1), lastSeenAt: day(3), fpVersion: 1 }])]);
    r = await bind({ productKey: "mep", fingerprint: HUB_B, deviceName: "PC-B" });
    assert.deepEqual(r.body, { ok: true, migrated: true, alreadyBound: true });
    assert.equal(devicesOf(doc2, "mep")[0].fingerprint, HUB_B);

    // Seat limit.
    userWith([ent("mep", [{ fingerprint: HUB_A, name: "PC-A", boundAt: day(1), lastSeenAt: day(3), fpVersion: 2 }])]);
    r = await bind({ productKey: "mep", fingerprint: HUB_B, deviceName: "PC-B" });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /already bound to 1 device\(s\) \(max 1\)/);
  }));

test("an old Hub without x-adlm-fp-version gets a v1-labelled row", () =>
  withSwitch(undefined, async () => {
    const doc = userWith([ent("mep", [])]);
    await bind({ productKey: "mep", fingerprint: HUB_A, deviceName: "PC-A" }, { fpVersion: "" });
    const [row] = devicesOf(doc, "mep");
    assert.equal(row.fpVersion, 1);
    assert.equal(row.scheme, "v1");
  }));

test("kill switch off: revit binds like before (the Hub row takes the seat), rows unstamped", () =>
  withSwitch("0", async () => {
    const doc = userWith([ent("revit", [])]);
    const r = await bind({ productKey: "revit", fingerprint: HUB_A, deviceName: "PC-A" });
    assert.deepEqual(r.body, { ok: true, bound: true, devicesUsed: 1, maxSeats: 1 });
    const [row] = devicesOf(doc, "revit");
    assert.equal(row.fingerprint, HUB_A);
    assert.equal(row.source, undefined);
    assert.equal(row.scheme, undefined);
    assert.equal(row.client, undefined);
  }));

test("missing entitlement and bad input answer as before", () =>
  withSwitch(undefined, async () => {
    userWith([]);
    assert.equal((await bind({ productKey: "revit", fingerprint: HUB_A })).status, 404);
    assert.equal((await bind({ productKey: "revit" })).status, 400);
  }));
