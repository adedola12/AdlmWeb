// server/routes/archicad.shareMoney.test.js
//
// QUIV for ArchiCAD serves shared projects through its own router
// (routes/archicad.routes.js), with the priced BoQ in ArchicadBoqVersion — so
// it never passed through routes/projects.js resolveProjectAccess → maskRates,
// and every collaborator was handed the owner's money. These tests pin the
// same rule every other product follows:
//
//   owner                          → money, always
//   collaborator, owner said off   → no money, even WITH RateGen
//   collaborator, owner said on    → money only with RateGen
//   collaborator, no field at all  → as "on" (records from before the switch)
//   sample (owner-less, read-only) → money
//
// and that "no money" is done by the SERVER: figures read 0 in the response
// (never null — the connector's C# models are non-nullable doubles), the
// response says moneyHidden, and priced exports / money edits answer 403.
//
// Mongo is stubbed throughout, as in projects.shareMoney.test.js: the real
// router, the real auth, the real access rule and masking all run. Nothing
// here touches a database — local dev shares the production one.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
// The costing engine's master labour list opens its OWN MongoClient from these
// (util/rategenMaster.js). Without them it throws and falls back to [] — which
// is exactly what these tests need: no connection to anything, ever.
delete process.env.RATEGEN_MONGO_URI;
delete process.env.MONGO_URI;

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { ArchicadBoqVersion } = await import("../models/ArchicadBoqVersion.js");
const { User } = await import("../models/User.js");
const { RateGenRate } = await import("../models/RateGenRate.js");
const { RateGenComputeItem } = await import("../models/RateGenComputeItem.js");
const { RateGenMaterial } = await import("../models/RateGenMaterial.js");
const { RateGenLabour } = await import("../models/RateGenLabour.js");
const { RateGenLibrary } = await import("../models/RateGenLibrary.js");
const { default: archicadRouter } = await import("./archicad.routes.js");
const {
  archicadMoneyAccess,
  maskArchicadBoqDocument,
  ARCHICAD_LINE_MONEY_FIELDS,
  ARCHICAD_TOTALS_MONEY_FIELDS,
} = await import("../util/archicadMoney.js");

// ── People ──────────────────────────────────────────────────────────────────
const OWNER = new mongoose.Types.ObjectId();
const HIDDEN = new mongoose.Types.ObjectId(); // HAS RateGen, owner said off
const SHOWN = new mongoose.Types.ObjectId(); // has RateGen, owner said on
const LEGACY = new mongoose.Types.ObjectId(); // has RateGen, record predates the switch
const NORATE = new mongoose.Types.ObjectId(); // no RateGen, owner said on
const VIEWER = new mongoose.Types.ObjectId(); // VIEW access, has RateGen, owner said on
const PROJECT_ID = new mongoose.Types.ObjectId();
const SAMPLE_ID = new mongoose.Types.ObjectId();
const VERSION_ID = new mongoose.Types.ObjectId();

const ARCHICAD = { productKey: "archicad", status: "active" };
const RATEGEN = { productKey: "rategen", status: "active" };
const ENTITLEMENTS = new Map([
  [String(OWNER), [ARCHICAD, RATEGEN]],
  [String(HIDDEN), [ARCHICAD, RATEGEN]],
  [String(SHOWN), [ARCHICAD, RATEGEN]],
  [String(LEGACY), [ARCHICAD, RATEGEN]],
  [String(NORATE), [ARCHICAD]],
  [String(VIEWER), [ARCHICAD, RATEGEN]],
]);

const GUID = "6F1C2A3B-0000-4000-8000-000000000001";

function costedLine() {
  return {
    itemRef: "A1",
    category: "frame",
    categoryTitle: "Frame",
    description: "Reinforced concrete grade 25 in columns",
    unit: "m3",
    quantity: 32,
    quivType: "column",
    elementGuids: [GUID],
    elementQuantities: [{ guid: GUID, qty: 32 }],
    elementQuantitiesEstimated: false,
    quantitiesBreakdown: { volume: 32 },
    flags: [],
    netUnitCost: 55_000,
    overheadPercent: 10,
    profitPercent: 8,
    marginPercent: 8,
    unitRate: 65_000,
    materialUnitCost: 40_000,
    plantUnitCost: 3_000,
    otherUnitCost: 1_000,
    materialAmount: 1_280_000,
    labourAmount: 352_000,
    plantAmount: 96_000,
    otherAmount: 32_000,
    totalAmount: 2_080_000,
    marginAmount: 144_000,
    rateProvenance: { rateId: "r1", rateSource: "rategen", section: "Concrete", name: "Concrete", matchScore: 0.9 },
    labourProvenance: {
      method: "rate-build-up",
      labourUnitRate: 11_000,
      gangComposition: [{ name: "Mason", unit: "day", qtyPerUnit: 0.5, unitPrice: 22_000 }],
      sourceRateId: "r1",
      notes: "",
    },
  };
}

