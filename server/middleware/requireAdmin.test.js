// server/middleware/requireAdmin.test.js
// The admin gate decides who reaches the most sensitive routes in the system,
// so the property under test is narrow and important: the answer comes from the
// DATABASE, not from the role claim baked into a 15-minute token.
//
// The User model is stubbed through mongoose's model registry rather than by
// standing up a database — the gate only ever calls findById().select().lean(),
// which is cheap to fake and keeps this suite runnable anywhere.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_ACCESS_SECRET = "test-secret-for-requireAdmin";

let requireAdmin;
let stubbedUser = null;
let lookupError = null;

before(async () => {
  const mongoose = (await import("mongoose")).default;
  const { registerDemoTenancy } = await import("../models/demoTenancy.js");
  registerDemoTenancy();

  // Compile the real User model, then intercept the one call the gate makes.
  const { User } = await import("../models/User.js");
  User.findById = () => ({
    select: () => ({
      lean: async () => {
        if (lookupError) throw lookupError;
        return stubbedUser;
      },
    }),
  });

  ({ requireAdmin } = await import("./auth.js"));
});

beforeEach(() => {
  stubbedUser = null;
  lookupError = null;
});

const tokenFor = (claims) =>
  jwt.sign({ id: "u1", ...claims }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

// Minimal req/res doubles recording what the gate decided.
function run(middleware, { token, ...reqExtras } = {}) {
  return new Promise((resolve) => {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cookies: {},
      ...reqExtras,
    };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; resolve({ passed: false, req, res: this }); return this; },
    };
    middleware(req, res, () => resolve({ passed: true, req, res }));
  });
}

test("a token claiming admin is refused once the database says otherwise", async () => {
  // The whole point. Revoking someone's admin used to leave them able to work
  // every admin-only endpoint until their token lapsed, up to 15 minutes after
  // the UI reported the revocation as done.
  stubbedUser = { role: "user" };
  const { passed, res } = await run(requireAdmin, { token: tokenFor({ role: "admin" }) });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("a token claiming user is admitted when the database says admin", async () => {
  // The mirror case: a freshly promoted admin should not have to sign out and
  // back in to use the promotion.
  stubbedUser = { role: "admin" };
  const { passed } = await run(requireAdmin, { token: tokenFor({ role: "user" }) });
  assert.equal(passed, true);
});

test("a genuine admin passes", async () => {
  stubbedUser = { role: "admin" };
  const { passed, req } = await run(requireAdmin, { token: tokenFor({ role: "admin" }) });
  assert.equal(passed, true);
  assert.equal(req.user.role, "admin");
});

test("req.user is corrected to the database value", async () => {
  // Handlers downstream read req.user.role; leaving the stale claim there would
  // reintroduce the bug one layer deeper.
  stubbedUser = { role: "admin" };
  const { req } = await run(requireAdmin, { token: tokenFor({ role: "mini_admin" }) });
  assert.equal(req.user.role, "admin");
  assert.equal(req.userRole, "admin");
});

test("a disabled account loses admin immediately", async () => {
  stubbedUser = { role: "admin", disabled: true };
  const { passed, res } = await run(requireAdmin, { token: tokenFor({ role: "admin" }) });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("a deleted account is refused", async () => {
  stubbedUser = null;
  const { passed, res } = await run(requireAdmin, { token: tokenFor({ role: "admin" }) });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("the legacy isAdmin / admin claims no longer grant anything", async () => {
  // Nothing in this codebase ever issued these, but the old gate honoured them.
  // A forged-looking token carrying them must not be a way in.
  stubbedUser = { role: "user" };
  const { passed, res } = await run(requireAdmin, {
    token: tokenFor({ role: "user", isAdmin: true, admin: true }),
  });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("a missing token is 401, not 403", async () => {
  const { passed, res } = await run(requireAdmin, {});
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test("a token signed with the wrong secret is 401", async () => {
  const forged = jwt.sign({ id: "u1", role: "admin" }, "not-the-secret");
  const { passed, res } = await run(requireAdmin, { token: forged });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test("an expired token is 401", async () => {
  const stale = jwt.sign({ id: "u1", role: "admin" }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: -10,
  });
  const { passed, res } = await run(requireAdmin, { token: stale });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test("a database outage is 500, never a silent downgrade to 403", async () => {
  // If Atlas blips, every admin must see an error — not be quietly told they
  // are not an admin, which reads as a permissions problem and sends people
  // hunting through the UAC during an incident.
  lookupError = new Error("connection timed out");
  const { passed, res } = await run(requireAdmin, { token: tokenFor({ role: "admin" }) });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 500);
});

test("a demo session is admitted without a database round trip", async () => {
  // demoModeGuard has already resolved the role from the DB and tenant-scoped
  // the request; re-reading here would be a second query for no new information.
  lookupError = new Error("must not be called");
  const { passed } = await run(requireAdmin, { demoMode: true });
  assert.equal(passed, true);
});
