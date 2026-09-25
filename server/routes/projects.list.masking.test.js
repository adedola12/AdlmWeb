// server/routes/projects.list.masking.test.js
//
// GET /projects/:productKey — the per-product project list behind the file
// explorer (client/src/pages/ProjectsGeneric.jsx) and, through it, every
// plugin that reads the same endpoint.
//
// Opening a shared project already hides its money from a collaborator without
// RateGen (maskRates), and /me/projects-rollup hides the equivalent figures on
// its own rows. This list did neither: it handed back the contract sum and the
// whole estimate cascade for a project the reader does not own. These tests
// pin the gate, and pin what it deliberately leaves alone.
//
// Mongo is stubbed — what is checked here is what the ROUTE decides.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { default: projectsRouter } = await import("./projects.js");

const USER_ID = new mongoose.Types.ObjectId();

// The licence the route itself requires, plus (optionally) RateGen.
const planswift = () => ({ productKey: "planswift", status: "active" });
const rategen = () => ({ productKey: "rategen", status: "active" });

let me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };

// Both requireEntitlement and readerMaySeeRates read the user this way; the
// stub answers `await`, `.lean()` and `.select()` alike.
User.findById = (id) => {
  const found = String(id) === String(USER_ID) ? me : null;
  const q = {
    select() {
      return q;
    },
    lean: async () => found,
    then: (ok, ko) => Promise.resolve(found).then(ok, ko),
  };
  return q;
};

let rows = [];
TakeoffProject.aggregate = async () => rows;

async function list(path = "/projects/planswift") {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: {
        authorization: `Bearer ${signAccess({
          _id: String(USER_ID),
          email: "qs@example.com",
          role: "user",
        })}`,
      },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// A row exactly as the aggregate builds it.
const row = (extra) => ({
  id: new mongoose.Types.ObjectId(),
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi-estate-block-a",
  shared: false,
  itemCount: 120,
  markedCount: 40,
  progressPercent: 33,
  contractSum: 120_000_000,
  provisionalTotal: 2_000_000,
  approvedVariationsTotal: 1_000_000,
  preliminaryTotal: 3_150_000,
  estimateSubtotal: 45_150_000,
  contingencyTotal: 2_257_500,
  taxTotal: 3_555_562.5,
  estimatedTotal: 51_963_062.5,
  totalCost: 40_000_000,
  valuedAmount: 13_000_000,
  remainingAmount: 27_000_000,
  ...extra,
});

test("a collaborator without RateGen is not told a shared job's contract money", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true }), row()];
  const res = await list();
  assert.equal(res.status, 200);
  const [theirs, mine] = res.body;

  assert.equal(theirs.contractSum, 0);
  assert.equal(theirs.estimatedTotal, 0);
  assert.equal(theirs.estimateSubtotal, 0);
  assert.equal(theirs.contingencyTotal, 0);
  assert.equal(theirs.taxTotal, 0);
  assert.equal(theirs.provisionalTotal, 0);
  assert.equal(theirs.approvedVariationsTotal, 0);
  assert.equal(theirs.preliminaryTotal, 0);
  // A zero here means "hidden", not "nothing", and the row says so.
  assert.equal(theirs.moneyHidden, true);

  // Their OWN project is never masked.
  assert.equal(mine.contractSum, 120_000_000);
  assert.equal(mine.estimatedTotal, 51_963_062.5);
  assert.equal(mine.moneyHidden, undefined);
});

test("the same collaborator WITH RateGen sees the shared figures", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift(), rategen()] };
  rows = [row({ shared: true })];
  const res = await list();
  assert.equal(res.body[0].contractSum, 120_000_000);
  assert.equal(res.body[0].estimatedTotal, 51_963_062.5);
  assert.equal(res.body[0].moneyHidden, undefined);
});

test("the figures that were always on this route are left exactly as they were", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true })];
  const res = await list();
  // Measured work, what has been valued and what is left have been on this
  // list since long before any of this masking, and the plugins read them.
  // Masking is limited to the contract/estimate figures, exactly as
  // /me/projects-rollup limits itself. Changing these is a separate decision.
  assert.equal(res.body[0].totalCost, 40_000_000);
  assert.equal(res.body[0].valuedAmount, 13_000_000);
  assert.equal(res.body[0].remainingAmount, 27_000_000);
});

test("the shape a plugin reads is unchanged — a bare array, same rows, same order", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true, name: "A" }), row({ name: "B" })];
  const res = await list();
  assert.ok(Array.isArray(res.body));
  assert.deepEqual(res.body.map((p) => p.name), ["A", "B"]);
  assert.equal(res.body[0].itemCount, 120);
  assert.equal(res.body[0].progressPercent, 33);
});

test("a list with no shared rows is passed straight through", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row(), row()];
  const res = await list();
  // Nothing to hide, so nothing is touched and no entitlement lookup is worth
  // making: the owner's own list reads exactly as the aggregate built it.
  assert.deepEqual(res.body, JSON.parse(JSON.stringify(rows)));
});
