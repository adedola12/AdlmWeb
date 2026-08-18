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
