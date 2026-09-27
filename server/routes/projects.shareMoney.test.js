// server/routes/projects.shareMoney.test.js
//
// R4b: whoever shares a project chooses whether the people they share it with
// see its money. The choice is `showMoney` on a share code, copied onto the
// collaborator record on claim and changeable per person afterwards.
//
// The rule these tests pin, on every route that serves a shared project's
// money:
//
//   owner                          → money, always
//   collaborator, owner said off   → no money, even WITH RateGen
//   collaborator, owner said on    → money only with RateGen (as before)
//   collaborator, no field at all  → exactly as before the switch existed
//
// and that "no money" is done by the SERVER: the figures are zero in the
// response (or the route refuses), never sent for the browser to hide.
//
// Mongo is stubbed throughout, as in projects.rateMask.test.js: the real
// routers, the real auth, the real access resolution and masking all run.
// Nothing here touches a database — local dev shares the production one.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { User } = await import("../models/User.js");
const { Product } = await import("../models/Product.js");
const { ActivityLog } = await import("../models/ActivityLog.js");
const { CategoryFeedback } = await import("../models/CategoryFeedback.js");
const { default: projectsRouter } = await import("./projects.js");
const { default: projectsPmRouter } = await import("./projects.pm.js");
const { default: reportsRouter } = await import("./reports.js");
const { default: boqRouter } = await import("./projects.boq.js");
const { default: meRouter } = await import("./me.js");
const {
  maskSharedMoney,
  ownerAllowsMoney,
  ownerHidesMoneyExpr,
  PROJECT_LIST_MONEY_FIELDS,
  MERGED_CONTRACT_MONEY_FIELDS,
} = await import("../util/sharedMoney.js");
const { shapeWorkOverview } = await import("../util/workOverview.js");

// ── People ──────────────────────────────────────────────────────────────────
const OWNER = new mongoose.Types.ObjectId();
const HIDDEN = new mongoose.Types.ObjectId(); // full, HAS RateGen, owner said off
const SHOWN = new mongoose.Types.ObjectId(); // full, has RateGen, owner said on
const LEGACY = new mongoose.Types.ObjectId(); // full, has RateGen, record predates the switch
const NORATE = new mongoose.Types.ObjectId(); // full, no RateGen, owner said on
const JOINER = new mongoose.Types.ObjectId(); // claims a code in the claim tests
const PROJECT_ID = new mongoose.Types.ObjectId();

const HERON = { productKey: "planswift", status: "active" };
const RATEGEN = { productKey: "rategen", status: "active" };
const ENTITLEMENTS = new Map([
  [String(OWNER), [HERON, RATEGEN]],
  [String(HIDDEN), [HERON, RATEGEN]],
  [String(SHOWN), [HERON, RATEGEN]],
  [String(LEGACY), [HERON, RATEGEN]],
  [String(NORATE), [HERON]],
  [String(JOINER), [HERON, RATEGEN]],
]);

function deepCopy(value) {
  if (Array.isArray(value)) return value.map(deepCopy);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    if (value instanceof mongoose.Types.ObjectId) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      out[k] = deepCopy(v);
    }
    return out;
  }
  return value;
}