function versionDoc() {
  const lines = [costedLine()];
  return {
    _id: VERSION_ID,
    projectId: PROJECT_ID,
    versionNumber: 3,
    isCurrent: true,
    extractedAt: new Date("2026-09-20T00:00:00Z"),
    modelVersion: "28",
    currency: "NGN",
    lines,
    categories: [
      { key: "frame", title: "Frame", nrm: "2.1", materialAmount: 1_280_000, labourAmount: 352_000,
        plantAmount: 96_000, otherAmount: 32_000, totalAmount: 2_080_000, marginAmount: 144_000 },
    ],
    totals: {
      materialAmount: 1_280_000, labourAmount: 352_000, plantAmount: 96_000, otherAmount: 32_000,
      directCost: 1_936_000, marginAmount: 144_000, grandTotal: 2_080_000, floorArea: 120, costPerM2: 17_333.33,
    },
    issues: [],
    changedLineRefs: [],
    markModified() {},
    async save() {
      saves.version += 1;
      return this;
    },
  };
}

function projectDoc({ sample = false } = {}) {
  return {
    _id: sample ? SAMPLE_ID : PROJECT_ID,
    userId: sample ? null : OWNER,
    isSample: sample,
    productKey: "archicad",
    name: sample ? "Sample bungalow" : "Pavillion",
    slug: sample ? "sample-bungalow" : "pavillion",
    updatedAt: new Date("2026-09-21T00:00:00Z"),
    version: 3,
    items: [],
    collaborators: sample
      ? []
      : [
          { userId: HIDDEN, email: "sub@contractor.example", accessLevel: "full", showMoney: false },
          { userId: SHOWN, email: "qs@firm.example", accessLevel: "full", showMoney: true },
          { userId: LEGACY, email: "old@firm.example", accessLevel: "full" },
          { userId: NORATE, email: "site@firm.example", accessLevel: "full", showMoney: true },
          { userId: VIEWER, email: "client@firm.example", accessLevel: "view", showMoney: true },
        ],
    projectManagement: { budgetOverride: 2_500_000 },
    async save() {
      saves.project += 1;
      return this;
    },
  };
}

// ── Mongo stubs ─────────────────────────────────────────────────────────────
let project = null;
let sample = null;
let saves = { project: 0, version: 0 };
// Whose RateGen library the costing engine asked for, and who each new
// version says made it.
let libraryAskedFor = [];
let createdVersions = [];

function reset() {
  project = projectDoc();
  sample = projectDoc({ sample: true });
  saves = { project: 0, version: 0 };
  libraryAskedFor = [];
  createdVersions = [];
}

// Serves `await q`, `q.lean()`, `q.select().lean()`, `q.sort().limit()`.
function query(value) {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: async () => value,
    then: (ok, ko) => Promise.resolve(value).then(ok, ko),
  };
  return q;
}

// Does this filter reach `doc`? Understands exactly the shapes the ArchiCAD
// router builds: _id or slug, productKey, and an owner / collaborator / sample
// $or (or a bare userId for owner-only routes).
function reaches(doc, filter = {}) {
  if (!doc) return false;
  if (filter._id && String(filter._id) !== String(doc._id)) return false;
  if (filter.slug && filter.slug !== doc.slug) return false;
  if (filter.productKey && filter.productKey !== doc.productKey) return false;
  const who = (c) => {
    if (c.isSample === true) return doc.isSample === true;
    if (c.userId) return doc.userId != null && String(c.userId) === String(doc.userId);
    if (c["collaborators.userId"]) {
      return (doc.collaborators || []).some((x) => String(x.userId) === String(c["collaborators.userId"]));
    }
    return false;
  };
  if (filter.$or) return filter.$or.some(who);
  if (filter.userId) return who({ userId: filter.userId });
  return true;
}

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

