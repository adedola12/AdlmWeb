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
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

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
 * Resolves to { app, bootstrap } with secrets already in process.env.
 * Cached, so the SSM round-trip and the module graph evaluation happen once
 * per container rather than once per request.
 */
function loadApp() {
  if (_appModulePromise) return _appModulePromise;

  _appModulePromise = (async () => {
    await loadSecretsIntoEnv();
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

let _handler = null;

export async function handler(event, context) {
  // Return as soon as the response is written instead of waiting for the event
  // loop to drain. Without this, Mongoose's open sockets and any fire-and-forget
  // .catch() work keep the invocation billing until the timeout.
  context.callbackWaitsForEmptyEventLoop = false;

  if (!_handler) {
    const { app, bootstrap } = await loadApp();
    await bootstrap();
    _handler = serverless(app, {
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
  }

  return _handler(event, context);
}

export default handler;
