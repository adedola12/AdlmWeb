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
});

test("either limit can be tuned or switched off from SSM without a code change", () => {
  assert.deepEqual(
    apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "15000", MONGO_WAIT_QUEUE_TIMEOUT_MS: "5000" }),
    { socketTimeoutMS: 15000, waitQueueTimeoutMS: 5000 },
  );
  // 0 means "no limit", i.e. the driver default, so the option is left out.
  assert.deepEqual(apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "0", MONGO_WAIT_QUEUE_TIMEOUT_MS: "0" }), {});
});

test("a nonsense value falls back to the default rather than disabling the limit", () => {
  const o = apiMongoOptions({ MONGO_SOCKET_TIMEOUT_MS: "soon", MONGO_WAIT_QUEUE_TIMEOUT_MS: "-1" });
  assert.equal(o.socketTimeoutMS, 25000);
  assert.equal(o.waitQueueTimeoutMS, 10000);
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
  assert.equal(seen[1].socketTimeoutMS, undefined);
  assert.equal(seen[1].waitQueueTimeoutMS, undefined);
});
