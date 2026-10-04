// server/routes/rategen.customRateGuard.integration.test.js
//
// Rate Gen desktop 2.9.x never downloads custom rates, and its sync treated
// every cloud custom rate missing from its local Saved Rates as deleted: a
// DELETE per rate, or a bulk PUT of its own list. A rate built on the website
// or on another PC was erased by the next desktop sync. These tests drive the
// real routers the way that desktop does and pin that it no longer can
// (util/rategenCustomRateGuard.js).
//
// Needs a throwaway database. Set RATEGEN_GUARD_TEST_MONGO_URI to a local
// mongod (it must be localhost), or have mongodb-memory-server installed;
// otherwise the suite skips. It never reads MONGO_URI, which is the shared
// Atlas cluster.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
delete process.env.MONGO_URI;
delete process.env.RATEGEN_MONGO_URI;

let mongod = null;
let server = null;
let base = "";
let skip = false;
let token = "";
let userId = null;
let RateGenLibrary;

const DESKTOP_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"; // made on this PC
const DESKTOP_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7"; // made on another PC
const WEB = "tiling-600x600-k3x9"; // made on the website builder

const rate = (customRateId, title, extra = {}) => ({
  customRateId,
  title,
  description: title,
  unit: "m2",
  materials: [{ rateType: "material", description: "Tile", quantity: 1, unit: "m2", unitPrice: 1000, totalCost: 1000 }],
  labour: [{ rateType: "labour", description: "Tiler", quantity: 1, unit: "m2", unitPrice: 500, totalCost: 500 }],
  netCost: 1500,
  overheadPercent: 10,
  profitPercent: 10,
  ...extra,
});

before(async () => {
  let uri = process.env.RATEGEN_GUARD_TEST_MONGO_URI || "";
  if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(uri)) {
    skip = "RATEGEN_GUARD_TEST_MONGO_URI must point at localhost";
    return;
  }
  try {
    if (!uri) {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
    }
    await mongoose.connect(uri, { dbName: `rategen_guard_test_${Date.now()}` });
  } catch (err) {
    skip = `no test database: ${err?.message || err}`;
    return;
  }

  const { signAccess } = await import("../middleware/auth.js");
  const { User } = await import("../models/User.js");
  ({ RateGenLibrary } = await import("../models/RateGenLibrary.js"));
  const libraryRouter = (await import("./rategen.library.js")).default;
  const legacyRouter = (await import("./rategen.js")).default;

  const user = await User.create({
    email: `guard-${Date.now()}@adlm.test`,
    username: `guard${Date.now()}`,
    entitlements: [{ productKey: "rategen", status: "active", expiresAt: new Date(Date.now() + 864e5) }],
  });
  userId = user._id;
  token = signAccess({ _id: String(user._id), email: user.email, role: "user" });

  const app = express();
  app.use(express.json());
  app.use("/rategen-v2", libraryRouter);
  app.use("/rategen", legacyRouter);
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err?.message || err) }));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose.connection.readyState) {
    await mongoose.connection.db.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }
  if (mongod) await mongod.stop();
});

async function call(method, path, body, { syncAware = false, headers: extra = {} } = {}) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/json", ...extra };
  if (body) headers["content-type"] = "application/json";
  if (syncAware) headers["x-adlm-rates-sync"] = "2";
  // node:http, not fetch: Node's fetch adds Sec-Fetch-Mode to every request,
  // which the rate write guard rightly reads as a browser. Rate Gen desktop's
  // HttpClient sends no Sec-Fetch-* and no Origin, and neither does this.
  const payload = body ? JSON.stringify(body) : null;
  if (payload) headers["content-length"] = Buffer.byteLength(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = {};
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// The cloud as a QS with two PCs and the website would have it.
async function seedCloud() {
  await RateGenLibrary.deleteMany({ userId });
  for (const r of [rate(DESKTOP_A, "Desktop A rate"), rate(DESKTOP_B, "Desktop B rate"), rate(WEB, "Website rate")]) {
    const put = await call("PUT", `/rategen-v2/library/custom-rates/${encodeURIComponent(r.customRateId)}`, r);
    assert.equal(put.status, 200, JSON.stringify(put.json));
  }
}

const cloudIds = async () =>
  (await call("GET", "/rategen-v2/library/user-rates")).json.customRates.map((r) => r.customRateId).sort();

test("each new rate records where it was made", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const lib = await RateGenLibrary.findOne({ userId }).lean();
  const origin = Object.fromEntries(lib.customRates.map((r) => [r.customRateId, r.origin]));
  assert.deepEqual(origin, { [DESKTOP_A]: "desktop", [DESKTOP_B]: "desktop", [WEB]: "web" });
});

