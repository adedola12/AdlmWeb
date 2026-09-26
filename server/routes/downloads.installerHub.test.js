// server/routes/downloads.installerHub.test.js
//
// R3 (2026-09-26): an unpaid account must not be able to download the
// Installer Hub. GET /me/downloads/installer-hub is driven over real HTTP with
// a real signed token; only Mongo is stubbed (User.findById / Setting.findOne
// return plain objects), and private storage is left unconfigured so the link
// comes from the Admin setting, exactly as it does before a file is uploaded.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
delete process.env.FILES_BUCKET;

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { Setting } = await import("../models/Setting.js");
const { meDownloads } = await import("./downloads.js");
const { canDownloadInstallerHub, HUB_REQUIRES_PAID } = await import("../util/installerHubAccess.js");
const { _resetDownloadCache } = await import("../util/downloadLinks.js");

const HUB_URL = "https://downloads.example.test/ADLM-Installer-Hub-Setup.exe";
const USER_ID = new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

let current = null;
User.findById = (id) => ({
  select: () => ({
    lean: async () => (String(id) === String(USER_ID) ? current : null),
  }),
});
Setting.findOne = () => ({
  select: () => ({ lean: async () => ({ installerHubUrl: HUB_URL }) }),
});

const customer = (entitlements, extra = {}) => ({
  _id: USER_ID,
  email: "qs@example.com",
  role: "user",
  entitlements,
  ...extra,
});
const ent = (productKey, status, expiresAt) => ({ productKey, status, expiresAt });

async function getHub({ signedIn = true } = {}) {
  _resetDownloadCache();
  const app = express();
  app.use("/me/downloads", meDownloads);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const headers = {};
    if (signedIn) {
      const token = signAccess({ _id: String(USER_ID), email: "qs@example.com", role: "user" });
      headers.authorization = `Bearer ${token}`;
    }
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/me/downloads/installer-hub`,
      { headers },
    );
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("signed out: 401, no link", async () => {
  current = customer([ent("revit", "active", new Date(Date.now() + 30 * DAY))]);
  const r = await getHub({ signedIn: false });
  assert.equal(r.status, 401);
  assert.equal(r.body.url, undefined);
});

test("signed in with no licence: 403 HUB_REQUIRES_PAID, no link", async () => {
  current = customer([]);
  const r = await getHub();
  assert.equal(r.status, 403);
  assert.equal(r.body.code, HUB_REQUIRES_PAID);
  assert.equal(r.body.url, undefined);
});

test("signed in with only inactive/disabled licences: 403", async () => {
  current = customer([ent("revit", "inactive"), ent("planswift", "disabled")]);
  const r = await getHub();
  assert.equal(r.status, 403);
  assert.equal(r.body.code, HUB_REQUIRES_PAID);
});

test("paid and active: 200 with the download link", async () => {
  current = customer([ent("revit", "active", new Date(Date.now() + 30 * DAY))]);
  const r = await getHub();
  assert.equal(r.status, 200);
  assert.equal(r.body.url, HUB_URL);
  assert.equal(r.body.fileName, "ADLM-Installer-Hub-Setup.exe");
});

test("active with no end date (perpetual): 200", async () => {
  current = customer([ent("rategen", "active")]);
  const r = await getHub();
  assert.equal(r.status, 200);
});

test("licence still marked active but past its expiresAt: 403", async () => {
  current = customer([ent("revit", "active", new Date(Date.now() - DAY))]);
  const r = await getHub();
  assert.equal(r.status, 403);
  assert.equal(r.body.code, HUB_REQUIRES_PAID);
});

test("licence marked expired: 403", async () => {
  current = customer([ent("revit", "expired", new Date(Date.now() - DAY))]);
  const r = await getHub();
  assert.equal(r.status, 403);
});

test("a disabled account is refused even with a live licence", async () => {
  current = customer([ent("revit", "active", new Date(Date.now() + DAY))], { disabled: true });
  const r = await getHub();
  assert.equal(r.status, 403);
});

test("staff keep access without a licence (admin role, God account)", async () => {
  current = customer([], { role: "admin" });
  assert.equal((await getHub()).status, 200);
  current = customer([], { isGod: true });
  assert.equal((await getHub()).status, 200);
});

test("the pure rule: one live licence among expired ones is enough", () => {
  const now = Date.UTC(2026, 8, 26);
  const u = customer([
    ent("revit", "active", new Date(now - DAY)),
    ent("mep", "active", new Date(now + DAY)),
  ]);
  assert.equal(canDownloadInstallerHub(u, now), true);
  assert.equal(canDownloadInstallerHub(customer([ent("revit", "active", new Date(now - DAY))]), now), false);
  assert.equal(canDownloadInstallerHub(null, now), false);
});
