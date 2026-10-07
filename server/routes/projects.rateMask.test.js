// The rate-mask guard, over the REAL router.
//
// projects.masking.test.js already pins what guardMaskedWrite() does to a body,
// line by line, in isolation. What it cannot see is whether the routes still
// CALL it: delete the call from updateProject or markBudget and every one of
// those tests still passes, while a site engineer's next save zeroes the
// owner's bill. These drive the two write paths end to end so the wiring itself
// is pinned.
//
// The bug behind all of it: resolveProjectAccess() gives a "full" collaborator
// canEdit, but canSeeRates only when they hold RateGen. projectForClient() then
// runs maskRates() over the payload, zeroing items[].rate, budgetItems[] money,
// provisionalSums[].amount, variations[].rate and preliminaryItems[]
// .actualAmount. The web editor initialises its state from that payload and
// PUTs the whole thing back, and the PUT replaces those arrays wholesale.
//
// Only Mongo is stubbed: requireAuth decodes a real signed token, the real
// access filter runs, and the real sanitizers, contract-lock enforcement,
// budget coverage and rate derivation all execute against the document.
// Nothing here touches a database — local dev shares the production one.
//
// The money assertions are written as "what is stored did not change across the
// save" rather than against hard-coded figures, because opening a project
// legitimately heals its budget and re-derives bill rates from it. What is
// under test is the write, not the heal.

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
const { default: projectsRouter } = await import("./projects.js");

const OWNER = new mongoose.Types.ObjectId();
const MASKED = new mongoose.Types.ObjectId(); // full collaborator, no RateGen
const PRICER = new mongoose.Types.ObjectId(); // full collaborator, has RateGen
const PROJECT_ID = new mongoose.Types.ObjectId();

const HERON = [{ productKey: "planswift", status: "active" }];
const RATEGEN = [{ productKey: "rategen", status: "active" }];

// Who holds what. Everyone needs the product licence to reach the route at
// all; only PRICER also holds RateGen, which is what unmasks money.
const ENTITLEMENTS = new Map([
  [String(OWNER), HERON],
  [String(MASKED), HERON],
  [String(PRICER), [...HERON, ...RATEGEN]],
]);

// A real toObject() hands back a detached copy. A shallow one would let
// maskRates() blank the stored document itself, which would hide the very bug
// these tests exist for.
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

// The stored project. No clientProjectKey / modelFingerprint, so the
// Bill→Budget cascade (which looks for a sibling materials project) is skipped.
//
// `budget: true` gives BQ-1 a priced material build-up. That makes its bill
// rate a DERIVED figure (deriveBillRatesFromBudget), which is what the Budget
// tab test needs; the bill tests leave it off so a typed rate stays typed.
function projectDoc({ budget = false } = {}) {
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
      { userId: MASKED, email: "engineer@site.example", accessLevel: "full" },
      { userId: PRICER, email: "qs@example.com", accessLevel: "full" },
    ],
    shareCodes: [],
    contract: { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 },
    valuationEvents: [],
    certificates: [],
    materialItems: [],
    items: [
      {
        sn: 1,
        code: "BQ-1",
        description: "Reinforced concrete grade 25 in columns",
        unit: "m3",
        qty: 32,
        rate: 65_000,
        actualRate: 66_500,
        actualRecordedAt: new Date("2026-09-01T09:00:00Z"),
        netUnitCost: 52_000,
        overheadPercent: 8,
        profitPercent: 12,
        percentComplete: 0,
        completed: false,
        category: "111: Insitu Concrete Works",
        trade: "Concrete",
      },
      {
        sn: 2,
        code: "BQ-2",
        description: "Remove existing roof covering and cart away",
        unit: "Item",
        qty: 1,
        rate: 250_000,
        actualRate: null,
        netUnitCost: null,
        overheadPercent: null,
        profitPercent: null,
        percentComplete: 0,
        completed: false,
        category: "Demolition And Alteration",
        trade: "Demolition",
      },
    ],
    budgetItems: budget
      ? [
          {
            sn: 1,
            billIdentity: "BQ-1",
            componentKind: "Material",
            materialName: "Cement (50kg)",
            description: "Cement (50kg)",
            unit: "bags",
            qty: 224,
            rate: 9_500,
            netUnitCost: 9_500,
            budgetRate: 9_500,
            overheadPercent: 8,
            profitPercent: 12,
            procured: false,
            procuredPercent: 0,
          },
        ]
      : [],
    provisionalSums: [
      { description: "Piling by specialist", amount: 4_500_000, completed: false },
    ],
    variations: [
      {
        description: "Extra blockwork to rear",
        qty: 40,
        unit: "m2",
        rate: 7_500,
        reference: "VO-01",
        source: "manual",
      },
    ],
    preliminaryItems: [
      { name: "Site accommodation", allocation: 10, actualAmount: 850_000, completed: false },
    ],
    // The mongoose surface the handlers use.
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