test("2.9.x bulk sync: a rate made on the website survives", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  // What PC A's PushWholeSnapshotAsync sends: its own list, and nothing else.
  const put = await call("PUT", "/rategen-v2/library/user-rates", { customRates: [rate(DESKTOP_A, "Desktop A rate")] });
  assert.equal(put.status, 200);
  const ids = await cloudIds();
  assert.ok(ids.includes(WEB), "website rate was erased");
  assert.ok(ids.includes(DESKTOP_A));
  // Another desktop's rate is the one case an old desktop's omission can mean
  // "I deleted it": it goes, but to the archive.
  assert.ok(!ids.includes(DESKTOP_B));
  const deleted = (await call("GET", "/rategen-v2/library/custom-rates/deleted")).json.items;
  assert.deepEqual(deleted.map((r) => r.customRateId), [DESKTOP_B]);
  assert.equal(deleted[0].deletedReason, "omitted-by-desktop-sync");
});

test("2.9.x bulk sync from a fresh install (empty list) removes nothing", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const put = await call("PUT", "/rategen-v2/library/user-rates", { customRates: [] });
  assert.equal(put.status, 200);
  assert.deepEqual(await cloudIds(), [DESKTOP_A, DESKTOP_B, WEB].sort());
});

test("2.9.x fallback DELETE of a website rate is answered ok but refused", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const del = await call("DELETE", `/rategen-v2/library/custom-rates/${WEB}`);
  assert.equal(del.status, 200, "an error would abort the old desktop's whole sync");
  assert.equal(del.json.kept, true);
  assert.ok((await cloudIds()).includes(WEB));
});

test("2.9.x DELETE of a desktop rate goes through, archived and restorable", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const del = await call("DELETE", `/rategen-v2/library/custom-rates/${DESKTOP_B}`);
  assert.equal(del.status, 200);
  assert.ok(!(await cloudIds()).includes(DESKTOP_B));

  const restore = await call("POST", `/rategen-v2/library/custom-rates/${DESKTOP_B}/restore`);
  assert.equal(restore.status, 200);
  assert.equal(restore.json.restored, true);
  const back = (await call("GET", "/rategen-v2/library/user-rates")).json.customRates.find(
    (r) => r.customRateId === DESKTOP_B,
  );
  assert.equal(back.title, "Desktop B rate");
  assert.equal((await call("GET", "/rategen-v2/library/custom-rates/deleted")).json.items.length, 0);
});

test("a sync-aware desktop: bulk never deletes, an explicit DELETE does", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const put = await call(
    "PUT",
    "/rategen-v2/library/user-rates",
    { customRates: [rate(DESKTOP_A, "Desktop A rate, edited")] },
    { syncAware: true },
  );
  assert.equal(put.status, 200);
  assert.deepEqual(await cloudIds(), [DESKTOP_A, DESKTOP_B, WEB].sort());

  const del = await call("DELETE", `/rategen-v2/library/custom-rates/${WEB}`, null, { syncAware: true });
  assert.equal(del.status, 200);
  assert.equal(del.json.kept, undefined);
  assert.ok(!(await cloudIds()).includes(WEB));
  const deleted = (await call("GET", "/rategen-v2/library/custom-rates/deleted")).json.items;
  assert.equal(deleted[0].customRateId, WEB);
  assert.equal(deleted[0].deletedReason, "deleted-by-client");
});

test("the older /rategen/library bulk PUT keeps website rates too, and does not leak the archive", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const put = await call("PUT", "/rategen/library", { customRates: [rate(DESKTOP_A, "Desktop A rate")] });
  assert.equal(put.status, 200);
  assert.equal(put.json.deletedCustomRates, undefined);
  const ids = put.json.customRates.map((r) => r.customRateId);
  assert.ok(ids.includes(WEB));
  assert.ok(ids.includes(DESKTOP_A));
});

// -- Rates are built in Rate Gen: the website reads, it does not write --------
// (middleware/rateGenOnlyWrites.js). What a browser on adlmstudio.net sends.
const BROWSER = { origin: "https://adlmstudio.net", "sec-fetch-site": "same-site" };

