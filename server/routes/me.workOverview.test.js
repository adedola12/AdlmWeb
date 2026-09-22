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
const {
  baseProductKeyExpr,
  buildWorkOverviewPipeline,
  certifiedToDateExpr,
  shapeWorkOverview,
  watDayStart,
} = await import("../util/workOverview.js");
const { default: meRouter } = await import("./me.js");

const USER_ID = new mongoose.Types.ObjectId();
const PROJ_ID = new mongoose.Types.ObjectId();

// The signed-in user, as the route's own RateGen check reads them. Tests that
// care set `entitlements` before the call.
let me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
const rategen = (extra = {}) => [{ productKey: "rategen", status: "active", ...extra }];

User.findById = (id) => ({
  select() {
    return this;
  },
  lean: async () => (String(id) === String(USER_ID) ? me : null),
  then: (ok, ko) => Promise.resolve(String(id) === String(USER_ID) ? me : null).then(ok, ko),
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

// ── Money on somebody else's project ────────────────────────────────────────
// The project API masks money for a collaborator without RateGen
// (routes/projects.js: resolveProjectAccess → canSeeRates → maskRates). The
// dashboard reads the same projects, so it must hide the same figures.

const sharedCert = () =>
  row({
    number: 2,
    date: new Date("2026-09-10"),
    netPayable: 4_250_000,
    cumulativeValue: 30_000_000,
    status: "approved",
    shared: true,
  });

test("a collaborator without RateGen is not told what a shared job is worth", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  facet = {
    certificates: [sharedCert()],
    draftCertificates: [sharedCert()],
    variations: [row({ reference: "V1", amount: 1_200_000, shared: true })],
    pendingVariations: [row({ reference: "V1", amount: 1_200_000, shared: true })],
  };
  const res = await get("/me/work-overview");
  assert.equal(res.body.certificates[0].netPayable, 0);
  assert.equal(res.body.certificates[0].cumulativeValue, 0);
  assert.equal(res.body.certificates[0].moneyHidden, true);
  // The row itself stays: quantities, dates and status are not money.
  assert.equal(res.body.certificates[0].status, "approved");
  assert.equal(res.body.draftCertificates[0].netPayable, 0);
  assert.equal(res.body.variations[0].amount, 0);
  assert.equal(res.body.variations[0].moneyHidden, true);
  assert.equal(res.body.pendingVariations[0].amount, 0);
});

test("the same collaborator WITH RateGen sees it, exactly as the project does", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: rategen() };
  facet = { certificates: [sharedCert()] };
  const res = await get("/me/work-overview");
  assert.equal(res.body.certificates[0].netPayable, 4_250_000);
  assert.equal(res.body.certificates[0].moneyHidden, false);
});

test("an expired RateGen subscription does not count as holding one", async () => {
  me = {
    _id: USER_ID,
    email: "qs@example.com",
    entitlements: rategen({ expiresAt: new Date("2026-01-01") }),
  };
  facet = { certificates: [sharedCert()] };
  const res = await get("/me/work-overview");
  assert.equal(res.body.certificates[0].netPayable, 0);
});

test("the owner's own money is never hidden from them", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  facet = { certificates: [row({ number: 1, netPayable: 900_000, status: "paid" })] };
  const res = await get("/me/work-overview");
  assert.equal(res.body.certificates[0].netPayable, 900_000);
  assert.equal(res.body.certificates[0].shared, false);
  assert.equal(res.body.certificates[0].moneyHidden, false);
});

test("shaping hides money by default, so a caller that forgets cannot leak it", () => {
  const shaped = shapeWorkOverview([{ certificates: [{ netPayable: 10, shared: true }] }]);
  assert.equal(shaped.certificates[0].netPayable, 0);
});

// ── An honest count ─────────────────────────────────────────────────────────

test("the counts say how many there really are, not how many were returned", async () => {
  me = { _id: USER_ID, email: "qs@example.com", entitlements: [] };
  facet = {
    draftCertificates: [row({ number: 1, status: "draft" })],
    counts: [{ draftCertificates: 31, pendingVariations: 4, overdueTasks: 9 }],
  };
  const res = await get("/me/work-overview");
  assert.equal(res.body.draftCertificates.length, 1);
  assert.deepEqual(res.body.counts, {
    draftCertificates: 31,
    pendingVariations: 4,
    overdueTasks: 9,
  });
});

test("a response with no counts branch still answers with zeros, never undefined", () => {
  assert.deepEqual(shapeWorkOverview([{}]).counts, {
    draftCertificates: 0,
    pendingVariations: 0,
    overdueTasks: 0,
  });
});

test("the counts branch counts the same things the capped facets return", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const counts = buildWorkOverviewPipeline(USER_ID, { now }).at(-1).$facet.counts;
  const flat = JSON.stringify(counts);
  assert.ok(flat.includes("draftCertificates"));
  assert.ok(flat.includes("pendingVariations"));
  assert.ok(flat.includes("overdueTasks"));
  // Counting never unwinds and never sorts, so it costs a scan of arrays the
  // pipeline already holds.
  assert.ok(!flat.includes("$unwind") && !flat.includes("$sort"));
  // Overdue is judged against the start of today in Lagos — the same rule the
  // client applies — not against the raw instant, which would call a task
  // ending today overdue at half past midnight.
  assert.ok(flat.includes(watDayStart(now).toISOString()));
  assert.equal(watDayStart(new Date("2026-09-22T00:30:00Z")).toISOString(), "2026-09-21T23:00:00.000Z");
});

