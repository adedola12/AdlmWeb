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

test("the estimate is withheld from a collaborator who may not see rates", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  rows = [project({ shared: true, estimatedTotal: 51_000_000 })];
  const hidden = await get("/me/projects-rollup");
  // The estimate is the whole grand summary — the most revealing figure on the
  // row — so it is masked with the rest of the money this branch added.
  assert.equal(hidden.body.projects[0].estimatedTotal, 0);
  assert.equal(hidden.body.projects[0].moneyHidden, true);

  me = { _id: USER_ID, email: "qs@example.com", entitlements: rategen() };
  rows = [project({ shared: true, estimatedTotal: 51_000_000 })];
  const shown = await get("/me/projects-rollup");
  assert.equal(shown.body.projects[0].estimatedTotal, 51_000_000);
});

// ── A merged project's container ────────────────────────────────────────────

test("a merged container is left out, exactly as the per-product list leaves it out", async () => {
  rows = [];
  await get("/me/projects-rollup");
  const match = seenPipeline.find((s) => s.$match).$match;
  // A container holds no measurements: its bill is resolved live from the
  // source projects it links, and those sources are rows in this same list
  // with their own money. Counted here it was a ₦0 project stuck at "Takeoff"
  // and the same job twice over.
  assert.deepEqual(match.mergeContainer, { $ne: true });
  // The rule the per-product list route applies by default.
  assert.deepEqual(match.pmTrackerOnly, { $ne: true });
});

// ── The estimate ────────────────────────────────────────────────────────────
//
// The gallery labelled measured work "Estimated" because this route never sent
// an estimate. It sends one now — and the only thing that makes that safe is
// that it is the SAME cascade the Bill uses, so the two can never disagree.
// The route's own expressions are evaluated below and compared with
// projectTotals() itself, on the same input. A second, subtly different
// cascade would be worse than no figure at all.

const at = (root, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), root);

function evalExpr(expr, doc, vars = {}) {
  if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc, vars));
  if (typeof expr === "string") {
    if (expr.startsWith("$$")) return at(vars, expr.slice(2));
    if (expr.startsWith("$")) return at(doc, expr.slice(1));
    return expr;
  }
  if (!expr || typeof expr !== "object") return expr;
  const op = Object.keys(expr)[0];
  const arg = expr[op];
  const nums = () => evalExpr(arg, doc, vars).map((v) => Number(v) || 0);
  switch (op) {
    case "$ifNull": {
      const [v, alt] = evalExpr(arg, doc, vars);
      return v == null ? alt : v;
    }
    case "$in": {
      const [needle, hay] = evalExpr(arg, doc, vars);
      return (hay || []).includes(needle);
    }
    case "$not":
      return !evalExpr(arg, doc, vars);
    case "$filter":
      return (evalExpr(arg.input, doc, vars) || []).filter((item) =>
        evalExpr(arg.cond, doc, { ...vars, [arg.as]: item }),
      );
    case "$map":
      return (evalExpr(arg.input, doc, vars) || []).map((item) =>
        evalExpr(arg.in, doc, { ...vars, [arg.as]: item }),
      );
    case "$sum": {
      const v = evalExpr(arg, doc, vars);
      return Array.isArray(v) ? v.reduce((a, b) => a + (Number(b) || 0), 0) : Number(v) || 0;
    }
    case "$size":
      return (evalExpr(arg, doc, vars) || []).length;
    case "$toLower":
      return String(evalExpr(arg, doc, vars) ?? "").toLowerCase();
    case "$regexMatch":
      return new RegExp(arg.regex).test(String(evalExpr(arg.input, doc, vars) ?? ""));
    case "$convert": {
      const v = evalExpr(arg.input, doc, vars);
      if (v == null) return arg.onNull;
      const n = Number(v);
      return Number.isFinite(n) ? n : arg.onError;
    }
    case "$add":
      return nums().reduce((a, b) => a + b, 0);
    case "$subtract": {
      const [a, b] = nums();
      return a - b;
    }
    case "$multiply":
      return nums().reduce((a, b) => a * b, 1);
    case "$divide": {
      const [a, b] = nums();
      return b === 0 ? 0 : a / b;
    }
    case "$gt": {
      const [a, b] = evalExpr(arg, doc, vars);
      return a > b;
    }
    case "$cond": {
      const [test, yes, no] = Array.isArray(arg)
        ? evalExpr(arg, doc, vars)
        : [evalExpr(arg.if, doc, vars), evalExpr(arg.then, doc, vars), evalExpr(arg.else, doc, vars)];
      return test ? yes : no;
    }
    default:
      throw new Error(`the test evaluator does not know ${op}`);
  }
}

