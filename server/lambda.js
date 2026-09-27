// server/lambda.js
// ----------------------------------------------------------------------------
// AWS Lambda entry point. Wraps the existing Express app from index.js with
// serverless-http — no routes, middleware or business logic are touched.
//
// Everything expensive lives in module scope so it runs once per container
// (a "cold start") and is reused by every subsequent invocation:
//
//   * secrets pulled from SSM Parameter Store
//   * the Mongoose connection (cached inside index.js's bootstrap())
//   * the serverless-http wrapper itself
//
// Local development is unaffected: `node index.js` still binds a port and
// starts the cron jobs, because index.js only does that when run directly.
// ----------------------------------------------------------------------------

import serverless from "serverless-http";
import {
  SSMClient,
  GetParametersByPathCommand,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";

// IMPORTANT: secrets must be in process.env BEFORE index.js is imported,
// because index.js reads several of them at module scope (helmet's HSTS flag,
// the CORS whitelist) and validateEnv() aborts on missing criticals. A static
// `import` would be hoisted above the await below, so this has to be a
// deferred dynamic import — see loadApp().
let _appModulePromise = null;

/**
 * Namespace holding this app's SecureStrings, e.g. /adlm/cloud/prod/MONGO_URI.
 * Every parameter under the path is loaded and exported into process.env under
 * its leaf name, so the application code keeps reading plain process.env vars
 * and needs no changes at all.
 */
const SSM_PREFIX = process.env.SSM_PREFIX || "";
const ssm = SSM_PREFIX ? new SSMClient({}) : null;

async function loadSecretsIntoEnv() {
  if (!SSM_PREFIX) {
    console.warn(
      "[lambda] SSM_PREFIX is not set — relying on plain environment variables only.",
    );
    return;
  }

  const path = SSM_PREFIX.endsWith("/") ? SSM_PREFIX.slice(0, -1) : SSM_PREFIX;
  let nextToken;
  let count = 0;

  // GetParametersByPath returns at most 10 per page, so paginate.
  do {
    const page = await ssm.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: false,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken,
      }),
    );

    for (const p of page.Parameters || []) {
      const key = p.Name.slice(p.Name.lastIndexOf("/") + 1);
      // Never let a stale parameter clobber an explicitly-set env var — this is
      // what makes a break-glass override via the Lambda console possible.
      if (process.env[key] === undefined) process.env[key] = p.Value;
      count += 1;
    }

    nextToken = page.NextToken;
  } while (nextToken);

  console.log(`[lambda] loaded ${count} parameters from ${path}`);
}

/**
 * Open the Mongo connection and seed the roles while the secrets load.
 *
 * A cold first request used to run these one after another: SSM (~0.8s over
 * nine sequential pages), the import (~2s), then connect (~0.4s) and the role
 * seed. Connecting and seeding need only the database's own parameters, so
 * they now start as soon as those arrive and overlap the rest of the SSM
 * paging (investigation of 26-27 Sep 2026; profiling showed the import is
 * spread over hundreds of modules with no single library worth lazy-loading,
 * and it cannot be overlapped because it blocks the event loop).
 *
 * Nothing here changes what is served:
 *   - demoTenancy is imported first, exactly as index.js does, so the Role
 *     model is compiled after the plugin registers and bootstrap()'s
 *     assertTenancyApplied() still holds;
 *   - connectDB() gets the API's options (apiMongoOptions) — the first
 *     caller's options win, so passing anything else here would silently drop
 *     the fail-fast timeouts;
 *   - bootstrap() still awaits connect and seed before the first request is
 *     handled, through connectDB's cached promise and ensureRolesSeededOnce.
 *
 * Never rejects: a failure is logged and bootstrap() retries it the normal way.
 */
