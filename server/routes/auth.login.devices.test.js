// server/routes/auth.login.devices.test.js
//
// POST /auth/login for desktop apps, end to end over real HTTP: the real
// router, a real bcrypt check, a real licence token. Only Mongo is stubbed
// (User.findOne hands back a real, unsaved User document; save() is counted;
// the app-use evidence collections answer from in-memory lists).
//
// What it pins: the shipped QUIV plugin (mgu2 id, no client header of its own)
// takes over the seat the Installer Hub's hw2 row was holding; a row with
// signs of app use is never taken; refusals carry a plain-English `message`
// and a `holder` list with no fingerprints; the log line says which scheme,
// client and decision; and the kill switch restores the old answer.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const { User } = await import("../models/User.js");
const { Refresh } = await import("../models/Refresh.js");
const { UsageSession } = await import("../models/UsageSession.js");
const { TakeoffSession } = await import("../models/TakeoffSession.js");
const { default: authRouter } = await import("./auth.js");

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

const PASSWORD = "Correct-Horse-9";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const HUB_A = "a1".repeat(32);
const QUIV_A = "a2".repeat(32);
const QUIV_B = "b2".repeat(32);
const day = (n) => new Date(Date.UTC(2026, 8, n, 9));
const FUTURE = new Date(Date.now() + 30 * 86400000);
const QUIV_UA = "ADLM-RevitPlugin/3.0.1 (+https://www.adlmstudio.net)";

let current = null;
let saves = 0;
let usageSeats = [];
let takeoffSeats = [];
let evidenceFails = false;

User.findOne = async () => current;
Refresh.create = async () => ({});
UsageSession.distinct = async (field, q) => {
  if (evidenceFails) throw new Error("db down");
  return usageSeats.filter((s) => q.deviceFingerprint.$in.includes(s));
};
TakeoffSession.distinct = async (field, q) => {
  if (evidenceFails) throw new Error("db down");
  assert.equal(q.product, "QUIV");
  return takeoffSeats.filter((s) => q.seatId.$in.includes(s));
};

function userWith(entitlement) {
  const doc = new User({
    email: "qs@example.com",
    passwordHash: HASH,
    emailVerified: true,
    role: "user",
    entitlements: [entitlement],
  });
  doc.save = async () => {
    saves += 1;
    return doc;
  };
  saves = 0;
  usageSeats = [];
  takeoffSeats = [];
  evidenceFails = false;
  current = doc;
  return doc;
}

const hubRow = (fingerprint, name) => ({
  fingerprint,
  name,
  boundAt: day(1),
  lastSeenAt: day(10),
  revokedAt: null,
  fpVersion: 2,
});
const appRow = (fingerprint) => ({ ...hubRow(fingerprint, ""), source: "app", scheme: "mgu2" });

const revitEnt = (devices, seats = 1) => ({
  productKey: "revit",
  status: "active",
  seats,
  licenseType: seats > 1 ? "organization" : "personal",
  organizationName: seats > 1 ? "Firm Ltd" : "",
  expiresAt: FUTURE,
  devices,
  deviceFingerprint: devices[0]?.fingerprint,
  deviceBoundAt: day(1),
});

async function login(fingerprint, { headers = {}, productKey = "revit" } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  const logs = [];
  const orig = { log: console.log, warn: console.warn };
  console.log = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": QUIV_UA, "x-adlm-fp-version": "2", ...headers },
      body: JSON.stringify({
        identifier: "qs@example.com",
        password: PASSWORD,
        productKey,
        device_fingerprint: fingerprint,
      }),
    });
    return { status: res.status, body: await res.json(), logs };
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
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

const devices = (doc) => doc.entitlements[0].toObject().devices;

test("QUIV signs in on a licence whose only seat the Hub took: adopted, licensed, saved", () =>
  withSwitch(undefined, async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    const r = await login(QUIV_A);

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.licenseToken, "licence issued");
    assert.equal(saves, 1);
    const [row] = devices(doc);
    assert.equal(row.fingerprint, QUIV_A);
    assert.equal(row.installerFingerprint, HUB_A);
    assert.equal(row.installerName, "PC-A");
    assert.equal(row.scheme, "mgu2");
    assert.equal(row.source, "app");
    assert.equal(row.client, "ADLM-RevitPlugin/3.0.1");
    assert.equal(doc.entitlements[0].deviceFingerprint, QUIV_A);
    assert.ok(
      r.logs.some((l) =>
        /device seat adopted from installer-hub row: .*product=revit .*installerName="PC-A" scheme=mgu2 client=ADLM-RevitPlugin\/3\.0\.1 decision=adopt/.test(l),
      ),
      r.logs.join("\n"),
    );
  }));