function projectDoc() {
  return {
    _id: PROJECT_ID,
    userId: OWNER,
    productKey: "planswift",
    name: "Pavillion",
    slug: "pavillion",
    version: 4,
    clientProjectKey: "",
    modelFingerprint: "",
    collaborators: [
      { userId: HIDDEN, email: "sub@contractor.example", accessLevel: "full", showMoney: false },
      { userId: SHOWN, email: "qs@firm.example", accessLevel: "full", showMoney: true },
      // Saved before R4b: no showMoney at all.
      { userId: LEGACY, email: "old@firm.example", accessLevel: "full" },
      { userId: NORATE, email: "site@firm.example", accessLevel: "full", showMoney: true },
    ],
    shareCodes: [],
    contract: { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 },
    valuationEvents: [],
    certificates: [
      {
        number: 1,
        date: new Date("2026-09-01T00:00:00Z"),
        cumulativeValue: 4_000_000,
        netPayable: 3_600_000,
        status: "approved",
      },
    ],
    materialItems: [],
    items: [
      {
        sn: 1,
        code: "BQ-1",
        description: "Reinforced concrete grade 25 in columns",
        unit: "m3",
        qty: 32,
        rate: 65_000,
        percentComplete: 0,
        completed: false,
        category: "111: Insitu Concrete Works",
        trade: "Concrete",
      },
    ],
    budgetItems: [],
    provisionalSums: [{ description: "Piling by specialist", amount: 4_500_000, completed: false }],
    variations: [
      { description: "Extra blockwork", qty: 40, unit: "m2", rate: 7_500, reference: "VO-01", source: "manual" },
    ],
    preliminaryItems: [
      { name: "Site accommodation", allocation: 10, actualAmount: 850_000, completed: false },
    ],
    projectManagement: {},
    markModified() {},
    async save() {
      this.saves = (this.saves || 0) + 1;
      return this;
    },
    toObject() {
      return deepCopy(this);
    },
  };
}

let stored = null;

// Serves `await q`, `q.lean()`, `q.select().lean()`, `q.sort().limit().lean()`.
function query(value) {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: async () => (value && value.toObject ? value.toObject() : value),
    then: (ok, ko) => Promise.resolve(value).then(ok, ko),
  };
  return q;
}

function canReach(filter) {
  if (!stored) return false;
  if (filter?.isSample === true) return stored.isSample === true;
  if (filter?._id && String(filter._id) !== String(stored._id)) return false;
  const or = filter?.$or || [];
  const uid = or.find((c) => c.userId)?.userId || or.find((c) => c["collaborators.userId"])?.["collaborators.userId"];
  if (!uid) return true;
  if (String(uid) === String(stored.userId)) return true;
  return (stored.collaborators || []).some((c) => String(c.userId) === String(uid));
}

let listRows = [];
let mergedRows = [];
let seenListPipeline = null;

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
Object.defineProperty(mongoose.connection, "db", { value: {}, configurable: true });

TakeoffProject.findOne = (filter) => {
  if (filter?.["shareCodes.codeHash"]) {
    const hit = (stored?.shareCodes || []).some((c) => c.codeHash === filter["shareCodes.codeHash"]);
    return query(hit ? stored : null);
  }
  return query(canReach(filter) ? stored : null);
};
TakeoffProject.find = (filter) => query(canReach(filter) && stored ? [stored.toObject()] : []);
TakeoffProject.aggregate = async (pipeline) => {
  const match = pipeline.find((s) => s.$match)?.$match || {};
  if (match.mergeContainer === true) return mergedRows;
  seenListPipeline = pipeline;
  return listRows;
};
User.findById = (id) =>
  query({
    _id: id,
    email: "user@example.com",
    firstName: "Test",
    entitlements: ENTITLEMENTS.get(String(id)) || [],
  });
Product.findOne = () => query({ name: "HERON" });
ActivityLog.create = async () => ({});
CategoryFeedback.find = () => ({ lean: async () => [] });
CategoryFeedback.updateOne = async () => ({});

async function withServer(fn) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/projects", projectsPmRouter);
  app.use("/projects", projectsRouter);
  app.use("/reports", reportsRouter);
  app.use("/projectsboq", boqRouter);
  app.use("/me", meRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const tokenFor = (userId, email = "user@example.com") =>
  signAccess({ _id: String(userId), email, role: "user" });

async function call(base, path, { as, method = "GET", body, email } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(as, email)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* binary (xlsx) or empty */
  }
  return { status: res.status, body: json, text };
}

const ONE = `/projects/planswift/${PROJECT_ID}`;

// ── The rule, as a pure function ────────────────────────────────────────────