export function startDatabaseEarly() {
  return (async () => {
    await import("./models/demoTenancy.js");
    const [{ connectDB }, { apiMongoOptions }, { ensureRolesSeededOnce }] = await Promise.all([
      import("./db.js"),
      import("./util/mongoTimeouts.js"),
      import("./util/rbac.js"),
    ]);
    await connectDB(process.env.MONGO_URI, apiMongoOptions());
    await ensureRolesSeededOnce();
  })().catch((err) => {
    console.warn("[lambda] early database start failed, bootstrap will retry:", err?.message || err);
  });
}

// Every parameter connectDB() and apiMongoOptions() read. AUTH_DB matters
// most: it lives in SSM, and connecting before it loaded would silently use
// the default database name. Names absent from SSM are simply not returned.
export const DB_PARAM_NAMES = Object.freeze([
  "MONGO_URI",
  "AUTH_DB",
  "MONGO_MAX_POOL",
  "MONGO_MIN_POOL",
  "MONGO_SOCKET_TIMEOUT_MS",
  "MONGO_WAIT_QUEUE_TIMEOUT_MS",
]);

/**
 * Load DB_PARAM_NAMES into process.env with one GetParameters call (allowed
 * by the function's existing policy). Same rule as loadSecretsIntoEnv: an
 * explicitly set env var is never overwritten, so the full load later agrees
 * with whatever the early connection used.
 *
 * Returns true only when it is safe to connect early: the call succeeded and
 * MONGO_URI is known. On any failure it returns false and the connection is
 * made by bootstrap() after the full load, exactly as before.
 */
export async function loadDbParamsIntoEnv(client = ssm, prefix = SSM_PREFIX) {
  if (!client || !prefix) return Boolean(process.env.MONGO_URI);
  const path = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  try {
    const out = await client.send(
      new GetParametersCommand({
        Names: DB_PARAM_NAMES.map((n) => `${path}/${n}`),
        WithDecryption: true,
      }),
    );
    for (const p of out.Parameters || []) {
      const key = p.Name.slice(p.Name.lastIndexOf("/") + 1);
      if (process.env[key] === undefined) process.env[key] = p.Value;
    }
    return Boolean(process.env.MONGO_URI);
  } catch (err) {
    console.warn("[lambda] early database parameters failed, connecting after the full load:", err?.message || err);
    return false;
  }
}

/**
 * Resolves to { app, bootstrap } with secrets already in process.env.
 * Cached, so the SSM round-trip and the module graph evaluation happen once
 * per container rather than once per request.
 */
function loadApp() {
  if (_appModulePromise) return _appModulePromise;

  _appModulePromise = (async () => {
    // The database's own parameters first, by name, in one call. When they
    // arrive, the connection and the role seed start while the rest of the
    // secrets are still paging in: both are network waits, so they genuinely
    // run side by side. (Starting them beside the app import does not work:
    // the import is synchronous CPU work that blocks the event loop.)
    // Deliberately not awaited: bootstrap() awaits the same connection and
    // the same seed run, so this only moves the work earlier.
    // Side by side with the first page, not before it, so the paging is not
    // held up by one extra round trip. Both only fill unset env vars, from
    // the same SSM values, so the order they land in does not matter.
    const early = loadDbParamsIntoEnv().then((ok) => {
      if (ok) startDatabaseEarly();
    });
    await loadSecretsIntoEnv();
    await early;
    // Deferred on purpose — see the note at the top of this file.
    return import("./index.js");
  })().catch((err) => {
    // Don't cache a rejection: let the next invocation retry rather than
    // wedging this container until Lambda recycles it.
    _appModulePromise = null;
    throw err;
  });

  return _appModulePromise;
}

/**
 * Parse the request body that Express 5 will otherwise ignore.
 *
 * serverless-http hands Express an http.IncomingMessage with no real socket
 * and `complete: true`. body-parser 2.x — which Express 5 depends on — starts
 * with `if (isFinished(req)) return next()`, and on-finished treats a
 * socket-less IncomingMessage as finished. So express.json() and
 * express.urlencoded() bail before reading anything, leaving req.body as the
 * raw Buffer serverless-http assigned. Every route then sees a Buffer where it
 * expects an object, and destructuring quietly yields undefined — a login
 * returns "identifier and password required" for a perfectly valid request.
 *
 * Express 4's body-parser keyed off `req._body`, which serverless-http never
 * sets, so this only breaks on Express 5.
 *
 * Parsing here restores the shape routes expect. Local development is
 * untouched: a real socket exists there and the normal parsers run.
 */
