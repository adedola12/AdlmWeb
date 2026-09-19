// server/routes/me.summary.devices.test.js
//
// GET /me/summary's per-entitlement `devices` list is what the Installer Hub
// gates Install/Update on: when it is non-empty and the Hub's own id is not
// in it, the Hub refuses with "bound to another device". For QUIV (revit)
// and ArchiCAD the rows are the app's, never the Hub's id, so a full licence
// locked customers out of updating their own PC. The list is now always
// empty for those products; seatsUsed still counts every machine.
//
// Real router over real HTTP with a real token; Mongo stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { Product } = await import("../models/Product.js");
const { Purchase } = await import("../models/Purchase.js");
const { Setting } = await import("../models/Setting.js");
const { default: meRouter, __test } = await import("./me.js");

const USER_ID = new mongoose.Types.ObjectId();
const day = (n) => new Date(Date.UTC(2026, 8, n, 9));
const FUTURE = new Date(Date.now() + 30 * 86400000);

const chain = (value) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  lean: async () => value,
  then: (ok, ko) => Promise.resolve(value).then(ok, ko),
});

let current = null;
User.findById = (id) => chain(String(id) === String(USER_ID) ? current : null);
Product.find = () => chain([]);
Purchase.find = () => chain([]);
Purchase.countDocuments = async () => 0;
Setting.findOne = () => chain(null);

const row = (fingerprint, name = "") => ({
  fingerprint,
  name,
  boundAt: day(1),
  lastSeenAt: day(5),
  revokedAt: null,
  fpVersion: 2,
});

function userWith(entitlements) {
  const doc = new User({ _id: USER_ID, email: "qs@example.com", entitlements });
  doc.save = async () => doc;
  current = doc;
  return doc;
}

const full = (productKey, fps) => ({
  productKey,
  status: "active",
  seats: fps.length,
  licenseType: fps.length > 1 ? "organization" : "personal",
  organizationName: fps.length > 1 ? "Firm Ltd" : "",
  expiresAt: FUTURE,
  devices: fps.map((fp, i) => row(fp, `PC-${i}`)),
  deviceFingerprint: fps[0],
});

async function summary() {
  const app = express();
  app.use(express.json());
  app.use("/me", meRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const token = signAccess({ _id: String(USER_ID), email: "qs@example.com", role: "user" });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/me/summary`, {
      headers: { authorization: `Bearer ${token}`, "x-adlm-client": "installer-hub" },
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function withSwitch(value, fn) {
  const prev = process.env.DEVICE_SCHEME_AWARE_BINDING;
  if (value === undefined) delete process.env.DEVICE_SCHEME_AWARE_BINDING;
  else process.env.DEVICE_SCHEME_AWARE_BINDING = value;
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.DEVICE_SCHEME_AWARE_BINDING;
    else process.env.DEVICE_SCHEME_AWARE_BINDING = prev;
  });
}

const byKey = (body, key) => body.entitlements.find((e) => e.productKey === key);

test("/me/summary: a full revit or archicad licence lists no devices; seatsUsed still counts", () =>
  withSwitch(undefined, async () => {
    userWith([
      full("revit", ["a1".repeat(32), "b1".repeat(32)]),
      full("archicad", ["c1".repeat(32)]),
      full("mep", ["d1".repeat(32)]),
    ]);
    const { status, body } = await summary();
    assert.equal(status, 200, JSON.stringify(body));

    const revit = byKey(body, "revit");
    assert.deepEqual(revit.devices, []);
    assert.equal(revit.seatsUsed, 2);
    assert.equal(revit.seatsAvailable, 0);
    assert.deepEqual(byKey(body, "archicad").devices, []);
    assert.equal(byKey(body, "archicad").seatsUsed, 1);

    // Products whose app shares the Hub's id keep the list (the Hub's gate
    // is correct for them).
    const mep = byKey(body, "mep");
    assert.equal(mep.devices.length, 1);
    assert.equal(mep.devices[0].fingerprint, "d1".repeat(32));
  }));

test("kill switch off: /me/summary lists revit devices again, as before", () =>
  withSwitch("0", async () => {
    userWith([full("revit", ["a1".repeat(32)])]);
    const { body } = await summary();
    assert.equal(byKey(body, "revit").devices.length, 1);
  }));

test("toEntitlementV2 (also behind GET /me and /me/entitlements-v2) hides revit devices", () =>
  withSwitch(undefined, () => {
    const out = __test.toEntitlementV2(full("revit", ["a1".repeat(32)]));
    assert.deepEqual(out.devices, []);
    assert.equal(out.seatsUsed, 1);
  }));