test("a Hub row with app-use evidence is not adopted; the refusal explains itself", () =>
  withSwitch(undefined, async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    // R26 takeoff telemetry from that machine (sent only by the unreleased
    // R26 feat/takeoff-time-log build; the shipped one sends none).
    takeoffSeats = [HUB_A];
    const r = await login(QUIV_B);

    assert.equal(r.status, 403);
    assert.equal(r.body.code, "DEVICE_MISMATCH");
    assert.equal(r.body.error, "This subscription is already bound to another device.");
    assert.match(r.body.message, /already in use on another computer: PC-A/);
    assert.match(r.body.message, /ask your admin to reset the device, or free it from your account page/);
    assert.deepEqual(r.body.holder, [{ name: "PC-A", app: "ADLM Installer Hub", lastSeenAt: day(10).toISOString() }]);
    assert.ok(!JSON.stringify(r.body).includes(HUB_A.slice(0, 10)), "no fingerprint in the body");
    assert.equal(devices(doc)[0].fingerprint, HUB_A);
    assert.equal(saves, 0);
    assert.ok(
      r.logs.some((l) => /device binding rejected: .*code=DEVICE_MISMATCH .*scheme=mgu2 client=ADLM-RevitPlugin\/3\.0\.1 decision=reject/.test(l)),
      r.logs.join("\n"),
    );
  }));

test("heartbeat evidence protects the row too", () =>
  withSwitch(undefined, async () => {
    userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    usageSeats = [HUB_A];
    assert.equal((await login(QUIV_B)).status, 403);
  }));

test("if the evidence lookup fails, nothing is adopted (the old answer, with the new message)", () =>
  withSwitch(undefined, async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    evidenceFails = true;
    const r = await login(QUIV_A);
    assert.equal(r.status, 403);
    assert.equal(devices(doc)[0].fingerprint, HUB_A);
    assert.ok(r.logs.some((l) => /app-use lookup failed, not adopting/.test(l)));
  }));

test("org licence full of app rows: DEVICE_LIMIT_REACHED with message and holders, never fingerprints", () =>
  withSwitch(undefined, async () => {
    userWith(revitEnt([appRow(QUIV_A), { ...appRow("c2".repeat(32)), lastSeenAt: day(12) }], 2));
    const r = await login(QUIV_B);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "DEVICE_LIMIT_REACHED");
    assert.equal(r.body.error, "Device limit reached for this subscription.");
    assert.match(r.body.message, /^All 2 seats on this QUIV licence are in use: /);
    assert.equal(r.body.holder.length, 2);
    assert.equal(r.body.holder[0].lastSeenAt, day(12).toISOString(), "most recent first");
    for (const h of r.body.holder) assert.deepEqual(Object.keys(h).sort(), ["app", "lastSeenAt", "name"]);
    const text = JSON.stringify(r.body);
    for (const fp of [QUIV_A, QUIV_B, "c2".repeat(32)]) assert.ok(!text.includes(fp.slice(0, 10)));
  }));

test("R26 (x-adlm-client: revit-arch-plugin) on the Hub's machine matches its row and marks it app use", () =>
  withSwitch(undefined, async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    const r = await login(HUB_A, { headers: { "x-adlm-client": "revit-arch-plugin" } });
    assert.equal(r.status, 200);
    const [row] = devices(doc);
    assert.equal(row.fingerprint, HUB_A);
    assert.ok(row.appSeenAt);
    assert.equal(row.scheme, "hw2");

    // …after which QUIV on another PC cannot take it.
    const q = await login(QUIV_B);
    assert.equal(q.status, 403);
    assert.equal(devices(doc)[0].fingerprint, HUB_A);
  }));

// ── The access token and the `user` body keep their pre-change shape ──────

const PRE_CHANGE_ROW_KEYS = ["boundAt", "fingerprint", "fpVersion", "lastSeenAt", "name", "revokedAt"];
const tokenClaims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));

test("login: device rows in the token and the body carry no provenance (the Hub's id stays out)", () =>
  withSwitch(undefined, async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    const r = await login(QUIV_A);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // Stored in full…
    assert.equal(devices(doc)[0].installerFingerprint, HUB_A);
    assert.ok(devices(doc)[0].appSeenAt);
    // …handed out without it.
    for (const user of [r.body.user, tokenClaims(r.body.accessToken)]) {
      const [row] = user.entitlements[0].devices;
      assert.deepEqual(Object.keys(row).sort(), PRE_CHANGE_ROW_KEYS);
      assert.equal(row.fingerprint, QUIV_A);
    }
    assert.ok(!r.body.accessToken.includes(HUB_A.slice(0, 10)));
    assert.ok(!JSON.stringify(tokenClaims(r.body.accessToken)).includes(HUB_A));
    assert.ok(!JSON.stringify(r.body.user).includes(HUB_A));
  }));

