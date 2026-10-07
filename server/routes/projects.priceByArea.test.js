// POST /projects/:productKey/:id/bill/price-many with a rate the USER stated
// (Ada's propose_price_by_area / propose_set_rates cards), over the REAL router.
//
// Pinned here: who may apply (owner and full collaborators who can see rates;
// never view-only, never rate-masked), what one stated line writes (the bill
// rate and its lock, one Material and one Labour budget row, the O&P share),
// that the server works an opening's rate out from the bill line's own size,
// that applying twice changes nothing, and that a plugin re-save keeps it.
//
// Only Mongo is stubbed, as in projects.rateMask.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { User } = await import("../models/User.js");
const { ActivityLog } = await import("../models/ActivityLog.js");
const { CategoryFeedback } = await import("../models/CategoryFeedback.js");
const { RateGenRate } = await import("../models/RateGenRate.js");
const { default: projectsRouter } = await import("./projects.js");
const { carryCloudRateLocks } = await import("../util/cloudRateLocks.js");
const { deriveBillRatesFromBudget } = await import("../util/deriveBillRates.js");

const OWNER = new mongoose.Types.ObjectId();
const MASKED = new mongoose.Types.ObjectId(); // full collaborator, no RateGen
const PRICER = new mongoose.Types.ObjectId(); // full collaborator, has RateGen
const VIEWER = new mongoose.Types.ObjectId(); // view collaborator
const STRANGER = new mongoose.Types.ObjectId(); // licensed, not on the project
const PROJECT_ID = new mongoose.Types.ObjectId();

const LICENCE = [{ productKey: "revit", status: "active" }];
const RATEGEN = [{ productKey: "rategen", status: "active" }];
const ENTITLEMENTS = new Map([
  [String(OWNER), LICENCE],
  [String(MASKED), LICENCE],
  [String(PRICER), [...LICENCE, ...RATEGEN]],
  [String(VIEWER), [...LICENCE, ...RATEGEN]],
  [String(STRANGER), [...LICENCE, ...RATEGEN]],
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
    productKey: "revit",
    name: "Lekki duplex",
    slug: "lekki-duplex",
    version: 1,
    collaborators: [
      { userId: MASKED, accessLevel: "full" },
      { userId: PRICER, accessLevel: "full" },
      { userId: VIEWER, accessLevel: "view" },
    ],
    shareCodes: [],
    items: [
      { sn: 1, code: "W1", description: "Window W1 (1200×1500)", unit: "nr", qty: 4, rate: 0, rateLockedAt: null },
      { sn: 2, code: "W2", description: "Window W2 (600x600)", unit: "nr", qty: 2, rate: 30000, rateLockedAt: null },
      { sn: 3, code: "WT", description: "Windows – Total Area", unit: "m2", qty: 7.92, rate: 0, rateLockedAt: null },
      { sn: 14, code: "B14", description: "225mm sandcrete blockwork in walls", unit: "m2", qty: 120, rate: 0, rateLockedAt: null },
      { sn: 15, code: "C15", description: "Concrete blockwork infill", unit: "m3", qty: 3, rate: 0, rateLockedAt: null },
    ],
    budgetItems: [
      // A row the QS typed for W2: it must survive.
      { sn: 5, billIdentity: "W2", componentKind: "Material", description: "Glass", materialName: "Glass", unit: "m2", qty: 1, rate: 100 },
      // An automatic row the constants generator made for B14: replaced.
      { sn: 800000123, billIdentity: "B14", componentKind: "Material", description: "Blocks", materialName: "Blocks", unit: "nr", qty: 1200, rate: 600, rateSource: "ml-schedule" },
    ],
    resourceItems: [
      { billIdentity: "B14", name: "Mason", componentKind: "Labour", quantity: 2, duration: 1, rate: 8000, rateSource: "rategen-rate" },
    ],
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

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
TakeoffProject.findOne = async (filter) => {
  if (!stored || String(filter?._id) !== String(stored._id)) return null;
  const uid = filter?.$or?.[0]?.userId;
  const isOwner = uid && String(uid) === String(stored.userId);
  const isCollab = (stored.collaborators || []).some((c) => String(c.userId) === String(uid));
  return isOwner || isCollab ? stored : null;
};
User.findById = (id) => {
  const doc = { _id: id, entitlements: ENTITLEMENTS.get(String(id)) || [] };
  return { lean: async () => doc, then: (ok, ko) => Promise.resolve(doc).then(ok, ko) };
};
ActivityLog.create = async () => ({});
CategoryFeedback.find = () => ({ lean: async () => [] });
CategoryFeedback.updateOne = async () => ({});
// A stated rate must not read the rate library at all.
let libraryReads = 0;
RateGenRate.find = () => {
  libraryReads += 1;
  return { lean: async () => [] };
};

async function post(userId, body) {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/projects/revit/${PROJECT_ID}/bill/price-many`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${signAccess({ _id: String(userId), email: "u@example.com", role: "user" })}`,
        },
        body: JSON.stringify(body),
      },
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const line = (code) => stored.items.find((i) => i.code === code);
const rowsFor = (code) => stored.budgetItems.filter((b) => b.billIdentity === code);

const WINDOWS = {
  lines: [
    { code: "W1", ratePerM2: 88000, split: { material: 60, labour: 20, overheadProfit: 20 } },
    { code: "W2", ratePerM2: 88000 },
    { code: "WT", ratePerM2: 88000 },
  ],
  via: "ada",
};

test("windows by area: rate from the line's own size, locked, split into the budget", async () => {
  stored = projectDoc();
  const res = await post(OWNER, WINDOWS);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body._priced, ["W1", "W2"]);
  assert.deepEqual(res.body._skipped.map((s) => s.code), ["WT"]);
  assert.match(res.body._skipped[0].reason, /width × height/);

  const w1 = line("W1");
  assert.equal(w1.rate, 158400);
  assert.ok(w1.rateLockedAt instanceof Date);
  assert.equal(w1.netUnitCost, 126720);
  assert.equal(w1.overheadPercent, 25);
  assert.equal(w1.profitPercent, 0);
  assert.equal(line("W2").rate, 31680);

  assert.deepEqual(
    rowsFor("W1").map((b) => [b.componentKind, b.qty, b.rate, b.overheadPercent, b.rateSource]),
    [
      ["Material", 4, 95040, 25, "user-rate"],
      ["Labour", 4, 31680, 25, "user-rate"],
    ],
  );
  // The QS's own Glass row on W2 survives beside the new ones.
  assert.deepEqual(rowsFor("W2").map((b) => b.description).sort(), ["Glass", "Labour", "Material"]);
  assert.equal(stored.saves, 1);
  assert.equal(stored.version, 2);
  assert.equal(libraryReads, 0);
});

