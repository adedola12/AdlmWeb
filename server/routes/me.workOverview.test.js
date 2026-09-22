// server/routes/me.workOverview.test.js
//
// GET /me/work-overview, the Work dashboard's one extra read (S18/WH-07,
// WH-08, WH-09). Real router over real HTTP with a real signed token; Mongo is
// stubbed, so what is checked here is the SHAPING — that a draft certificate
// is reported as a draft, that a variation with no stored status counts as
// approved (so no total moves when the valuations stream adds the field), and
// that the pipeline really does filter the tasks it claims to.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { buildWorkOverviewPipeline, shapeWorkOverview, baseProductKeyExpr } = await import(
  "../util/workOverview.js"
);
const { default: meRouter } = await import("./me.js");

const USER_ID = new mongoose.Types.ObjectId();
const PROJ_ID = new mongoose.Types.ObjectId();

User.findById = (id) => ({
  select() {
    return this;
  },
  lean: async () => (String(id) === String(USER_ID) ? { _id: USER_ID, email: "qs@example.com" } : null),
  then: (ok, ko) =>
    Promise.resolve(String(id) === String(USER_ID) ? { _id: USER_ID, email: "qs@example.com" } : null).then(ok, ko),
});

let seenPipeline = null;
let facet = {};
TakeoffProject.aggregate = async (pipeline) => {
  seenPipeline = pipeline;
  return [facet];
};

async function get(path, { auth = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/me", meRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const headers = {};
    if (auth) {
      headers.authorization = `Bearer ${signAccess({
        _id: String(USER_ID),
        email: "qs@example.com",
        role: "user",
      })}`;
    }
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const row = (extra) => ({
  projectId: PROJ_ID,
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi-estate-block-a",
  productKey: "planswift",
  baseProductKey: "planswift",
  ...extra,
});

test("work overview needs a signed-in user", async () => {
  const res = await get("/me/work-overview", { auth: false });
  assert.equal(res.status, 401);
});

test("certificates keep their stored status and payable, and are never summed", async () => {
  facet = {
    certificates: [
      row({ number: 3, date: new Date("2026-09-10"), netPayable: 4_250_000, cumulativeValue: 30_000_000, status: "draft" }),
      row({ number: 2, date: new Date("2026-08-10"), netPayable: 3_000_000, cumulativeValue: 25_000_000, status: "paid" }),
    ],
    draftCertificates: [
      row({ number: 3, date: new Date("2026-09-10"), netPayable: 4_250_000, cumulativeValue: 30_000_000, status: "draft" }),
    ],
  };
  const res = await get("/me/work-overview");
  assert.equal(res.status, 200);
  assert.equal(res.body.certificates.length, 2);
  assert.equal(res.body.certificates[0].status, "draft");
  assert.equal(res.body.certificates[0].netPayable, 4_250_000);
  assert.equal(res.body.certificates[1].status, "paid");
  assert.equal(res.body.certificates[0].projectId, String(PROJ_ID));
  // The one row that needs a decision, and only that one.
  assert.equal(res.body.draftCertificates.length, 1);
  assert.equal(res.body.draftCertificates[0].number, 3);
});

test("a variation with no stored status counts as approved, so no total moves", async () => {
  facet = {
    variations: [
      row({ reference: "V1", description: "Extra blockwork", amount: 1_200_000, issuedAt: new Date("2026-09-01") }),
      row({ reference: "V2", description: "Omit paving", amount: -450_000, issuedAt: new Date("2026-08-01"), status: "pending" }),
      row({ reference: "V3", description: "Rejected extra", amount: 90_000, status: "rejected" }),
    ],
  };
  const res = await get("/me/work-overview");
  assert.equal(res.body.variations[0].status, "approved");
  assert.equal(res.body.variations[1].status, "pending");
  assert.equal(res.body.variations[2].status, "rejected");
  // A negative variation stays negative; nothing is re-signed here.
  assert.equal(res.body.variations[1].amount, -450_000);
});

test("an unknown variation status is treated as approved, never invented", async () => {
  facet = { variations: [row({ reference: "V9", status: "who-knows", amount: 10 })] };
  const res = await get("/me/work-overview");
  assert.equal(res.body.variations[0].status, "approved");
});

test("missing facets shape to empty arrays rather than throwing", async () => {
  facet = {};
  const res = await get("/me/work-overview");
  assert.equal(res.status, 200);
  for (const k of ["certificates", "draftCertificates", "variations", "pendingVariations", "tasks", "rateUsage"]) {
    assert.deepEqual(res.body[k], [], `${k} should be an empty array`);
  }
});

test("an aggregate that returns nothing at all still shapes", () => {
  assert.deepEqual(shapeWorkOverview([]).tasks, []);
  assert.deepEqual(shapeWorkOverview(null).certificates, []);
});

test("task progress is clamped and rate usage drops blank keys", async () => {
  facet = {
    tasks: [row({ task: "Roof covering", endDate: new Date("2026-09-15"), percentComplete: 140, isMilestone: true })],
    rateUsage: [
      { key: "Concrete grade 25 in slabs", lines: 12 },
      { key: "", lines: 4 },
    ],
  };
  const res = await get("/me/work-overview");
  assert.equal(res.body.tasks[0].percentComplete, 100);
  assert.equal(res.body.tasks[0].isMilestone, true);
  assert.equal(res.body.rateUsage.length, 1);
  assert.equal(res.body.rateUsage[0].lines, 12);
});

test("the pipeline filters what it claims to, and caps every facet", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const pipeline = buildWorkOverviewPipeline(USER_ID, { now, limit: 8, dueWithinDays: 14 });
  const facets = pipeline.at(-1).$facet;

  // Read-only: nothing in here writes, merges or looks outside this user.
  const stages = JSON.stringify(pipeline);
  assert.ok(!stages.includes("$merge") && !stages.includes("$out"));
  assert.ok(stages.includes("collaborators.userId"));

  for (const name of ["certificates", "draftCertificates", "variations", "pendingVariations", "tasks"]) {
    assert.ok(
      facets[name].some((s) => s.$limit === 8),
      `${name} must be capped`,
    );
  }

  const taskMatch = facets.tasks.find((s) => s.$match).$match.$and;
  const flat = JSON.stringify(taskMatch);
  assert.ok(flat.includes('"tasks.isSummary"'), "summary rows are not work");
  assert.ok(flat.includes('"completed"'), "completed tasks are not due");
  // Due-soon reaches exactly a fortnight past the real now, not a fixed date.
  assert.ok(flat.includes(new Date(now.getTime() + 14 * 86400000).toISOString()));
});

test("both /me routes derive a product key from the same expression", () => {
  const expr = JSON.stringify(baseProductKeyExpr());
  assert.ok(expr.includes("planswift-materials"));
  assert.ok(expr.includes("revitmep-materials"));
  const pipeline = buildWorkOverviewPipeline(USER_ID, {});
  assert.equal(JSON.stringify(pipeline[1].$project.baseProductKey), expr);
});

test("the route hands the aggregate a pipeline, not a raw find", async () => {
  facet = {};
  await get("/me/work-overview");
  assert.ok(Array.isArray(seenPipeline));
  assert.ok(seenPipeline[0].$match.$or.length === 2);
});