test("ownerAllowsMoney: owner yes, switched-off no, switched-on and legacy yes", () => {
  const p = projectDoc();
  assert.equal(ownerAllowsMoney(p, OWNER), true);
  assert.equal(ownerAllowsMoney(p, HIDDEN), false);
  assert.equal(ownerAllowsMoney(p, SHOWN), true);
  assert.equal(ownerAllowsMoney(p, LEGACY), true, "a record from before the switch keeps money on");
});

// A tiny evaluator for exactly the operators ownerHidesMoneyExpr uses, so the
// aggregation expression itself is proven against documents rather than
// trusted by eye. A wrong expression here would leak silently.
function evalExpr(expr, doc, vars = {}) {
  if (typeof expr === "string" && expr.startsWith("$$")) {
    const [name, ...path] = expr.slice(2).split(".");
    return path.reduce((v, k) => v?.[k], vars[name]);
  }
  if (typeof expr === "string" && expr.startsWith("$")) {
    return expr.slice(1).split(".").reduce((v, k) => v?.[k], doc);
  }
  if (expr && typeof expr === "object" && !Array.isArray(expr) && !(expr instanceof mongoose.Types.ObjectId)) {
    const [op] = Object.keys(expr);
    const arg = expr[op];
    if (op === "$ifNull") {
      const v = evalExpr(arg[0], doc, vars);
      return v == null ? evalExpr(arg[1], doc, vars) : v;
    }
    if (op === "$eq") {
      const a = evalExpr(arg[0], doc, vars);
      const b = evalExpr(arg[1], doc, vars);
      return String(a) === String(b) && typeof a === typeof b;
    }
    if (op === "$filter") {
      const input = evalExpr(arg.input, doc, vars) || [];
      return input.filter((x) => evalExpr(arg.cond, doc, { ...vars, [arg.as]: x }));
    }
    if (op === "$map") {
      const input = evalExpr(arg.input, doc, vars) || [];
      return input.map((x) => evalExpr(arg.in, doc, { ...vars, [arg.as]: x }));
    }
    if (op === "$in") {
      const needle = evalExpr(arg[0], doc, vars);
      const hay = evalExpr(arg[1], doc, vars) || [];
      return hay.some((h) => String(h) === String(needle));
    }
    throw new Error(`evaluator does not know ${op}`);
  }
  return expr;
}

test("ownerHidesMoneyExpr is true only for a collaborator the owner switched off", () => {
  const doc = projectDoc();
  assert.equal(evalExpr(ownerHidesMoneyExpr(HIDDEN), doc), true);
  assert.equal(evalExpr(ownerHidesMoneyExpr(SHOWN), doc), false);
  assert.equal(evalExpr(ownerHidesMoneyExpr(LEGACY), doc), false, "missing field reads as on");
  assert.equal(evalExpr(ownerHidesMoneyExpr(OWNER), doc), false, "the owner is never hidden");
  assert.equal(evalExpr(ownerHidesMoneyExpr(HIDDEN), { collaborators: null }), false);
});

test("maskSharedMoney: the owner's switch hides everything, even from a RateGen reader", () => {
  const row = {
    shared: true,
    ownerHidesMoney: true,
    contractSum: 120_000_000,
    estimatedTotal: 51_000_000,
    totalCost: 40_000_000,
    valuedAmount: 13_000_000,
    remainingAmount: 27_000_000,
    itemCount: 120,
  };
  const [out] = maskSharedMoney([row], /* canSeeRates */ true, PROJECT_LIST_MONEY_FIELDS);
  assert.equal(out.contractSum, 0);
  assert.equal(out.estimatedTotal, 0);
  assert.equal(out.totalCost, 0);
  assert.equal(out.valuedAmount, 0);
  assert.equal(out.remainingAmount, 0);
  assert.equal(out.itemCount, 120, "quantities and progress stay");
  assert.equal(out.moneyHidden, true);
  assert.equal(out.moneyHiddenBy, "owner");
  assert.equal("ownerHidesMoney" in out, false, "the internal flag never leaves the server");
});