TakeoffProject.findOne = (filter) => query([project, sample].find((d) => reaches(d, filter)) || null);
TakeoffProject.find = (filter) => query([project, sample].filter((d) => reaches(d, filter)));
TakeoffProject.exists = async (filter) => [project, sample].some((d) => reaches(d, filter));
// extract with projectId:null builds a real document; its save stays in memory.
TakeoffProject.prototype.save = async function save() {
  saves.project += 1;
  return this;
};

ArchicadBoqVersion.findOne = (filter) => {
  const v = versionDoc();
  const pid = String(filter?.projectId || "");
  if (pid !== String(PROJECT_ID) && pid !== String(SAMPLE_ID)) return query(null);
  if (filter._id && String(filter._id) !== String(VERSION_ID)) return query(null);
  v.projectId = filter.projectId;
  return query(v);
};
ArchicadBoqVersion.find = (filter) => {
  const ids = (filter?.projectId?.$in || [filter?.projectId]).map(String);
  return query(ids.flatMap((id) => (id === String(PROJECT_ID) || id === String(SAMPLE_ID) ? [{ ...versionDoc(), projectId: id }] : [])));
};
ArchicadBoqVersion.aggregate = async () => [
  { _id: PROJECT_ID, versionCount: 3 },
  { _id: SAMPLE_ID, versionCount: 1 },
];
ArchicadBoqVersion.updateMany = async () => ({ modifiedCount: 1 });
ArchicadBoqVersion.create = async (doc) => {
  createdVersions.push(doc);
  return { _id: new mongoose.Types.ObjectId(), ...doc };
};

// The costing engine's catalogue reads: empty, except for recording whose
// personal library was asked for.
for (const M of [RateGenRate, RateGenComputeItem, RateGenMaterial, RateGenLabour]) {
  M.find = () => query([]);
}
RateGenLibrary.findOne = (filter) => {
  libraryAskedFor.push(String(filter?.userId));
  return query(null);
};

User.findById = (id) =>
  query({ _id: id, email: "user@example.com", entitlements: ENTITLEMENTS.get(String(id)) || [] });

async function withServer(fn) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/api/archicad", archicadRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const tokenFor = (userId) => signAccess({ _id: String(userId), email: "user@example.com", role: "user" });

