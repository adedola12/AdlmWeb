// server/util/demoContext.js
// Request-scoped "this is a demo session" flag.
//
// The tenancy plugin (server/models/demoTenancy.js) has to know which tenant a
// query belongs to, but it runs deep inside Mongoose where there is no `req`.
// AsyncLocalStorage carries the answer down without threading a parameter
// through every route, model and helper.
//
// The store survives awaits and promise chains within one request and cannot
// leak between concurrent requests, which is exactly the property needed here:
// two admins and a designer hitting the same endpoint at the same time each
// resolve their own tenant.
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

// THE TRAP, and it is a sharp one.
//
// A mongoose Query is LAZY: `Model.find()` builds an object and starts no work.
// The database call begins when the query is awaited. So this is WRONG —
//
//     await runAsDemo(() => Model.deleteMany({}))   // ⚠ context already gone
//
// — because storage.run() returns the moment the callback hands back the query,
// restoring whatever context was there before, and only THEN does the await set
// the query going. The hook that applies the tenant filter therefore runs
// outside the scope, and a demo delete matches every REAL row instead.
//
// Always finish the work inside the callback:
//
//     await runAsDemo(async () => await Model.deleteMany({}))   // ✓
//
// Passing `next()` (as demoModeGuard does) is safe: the whole downstream
// continuation executes inside the callback, so queries created and awaited by
// route handlers stay in scope.

/** Run `fn` with every query inside it scoped to the demo tenant. */
export function runAsDemo(fn) {
  return storage.run({ demo: true }, fn);
}

/**
 * Run `fn` with demo scoping suspended, so queries see real rows again.
 *
 * Needed by the auth path. Richard's own User document is a REAL row — he signs
 * in with a real account that merely holds a demo role. Without this escape
 * hatch, the permission gate's `User.findById` would be scoped to the demo
 * tenant, fail to find him, and lock him out of the very screens the role is
 * meant to open.
 */
export function runWithoutDemo(fn) {
  return storage.run({ demo: false }, fn);
}

/** True when the current async context belongs to a demo session. */
export function isDemoContext() {
  return storage.getStore()?.demo === true;
}

/**
 * Await a lazy thenable (a mongoose Query) with demo scoping suspended.
 *
 * Sugar for the correct form, because the incorrect form is the one that reads
 * naturally. Nesting makes it worse, not better: inside a demo request the
 * broken form restores the DEMO scope rather than no scope, so a query meant to
 * read the caller's real user row reads demo rows and the session cannot resolve
 * its own role.
 */
export function withoutDemo(build) {
  return runWithoutDemo(async () => await build());
}