test("maskSharedMoney: the RateGen rule alone hides the three totals too, and says why", () => {
  const row = { shared: true, ownerHidesMoney: false, contractSum: 9, totalCost: 40, valuedAmount: 13, remainingAmount: 27 };
  const [out] = maskSharedMoney([row], false, PROJECT_LIST_MONEY_FIELDS);
  assert.equal(out.contractSum, 0);
  assert.equal(out.totalCost, 0);
  assert.equal(out.valuedAmount, 0);
  assert.equal(out.remainingAmount, 0);
  assert.equal(out.priced, true);
  assert.equal(out.moneyHiddenBy, "rategen");
  assert.equal("ownerHidesMoney" in out, false);
});

test("maskSharedMoney: an owner's own row is never masked, whatever it carries", () => {
  const row = { shared: false, ownerHidesMoney: true, contractSum: 9, totalCost: 40 };
  const [out] = maskSharedMoney([row], false, PROJECT_LIST_MONEY_FIELDS);
  assert.equal(out.contractSum, 9);
  assert.equal(out.totalCost, 40);
  assert.equal(out.moneyHidden, undefined);
});

// ── GET /projects/:key/:id (the project page, and what the editor saves from)

test("project GET: a collaborator WITH RateGen gets zeros when the owner hid the money", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, ONE, { as: HIDDEN });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body._ratesMasked, true);
    assert.equal(res.body._access.canSeeRates, false);
    assert.equal(res.body._access.moneyHiddenByOwner, true);
    assert.equal(res.body._access.canEdit, true, "the level is untouched: full still edits");
    assert.deepEqual(res.body.items.map((i) => i.rate), [0]);
    assert.deepEqual(res.body.provisionalSums.map((s) => s.amount), [0]);
    assert.equal(res.body.variations[0].rate, 0);
    assert.equal(res.body.preliminaryItems[0].actualAmount, 0);
    // The response body carries no stored figure anywhere.
    assert.equal(res.text.includes("65000"), false);
    assert.equal(res.text.includes("4500000"), false);
  });
});

test("project GET: switched on, or a record from before the switch, reads exactly as before", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    for (const who of [SHOWN, LEGACY]) {
      const res = await call(base, ONE, { as: who });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body._access.canSeeRates, true);
      assert.equal(res.body._access.moneyHiddenByOwner, false);
      assert.equal(res.body.items[0].rate, 65_000);
    }
    // Owner switched it on, but the reader has no RateGen: masked, by RateGen.
    const res = await call(base, ONE, { as: NORATE });
    assert.equal(res.body._access.canSeeRates, false);
    assert.equal(res.body._access.moneyHiddenByOwner, false);
    assert.equal(res.body.items[0].rate, 0);
  });
});

test("project GET: the owner always sees their own money", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, ONE, { as: OWNER });
    assert.equal(res.body._access.canSeeRates, true);
    assert.equal(res.body._access.moneyHiddenByOwner, false);
    assert.equal(res.body.items[0].rate, 65_000);
  });
});

test("project PUT: a save by a collaborator the owner hid money from cannot write zeros over it", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await call(base, ONE, { as: HIDDEN })).body;
    const payload = {
      baseVersion: served.version,
      items: served.items.map((it) => ({ ...it, percentComplete: 30 })),
      provisionalSums: served.provisionalSums,
      variations: served.variations,
      preliminaryItems: served.preliminaryItems,
    };
    const res = await call(base, ONE, { as: HIDDEN, method: "PUT", body: payload });
    assert.equal(res.status, 200, res.text);
    assert.equal(stored.items[0].rate, 65_000, "the owner's rate survived the masked save");
    assert.equal(stored.provisionalSums[0].amount, 4_500_000);
    assert.equal(stored.variations[0].rate, 7_500);
    assert.equal(stored.items[0].percentComplete, 30, "the progress edit itself landed");
    assert.equal(res.body._ratesMasked, true);
  });
});