test("refresh (lean user): device rows in the token and the body carry no provenance", async () => {
  const { default: cookieParser } = await import("cookie-parser");
  const { signRefresh } = await import("../util/jwt.js");
  const userId = new mongoose.Types.ObjectId();
  const stamped = {
    ...hubRow(QUIV_A, ""),
    source: "app",
    scheme: "mgu2",
    client: "ADLM-RevitPlugin/3.0.1",
    installerFingerprint: HUB_A,
    installerName: "PC-A",
    adoptedAt: day(11),
    appSeenAt: day(11),
  };
  const lean = { _id: userId, email: "qs@example.com", role: "user", entitlements: [revitEnt([stamped, hubRow(HUB_A, "PC-B")], 2)] };
  const origFindById = User.findById;
  const origRefreshFind = Refresh.findOne;
  User.findById = () => ({ lean: async () => lean });
  Refresh.findOne = async () => ({ userId });

  const app = express();
  app.use(cookieParser());
  app.use("/auth", authRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/auth/refresh`, {
      method: "POST",
      headers: { cookie: `rt=${signRefresh({ sub: String(userId) })}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    for (const user of [body.user, tokenClaims(body.accessToken)]) {
      const rows = user.entitlements[0].devices;
      assert.equal(rows.length, 2);
      for (const row of rows) assert.deepEqual(Object.keys(row).sort(), PRE_CHANGE_ROW_KEYS);
      assert.equal(rows[1].name, "PC-B");
    }
    assert.ok(!JSON.stringify(tokenClaims(body.accessToken)).includes('"installerName"'));
    // The lean record itself is untouched.
    assert.equal(lean.entitlements[0].devices[0].installerFingerprint, HUB_A);
  } finally {
    User.findById = origFindById;
    Refresh.findOne = origRefreshFind;
    await new Promise((r) => server.close(r));
  }
});

// ── Freed machine, then the Installer Hub bound the new one ────────────────

test("MEP personal: old PC freed, the Hub bound this one: the app signs in (was DEVICE_MISMATCH naming this PC)", () =>
  withSwitch(undefined, async () => {
    const HUB_B = "b1".repeat(32);
    const mep = (devs) => ({ ...revitEnt(devs), productKey: "mep" });
    const state = () =>
      mep([
        { ...hubRow(HUB_A, "OLD-PC"), revokedAt: day(12) }, // /me/devices/revoke
        { ...hubRow(HUB_B, "NEW-PC"), source: "installer-hub", scheme: "hw2", client: "installer-hub" }, // bind-device
      ]);
    const mepHeaders = { "user-agent": "ADLM-MEP/1.0" };

    const doc = userWith(state());
    assert.equal(doc.entitlements[0].deviceFingerprint, HUB_A, "the mirror still names the freed PC");
    const r = await login(HUB_B, { productKey: "mep", headers: mepHeaders });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.licenseToken);
    assert.equal(doc.entitlements[0].deviceFingerprint, HUB_B);
    assert.equal(devices(doc).length, 2, "no row added");
    assert.ok(devices(doc)[1].appSeenAt);
    assert.ok(r.logs.every((l) => !/device binding rejected/.test(l)), r.logs.join("\n"));

    // The freed PC is now the one refused, and it is told NEW-PC holds the seat.
    const old = await login(HUB_A, { productKey: "mep", headers: mepHeaders });
    assert.equal(old.status, 403);
    assert.equal(old.body.code, "DEVICE_MISMATCH");
    assert.match(old.body.message, /^This ADLM MEP & HVAC licence is already in use on another computer: NEW-PC \(ADLM MEP & HVAC app, /);

    // Kill switch off: refused as before.
    await withSwitch("0", async () => {
      userWith(state());
      const off = await login(HUB_B, { productKey: "mep", headers: mepHeaders });
      assert.equal(off.status, 403);
      assert.deepEqual(off.body, { error: "This subscription is already bound to another device.", code: "DEVICE_MISMATCH" });
    });
  }));

test("kill switch off: the Hub row keeps the seat and the body is exactly { error, code }", () =>
  withSwitch("0", async () => {
    const doc = userWith(revitEnt([hubRow(HUB_A, "PC-A")]));
    const r = await login(QUIV_A);
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, {
      error: "This subscription is already bound to another device.",
      code: "DEVICE_MISMATCH",
    });
    assert.equal(devices(doc)[0].fingerprint, HUB_A);
    assert.ok(r.logs.some((l) => /device binding rejected: .*devices=\[v2:a1a1a1a1a1…@2026-09-10\]$/.test(l)), r.logs.join("\n"));
  }));
