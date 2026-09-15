// server/models/demoTenancy.integration.test.js
// The tenancy split exercised against a REAL MongoDB, not stubbed queries.
//
// demoTenancy.test.js proves the plugin builds the filter it means to. That is
// not the same as proving the database honours it, and the claim being made
// here — a demo session cannot read, change or delete a real row — is only
// worth anything if it survives contact with an actual query planner.
//
// Runs against an ephemeral in-memory mongod. If that binary cannot be started
// (no network on a CI box, say) the whole suite SKIPS rather than fails: a
// missing test binary is not a broken build, and a red suite nobody can fix
// locally is worse than an honest skip.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { registerDemoTenancy } from "./demoTenancy.js";
import { runAsDemo, runWithoutDemo } from "../util/demoContext.js";

let mongod = null;
let skip = false;
let Widget = null;
let Config = null;

before(async () => {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: "tenancy_test" });
  } catch (err) {
    skip = `in-memory mongod unavailable: ${err?.message || err}`;
    return;
  }

  // Register exactly as index.js does, then compile — order is the whole game.
  registerDemoTenancy();

  Widget = mongoose.model("Widget", new mongoose.Schema({ title: String, qty: Number }));
  // Stands in for Role/Setting: infrastructure both tenants must share.
  Config = mongoose.model(
    "Config",
    new mongoose.Schema({ key: String }, { demoTenancy: false }),
  );
});

after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Fresh data per test so ordering never matters.
async function reset() {
  await mongoose.connection.collection("widgets").deleteMany({});
  await mongoose.connection.collection("configs").deleteMany({});
  // Written through the driver, bypassing the plugin, so these are exactly what
  // pre-existing production rows look like: no isDemo field at all.
  await mongoose.connection.collection("widgets").insertMany([
    { title: "real-a", qty: 1 },
    { title: "real-b", qty: 2 },
  ]);
  await runAsDemo(() => Widget.create({ title: "demo-a", qty: 10 }));
}

describe("demo tenancy against a real database", () => {
  test("a real session sees only real rows", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    const rows = await Widget.find({}).lean();
    assert.deepEqual(rows.map((r) => r.title).sort(), ["real-a", "real-b"]);
  });

  test("a demo session sees only demo rows", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    const rows = await runAsDemo(() => Widget.find({}).lean());
    assert.deepEqual(rows.map((r) => r.title), ["demo-a"]);
  });

  test("rows written before this feature existed stay visible", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    // The real rows carry no isDemo field whatsoever — the $ne:true form is the
    // only reason a production database does not vanish on deploy.
    const raw = await mongoose.connection.collection("widgets").findOne({ title: "real-a" });
    assert.equal("isDemo" in raw, false, "real rows must not gain the field");
    assert.ok(await Widget.findOne({ title: "real-a" }));
  });

  test("a demo write lands in the demo tenant and is invisible to real sessions", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    await runAsDemo(() => Widget.create({ title: "made-by-designer", qty: 5 }));

    assert.equal(await Widget.findOne({ title: "made-by-designer" }), null);
    const inDemo = await runAsDemo(() => Widget.findOne({ title: "made-by-designer" }).lean());
    assert.ok(inDemo);
    assert.equal(inDemo.isDemo, true);
  });

  test("a demo update cannot change a real row, even by its own id", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    const real = await mongoose.connection.collection("widgets").findOne({ title: "real-a" });

    const res = await runAsDemo(() =>
      Widget.updateOne({ _id: real._id }, { $set: { title: "hijacked" } }),
    );

    assert.equal(res.matchedCount, 0, "must match nothing");
    const after = await mongoose.connection.collection("widgets").findOne({ _id: real._id });
    assert.equal(after.title, "real-a", "the real row must be untouched");
  });

  test("a demo delete-everything removes only demo rows", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    // The worst case: a designer clears a list. An unscoped filter here would
    // empty the production collection.
    const res = await runAsDemo(() => Widget.deleteMany({}));

    assert.equal(res.deletedCount, 1);
    const survivors = await mongoose.connection.collection("widgets").find({}).toArray();
    assert.deepEqual(survivors.map((r) => r.title).sort(), ["real-a", "real-b"]);
  });

  test("counts and aggregates are scoped both ways", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    assert.equal(await Widget.countDocuments({}), 2);
    assert.equal(await runAsDemo(() => Widget.countDocuments({})), 1);

    const realSum = await Widget.aggregate([{ $group: { _id: null, n: { $sum: "$qty" } } }]);
    const demoSum = await runAsDemo(() =>
      Widget.aggregate([{ $group: { _id: null, n: { $sum: "$qty" } } }]),
    );
    assert.equal(realSum[0].n, 3, "1 + 2 from the real rows");
    assert.equal(demoSum[0].n, 10, "the demo row alone");
  });

  test("a demo upsert creates a demo row rather than a stray real one", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    await runAsDemo(() =>
      Widget.findOneAndUpdate({ title: "brand-new" }, { $set: { qty: 9 } }, { upsert: true }),
    );

    const raw = await mongoose.connection.collection("widgets").findOne({ title: "brand-new" });
    assert.equal(raw.isDemo, true, "an upserted row must belong to the demo tenant");
    assert.equal(await Widget.findOne({ title: "brand-new" }), null, "invisible to real sessions");
  });

  test("opted-out collections are shared by both tenants", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    await Config.create({ key: "global" });
    // This is the Role/Setting case: a demo session MUST still resolve these or
    // it cannot work out its own permissions.
    assert.ok(await runAsDemo(() => Config.findOne({ key: "global" })));
    assert.ok(await Config.findOne({ key: "global" }));
  });

  test("runWithoutDemo reaches real rows from inside a demo request", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    // Exactly what requirePermission does: the caller's own row is real even
    // though their role is a demo one.
    const found = await runAsDemo(() =>
      runWithoutDemo(() => Widget.findOne({ title: "real-a" }).lean()),
    );
    assert.ok(found, "the auth escape hatch must see real data");
    assert.equal(found.title, "real-a");
  });

  test("concurrent real and demo requests do not bleed into each other", async (t) => {
    if (skip) return t.skip(skip);
    await reset();
    // AsyncLocalStorage is the whole basis for per-request scoping; if it leaked
    // under concurrency, one admin's list could be served from the demo tenant.
    const [real, demo, realAgain] = await Promise.all([
      Widget.find({}).lean(),
      runAsDemo(() => Widget.find({}).lean()),
      Widget.find({}).lean(),
    ]);
    assert.equal(real.length, 2);
    assert.equal(demo.length, 1);
    assert.equal(realAgain.length, 2);
  });
});