export function parseBodyForExpress5(req) {
  const raw = req.body;
  if (raw === undefined || raw === null) return;

  const path = String(req.url || "").split("?")[0];

  // Webhooks must keep the RAW bytes. routes/webhooks.js verifies Paystack's
  // HMAC over the unmodified body, so parsing it here would break every
  // payment notification. The skip above happens to deliver exactly what that
  // route wants, so leave it alone.
  if (path.startsWith("/webhooks")) return;

  const type = String(req.headers?.["content-type"] || "").toLowerCase();
  const isBufferish = Buffer.isBuffer(raw) || raw instanceof Uint8Array;
  if (!isBufferish && typeof raw !== "string") return; // already an object

  const text = isBufferish ? Buffer.from(raw).toString("utf8") : raw;

  if (type.includes("application/json")) {
    if (!text.trim()) {
      req.body = {};
    } else {
      try {
        req.body = JSON.parse(text);
      } catch {
        // Mirror body-parser: a malformed payload becomes an empty body and
        // the route's own validation answers. Better a clean 400 from the
        // route than a 502 from a throw inside this hook.
        console.warn(`[lambda] malformed JSON body on ${path}`);
        req.body = {};
      }
    }
  } else if (type.includes("application/x-www-form-urlencoded")) {
    req.body = Object.fromEntries(new URLSearchParams(text));
  } else {
    return; // multipart and friends: multer reads the stream itself
  }

  // Tell anything that checks the Express 4 convention that we've handled it.
  req._body = true;
}

let _handler = null;

/**
 * Everything a cold start has to do before the first request can be served:
 * pull secrets from SSM, import the app, connect Mongo, seed roles, and build
 * the serverless-http wrapper. Idempotent — the second call is a no-op.
 */
async function ensureHandler() {
  if (_handler) return _handler;

  const { app, bootstrap } = await loadApp();
  await bootstrap();
  _handler = serverless(app, {
    request: parseBodyForExpress5,
    // Multipart/binary bodies arrive base64-encoded from a Function URL.
    // serverless-http decodes them when it knows the type isn't text, and
    // this list is what it checks against.
    binary: [
      "application/octet-stream",
      "application/pdf",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "image/*",
      "video/*",
      "font/*",
    ],
  });

  return _handler;
}

export async function handler(event, context) {
  // Return as soon as the response is written instead of waiting for the event
  // loop to drain. Without this, Mongoose's open sockets and any fire-and-forget
  // .catch() work keep the invocation billing until the timeout.
  context.callbackWaitsForEmptyEventLoop = false;

  // ── Scheduled keep-warm ping ──────────────────────────────────────────────
  // Not an HTTP event: it never reaches Express and serves no user. Its only
  // job is to hold one container open so a real sign-in doesn't pay the ~2s
  // cold start. Traffic is low enough that almost every user was hitting a
  // cold container, which is most of what "signing in is slow" actually was.
  //
  // The Mongo ping is deliberate: it proves the pooled socket still works
  // after the container was frozen, so a dead one is replaced here rather
  // than on the next real request.
  if (event?.__warm === true) {
    await ensureHandler();
    try {
      const mongoose = (await import("mongoose")).default;
      await mongoose.connection.db.admin().ping();
    } catch (err) {
      // Never fail the schedule over this — a failed ping just means the next
      // real request reconnects, which is the behaviour we had before.
      console.warn("[warm] mongo ping failed:", err?.message || err);
    }
    return { warmed: true };
  }

  const h = await ensureHandler();
  return h(event, context);
}

export default handler;
