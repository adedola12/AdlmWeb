// server/routes/me.projectsRollup.test.js
//
// GET /me/projects-rollup — the list every Work screen is built on (the
// dashboard, the project gallery and the tool pages all read it through
// client/src/ds/useProjects.js).
//
// Mongo is stubbed, so what is checked here is what the ROUTE decides: which
// facts it asks the database for (a stage that cannot be read is a stage the
// gallery cannot show or filter by), how it defines certified to date, and
// what it refuses to tell a collaborator who may not see money.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { certifiedToDateExpr } = await import("../util/workOverview.js");
const { default: meRouter } = await import("./me.js");

const USER_ID = new mongoose.Types.ObjectId();

let me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
const rategen = () => [{ productKey: "rategen", status: "active" }];

User.findById = (id) => ({
  select() {
    return this;
  },
  lean: async () => (String(id) === String(USER_ID) ? me : null),
  then: (ok, ko) => Promise.resolve(String(id) === String(USER_ID) ? me : null).then(ok, ko),
});

let seenPipeline = null;
let rows = [];
TakeoffProject.aggregate = async (pipeline) => {
  seenPipeline = pipeline;
  return rows;
};

async function get(path) {
  const app = express();
  app.use(express.json());
  app.use("/me", meRouter);
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

const project = (extra) => ({
  id: new mongoose.Types.ObjectId(),
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi-estate-block-a",
  productKey: "planswift",
  baseProductKey: "planswift",
  shared: false,
  totalCost: 40_000_000,
  certifiedToDate: 10_000_000,
  provisionalTotal: 2_000_000,
  approvedVariationsTotal: 1_000_000,
  preliminaryTotal: 3_150_000,
  workValue: 46_150_000,
  ...extra,
});

const projection = () => seenPipeline.find((s) => s.$project).$project;

// ── The stage a project is at ───────────────────────────────────────────────

test("the rollup asks for every fact the stage is read from", async () => {
  rows = [];
  await get("/me/projects-rollup");
  const p = projection();
  // client/src/lib/projectGallery.js stageOf() reads these four. Without them
  // Tendered, Contract locked and Final account are unreachable: a finalised
  // job reads "Valuations", and filtering the gallery by one of the three
  // returns nothing at all.
  assert.deepEqual(p.contractLocked, { $ifNull: ["$contract.locked", false] });
  assert.deepEqual(p.tenderedAt, { $ifNull: ["$contract.tenderedAt", null] });
  assert.deepEqual(p.finalized, { $ifNull: ["$finalAccount.finalized", false] });
  assert.ok(p.certificateCount, "the valuing stage needs the certificate count");
});

test("a finalised row read through the rollup reads Final account", async () => {
  const { stageOf } = await import("../../client/src/lib/projectGallery.js");
  rows = [
    project({ contractLocked: true, certificateCount: 4, finalized: true }),
    project({ contractLocked: true, certificateCount: 2, finalized: false }),
    project({ contractLocked: true, certificateCount: 0, finalized: false }),
    project({ tenderedAt: "2026-09-01T00:00:00Z", contractLocked: false, certificateCount: 0 }),
  ];
  const res = await get("/me/projects-rollup");
  assert.deepEqual(res.body.projects.map(stageOf), ["final", "valuing", "locked", "tendered"]);
});

// ── Certified to date ───────────────────────────────────────────────────────

test("the rollup certifies what the project's own Contract tab certifies", async () => {
  rows = [];
  await get("/me/projects-rollup");
  // One shared expression, so the dashboard and GET /me/work-overview cannot
  // drift apart from the workspace again.
  assert.deepEqual(projection().certifiedToDate, certifiedToDateExpr());
  assert.ok(!JSON.stringify(projection().certifiedToDate).includes("cumulativeValue"));
});

test("the rollup carries the rest of the work's value, so the share is like for like", async () => {
  rows = [];
  await get("/me/projects-rollup");
  const p = projection();
  for (const k of ["provisionalTotal", "approvedVariationsTotal", "preliminaryPercent"]) {
    assert.ok(p[k], `${k} must be projected`);
  }
  const added = seenPipeline.filter((s) => s.$addFields).map((s) => Object.keys(s.$addFields));
  assert.ok(added.flat().includes("preliminaryTotal"));
  assert.ok(added.flat().includes("workValue"));
});

// ── Money on somebody else's project ────────────────────────────────────────

test("a collaborator without RateGen is not told what a shared job has certified", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  rows = [project({ shared: true }), project()];
  const res = await get("/me/projects-rollup");
  const [theirs, mine] = res.body.projects;
  assert.equal(theirs.certifiedToDate, 0);
  assert.equal(theirs.workValue, 0);
  assert.equal(theirs.provisionalTotal, 0);
  assert.equal(theirs.approvedVariationsTotal, 0);
  assert.equal(theirs.moneyHidden, true);
  // Their own project is untouched.
  assert.equal(mine.certifiedToDate, 10_000_000);
  assert.equal(mine.moneyHidden, undefined);
});

test("the same collaborator WITH RateGen sees the shared figures", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: rategen() };
  rows = [project({ shared: true })];
  const res = await get("/me/projects-rollup");
  assert.equal(res.body.projects[0].certifiedToDate, 10_000_000);
  assert.equal(res.body.projects[0].moneyHidden, undefined);
});

test("the figures that were always on this route are left exactly as they were", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  rows = [project({ shared: true })];
  const res = await get("/me/projects-rollup");
  // Masking is limited to what this change added; measured work has been on
  // this route (and on the per-product list) since long before it.
  assert.equal(res.body.projects[0].totalCost, 40_000_000);
});