function installStubs() {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

  TakeoffProject.findOne = async (filter) => {
    if (!stored || String(filter?._id) !== String(stored._id)) return null;
    const uid = filter?.$or?.[0]?.userId;
    const isOwner = uid && String(uid) === String(stored.userId);
    const isCollab = (stored.collaborators || []).some(
      (c) => String(c.userId) === String(uid),
    );
    return isOwner || isCollab ? stored : null;
  };

  // requireEntitlementParam awaits the query directly; userHasActiveEntitlement
  // calls .lean() on it. Serve both off one thenable.
  User.findById = (id) => {
    const doc = { _id: id, entitlements: ENTITLEMENTS.get(String(id)) || [] };
    return {
      lean: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };

  // Fire-and-forget writes the handlers make. Left unstubbed these would sit in
  // mongoose's buffer until it timed out.
  ActivityLog.create = async () => ({});
  CategoryFeedback.find = () => ({ lean: async () => [] });
  CategoryFeedback.updateOne = async () => ({});
}

installStubs();

async function withServer(fn) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/projects", projectsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// The real shape buildAuthPayload() signs: _id, as a string. requireEntitlement
// reads req.user._id, so a token carrying only `id` never gets past the gate.
const tokenFor = (userId) =>
  signAccess({ _id: String(userId), email: "user@example.com", role: "user" });

async function req(base, path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body — the assertion reports `text` */
  }
  return { status: res.status, body: json, text };
}

const ONE = `/projects/planswift/${PROJECT_ID}`;

// What the browser sends back: the payload it was served, plus the edit the
// user made. Mirrors the Bill's save, including its filters — a masked row that
// comes out blank and zero is dropped by the client, not by us.
function echoPayload(served, edit = () => {}) {
  const payload = {
    baseVersion: served.version,
    items: (served.items || []).map((it) => ({ ...it })),
    provisionalSums: (served.provisionalSums || [])
      .map((s) => ({ description: String(s.description || ""), amount: Number(s.amount) || 0 }))
      .filter((s) => s.description || s.amount > 0),
    variations: (served.variations || [])
      .map((v) => ({
        description: String(v.description || ""),
        qty: Number(v.qty) || 0,
        unit: String(v.unit || ""),
        rate: Number(v.rate) || 0,
        reference: String(v.reference || ""),
      }))
      .filter((v) => v.description || v.qty > 0 || v.rate > 0),
    preliminaryItems: (served.preliminaryItems || []).map((p) => ({
      name: String(p.name || ""),
      allocation: Number(p.allocation) || 0,
      completed: Boolean(p.completed),
      notes: String(p.notes || ""),
      actualAmount: Number(p.actualAmount) || 0,
    })),
  };
  edit(payload);
  return payload;
}

// Every money figure the project holds, in one comparable shape.
function money(doc) {
  return {
    itemRate: (doc.items || []).map((i) => i.rate),
    itemActualRate: (doc.items || []).map((i) => i.actualRate ?? null),
    itemNetUnitCost: (doc.items || []).map((i) => i.netUnitCost ?? null),
    budget: (doc.budgetItems || []).map((b) => [b.rate, b.netUnitCost, b.budgetRate]),
    provisional: (doc.provisionalSums || []).map((p) => p.amount),
    variationRate: (doc.variations || []).map((v) => v.rate),
    preliminaryAmount: (doc.preliminaryItems || []).map((p) => p.actualAmount),
  };
}

