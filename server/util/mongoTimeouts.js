// server/util/mongoTimeouts.js
//
// Fail fast when the database stops answering, instead of hanging until
// Lambda kills the request.
//
// Why (investigated 2026-09-26): the API's 75 timeouts in 11-25 Sep 2026 were
// two bursts (18 Sep 18:22 UTC, 24 Sep 11:05 UTC) in which Atlas stopped
// answering, most likely a primary election. With no socketTimeoutMS an
// operation already on the wire waits forever, so each request sat for the
// full 60s, Lambda killed it, and a kill resets the runtime: the next request
// in that container paid the whole cold path again (SSM, import, connect) and
// often stalled too. Warm containers timed out at the same moments, which is
// what showed the stall was the database, not cold starts.
//
// With a socket timeout the stuck operation errors after MONGO_SOCKET_TIMEOUT_MS,
// the driver discards that connection and opens a fresh one on the next
// request, and the caller gets a clean 503 it can retry, well inside the 60s
// Lambda and CloudFront limits.
//
// API ONLY. index.js bootstrap() passes these; scheduled.js and the scripts in
// scripts/ call connectDB() without them, because a nightly job or a migration
// may legitimately wait on one long operation.

const num = (v, fallback) => {
  if (v === undefined || v === null || String(v).trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Connection options for the API's Mongo connection. 0 disables a limit (the
 * driver's own default), so either can be switched off from SSM without a code
 * change.
 *
 * - socketTimeoutMS 25s: longer than any healthy API operation (warm p99 is
 *   under 1s, the slowest cold request that did not stall was ~55s in total
 *   but made of many short round trips), short enough to leave room for the
 *   driver's one automatic retry and a response before the 60s kill.
 * - waitQueueTimeoutMS 10s: a request waiting for a pooled connection that
 *   never frees up fails instead of queueing to the kill.
 */
export function apiMongoOptions(env = process.env) {
  const out = {};
  const socket = num(env.MONGO_SOCKET_TIMEOUT_MS, 25000);
  const waitQueue = num(env.MONGO_WAIT_QUEUE_TIMEOUT_MS, 10000);
  if (socket > 0) out.socketTimeoutMS = socket;
  if (waitQueue > 0) out.waitQueueTimeoutMS = waitQueue;
  return out;
}

// Errors that mean "the database did not answer", as opposed to "the database
// said no" (a duplicate key, a validation error), which must keep their own
// handling. Names, not instanceof, so a second copy of the driver in the
// bundle cannot break the match.
const UNAVAILABLE_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoWaitQueueTimeoutError",
  "MongoPoolClearedError",
  "PoolClearedOnNetworkError",
]);

export function isMongoUnavailableError(err) {
  for (let e = err, depth = 0; e && depth < 5; e = e.cause, depth += 1) {
    if (UNAVAILABLE_NAMES.has(e.name)) return true;
    // Mongoose buffers a command while it is disconnected and gives up with
    // a plain Error after bufferTimeoutMS.
    if (/buffering timed out after/.test(String(e.message || ""))) return true;
  }
  return false;
}

export const DB_UNAVAILABLE = "DB_UNAVAILABLE";