test("priced exports: refused with MONEY_HIDDEN_BY_OWNER, not a RateGen upsell", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, `${ONE}/certificates/1/export`, { as: HIDDEN });
    assert.equal(res.status, 403, res.text);
    assert.equal(res.body.code, "MONEY_HIDDEN_BY_OWNER");
    // A reader without RateGen still gets the RateGen answer.
    const norate = await call(base, `${ONE}/certificates/1/export`, { as: NORATE });
    assert.equal(norate.status, 403);
    assert.equal(norate.body.code, "RATEGEN_REQUIRED");
  });
});

test("BoQ exports (/projectsboq): refused when the owner hid the money", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    for (const kind of ["boq", "bill-budget"]) {
      const res = await call(base, `/projectsboq/planswift/${PROJECT_ID}/export/${kind}`, { as: HIDDEN });
      assert.equal(res.status, 403, `${kind}: ${res.text}`);
      assert.equal(res.body.code, "MONEY_HIDDEN_BY_OWNER");
    }
  });
});

test("PM dashboard: closed to a collaborator the owner hid money from, even with RateGen", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, `${ONE}/pm/dashboard`, { as: HIDDEN });
    assert.equal(res.status, 403, res.text);
    assert.equal(res.body.code, "MONEY_HIDDEN_BY_OWNER");
    const shown = await call(base, `${ONE}/pm/dashboard`, { as: SHOWN });
    assert.notEqual(shown.status, 403, "switched on + RateGen still opens it");
  });
});

test("project report: refused when the owner hid the money", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, `/reports/project/planswift/${PROJECT_ID}`, { as: HIDDEN });
    assert.equal(res.status, 403, res.text);
    assert.equal(res.body.code, "MONEY_HIDDEN_BY_OWNER");
  });
});

test("management report: the hidden project's money is null, not a figure", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const hidden = await call(base, "/reports/management", { as: HIDDEN });
    assert.equal(hidden.status, 200, hidden.text);
    const rows = Object.values(hidden.body.report).find(
      (v) => Array.isArray(v) && v.some((r) => r && "moneyMasked" in r),
    );
    assert.ok(rows, "report has project rows");
    assert.equal(rows[0].moneyMasked, true);
    assert.equal(rows[0].value, null);

    const shown = await call(base, "/reports/management", { as: SHOWN });
    const shownRows = Object.values(shown.body.report).find(
      (v) => Array.isArray(v) && v.some((r) => r && "moneyMasked" in r),
    );
    assert.equal(shownRows[0].moneyMasked, false);
  });
});

// ── The lists ───────────────────────────────────────────────────────────────

const listRow = (extra) => ({
  id: new mongoose.Types.ObjectId(),
  name: "MOREMI ESTATE BLOCK A",
  slug: "moremi-estate-block-a",
  productKey: "planswift",
  shared: true,
  ownerHidesMoney: false,
  itemCount: 120,
  progressPercent: 33,
  contractSum: 120_000_000,
  estimatedTotal: 51_963_062.5,
  certifiedToDate: 9_000_000,
  totalCost: 40_000_000,
  valuedAmount: 13_000_000,
  remainingAmount: 27_000_000,
  ...extra,
});

test("GET /projects/:key: the pipeline asks the owner's switch for THIS reader", async () => {
  stored = projectDoc();
  listRows = [];
  await withServer(async (base) => {
    await call(base, "/projects/planswift", { as: HIDDEN });
  });
  const stage = seenListPipeline.find((s) => s.$project?.ownerHidesMoney);
  assert.ok(stage, "the list projects ownerHidesMoney");
  assert.deepEqual(stage.$project.ownerHidesMoney, ownerHidesMoneyExpr(HIDDEN));
});