test("applying the same rates twice leaves the project exactly as it was", async () => {
  stored = projectDoc();
  await post(OWNER, WINDOWS);
  const snap = JSON.stringify({ items: stored.items, budget: stored.budgetItems });
  const version = stored.version;
  const res = await post(OWNER, WINDOWS);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body._priced, ["W1", "W2"]);
  assert.equal(JSON.stringify({ items: stored.items, budget: stored.budgetItems }), snap);
  assert.equal(stored.version, version);
  assert.equal(stored.saves, 1); // the second Apply wrote nothing
});

test("a stated rate replaces the automatic rows and the old gang, and keeps its unit", async () => {
  stored = projectDoc();
  const res = await post(OWNER, {
    lines: [
      { code: "B14", userRate: 9500, unit: "m2" },
      { code: "C15", userRate: 9500, unit: "m2" },
    ],
    via: "ada",
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body._priced, ["B14"]);
  assert.match(res.body._skipped[0].reason, /m3/);
  assert.equal(line("B14").rate, 9500);
  assert.equal(line("C15").rate, 0);
  assert.deepEqual(rowsFor("B14").map((b) => [b.componentKind, b.rate]), [
    ["Material", 5700],
    ["Labour", 1900],
  ]);
  assert.equal(stored.resourceItems.filter((r) => r.billIdentity === "B14").length, 0);
});

test("the user's split is used, and a bad one is skipped with the reason", async () => {
  stored = projectDoc();
  const res = await post(OWNER, {
    lines: [
      { code: "B14", userRate: 10000, split: { material: 70, labour: 30, overheadProfit: 0 } },
      { code: "W1", ratePerM2: 88000, split: { material: 90, labour: 20, overheadProfit: 0 } },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body._priced, ["B14"]);
  assert.match(res.body._skipped[0].reason, /100/);
  assert.deepEqual(rowsFor("B14").map((b) => [b.componentKind, b.rate, b.overheadPercent]), [
    ["Material", 7000, 0],
    ["Labour", 3000, 0],
  ]);
  assert.equal(line("W1").rate, 0);
});

test("a plugin re-save and the budget heal keep the stated rate", async () => {
  stored = projectDoc();
  await post(OWNER, WINDOWS);
  // QUIV rebuilds the bill on save with its own rate and no rateLockedAt field.
  const incoming = [{ sn: 1, code: "W1", description: "Window W1 (1200×1500)", unit: "nr", qty: 4, rate: 0 }];
  carryCloudRateLocks(stored.items, incoming);
  assert.equal(incoming[0].rate, 158400);
  assert.ok(incoming[0].rateLockedAt);
  // The heal re-derives every rate from the budget, except a locked one.
  const before = line("W1").rate;
  deriveBillRatesFromBudget(stored);
  assert.equal(line("W1").rate, before);
});

test("a full collaborator with RateGen may apply", async () => {
  stored = projectDoc();
  const res = await post(PRICER, { lines: [{ code: "B14", userRate: 9500 }] });
  assert.equal(res.status, 200);
  assert.equal(line("B14").rate, 9500);
});

test("a rate-masked collaborator is refused and nothing changes", async () => {
  stored = projectDoc();
  const res = await post(MASKED, { lines: [{ code: "B14", userRate: 9500 }] });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "RATES_MASKED");
  assert.equal(line("B14").rate, 0);
  assert.equal(stored.saves, undefined);
});

test("a view-only collaborator is refused", async () => {
  stored = projectDoc();
  const res = await post(VIEWER, { lines: [{ code: "B14", userRate: 9500 }] });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "VIEW_ONLY");
  assert.equal(line("B14").rate, 0);
});

test("a stranger gets 404, and an empty Apply is a 400", async () => {
  stored = projectDoc();
  assert.equal((await post(STRANGER, { lines: [{ code: "B14", userRate: 1 }] })).status, 404);
  assert.equal((await post(OWNER, { lines: [] })).status, 400);
});

test("nonsense figures are skipped, never written", async () => {
  stored = projectDoc();
  const res = await post(OWNER, {
    lines: [
      { code: "B14", userRate: -5 },
      { code: "W1", ratePerM2: "lots" },
      { code: "NOPE", userRate: 100 },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body._priced, []);
  assert.equal(res.body._skipped.length, 3);
  assert.equal(stored.saves, undefined);
});
