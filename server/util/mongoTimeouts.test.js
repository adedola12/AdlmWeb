// server/util/mongoTimeouts.test.js
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoServerSelectionError,
  MongoServerError,
} from "mongodb";
import { apiMongoOptions, isMongoUnavailableError } from "./mongoTimeouts.js";

// ── The API's timeouts ──────────────────────────────────────────────────────

test("the API fails a stalled operation well inside Lambda's 60s kill", () => {
  const o = apiMongoOptions({});
  assert.equal(o.socketTimeoutMS, 25000);
  assert.equal(o.waitQueueTimeoutMS, 10000);
  assert.ok(o.socketTimeoutMS < 60000);
  // One connection is kept ready, so a cleared pool refills in the background.
  assert.equal(o.minPoolSize, 1);
});

test("either limit can be tuned or switched off from SSM without a code change", () => {
  assert.deepEqual(
    apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "15000", MONGO_WAIT_QUEUE_TIMEOUT_MS: "5000" }),
    { socketTimeoutMS: 15000, waitQueueTimeoutMS: 5000, minPoolSize: 1 },
  );
  // 0 means "no limit", i.e. the driver default, so the option is left out.
  assert.deepEqual(
    apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "0", MONGO_WAIT_QUEUE_TIMEOUT_MS: "0", MONGO_MIN_POOL: "0" }),
    {},
  );
    { socketTimeoutMS: 15000, waitQueueTimeoutMS: 5000, autoIndex: false, autoCreate: false },
  );
  // 0 means "no limit", i.e. the driver default, so the option is left out.
  assert.deepEqual(apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "0", MONGO_WAIT_QUEUE_TIMEOUT_MS: "0" }), {
    autoIndex: false,
    autoCreate: false,
  });
});

test("a nonsense value falls back to the default rather than disabling the limit", () => {
  const o = apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "soon", MONGO_WAIT_QUEUE_TIMEOUT_MS: "-1" });
  assert.equal(o.socketTimeoutMS, 25000);
  assert.equal(o.waitQueueTimeoutMS, 10000);
});

test("the minimum pool is tunable and can never exceed the maximum", () => {
  assert.equal(apiMongoOptions({ MONGO_MIN_POOL: "2" }).minPoolSize, 2);
  // A minimum above the maximum would make the driver refuse to connect.
  assert.equal(apiMongoOptions({ MONGO_MIN_POOL: "9", MONGO_MAX_POOL: "5" }).minPoolSize, 5);
  assert.equal(apiMongoOptions({ MONGO_MIN_POOL: "3", MONGO_MAX_POOL: "2" }).minPoolSize, 2);
  assert.equal(apiMongoOptions({ MONGO_MIN_POOL: "junk" }).minPoolSize, 1);
  assert.equal(apiMongoOptions({ MONGO_MIN_POOL: "1.7" }).minPoolSize, 1);
// ── No index building from API containers ──────────────────────────────────

test("the API connects without building indexes or collections", () => {
  // Each cold container used to queue ~324 createCollection/createIndex
  // commands ahead of real queries; a deploy's wave of them caused the 503s.
  const o = apiMongoOptions({});
  assert.equal(o.autoIndex, false);
  assert.equal(o.autoCreate, false);
});

test("MONGO_AUTO_INDEX=true restores mongoose's default from SSM", () => {
  for (const v of ["true", "1", "yes", " TRUE "]) {
    const o = apiMongoOptions({ MONGO_AUTO_INDEX: v });
    assert.equal("autoIndex" in o, false, v);
    assert.equal("autoCreate" in o, false, v);
  }
  for (const v of ["false", "0", "", undefined]) {
    assert.equal(apiMongoOptions({ MONGO_AUTO_INDEX: v }).autoIndex, false, String(v));
  }
});

// ── Which errors mean "the database did not answer" ────────────────────────

test("the driver's own stall and failover errors are recognised", () => {
  assert.ok(isMongoUnavailableError(new MongoNetworkTimeoutError("connection 3 timed out")));
  assert.ok(isMongoUnavailableError(new MongoNetworkError("connection closed")));
  assert.ok(isMongoUnavailableError(new MongoServerSelectionError("no primary", { error: undefined })));
  assert.ok(isMongoUnavailableError(new mongoose.Error.MongooseServerSelectionError("no primary")));
});

test("a mongoose buffering timeout (disconnected) is recognised", () => {
  assert.ok(
    isMongoUnavailableError(new Error("Operation `users.findOne()` buffering timed out after 10000ms")),
  );
});

test("a wrapped cause is followed", () => {
  const outer = new Error("load failed", { cause: new MongoNetworkTimeoutError("timed out") });
  assert.ok(isMongoUnavailableError(outer));
});

test("the database saying no is NOT an outage", () => {
  const dup = new MongoServerError({ message: "E11000 duplicate key", code: 11000 });
  assert.equal(isMongoUnavailableError(dup), false);
  assert.equal(isMongoUnavailableError(new mongoose.Error.ValidationError()), false);
  assert.equal(isMongoUnavailableError(new Error("Server error")), false);
  assert.equal(isMongoUnavailableError(null), false);
});

// ── connectDB passes them through; jobs and scripts get none ───────────────

test("connectDB hands the API's options to mongoose, and nothing extra otherwise", async () => {
  const seen = [];
  const realConnect = mongoose.connect;
  mongoose.connect = async (uri, opts) => {
    seen.push(opts);
    throw new Error("stub: not connecting");
  };
  try {
    const { connectDB } = await import("../db.js");
    await assert.rejects(connectDB("mongodb://stub", apiMongoOptions({})));
    await assert.rejects(connectDB("mongodb://stub"));
  } finally {
    mongoose.connect = realConnect;
  }
  assert.equal(seen[0].socketTimeoutMS, 25000);
  assert.equal(seen[0].waitQueueTimeoutMS, 10000);
  // The existing options are untouched.
  assert.equal(seen[0].serverSelectionTimeoutMS, 10000);
  assert.equal(seen[0].minPoolSize, 1);
  assert.equal(seen[0].autoIndex, false);
  assert.equal(seen[1].socketTimeoutMS, undefined);
  // Jobs and scripts keep an empty minimum.
  assert.equal(seen[1].minPoolSize, 0);
  assert.equal(seen[1].waitQueueTimeoutMS, undefined);
  // Jobs and scripts keep mongoose's index building.
  assert.equal(seen[1].autoIndex, undefined);
  assert.equal(seen[1].autoCreate, undefined);
});