// ── The shape of the query ──────────────────────────────────────────────────

test("no facet branch drags the rest of the project through its sort", () => {
  const facets = buildWorkOverviewPipeline(USER_ID, {}).at(-1).$facet;
  const ARRAYS = ["certificates", "variations", "tasks", "rateKeys"];

  for (const [name, field] of [
    ["certificates", "certificates"],
    ["draftCertificates", "certificates"],
    ["variations", "variations"],
    ["pendingVariations", "variations"],
    ["tasks", "tasks"],
  ]) {
    const stages = facets[name];
    const kept = Object.keys(stages[0].$project || {});
    assert.ok(kept.includes(field), `${name} must keep the array it reads`);
    for (const other of ARRAYS) {
      if (other !== field) {
        assert.ok(!kept.includes(other), `${name} must not carry ${other} into its unwind`);
      }
    }
    // The row is projected BEFORE the sort, so the blocking sort holds a
    // handful of small fields per row rather than whole projects.
    const sortAt = stages.findIndex((s) => s.$sort);
    assert.ok(sortAt > 0, `${name} must sort`);
    const before = stages[sortAt - 1].$project;
    assert.ok(before && before._id === 0, `${name} must project its row before sorting`);
    for (const key of Object.keys(stages[sortAt].$sort)) {
      assert.ok(!key.includes("."), `${name} sorts on the projected row, not a nested path`);
    }
  }

  // Rate usage unwinds one document per bill line, so it must carry nothing
  // but the keys by the time it gets there.
  const usage = facets.rateUsage;
  assert.deepEqual(Object.keys(usage[0].$project).sort(), ["_id", "rateKeys"]);
  assert.ok(usage[1].$unwind, "the narrowing must come before the unwind");
});

test("every row says whether the project is the reader's own", () => {
  const pipeline = buildWorkOverviewPipeline(USER_ID, {});
  assert.ok(pipeline[1].$project.shared, "the pipeline must know whose project it is");
  const facets = pipeline.at(-1).$facet;
  for (const name of ["certificates", "variations", "tasks"]) {
    assert.ok(Object.keys(facets[name][0].$project).includes("shared"));
  }
});

// ── Certified to date ───────────────────────────────────────────────────────
//
// The expression is evaluated here rather than described, because what went
// wrong was arithmetic. This walks the handful of operators it uses.

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
  if (op === "$ifNull") {
    const [v, alt] = evalExpr(arg, doc, vars);
    return v == null ? alt : v;
  }
  if (op === "$in") {
    const [needle, hay] = evalExpr(arg, doc, vars);
    return (hay || []).includes(needle);
  }
  if (op === "$filter") {
    return (evalExpr(arg.input, doc, vars) || []).filter((item) =>
      evalExpr(arg.cond, doc, { ...vars, [arg.as]: item }),
    );
  }
  if (op === "$map") {
    return (evalExpr(arg.input, doc, vars) || []).map((item) =>
      evalExpr(arg.in, doc, { ...vars, [arg.as]: item }),
    );
  }
  if (op === "$sum") {
    const v = evalExpr(arg, doc, vars);
    return Array.isArray(v) ? v.reduce((a, b) => a + (Number(b) || 0), 0) : Number(v) || 0;
  }
  if (op === "$convert") {
    const v = evalExpr(arg.input, doc, vars);
    if (v == null) return arg.onNull;
    const n = Number(v);
    return Number.isFinite(n) ? n : arg.onError;
  }
  if (op === "$multiply") {
    return evalExpr(arg, doc, vars).reduce((a, b) => a * (Number(b) || 0), 1);
  }
  throw new Error(`the test evaluator does not know ${op}`);
}

test("certified to date is what the approved certificates add up to", () => {
  const expr = certifiedToDateExpr();

  // Approval is not always contiguous: certificate 1 is still a draft while
  // certificate 2 has been approved. Only the approved certificate's own money
  // is certified — its CUMULATIVE value would credit the draft's work too, and
  // say 15m where the project's own Contract tab says 5m.
  const gappy = {
    certificates: [
      { number: 1, status: "draft", thisCertificate: 10_000_000, cumulativeValue: 10_000_000 },
      { number: 2, status: "approved", thisCertificate: 5_000_000, cumulativeValue: 15_000_000 },
    ],
  };
  assert.equal(evalExpr(expr, gappy), 5_000_000);

  // Paid is certified too, and a certificate with no stored status is a draft.
  const mixed = {
    certificates: [
      { number: 1, status: "paid", thisCertificate: 4_000_000 },
      { number: 2, status: "approved", thisCertificate: 3_000_000 },
      { number: 3, thisCertificate: 2_000_000 },
    ],
  };
  assert.equal(evalExpr(expr, mixed), 7_000_000);

  assert.equal(evalExpr(expr, { certificates: [] }), 0);
  assert.equal(evalExpr(expr, {}), 0);
  // The old reading is gone, not merely unused.
  assert.ok(!JSON.stringify(expr).includes("cumulativeValue"));
});