test("GET /projects/:key: an owner-hidden row loses every figure, a RateGen reader included", async () => {
  listRows = [listRow({ ownerHidesMoney: true }), listRow({ name: "OTHER" })];
  await withServer(async (base) => {
    const res = await call(base, "/projects/planswift", { as: HIDDEN });
    assert.equal(res.status, 200, res.text);
    assert.ok(Array.isArray(res.body), "still a bare array for the plugins");
    const [hid, other] = res.body;
    for (const f of ["contractSum", "estimatedTotal", "totalCost", "valuedAmount", "remainingAmount"]) {
      assert.equal(hid[f], 0, f);
    }
    assert.equal(hid.moneyHidden, true);
    assert.equal(hid.moneyHiddenBy, "owner");
    assert.equal(hid.itemCount, 120);
    // The other shared row, owner said on, reader has RateGen: untouched.
    assert.equal(other.contractSum, 120_000_000);
    assert.equal(other.totalCost, 40_000_000);
    assert.equal(other.moneyHidden, undefined);
    for (const r of res.body) assert.equal("ownerHidesMoney" in r, false);
  });
});

test("GET /me/projects-rollup: owner-hidden rows and merged contracts are masked", async () => {
  listRows = [listRow({ ownerHidesMoney: true }), listRow({ shared: false })];
  mergedRows = [
    { id: "c1", name: "MERGED", shared: true, ownerHidesMoney: true, certifiedToDate: 5_000_000, approvedVariationsTotal: 300_000 },
  ];
  await withServer(async (base) => {
    const res = await call(base, "/me/projects-rollup", { as: HIDDEN });
    assert.equal(res.status, 200, res.text);
    const [hid, mine] = res.body.projects;
    for (const f of ["estimatedTotal", "certifiedToDate", "totalCost", "valuedAmount", "remainingAmount"]) {
      assert.equal(hid[f], 0, f);
    }
    assert.equal(hid.moneyHiddenBy, "owner");
    assert.equal(mine.totalCost, 40_000_000, "own row untouched");
    assert.equal("ownerHidesMoney" in hid, false);
    assert.equal("ownerHidesMoney" in mine, false);
    const [mc] = res.body.mergedContracts;
    for (const f of MERGED_CONTRACT_MONEY_FIELDS) assert.equal(mc[f], 0, f);
    assert.equal(mc.moneyHiddenBy, "owner");
  });
  mergedRows = [];
});

test("GET /me/work-overview (shaping): owner-hidden certificates and variations are zeroed", () => {
  const raw = [
    {
      certificates: [
        { projectId: "p1", name: "A", shared: true, ownerHidesMoney: true, number: 1, netPayable: 3_600_000, cumulativeValue: 4_000_000, status: "approved" },
        { projectId: "p2", name: "B", shared: true, ownerHidesMoney: false, number: 1, netPayable: 1_000, cumulativeValue: 2_000, status: "approved" },
      ],
      variations: [
        { projectId: "p1", name: "A", shared: true, ownerHidesMoney: true, reference: "VO-1", amount: 300_000 },
      ],
    },
  ];
  // A RateGen reader: only the owner's switch can hide anything here.
  const out = shapeWorkOverview(raw, { canSeeRates: true });
  assert.equal(out.certificates[0].netPayable, 0);
  assert.equal(out.certificates[0].cumulativeValue, 0);
  assert.equal(out.certificates[0].moneyHidden, true);
  assert.equal(out.certificates[0].moneyHiddenBy, "owner");
  assert.equal(out.certificates[1].netPayable, 1_000);
  assert.equal(out.certificates[1].moneyHidden, false);
  assert.equal(out.variations[0].amount, 0);
  assert.equal(out.variations[0].moneyHiddenBy, "owner");
  for (const c of out.certificates) assert.equal("ownerHidesMoney" in c, false);
});

// ── Setting the switch ──────────────────────────────────────────────────────

