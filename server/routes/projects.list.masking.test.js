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

test("measured work, valued and remaining are withheld on a shared row too", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true })];
  const res = await list();
  // These three were left unmasked here because "the plugins read them".
  // They do — and every one of the three bindings in ADLMPlanswiftApp
  // (MainWindow.xaml 442, 505, 762) is a OneWay display of
  // CloudProjectListItem.TotalCost in a "Total (NGN): …" badge. No plugin
  // branches on the value, so withholding it shows 0.00 on a project the
  // reader is not entitled to price, and breaks nothing.
  assert.equal(res.body[0].totalCost, 0);
  assert.equal(res.body[0].valuedAmount, 0);
  assert.equal(res.body[0].remainingAmount, 0);
  assert.equal(res.body[0].moneyHidden, true);
});

test("a shared row still reports whether it is priced", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true })];
  const res = await list();
  assert.equal(res.body[0].priced, true);
test("measured work, value to date and balance are withheld too", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row({ shared: true })];
  const res = await list();
  // These three were left unmasked when this gate was added, which let a
  // collaborator without RateGen read the value, the amount certified and the
  // balance of a project whose rates the project page hides from them. The
  // fields stay on the row as numbers, so a plugin reads a zero.
  assert.equal(res.body[0].totalCost, 0);
  assert.equal(res.body[0].valuedAmount, 0);
  assert.equal(res.body[0].remainingAmount, 0);
  // Whether the bill is priced at all survives, so the stage still reads right.
  assert.equal(res.body[0].priced, true);
});

test("a RateGen reader and the owner still see all three", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift(), rategen()] };
  rows = [row({ shared: true })];
  const shared = await list();
  assert.equal(shared.body[0].totalCost, 40_000_000);
  assert.equal(shared.body[0].remainingAmount, 27_000_000);

  me = { _id: USER_ID, email: "qs@example.com", entitlements: [planswift()] };
  rows = [row()];
  const own = await list();
  assert.equal(own.body[0].totalCost, 40_000_000);
  assert.equal(own.body[0].valuedAmount, 13_000_000);
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