test("a browser cannot build, edit or delete a custom rate", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const before = await cloudIds();

  const put = await call(
    "PUT",
    "/rategen-v2/library/custom-rates/web-built-k9",
    rate("web-built-k9", "From a browser"),
    { headers: BROWSER },
  );
  assert.equal(put.status, 403);
  assert.equal(put.json.code, "RATES_BUILT_IN_RATEGEN");
  assert.match(put.json.error, /Rate Gen/);

  const del = await call("DELETE", `/rategen-v2/library/custom-rates/${DESKTOP_A}`, null, { headers: BROWSER });
  assert.equal(del.status, 403);

  const bulk = await call("PUT", "/rategen-v2/library/user-rates", { customRates: [] }, { headers: BROWSER });
  assert.equal(bulk.status, 403);
  const legacy = await call("PUT", "/rategen/library", { customRates: [] }, { headers: BROWSER });
  assert.equal(legacy.status, 403);

  assert.deepEqual(await cloudIds(), before, "a refused write must change nothing");
});

test("a browser cannot edit its copy of a published rate", async (t) => {
  if (skip) return t.skip(skip);
  const path = "/rategen-v2/library/user-rates/override/64b000000000000000000001";
  const put = await call("PUT", path, { overheadPercent: 20 }, { headers: BROWSER });
  assert.equal(put.status, 403);
  const del = await call("DELETE", path, null, { headers: BROWSER });
  assert.equal(del.status, 403);
});

test("a browser cannot change material or labour prices; it can still read them", async (t) => {
  if (skip) return t.skip(skip);
  await RateGenLibrary.deleteMany({ userId });
  const cement = { kind: "material", name: "Cement", unit: "bag", price: 9000 };
  const one = await call("PUT", "/rategen/price-overrides", cement, { headers: BROWSER });
  assert.equal(one.status, 403);
  const bulk = await call("PUT", "/rategen/price-overrides/bulk", { kind: "material", percent: 5 }, { headers: BROWSER });
  assert.equal(bulk.status, 403);
  const restore = await call("PUT", "/rategen/price-overrides/restore", { items: [] }, { headers: BROWSER });
  assert.equal(restore.status, 403);

  const read = await call("GET", "/rategen/price-overrides", null, { headers: BROWSER });
  assert.equal(read.status, 200);
  assert.deepEqual(read.json.items, []);
});

test("Rate Gen desktop (no Origin) still writes prices and rates", async (t) => {
  if (skip) return t.skip(skip);
  await RateGenLibrary.deleteMany({ userId });
  const cement = { kind: "material", name: "Cement", unit: "bag", price: 9000 };
  const price = await call("PUT", "/rategen/price-overrides", cement);
  assert.equal(price.status, 200, JSON.stringify(price.json));
  const put = await call("PUT", `/rategen-v2/library/custom-rates/${DESKTOP_A}`, rate(DESKTOP_A, "Desktop A rate"));
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const named = await call(
    "PUT",
    `/rategen-v2/library/custom-rates/${DESKTOP_B}`,
    rate(DESKTOP_B, "Desktop B rate"),
    { headers: { "x-adlm-client": "rategen" } },
  );
  assert.equal(named.status, 200, JSON.stringify(named.json));
});

test("a browser that sets X-ADLM-Client itself is still refused", async (t) => {
  if (skip) return t.skip(skip);
  await RateGenLibrary.deleteMany({ userId });
  const put = await call(
    "PUT",
    `/rategen-v2/library/custom-rates/${DESKTOP_A}`,
    rate(DESKTOP_A, "Spoofed"),
    { headers: { origin: "https://adlmstudio.net", "x-adlm-client": "rategen" } },
  );
  assert.equal(put.status, 403);
  assert.equal(put.json.code, "RATES_BUILT_IN_RATEGEN");
  assert.deepEqual(await cloudIds(), []);
});

test("a browser can still read the library and restore an archived rate (#116)", async (t) => {
  if (skip) return t.skip(skip);
  await seedCloud();
  const del = await call("DELETE", `/rategen-v2/library/custom-rates/${DESKTOP_B}`);
  assert.equal(del.status, 200);

  const list = await call("GET", "/rategen-v2/library/user-rates", null, { headers: BROWSER });
  assert.equal(list.status, 200);
  const archived = await call("GET", "/rategen-v2/library/custom-rates/deleted", null, { headers: BROWSER });
  assert.equal(archived.status, 200);
  assert.equal(archived.json.items[0].customRateId, DESKTOP_B);

  const restore = await call(
    "POST",
    `/rategen-v2/library/custom-rates/${DESKTOP_B}/restore`,
    null,
    { headers: BROWSER },
  );
  assert.equal(restore.status, 200);
  assert.ok((await cloudIds()).includes(DESKTOP_B));
});
