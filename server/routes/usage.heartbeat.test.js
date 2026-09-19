// server/routes/usage.heartbeat.test.js
//
// A heartbeat is an app running on a machine, so besides lastSeenAt it now
// stamps appSeenAt on the matching device row: such a row is app use and is
// never adopted away by another sign-in (util/deviceBinding.js). The
// Installer Hub is not an app; its heartbeat, should it ever send one, must
// leave its rows adoptable. Real router over HTTP; Mongo stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { UsageSession } = await import("../models/UsageSession.js");
const { default: usageRouter } = await import("./usage.js");

const USER_ID = new mongoose.Types.ObjectId();
const FP = "a2".repeat(32);

let updates = [];
UsageSession.findOne = () => ({ sort: async () => null });
UsageSession.create = async () => ({});
User.updateOne = (filter, update, options) => {
  updates.push({ filter, update, options });
  return Promise.resolve({ acknowledged: true });
};

async function beat(headers = {}) {
  const app = express();
  app.use(express.json());
  app.use("/usage", usageRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const token = signAccess({ _id: String(USER_ID), email: "qs@example.com", role: "user" });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/usage/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify({ productKey: "revit", appVersion: "3.0.1", fpVersion: 2, deviceFingerprint: FP }),
    });
    return res.status;
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

const setOf = () => updates[0].update.$set;

test("an app heartbeat stamps appSeenAt alongside lastSeenAt on the matching row", () =>
  withSwitch(undefined, async () => {
    updates = [];
    assert.equal(await beat(), 204);
    assert.equal(updates.length, 1);
    const set = setOf();
    assert.ok(set["entitlements.$[ent].devices.$[dev].lastSeenAt"] instanceof Date);
    assert.ok(set["entitlements.$[ent].devices.$[dev].appSeenAt"] instanceof Date);
    assert.deepEqual(updates[0].options.arrayFilters, [
      { "ent.productKey": "revit" },
      { "dev.fingerprint": FP },
    ]);
  }));

test("the Installer Hub's heartbeat does not mark its row as app use", () =>
  withSwitch(undefined, async () => {
    updates = [];
    await beat({ "x-adlm-client": "installer-hub" });
    assert.equal(setOf()["entitlements.$[ent].devices.$[dev].appSeenAt"], undefined);
  }));

test("kill switch off: only lastSeenAt, as before", () =>
  withSwitch("0", async () => {
    updates = [];
    await beat();
    assert.deepEqual(Object.keys(setOf()), ["entitlements.$[ent].devices.$[dev].lastSeenAt"]);
  }));
