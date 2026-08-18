// server/middleware/designMode.integration.test.js
// Drives the real middleware over real HTTP against a stand-in admin router
// that returns exactly the kind of body the production ones do. The mask, the
// role spoof and the write block are all exercised end to end — the only thing
// swapped out is the Mongo lookup of the acting user's role.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_ACCESS_SECRET = "test-secret-for-design-mode";

const { makeDesignMode } = await import("./designMode.js");
const { requireAuth, requireAdmin, signAccess } = await import("./auth.js");

// Every gate style used across the admin routes, so the spoof is proven against
// all of them and not just the shared one.
const localRequireAdmin = (req, res, next) =>
  req.user?.role === "admin" ? next() : res.status(403).json({ error: "Admin only" });

const REAL_ROW = {
  _id: "652f1c9a4b2e7d1a3c8f0b11",
  email: "real.customer@bigclient.com",
  firstName: "Ngozi",
  lastName: "Adeyemi",
  company: "Bigclient Nigeria Ltd",
  status: "active",
  amountPaid: 1_750_000,
  createdAt: "2026-01-09T11:00:00.000Z",
};

let server;
let base;
let designToken;
let staffToken;

before(async () => {
  const app = express();
  app.use(express.json());

  // Only the acting user's role comes from outside; everything else is real.
  app.use(
    "/admin",
    makeDesignMode({
      findRole: async (uid) => (uid === "design-user" ? "design" : "mini_admin"),
      isDesign: (roleKey) => roleKey === "design",
    }),
  );

  app.get("/admin/users-lite", requireAuth, localRequireAdmin, (_req, res) =>
    res.json({ rows: Array.from({ length: 300 }, () => REAL_ROW), total: 1423 }),
  );

  app.get("/admin/roles", requireAuth, requireAdmin, (_req, res) =>
    res.json({ roles: [{ key: "mini_admin", name: "Mini Admin", userCount: 4 }] }),
  );

  app.patch("/admin/users-lite/:id", requireAuth, localRequireAdmin, (_req, res) => {
    throw new Error("a write must never reach the handler in design mode");
  });

  app.get("/admin/invoices/:id/pdf", requireAuth, localRequireAdmin, (_req, res) =>
    res.send("REAL-INVOICE-BYTES"),
  );

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  designToken = signAccess({ id: "design-user", email: "richard@adlm.test", role: "design" });
  staffToken = signAccess({ id: "staff-user", email: "staff@adlm.test", role: "mini_admin" });
});

after(() => server?.close());

const get = (path, token, init = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

test("a design user reaches an admin-only route and gets masked data", async () => {
  const res = await get("/admin/users-lite", designToken);
  assert.equal(res.status, 200, "the role spoof must satisfy the route's admin gate");
  assert.equal(res.headers.get("x-design-mode"), "1");

  const body = await res.json();
  assert.equal(body.designMode, true);
  assert.ok(body.rows.length <= 12, "the real row count must not be visible");
  assert.notEqual(body.total, 1423);

  const row = body.rows[0];
  assert.notEqual(row.email, REAL_ROW.email);
  assert.notEqual(row.firstName, REAL_ROW.firstName);
  assert.notEqual(row.company, REAL_ROW.company);
  assert.notEqual(row.amountPaid, REAL_ROW.amountPaid);

  // Shape survives so the UI renders unchanged.
  assert.equal(row._id, REAL_ROW._id);
  assert.equal(row.status, "active");
  assert.equal(row.createdAt, REAL_ROW.createdAt);

  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("bigclient.com"), "no real email may appear anywhere");
  assert.ok(!raw.includes("Ngozi"), "no real name may appear anywhere");
  assert.ok(!raw.includes("1750000"), "no real amount may appear anywhere");
});

test("the shared requireAdmin also accepts a design user", async () => {
  const res = await get("/admin/roles", designToken);
  assert.equal(res.status, 200);
});

test("a write is answered with success but never runs", async () => {
  const res = await get("/admin/users-lite/652f1c9a4b2e7d1a3c8f0b11", designToken, {
    method: "PATCH",
    body: JSON.stringify({ disabled: true }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.simulated, true);
});

test("a file export is refused rather than streamed unmasked", async () => {
  const res = await get("/admin/invoices/123/pdf", designToken);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "DESIGN_MODE_BLOCKED");
});

test("a non-design user is untouched — real data, real gates", async () => {
  const res = await get("/admin/users-lite", staffToken);
  assert.equal(res.status, 403, "mini_admin still fails the route's own admin gate");
  assert.equal(res.headers.get("x-design-mode"), null);
});

test("an unauthenticated request is left to the route's own gate", async () => {
  const res = await fetch(`${base}/admin/users-lite`);
  assert.equal(res.status, 401);
});

test("a forged token cannot enter design mode", async () => {
  const forged = jwt.sign({ id: "design-user", role: "design" }, "wrong-secret");
  const res = await get("/admin/users-lite", forged);
  assert.equal(res.status, 401);
});
