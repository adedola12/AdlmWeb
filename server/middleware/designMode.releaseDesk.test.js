// server/middleware/designMode.releaseDesk.test.js
// The release approver may hold Design Access. On /admin/releases, and only
// there, the named approver gets the real response; everyone else in Design
// Access, and the approver everywhere else, stays masked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.JWT_ACCESS_SECRET = "test-secret-release-desk";
const { makeDesignMode } = await import("./designMode.js");
const { signAccess } = await import("./auth.js");

const REAL = { email: "real.customer@bigclient.com", company: "Bigclient Nigeria Ltd" };
let server, base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/admin",
    makeDesignMode({
      findRole: async () => "design",
      isDesign: (k) => k === "design",
      isReleaseApprover: async (email) => email === "approver@example.com",
    }),
  );
  app.get("/admin/releases", (req, res) => res.json({ designMode: !!req.designMode, row: REAL }));
  app.post("/admin/releases/:id/approve", (req, res) => res.json({ reached: true, designMode: !!req.designMode }));
  app.get("/admin/work", (req, res) => res.json({ designMode: !!req.designMode, row: REAL }));
  app.get("/admin/users-lite", (req, res) => res.json({ row: REAL }));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const tok = (email) => signAccess({ _id: `u-${email}`, email, role: "design" });
const get = (p, email) => fetch(base + p, { headers: { authorization: `Bearer ${tok(email)}` } }).then((r) => r.json());

test("the named approver sees the real release desk", async () => {
  const body = await get("/admin/releases", "approver@example.com");
  assert.equal(body.designMode, false);
  assert.equal(body.row.company, REAL.company);
});

test("the named approver's approve reaches the handler, not the simulator", async () => {
  const r = await fetch(`${base}/admin/releases/abc/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok("approver@example.com")}`, "content-type": "application/json" },
    body: "{}",
  }).then((x) => x.json());
  assert.equal(r.reached, true);
  assert.equal(r.designMode, false);
});

test("any other design user stays masked on the release desk", async () => {
  const body = await get("/admin/releases", "designer@example.com");
  assert.notEqual(body.row.company, REAL.company);
});

test("the approver stays masked everywhere else", async () => {
  const body = await get("/admin/users-lite", "approver@example.com");
  assert.notEqual(body.row.company, REAL.company);
});

test("the named approver sees the real work board; other designers stay masked", async () => {
  const mine = await get("/admin/work", "approver@example.com");
  assert.equal(mine.designMode, false);
  assert.equal(mine.row.company, REAL.company);
  const theirs = await get("/admin/work", "designer@example.com");
  assert.notEqual(theirs.row.company, REAL.company);
});
