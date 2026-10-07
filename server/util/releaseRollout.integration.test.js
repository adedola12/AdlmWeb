// server/util/releaseRollout.integration.test.js
//
// The staged rollout against a REAL MongoDB: approve to firms, a hotfix to
// everyone in the middle, the locked button, release to everyone, and taking a
// build back. No mail is sent: these functions only record notices.
//
// Needs a throwaway database. Set ROLLOUT_TEST_MONGO_URI to a local mongod
// (it must be localhost), or have mongodb-memory-server installed; otherwise
// the suite skips. It never reads MONGO_URI, which is the shared Atlas cluster.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

let mongod = null;
let skip = false;
let M = {};

before(async () => {
  let uri = process.env.ROLLOUT_TEST_MONGO_URI || "";
  if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(uri)) {
    skip = "ROLLOUT_TEST_MONGO_URI must point at localhost";
    return;
  }
  try {
    if (!uri) {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
    }
    await mongoose.connect(uri, { dbName: `rollout_test_${Date.now()}` });
  } catch (err) {
    skip = `no test database: ${err?.message || err}`;
    return;
  }
  M = {
    ...(await import("../models/ProductDeployment.js")),
    ...(await import("../models/ReleaseCandidate.js")),
    ...(await import("../models/ReleaseNotice.js")),
    ...(await import("../models/User.js")),
    ...(await import("./releaseGateFlow.js")),
    ...(await import("./releaseRollout.js")),
  };
});

after(async () => {
  if (mongoose.connection.readyState) {
    await mongoose.connection.db.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }
  if (mongod) await mongod.stop();
});

const pkg = (version) => ({
  productKey: "revit",
  displayName: "QUIV for Revit",
  version,
  enabled: true,
  packageKind: "zip",
  packageUri: `https://r2.test/revit-${version}.zip`,
  sha256: `sha-${version}`,
  envVars: { ADLM_KEY: `k-${version}` },
});

async function candidate(version, rollout = "organizations") {
  const live = await M.ProductDeployment.findOne({ productKey: "revit" }).lean();
  return M.ReleaseCandidate.create({
    productKey: "revit",
    displayName: "QUIV for Revit",
    fromVersion: live?.version || "",
    toVersion: version,
    payload: pkg(version),
    rollout,
    status: "approved",
    submittedBy: "admin@adlmstudio.net",
  });
}

const dep = () => M.ProductDeployment.findOne({ productKey: "revit" }).lean();

test("firms first, a hotfix for everyone, the locked button, then everyone", async (t) => {
  if (skip) return t.skip(skip);

  await M.User.create([
    {
      email: "ys@firm.test",
      entitlements: [{ productKey: "revit", status: "active", licenseType: "organization", organizationName: "Y.S. Associates Ltd", seats: 8 }],
    },
    {
      email: "small@firm.test",
      entitlements: [{ productKey: "revit", status: "active", licenseType: "organization", organizationName: "Small Co", seats: 3 }],
    },
    { email: "solo@me.test", entitlements: [{ productKey: "revit", status: "active", licenseType: "personal", seats: 1 }] },
  ]);
  await M.ProductDeployment.create(pkg("3.1.11"));

  // The firms' ring, from the real collection.
  const ring = await M.earlyRingUserIds(M.User);
  const ys = await M.User.findOne({ email: "ys@firm.test" }).lean();
  assert.deepEqual(ring, [String(ys._id)]);

  // 1. Approve 4.0.0: firms only.
  const c4 = await candidate("4.0.0");
  const a1 = await M.applyCandidate(c4, { actor: "richard@adlm.test" });
  assert.equal(a1.appliedTo, "organizations");
  let d = await dep();
  assert.equal(d.version, "3.1.11", "everyone else keeps the live build");
  assert.equal(d.earlyAccess.version, "4.0.0");
  assert.equal(d.earlyAccess.payload.packageUri, "https://r2.test/revit-4.0.0.zip");
  const n4 = await M.ReleaseNotice.findOne({ key: "revit@4.0.0" }).lean();
  assert.equal(n4.audience, "organizations");

  // What each account's Hub is offered.
  assert.equal(M.withEarlyAccess(d, { inRing: true }).version, "4.0.0");
  assert.equal(M.withEarlyAccess(d, { inRing: false }).version, "3.1.11");

  // 2. The button is locked for three months.
  await assert.rejects(M.releaseToEveryone("revit", { actor: "richard@adlm.test" }), (e) => e.status === 409);

  // 3. A hotfix for single users in the meantime goes to everyone, and the
  //    firms keep 4.0.0.
  const hot = await candidate("3.1.12", "everyone");
  const a2 = await M.applyCandidate(hot, { actor: "richard@adlm.test" });
  assert.equal(a2.appliedTo, "everyone");
  d = await dep();
  assert.equal(d.version, "3.1.12");
  assert.equal(d.earlyAccess.version, "4.0.0");
  const n3 = await M.ReleaseNotice.findOne({ key: "revit@3.1.12" }).lean();
  assert.equal(n3?.audience, "everyone", "single users are told about the hotfix");
  assert.equal((await M.ReleaseNotice.findOne({ key: "revit@4.0.0" }).lean()).status, "pending");

  // 4. A fix for the firms during the window keeps the original clock.
  const unlocks = d.earlyAccess.unlocksAt;
  const c401 = await candidate("4.0.1");
  await M.applyCandidate(c401, { actor: "richard@adlm.test" });
  d = await dep();
  assert.equal(d.earlyAccess.version, "4.0.1");
  assert.equal(new Date(d.earlyAccess.unlocksAt).getTime(), new Date(unlocks).getTime());
  assert.equal((await M.ReleaseNotice.findOne({ key: "revit@4.0.0" }).lean()).status, "superseded");

  // 5. Three months on, release to everyone.
  const later = new Date(new Date(unlocks).getTime() + 1000);
  const out = await M.releaseToEveryone("revit", { actor: "richard@adlm.test", now: later });
  d = await dep();
  assert.equal(d.version, "4.0.1");
  assert.equal(d.packageUri, "https://r2.test/revit-4.0.1.zip");
  assert.equal(d.envVars.ADLM_KEY, "k-4.0.1");
  assert.equal(d.earlyAccess, null);
  assert.equal(out.releaseNotice.widened, true);
  const widened = await M.ReleaseNotice.findOne({ key: "revit@4.0.1" }).lean();
  assert.equal(widened.audience, "everyone");
  assert.equal(widened.enrolledAt, null, "enrolled again on the next run");
});

