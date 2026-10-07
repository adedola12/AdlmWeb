// server/routes/downloads.android.test.js
//
// The owner's rule (3 Oct 2026): the only thing downloadable from the website
// is the Installer Hub's .exe, and everything else comes from the Hub.
//
// GET /downloads/android was the one build anybody with the URL could pull,
// signed in or not. It cannot come "from the Hub" — the Hub is a Windows
// desktop application and this is an Android package — so the rule is applied
// where it bites: no SOFTWARE leaves the website anonymously any more.
//
// Driven over real HTTP with a real signed token, like the Installer Hub test
// beside it; only Mongo is stubbed.
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
const { publicDownloads } = await import("./downloads.js");
const { _resetDownloadCache } = await import("../util/downloadLinks.js");

const APK_URL = "https://downloads.example.test/ADLM-Studio.apk";
const USER_ID = new mongoose.Types.ObjectId();

const realUserFindById = User.findById;
const realSettingFindOne = Setting.findOne;

function stubMongo() {
  User.findById = () => ({
    select: () => ({ lean: async () => ({ _id: USER_ID, email: "someone@practice.ng", role: "user" }) }),
    lean: async () => ({ _id: USER_ID, email: "someone@practice.ng", role: "user" }),
  });
  Setting.findOne = () => ({
    select: () => ({ lean: async () => ({ key: "global", mobileAppUrl: APK_URL }) }),
    lean: async () => ({ key: "global", mobileAppUrl: APK_URL }),
  });
}

function restoreMongo() {
  User.findById = realUserFindById;
  Setting.findOne = realSettingFindOne;
}

async function withServer(fn) {
  const app = express();
  app.use("/downloads", publicDownloads);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

/** Raw request so a 302 is observed rather than followed. */
function get(port, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, path, method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("the Android app is no longer anonymously downloadable", async (t) => {
  stubMongo();
  _resetDownloadCache?.();
  t.after(restoreMongo);

  await withServer(async (port) => {
    // THE RULE. Before 3 Oct this answered 302 to the APK for anyone at all.
    const anon = await get(port, "/downloads/android");
    assert.notEqual(anon.status, 302, "an anonymous visitor must not be redirected to the build");
    assert.equal(anon.status, 401, `expected 401, got ${anon.status}`);

    // And it is a gate, not a removal: the app is still there for a customer.
    const token = signAccess({ _id: USER_ID, email: "someone@practice.ng", role: "user" });
    const signedIn = await get(port, "/downloads/android", token);
    assert.equal(signedIn.status, 302, `a signed-in account should still get the app, got ${signedIn.status}`);
    assert.equal(signedIn.location, APK_URL);
  });
});