/** Run the route's own money expressions over one stored document. */
function rollupOf(doc) {
  const projectIndex = seenPipeline.findIndex((s) => s.$project);
  const projection = seenPipeline[projectIndex].$project;
  // What the pipeline sets up before it projects (safeItems, and whether this
  // is a materials schedule), so the money expressions read what they read in
  // the database rather than a hand-made stand-in.
  const source = { ...doc };
  for (const stage of seenPipeline.slice(0, projectIndex).filter((s) => s.$addFields)) {
    for (const [key, expr] of Object.entries(stage.$addFields)) {
      source[key] = evalExpr(expr, source);
    }
  }
  const row = {};
  for (const key of [
    "totalCost",
    "provisionalTotal",
    "approvedVariationsTotal",
    "preliminaryPercent",
    "contingencyPercent",
    "taxPercent",
  ]) {
    assert.ok(projection[key], `${key} must be projected`);
    row[key] = evalExpr(projection[key], source);
  }
  for (const stage of seenPipeline.slice(projectIndex).filter((s) => s.$addFields)) {
    for (const [key, expr] of Object.entries(stage.$addFields)) {
      row[key] = evalExpr(expr, { ...source, ...row });
    }
  }
  return row;
}

test("the rollup's estimate is the Bill's estimate, to the kobo", async () => {
  const { projectTotals } = await import(
    "../../client/src/features/projects/lib/projectTotals.js"
  );
  rows = [];
  await get("/me/projects-rollup");

  const doc = {
    items: [
      { qty: 120, rate: 35_000, completed: true },
      { qty: 48.5, rate: 12_250 },
      { qty: 0, rate: 900_000 },
    ],
    provisionalSums: [
      { amount: 2_500_000, kind: "pc" },
      { amount: 1_750_000 },
    ],
    variations: [
      { qty: 1, rate: 900_000, status: "approved" },
      // No status at all: work that has always counted, so it still does.
      { qty: 2, rate: 150_000 },
      { qty: 1, rate: 4_000_000, status: "pending" },
      { qty: 1, rate: 3_000_000, status: "rejected" },
    ],
    contract: { preliminaryPercent: 8, contingencyPercent: 5, taxPercent: 7.5 },
  };

  const row = rollupOf(doc);
  const expected = projectTotals({
    items: doc.items,
    provisionalSums: doc.provisionalSums,
    variations: doc.variations,
    preliminaryPercent: doc.contract.preliminaryPercent,
    contingencyPercent: doc.contract.contingencyPercent,
    taxPercent: doc.contract.taxPercent,
  });

  assert.equal(row.totalCost, expected.measured);
  assert.equal(row.provisionalTotal, expected.sums);
  assert.equal(row.preliminaryTotal, expected.prelims);
  assert.equal(row.estimateSubtotal, expected.subtotal);
  assert.equal(row.contingencyTotal, expected.contingency);
  assert.equal(row.taxTotal, expected.tax);
  assert.equal(row.approvedVariationsTotal, expected.variations);
  assert.equal(row.estimatedTotal, expected.total);
  // Only an approved variation counts, on both sides of the wire.
  assert.equal(row.approvedVariationsTotal, 1_200_000);
});

test("a project that has agreed no percentages still estimates the same on both", async () => {
  const { projectTotals } = await import(
    "../../client/src/features/projects/lib/projectTotals.js"
  );
  rows = [];
  await get("/me/projects-rollup");

  // No contract sub-document at all — most projects. The route's defaults are
  // the schema's own (7.5 / 5 / 7.5), so the Bill reads the same figure.
  const doc = { items: [{ qty: 10, rate: 1_000 }] };
  const row = rollupOf(doc);
  assert.equal(row.preliminaryPercent, 7.5);
  assert.equal(row.contingencyPercent, 5);
  assert.equal(row.taxPercent, 7.5);
  assert.equal(
    row.estimatedTotal,
    projectTotals({
      items: doc.items,
      preliminaryPercent: 7.5,
      contingencyPercent: 5,
      taxPercent: 7.5,
    }).total,
  );
});

test("an empty project estimates nothing, rather than something", async () => {
  rows = [];
  await get("/me/projects-rollup");
  assert.equal(rollupOf({}).estimatedTotal, 0);
  assert.equal(rollupOf({ items: [] }).estimatedTotal, 0);
});