// Guard against a vacuous pass: if the fixture were already all zeros, "money
// did not change" would prove nothing.
function assertHasMoney(doc) {
  const values = Object.values(money(doc)).flat(2).map(Number);
  assert.ok(
    values.some((v) => Number.isFinite(v) && v > 0),
    "the fixture holds no money, so this test would pass vacuously",
  );
}

test("the project is served to a collaborator without RateGen with its money blanked", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const res = await req(base, ONE, { token: tokenFor(MASKED) });
    assert.equal(res.status, 200, res.text);

    assert.equal(res.body._ratesMasked, true);
    assert.equal(res.body._access.canEdit, true, "a full collaborator may still edit");
    assert.equal(res.body._access.canSeeRates, false);

    // This is the payload the editor initialises its state from.
    assert.deepEqual(res.body.items.map((i) => i.rate), [0, 0]);
    assert.deepEqual(res.body.provisionalSums.map((p) => p.amount), [0]);
    assert.equal(res.body.variations[0].rate, 0);
    assert.equal(res.body.preliminaryItems[0].actualAmount, 0);

    // …while the document itself is untouched.
    assertHasMoney(stored);
    assert.equal(stored.items[0].rate, 65_000);
  });
});

test("saving that masked payload back does not zero a single stored figure", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(MASKED) })).body;
    assertHasMoney(stored);
    const before = money(stored);

    // The engineer ticks one line off and part-completes another. Everything
    // else is the blanked copy going straight back.
    const payload = echoPayload(served, (p) => {
      p.items[0].percentComplete = 45;
      p.items[1].completed = true;
      p.items[1].percentComplete = 100;
    });

    const res = await req(base, ONE, {
      token: tokenFor(MASKED),
      method: "PUT",
      body: payload,
    });
    assert.equal(res.status, 200, res.text);

    assert.deepEqual(money(stored), before, "the masked save moved money");

    // The edit it was actually made for did land.
    assert.equal(stored.items[0].percentComplete, 45);
    assert.equal(stored.items[1].completed, true);

    // And the response is still masked, so the next save starts from zeros too.
    assert.equal(res.body._ratesMasked, true);
    assert.deepEqual(res.body.items.map((i) => i.rate), [0, 0]);
  });
});

test("a masked save cannot smuggle in a rate of its own", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(MASKED) })).body;
    const before = money(stored);

    const payload = echoPayload(served, (p) => {
      p.items[0].rate = 1; // re-price the owner's line
      p.items[0].actualRate = 1;
      p.provisionalSums[0].amount = 1;
      p.variations[0].rate = 1;
      p.preliminaryItems[0].actualAmount = 1;
      p.items.push({
        sn: 3,
        code: "BQ-9",
        description: "Invented line",
        unit: "m2",
        qty: 10,
        rate: 999_999,
      });
    });

    const res = await req(base, ONE, {
      token: tokenFor(MASKED),
      method: "PUT",
      body: payload,
    });
    assert.equal(res.status, 200, res.text);

    assert.deepEqual(stored.items.slice(0, 2).map((i) => i.rate), before.itemRate);
    assert.equal(stored.items[0].actualRate, before.itemActualRate[0]);
    assert.deepEqual(stored.provisionalSums.map((p) => p.amount), before.provisional);
    assert.deepEqual(stored.variations.map((v) => v.rate), before.variationRate);
    assert.deepEqual(
      stored.preliminaryItems.map((p) => p.actualAmount),
      before.preliminaryAmount,
    );

    // The added line is kept — a full collaborator may add scope — but it
    // arrives unpriced, because pricing is not theirs to do.
    assert.equal(stored.items.length, 3);
    assert.equal(stored.items[2].description, "Invented line");
    assert.equal(stored.items[2].qty, 10);
    assert.equal(stored.items[2].rate, 0);
  });
});

