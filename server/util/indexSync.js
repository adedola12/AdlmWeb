// server/util/indexSync.js
//
// Builds every model's indexes, once, from a scheduled job, instead of from
// every API container at cold start.
//
// Why (investigated 2026-09-27): mongoose's autoIndex and autoCreate are on by
// default, so each new API container, the moment it connected, sent a
// createCollection for each of its 82 models and a createIndex for each of
// their 242 schema indexes. Those ~324 commands sat in the container's
// 5-connection pool ahead of the role seed and the user's own query. One cold
// container got through them in ~6 s. A deploy starts 11-18 containers inside
// a few seconds, ~5,000 DDL commands reach the Atlas M10 together, every round
// trip slows, and user queries waited past the 10 s wait-queue limit: "[mongo]
// connected" logged in ~1 s, then "role seed failed: Timed out while checking
// out a connection from connection pool" 18-20 s later, then a 503
// DB_UNAVAILABLE for the request (38 errors in the 22:58 UTC minute on
// 26 Sep 2026, 12 in 06:39 UTC on 27 Sep).
//
// The API now connects with autoIndex/autoCreate off (util/mongoTimeouts.js),
// and this job keeps the indexes in step. It only ever CREATES (createIndexes,
// never syncIndexes), so an index someone added by hand in Atlas is never
// dropped. It runs after the daily expiry job and can be run by hand after a
// deploy that adds an index: invoke the scheduled function with
// { "job": "sync-indexes" }.

import mongoose from "mongoose";

/**
 * Create the declared indexes of every registered model, one model at a time
 * so the job never floods the pool. A model that fails (e.g. an index whose
 * options conflict with an existing one) is reported and skipped; it never
 * stops the others.
 *
 * `models` is injectable for tests; the default is every model the app
 * defines (util/allModels.js).
 */
export async function syncAllIndexes({ models, log = console } = {}) {
  let list = models;
  if (!list) {
    await import("./allModels.js");
    list = mongoose.modelNames().map((n) => mongoose.model(n));
  }

  const startedAt = Date.now();
  const failed = [];
  let ok = 0;
  for (const Model of list) {
    try {
      await Model.createIndexes();
      ok += 1;
    } catch (err) {
      const reason = String(err?.message || err).slice(0, 300);
      failed.push({ model: Model.modelName, error: reason });
      log.warn?.(`[indexes] ${Model.modelName} failed: ${reason}`);
    }
  }
  return { ok: failed.length === 0, models: list.length, built: ok, failed, ms: Date.now() - startedAt };
}

/**
 * For code that needs an index to EXIST before its first write (a unique key
 * guarding against a duplicate send). Model.init() used to cover that, but it
 * is a no-op once autoIndex is off, so this creates the indexes explicitly,
 * once per process per model.
 */
const _ready = new Map();
export function indexesReady(Model) {
  let p = _ready.get(Model);
  if (!p) {
    p = Promise.resolve(Model.init())
      .then(() => Model.createIndexes())
      .catch((err) => {
        _ready.delete(Model);
        throw err;
      });
    _ready.set(Model, p);
  }
  return p;
}