test("taking a build back from firms", async (t) => {
  if (skip) return t.skip(skip);
  await M.ProductDeployment.deleteMany({});
  await M.ReleaseNotice.deleteMany({});
  await M.ProductDeployment.create(pkg("4.0.1"));

  const c = await candidate("4.1.0");
  await M.applyCandidate(c, { actor: "richard@adlm.test" });
  assert.equal((await dep()).earlyAccess.version, "4.1.0");

  const out = await M.withdrawEarlyAccess("revit", { actor: "richard@adlm.test" });
  assert.deepEqual(out.cancelled, ["revit@4.1.0"]);
  const d = await dep();
  assert.equal(d.earlyAccess, null);
  assert.equal(d.version, "4.0.1");
  await assert.rejects(M.withdrawEarlyAccess("revit", { actor: "x" }), (e) => e.status === 404);
});

test("a hotfix that catches up with the firms' build ends the early stage", async (t) => {
  if (skip) return t.skip(skip);
  await M.ProductDeployment.deleteMany({});
  await M.ProductDeployment.create(pkg("4.0.1"));
  await M.applyCandidate(await candidate("4.2.0"), { actor: "r" });
  assert.equal((await dep()).earlyAccess.version, "4.2.0");
  const a = await M.applyCandidate(await candidate("4.2.1", "everyone"), { actor: "r" });
  assert.equal(a.appliedTo, "everyone");
  const d = await dep();
  assert.equal(d.version, "4.2.1");
  assert.equal(d.earlyAccess, null);
});

test("the approver's switch overrides the candidate, and a first release goes to everyone", async (t) => {
  if (skip) return t.skip(skip);
  await M.ProductDeployment.deleteMany({});
  // Nothing live yet: everyone.
  const first = await M.applyCandidate(await candidate("1.0.0"), { actor: "r" });
  assert.equal(first.appliedTo, "everyone");
  assert.equal((await dep()).version, "1.0.0");
  // Staged as firms-first, switched to a hotfix at approval.
  const sw = await M.applyCandidate(await candidate("1.0.1"), { actor: "r", rollout: "everyone" });
  assert.equal(sw.appliedTo, "everyone");
  assert.equal((await dep()).version, "1.0.1");
});

test("GET /me/deployments: a firm's account gets the early build, a single user the live one", async (t) => {
  if (skip) return t.skip(skip);
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
  const { default: express } = await import("express");
  const { signAccess } = await import("../middleware/auth.js");
  const { default: router } = await import("../routes/me.deployments.js");

  await M.ProductDeployment.deleteMany({});
  await M.ProductDeployment.create(pkg("3.1.11"));
  await M.applyCandidate(await candidate("4.0.0"), { actor: "r" });

  const app = express();
  app.use(express.json());
  app.use("/me/deployments", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const get = async (email) => {
    const u = await M.User.findOne({ email }).lean();
    const token = signAccess({ _id: String(u._id), email, role: "user" });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/me/deployments`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    return (await res.json()).items.find((i) => i.productKey === "revit");
  };
  try {
    const firm = await get("ys@firm.test");
    assert.equal(firm.version, "4.0.0");
    assert.equal(firm.earlyAccess, true);
    assert.equal(firm.generalVersion, "3.1.11");
    assert.equal(firm.envVars.ADLM_KEY, "k-4.0.0");

    for (const email of ["solo@me.test", "small@firm.test"]) {
      const other = await get(email);
      assert.equal(other.version, "3.1.11", email);
      assert.equal(other.earlyAccess, undefined, `${email} never sees the early record`);
      assert.equal(JSON.stringify(other).includes("4.0.0"), false, `${email} response mentions 4.0.0`);
    }
  } finally {
    server.close();
  }
});