test("a masked collaborator's deletion is still an ordinary save — the guard's limit", async () => {
  // Deliberate, and the one thing the guard does NOT undo: a removed row takes
  // its money with it, because the money went where the row went and no other
  // row is left holding a figure that is not its own. The judgement it rests on
  // is that the viewer meant to remove that line.
  //
  // What stops a rate-blind viewer removing a line they cannot value is the
  // editor: every delete control on the Bill is dead while rates are hidden
  // (RATES_HIDDEN_NO_DELETE in client/src/features/projects/ProjectBillTable
  // .jsx). This pins the server half so the two cannot be confused for each
  // other, and so a future change to either is a deliberate one.
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(MASKED) })).body;
    const payload = echoPayload(served, (p) => {
      p.items = [p.items[0]];
    });

    const res = await req(base, ONE, {
      token: tokenFor(MASKED),
      method: "PUT",
      body: payload,
    });
    assert.equal(res.status, 200, res.text);

    assert.equal(stored.items.length, 1);
    // The line that remains keeps every figure it had — this is the part the
    // guard is responsible for.
    assert.equal(stored.items[0].rate, 65_000);
    assert.equal(stored.items[0].actualRate, 66_500);
    assert.equal(stored.items[0].netUnitCost, 52_000);
  });
});

test("the owner's own save is untouched by the guard", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(OWNER) })).body;
    assert.equal(served._access.role, "owner");
    assert.equal(served._access.canSeeRates, true);

    const payload = echoPayload(served, (p) => {
      p.items[1].rate = 0; // an owner is allowed to zero a line
      p.provisionalSums[0].amount = 0;
    });
    const res = await req(base, ONE, {
      token: tokenFor(OWNER),
      method: "PUT",
      body: payload,
    });
    assert.equal(res.status, 200, res.text);

    assert.equal(stored.items[1].rate, 0);
    // An amount of 0 with a description is still a row; it is simply worth nil.
    assert.deepEqual(stored.provisionalSums.map((p) => p.amount), [0]);
  });
});

test("a collaborator who holds RateGen still prices the bill normally", async () => {
  stored = projectDoc();
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(PRICER) })).body;
    assert.equal(served._ratesMasked, undefined, "a rate holder is served real money");
    assert.equal(served.items[0].rate, 65_000);

    const payload = echoPayload(served, (p) => {
      p.items[1].rate = 300_000;
      p.provisionalSums[0].amount = 5_000_000;
    });
    const res = await req(base, ONE, {
      token: tokenFor(PRICER),
      method: "PUT",
      body: payload,
    });
    assert.equal(res.status, 200, res.text);

    assert.equal(stored.items[1].rate, 300_000, "the guard must not fire for a rate holder");
    assert.equal(stored.provisionalSums[0].amount, 5_000_000);
  });
});

test("marking procurement without RateGen keeps the budget's pricing", async () => {
  stored = projectDoc({ budget: true });
  await withServer(async (base) => {
    const served = (await req(base, ONE, { token: tokenFor(MASKED) })).body;
    assertHasMoney(stored);
    const before = money(stored);

    assert.ok(
      served.budgetItems.every((b) => Number(b.rate) === 0),
      "the Budget tab reads zeroed rates too",
    );

    const budgetItems = served.budgetItems.map((b) => ({
      ...b,
      procured: true,
      procuredPercent: 100,
      supplier: "Dangote",
    }));

    const res = await req(base, `${ONE}/budget`, {
      token: tokenFor(MASKED),
      method: "PUT",
      body: { baseVersion: served.version, budgetItems },
    });
    assert.equal(res.status, 200, res.text);

    assert.equal(stored.budgetItems[0].procured, true, "the procurement mark must land");
    assert.equal(stored.budgetItems[0].supplier, "Dangote");
    assert.deepEqual(
      money(stored),
      before,
      "procurement marking moved money on the budget or the bill",
    );
  });
});

test("a view-only collaborator is still refused outright", async () => {
  stored = projectDoc();
  stored.collaborators = [{ userId: MASKED, accessLevel: "view" }];
  await withServer(async (base) => {
    const res = await req(base, ONE, {
      token: tokenFor(MASKED),
      method: "PUT",
      body: { items: [] },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "VIEW_ONLY");
  });
});