async function call(base, path, { as, method = "GET", body } = {}) {
  const res = await fetch(`${base}/api/archicad${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(as)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* binary (xlsx / pdf) */
  }
  return { status: res.status, body: json, type: res.headers.get("content-type") || "" };
}

// Every money figure on a BoQ document is zero, and nothing else moved.
function assertBoqMasked(doc, by) {
  assert.equal(doc.moneyHidden, true);
  assert.equal(doc.moneyHiddenBy, by);
  assert.equal(doc.targetBudget, 0);
  const line = doc.lines[0];
  for (const f of ARCHICAD_LINE_MONEY_FIELDS) assert.equal(line[f], 0, `line.${f}`);
  assert.equal(line.labourProvenance.labourUnitRate, 0);
  assert.equal(line.labourProvenance.gangComposition[0].unitPrice, 0);
  for (const f of ARCHICAD_TOTALS_MONEY_FIELDS) assert.equal(doc.totals[f], 0, `totals.${f}`);
  assert.equal(doc.categories[0].totalAmount, 0);
  assert.equal(doc.categories[0].materialAmount, 0);
  // What was measured is still there.
  assert.equal(line.quantity, 32);
  assert.equal(line.description, "Reinforced concrete grade 25 in columns");
  assert.deepEqual(line.elementGuids, [GUID]);
  assert.equal(doc.totals.floorArea, 120);
}

function assertBoqPriced(doc) {
  assert.equal(doc.moneyHidden, undefined);
  assert.equal(doc.lines[0].unitRate, 65_000);
  assert.equal(doc.lines[0].totalAmount, 2_080_000);
  assert.equal(doc.totals.grandTotal, 2_080_000);
  assert.equal(doc.targetBudget, 2_500_000);
}

// ── The rule, as a pure function ────────────────────────────────────────────

test("archicadMoneyAccess: owner and sample always; owner-off beats RateGen; else RateGen", async () => {
  reset();
  const no = () => {
    throw new Error("RateGen must not be looked up here");
  };
  assert.deepEqual(await archicadMoneyAccess(project, OWNER, no), { canSeeMoney: true, hiddenBy: null });
  assert.deepEqual(await archicadMoneyAccess(sample, NORATE, no), { canSeeMoney: true, hiddenBy: null });
  assert.deepEqual(await archicadMoneyAccess(project, HIDDEN, no), { canSeeMoney: false, hiddenBy: "owner" });
  assert.deepEqual(await archicadMoneyAccess(project, SHOWN, true), { canSeeMoney: true, hiddenBy: null });
  assert.deepEqual(await archicadMoneyAccess(project, LEGACY, true), { canSeeMoney: true, hiddenBy: null });
  assert.deepEqual(await archicadMoneyAccess(project, NORATE, false), { canSeeMoney: false, hiddenBy: "rategen" });
});

test("maskArchicadBoqDocument keeps every key and never mutates its input", () => {
  const v = versionDoc();
  const doc = { lines: v.lines, categories: v.categories, totals: v.totals, targetBudget: 9, currency: "NGN" };
  const masked = maskArchicadBoqDocument(doc, "owner");
  assert.equal(v.lines[0].unitRate, 65_000, "input line untouched");
  assert.equal(v.totals.grandTotal, 2_080_000, "input totals untouched");
  assert.deepEqual(Object.keys(masked.lines[0]).sort(), Object.keys(v.lines[0]).sort());
  assert.deepEqual(Object.keys(masked.totals).sort(), Object.keys(v.totals).sort());
  for (const f of ARCHICAD_TOTALS_MONEY_FIELDS) assert.equal(typeof masked.totals[f], "number");
});

// ── GET /projects (the connector's Welcome list) ───────────────────────────

test("GET /projects: owner sees grandTotal; owner-off and no-RateGen collaborators see 0", async () => {
  reset();
  await withServer(async (base) => {
    const mine = await call(base, "/projects", { as: OWNER });
    assert.equal(mine.status, 200);
    assert.ok(Array.isArray(mine.body), "still a bare array");
    assert.equal(mine.body[0].grandTotal, 2_080_000);
    assert.equal(mine.body[0].moneyHidden, undefined);

    const hidden = await call(base, "/projects", { as: HIDDEN });
    assert.ok(Array.isArray(hidden.body));
    assert.equal(hidden.body[0].grandTotal, 0);
    assert.equal(hidden.body[0].moneyHidden, true);
    assert.equal(hidden.body[0].moneyHiddenBy, "owner");
    // Same fields the connector's ArchicadProjectSummary reads, plus the flags.
    for (const k of ["id", "slug", "name", "updatedAt", "versionCount", "grandTotal"]) {
      assert.ok(k in hidden.body[0], k);
    }
    assert.equal(hidden.body[0].versionCount, 3);
    assert.equal(hidden.body[0].collaborators, undefined, "access fields are not sent");
    assert.equal(hidden.body[0].userId, undefined);

    const norate = await call(base, "/projects", { as: NORATE });
    assert.equal(norate.body[0].grandTotal, 0);
    assert.equal(norate.body[0].moneyHiddenBy, "rategen");

    for (const who of [SHOWN, LEGACY]) {
      const r = await call(base, "/projects", { as: who });
      assert.equal(r.body[0].grandTotal, 2_080_000);
      assert.equal(r.body[0].moneyHidden, undefined);
    }
  });
});

// ── BoQ reads ───────────────────────────────────────────────────────────────

test("GET /boq/:id: owner priced; owner-off masked even with RateGen; no-RateGen masked", async () => {
  reset();
  await withServer(async (base) => {
    const own = await call(base, `/boq/${PROJECT_ID}`, { as: OWNER });
    assert.equal(own.status, 200);
    assertBoqPriced(own.body);

    const hidden = await call(base, `/boq/${PROJECT_ID}`, { as: HIDDEN });
    assert.equal(hidden.status, 200);
    assertBoqMasked(hidden.body, "owner");

    const norate = await call(base, `/boq/${PROJECT_ID}`, { as: NORATE });
    assertBoqMasked(norate.body, "rategen");

    // By slug too (the web address), not only by id.
    const bySlug = await call(base, "/boq/pavillion", { as: HIDDEN });
    assertBoqMasked(bySlug.body, "owner");

    assertBoqPriced((await call(base, `/boq/${PROJECT_ID}`, { as: SHOWN })).body);
    assertBoqPriced((await call(base, `/boq/${PROJECT_ID}`, { as: LEGACY })).body);
  });
});

test("GET /boq/:id/versions and /versions/:vid are masked the same way", async () => {
  reset();
  await withServer(async (base) => {
    const own = await call(base, `/boq/${PROJECT_ID}/versions`, { as: OWNER });
    assert.equal(own.body[0].grandTotal, 2_080_000);
    assert.equal(own.body[0].moneyHidden, undefined);

    const hidden = await call(base, `/boq/${PROJECT_ID}/versions`, { as: HIDDEN });
    assert.ok(Array.isArray(hidden.body), "still a bare array");
    assert.equal(hidden.body[0].grandTotal, 0);
    assert.equal(hidden.body[0].lineCount, 1);
    assert.equal(hidden.body[0].moneyHiddenBy, "owner");

    const norate = await call(base, `/boq/${PROJECT_ID}/versions/${VERSION_ID}`, { as: NORATE });
    assert.equal(norate.status, 200);
    assertBoqMasked(norate.body, "rategen");

    const shown = await call(base, `/boq/${PROJECT_ID}/versions/${VERSION_ID}`, { as: SHOWN });
    assertBoqPriced(shown.body);
  });
});

test("GET /element/:id/:guid: a masked reader gets the quantities and zero money", async () => {
  reset();
  await withServer(async (base) => {
    const own = await call(base, `/element/${PROJECT_ID}/${GUID}`, { as: OWNER });
    assert.equal(own.status, 200);
    assert.equal(own.body.totalAmount, 2_080_000);
    assert.equal(own.body.unitRate, 65_000);

    const hidden = await call(base, `/element/${PROJECT_ID}/${GUID}`, { as: HIDDEN });
    assert.equal(hidden.status, 200);
    for (const f of ["materialAmount", "labourAmount", "plantAmount", "otherAmount", "totalAmount", "marginAmount", "unitRate"]) {
      assert.equal(hidden.body[f], 0, f);
    }
    assert.equal(hidden.body.labourProvenance.labourUnitRate, 0);
    assert.equal(hidden.body.quantities.elementQuantity, 32);
    assert.equal(hidden.body.lineQuantityShare, 1);
    assert.equal(hidden.body.moneyHiddenBy, "owner");
  });
});

// ── Priced exports and money edits ──────────────────────────────────────────

test("priced exports: 403 MONEY_HIDDEN_BY_OWNER / RATEGEN_REQUIRED; the owner still exports", async () => {
  reset();
  await withServer(async (base) => {
    for (const kind of ["excel", "pdf"]) {
      const hidden = await call(base, `/boq/${PROJECT_ID}/export/${kind}`, { as: HIDDEN });
      assert.equal(hidden.status, 403, kind);
      assert.equal(hidden.body.code, "MONEY_HIDDEN_BY_OWNER");

      const norate = await call(base, `/boq/${PROJECT_ID}/export/${kind}`, { as: NORATE });
      assert.equal(norate.status, 403, kind);
      assert.equal(norate.body.code, "RATEGEN_REQUIRED");
    }
    const xlsx = await call(base, `/boq/${PROJECT_ID}/export/excel`, { as: OWNER });
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.type, /spreadsheetml/);
    const shown = await call(base, `/boq/${PROJECT_ID}/export/excel`, { as: SHOWN });
    assert.equal(shown.status, 200);
  });
});

test("margin, budget and re-price are refused to a masked reader and change nothing", async () => {
  reset();
  await withServer(async (base) => {
    const margin = await call(base, `/boq/${PROJECT_ID}/margin`, { as: HIDDEN, method: "PATCH", body: { global: 20 } });
    assert.equal(margin.status, 403);
    assert.equal(margin.body.code, "MONEY_HIDDEN_BY_OWNER");

    const budget = await call(base, `/boq/${PROJECT_ID}/budget`, { as: NORATE, method: "PATCH", body: { targetBudget: 1 } });
    assert.equal(budget.status, 403);
    assert.equal(budget.body.code, "RATEGEN_REQUIRED");

    const reprice = await call(base, `/boq/${PROJECT_ID}/reapply-rates`, { as: HIDDEN, method: "POST", body: {} });
    assert.equal(reprice.status, 403);

    assert.deepEqual(saves, { project: 0, version: 0 }, "nothing was written");
    assert.equal(project.projectManagement.budgetOverride, 2_500_000);

    const own = await call(base, `/boq/${PROJECT_ID}/budget`, { as: OWNER, method: "PATCH", body: { targetBudget: 3_000_000 } });
    assert.equal(own.status, 200);
    assert.equal(own.body.targetBudget, 3_000_000);
  });
});

// ── Samples ─────────────────────────────────────────────────────────────────

test("a sample project shows its money to any ArchiCAD subscriber, RateGen or not", async () => {
  reset();
  await withServer(async (base) => {
    const r = await call(base, `/boq/${SAMPLE_ID}`, { as: NORATE });
    assert.equal(r.status, 200);
    assert.equal(r.body.moneyHidden, undefined);
    assert.equal(r.body.totals.grandTotal, 2_080_000);
  });
});

// ── View vs full access, and whose rates price the bill ─────────────────────

const EXTRACT_BODY = {
  projectId: String(PROJECT_ID),
  modelVersion: "28",
  boqLines: [
    { itemRef: "A1", category: "frame", description: "Concrete in columns", unit: "m3", quantity: 40, quivType: "column" },
  ],
};

test("a view-only collaborator reads the bill but every write answers 403 VIEW_ONLY", async () => {
  reset();
  await withServer(async (base) => {
    const read = await call(base, `/boq/${PROJECT_ID}`, { as: VIEWER });
    assert.equal(read.status, 200, "view access still reads");
    assertBoqPriced(read.body);

    const writes = [
      ["/boq/extract", "POST", EXTRACT_BODY],
      [`/boq/${PROJECT_ID}/reapply-rates`, "POST", {}],
      [`/boq/${PROJECT_ID}/margin`, "PATCH", { global: 20 }],
      [`/boq/${PROJECT_ID}/budget`, "PATCH", { targetBudget: 1 }],
    ];
    for (const [path, method, body] of writes) {
      const r = await call(base, path, { as: VIEWER, method, body });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.code, "VIEW_ONLY", `${method} ${path}`);
    }
    assert.deepEqual(saves, { project: 0, version: 0 }, "nothing was written");
    assert.equal(createdVersions.length, 0, "no version was made");
    assert.equal(libraryAskedFor.length, 0, "nothing was priced");
  });
});

test("a full collaborator's extract is priced from the OWNER's library, and recorded as theirs", async () => {
  reset();
  await withServer(async (base) => {
    const r = await call(base, "/boq/extract", { as: SHOWN, method: "POST", body: EXTRACT_BODY });
    assert.equal(r.status, 200);
    assert.deepEqual(libraryAskedFor, [String(OWNER)], "owner's rates, not the collaborator's");
    assert.equal(createdVersions.length, 1);
    assert.equal(String(createdVersions[0].createdBy), String(SHOWN), "who sent the quantities");
    assert.equal(createdVersions[0].lines[0].quantity, 40);
    assert.equal(saves.project, 1);
  });
});

test("a full collaborator's re-price also uses the owner's library", async () => {
  reset();
  await withServer(async (base) => {
    const r = await call(base, `/boq/${PROJECT_ID}/reapply-rates`, { as: SHOWN, method: "POST", body: {} });
    assert.equal(r.status, 200);
    assert.deepEqual(libraryAskedFor, [String(OWNER)]);
    assert.equal(String(createdVersions[0].createdBy), String(SHOWN));
  });
});

test("a masked full collaborator can still update quantities; the answer comes back masked", async () => {
  reset();
  await withServer(async (base) => {
    const r = await call(base, "/boq/extract", { as: HIDDEN, method: "POST", body: EXTRACT_BODY });
    assert.equal(r.status, 200);
    assert.deepEqual(libraryAskedFor, [String(OWNER)]);
    assert.equal(r.body.moneyHidden, true);
    assert.equal(r.body.moneyHiddenBy, "owner");
    assert.equal(r.body.lines[0].quantity, 40);
  });
});

test("the owner's own extract and a brand-new project are priced from the sender's library", async () => {
  reset();
  await withServer(async (base) => {
    const own = await call(base, "/boq/extract", { as: OWNER, method: "POST", body: EXTRACT_BODY });
    assert.equal(own.status, 200);
    assert.deepEqual(libraryAskedFor, [String(OWNER)]);

    libraryAskedFor = [];
    const fresh = await call(base, "/boq/extract", {
      as: SHOWN,
      method: "POST",
      body: { ...EXTRACT_BODY, projectId: null, projectName: "My own job" },
    });
    assert.equal(fresh.status, 200);
    assert.deepEqual(libraryAskedFor, [String(SHOWN)], "a new project's owner is whoever created it");
  });
});