test("share code: showMoney is stored as sent, defaults to on, and is listed back", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const off = await call(base, `${ONE}/collab/codes`, {
      as: OWNER,
      method: "POST",
      body: { accessLevel: "view", showMoney: false },
    });
    assert.equal(off.status, 200, off.text);
    assert.equal(off.body.showMoney, false);
    assert.equal(stored.shareCodes.at(-1).showMoney, false);

    const dflt = await call(base, `${ONE}/collab/codes`, { as: OWNER, method: "POST", body: {} });
    assert.equal(dflt.body.showMoney, true, "default keeps today's behaviour");

    const junk = await call(base, `${ONE}/collab/codes`, {
      as: OWNER,
      method: "POST",
      body: { showMoney: "maybe" },
    });
    assert.equal(junk.body.showMoney, true, "an unreadable value falls back to the default");

    const list = await call(base, `${ONE}/collab`, { as: OWNER });
    assert.equal(list.status, 200, list.text);
    assert.deepEqual(list.body.codes.map((c) => c.showMoney), [false, true, true]);
    const byId = Object.fromEntries(list.body.collaborators.map((c) => [c.userId, c.showMoney]));
    assert.equal(byId[String(HIDDEN)], false);
    assert.equal(byId[String(LEGACY)], true, "legacy record lists as on");
  });
});

test("claim: the collaborator inherits the code's money setting", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const made = await call(base, `${ONE}/collab/codes`, {
      as: OWNER,
      method: "POST",
      body: { accessLevel: "full", showMoney: false },
    });
    const res = await call(base, "/projects/claim", {
      as: JOINER,
      email: "joiner@example.com",
      method: "POST",
      body: { code: made.body.code },
    });
    assert.equal(res.status, 200, res.text);
    const joined = stored.collaborators.find((c) => String(c.userId) === String(JOINER));
    assert.ok(joined, "joined");
    assert.equal(joined.showMoney, false);

    // And they meet a masked project, RateGen notwithstanding.
    const page = await call(base, ONE, { as: JOINER });
    assert.equal(page.body._access.moneyHiddenByOwner, true);
    assert.equal(page.body.items[0].rate, 0);
  });
});

test("PATCH collaborator: flips money alone, leaves the level; flips back; empty body is refused", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const path = `${ONE}/collab/${SHOWN}`;
    const off = await call(base, path, { as: OWNER, method: "PATCH", body: { showMoney: false } });
    assert.equal(off.status, 200, off.text);
    assert.equal(off.body.showMoney, false);
    assert.equal(off.body.accessLevel, "full", "money switch did not demote them to view");
    const rec = stored.collaborators.find((c) => String(c.userId) === String(SHOWN));
    assert.equal(rec.showMoney, false);
    assert.equal(rec.accessLevel, "full");

    const page = await call(base, ONE, { as: SHOWN });
    assert.equal(page.body.items[0].rate, 0, "takes effect on the very next read");

    const on = await call(base, path, { as: OWNER, method: "PATCH", body: { showMoney: true } });
    assert.equal(on.body.showMoney, true);
    assert.equal((await call(base, ONE, { as: SHOWN })).body.items[0].rate, 65_000);

    // Changing only the level still works as it always did.
    const lvl = await call(base, path, { as: OWNER, method: "PATCH", body: { accessLevel: "view" } });
    assert.equal(lvl.body.accessLevel, "view");
    assert.equal(lvl.body.showMoney, true);

    const empty = await call(base, path, { as: OWNER, method: "PATCH", body: {} });
    assert.equal(empty.status, 400);
  });
});

test("only the owner can set the switch", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await call(base, `${ONE}/collab/${HIDDEN}`, {
      as: SHOWN,
      method: "PATCH",
      body: { showMoney: true },
    });
    assert.equal(res.status, 403, res.text);
    assert.equal(stored.collaborators.find((c) => String(c.userId) === String(HIDDEN)).showMoney, false);
  });
});
