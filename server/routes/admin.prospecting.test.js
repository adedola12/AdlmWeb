// server/routes/admin.prospecting.test.js
//
// Every prospecting endpoint sits behind sign-in and a permission gate, and
// the dangerous ones behind the admin-only gate. Read off the router itself,
// so a route added later without a gate fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import router from "./admin.prospecting.js";
import { requireAuth } from "../middleware/auth.js";
import { ADMIN_AREAS } from "../config/permissions.js";

const routes = router.stack
  .filter((l) => l.route)
  .map((l) => ({
    method: Object.keys(l.route.methods)[0].toUpperCase(),
    path: l.route.path,
    handlers: l.route.stack.map((s) => s.handle),
  }));

const gateOf = (r) => r.handlers.find((h) => h.gate)?.gate;

test("every route requires sign-in first", () => {
  assert.ok(routes.length >= 14);
  for (const r of routes) assert.equal(r.handlers[0], requireAuth, `${r.method} ${r.path}`);
});

test("every route has a prospecting permission gate", () => {
  for (const r of routes) assert.ok(["prospecting", "prospecting_admin"].includes(gateOf(r)), `${r.method} ${r.path}`);
});

test("deletion, suppression and profile edits are admin-only", () => {
  const adminOnly = routes.filter((r) => gateOf(r) === "prospecting_admin").map((r) => `${r.method} ${r.path}`).sort();
  assert.deepEqual(adminOnly, [
    "DELETE /prospects/:id",
    "PATCH /profiles/:id",
    "POST /profiles",
    "POST /suppressions",
    "POST /suppressions/check",
  ]);
});

test("the admin area cannot be granted to staff roles; the reviewer area can", () => {
  const area = (k) => ADMIN_AREAS.find((a) => a.key === k);
  assert.equal(area("prospecting").staffGrantable, true);
  assert.equal(area("prospecting_admin").staffGrantable, false);
});

test("no route puts an email address in the URL", () => {
  for (const r of routes) assert.ok(!/email/i.test(r.path), `${r.method} ${r.path}`);
});
