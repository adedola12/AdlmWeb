// Provisional-sum and variation completion flags survive a save that omits them.
//
// These drive the real PUT /:productKey/:id route over real HTTP with a real
// signed access token, so the whole path a browser save takes is exercised:
// requireAuth, the entitlement gate, the access filter, the sanitizers and the
// document that is finally saved. Only Mongo is stubbed — the container has no
// database and the mongod download is blocked. Same pattern as
// projects.boq.test.js.
//
// The regression they exist for: the BoQ editor models a provisional sum as
// { description, amount } and a variation as { description, qty, unit, rate,
// reference, issuedAt }. The QS's "done" tick is in neither shape, so it was
// missing from every PUT body, and sanitizeProvisionalSums / sanitizeVariations
// rebuilt each row with `completed: Boolean(s.completed)` — an absent flag
// became false. Ticking a PC sum complete and then editing anything else on the
// page silently untinked it, for every user including the owner, and the
// Overview's "done" figures read 0 for good.
//
// The rule now: absent means unchanged. Only an explicit flag in the payload
// moves the tick. The first test is the regression guard; the rest pin down
// that the guard still lets a real edit through.
//
// The payloads below carry no `items`, which keeps the stub surface to Mongo:
// the flag handling is identical either way (the sanitizers run on the same
// body fields regardless of whether items were sent).

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
const { default: projectsRouter } = await import("./projects.js");

const OWNER = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();
const PRODUCT_KEY = "planswift";

// A date in the past, so a re-stamp is visible: if the route re-created the
// tick instead of carrying it, completedAt would jump to now.
const TICKED_ON = new Date("2026-08-01T09:30:00.000Z");

// The project as stored: one PC sum and one variation ticked done, one of each
// not ticked, and a variation the lock flow added (provenance the editor never
// sends back).
function projectDoc(extra = {}) {
  const doc = {
    _id: PROJECT_ID,
    userId: OWNER,
    productKey: PRODUCT_KEY,
    name: "Pavillion",
    collaborators: [],
    items: [],
    budgetItems: [],
    preliminaryItems: [],
    provisionalSums: [
      { description: "PC sum for kitchen fittings", amount: 4_500_000, completed: true, completedAt: TICKED_ON },
      { description: "PC sum for ironmongery", amount: 1_200_000, completed: false, completedAt: null },
    ],
    variations: [
      { description: "Additional skirting in study", qty: 40, unit: "m", rate: 3_500, reference: "AI-001", issuedAt: null, source: "manual", completed: true, completedAt: TICKED_ON },
      { description: "Extra downlights to lobby", qty: 12, unit: "No", rate: 18_000, reference: "AI-002", issuedAt: null, source: "post-lock-new-item", completed: false, completedAt: null },
    ],
    contract: {},
    finalAccount: {},
    valuationEvents: [],
    version: 7,
    clientProjectKey: "",
    modelFingerprint: "",
    // Mongoose document surface the route touches.
    save: async () => doc,
    markModified: () => {},
    toObject: () => JSON.parse(JSON.stringify(doc)),
    ...extra,
  };
  return doc;
}

let stored = null;

function installMongoStub() {
  // A connected-looking connection. readyState and db are prototype getters.
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  Object.defineProperty(mongoose.connection, "db", {
    value: { listCollections: () => ({ toArray: async () => [] }) },
    configurable: true,
  });

  TakeoffProject.findOne = async (filter) => {
    const uid = filter?.$or?.[0]?.userId;
    const hit =
      stored &&
      String(filter?._id) === String(stored._id) &&
      uid &&
      String(uid) === String(stored.userId);
    return hit ? stored : null;
  };

  // The activity trail is fire-and-forget and writes on a variation count
  // change; without this it logs a failed write against the absent database.
  ActivityLog.create = async () => ({});

  // The entitlement gate: an owner with a live HERON subscription.
  const user = {
    _id: OWNER,
    entitlements: [{ productKey: PRODUCT_KEY, status: "active", expiresAt: null }],
  };
  User.findById = () => {
    const q = Promise.resolve(user);
    q.lean = async () => user;
    return q;
  };
}

installMongoStub();

async function withServer(fn) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
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

// The shape buildAuthPayload signs at login: `_id`, which requireEntitlement
// reads, plus the entitlement list the gate walks.
const tokenFor = (userId) =>
  signAccess({
    _id: String(userId),
    email: "qs@example.com",
    role: "user",
    entitlements: [{ productKey: PRODUCT_KEY, status: "active", expiresAt: null }],
  });

async function put(base, body, token = tokenFor(OWNER)) {
  const res = await fetch(`${base}/projects/${PRODUCT_KEY}/${PROJECT_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// The shapes the BoQ editor sent before this fix — no completed, no completedAt.
const oldClientSums = [
  { description: "PC sum for kitchen fittings", amount: 4_500_000 },
  { description: "PC sum for ironmongery", amount: 1_200_000 },
];
const oldClientVariations = [
  { description: "Additional skirting in study", qty: 40, unit: "m", rate: 3_500, reference: "AI-001", issuedAt: null },
  { description: "Extra downlights to lobby", qty: 12, unit: "No", rate: 18_000, reference: "AI-002", issuedAt: null },
];

test("a save that omits the done flag leaves a stored tick alone", async () => {
  stored = projectDoc();

  await withServer(async (base) => {
    await put(base, {
      baseVersion: 7,
      clientName: "Lagos State Housing",
      provisionalSums: oldClientSums,
      variations: oldClientVariations,
    });
  });

  const [ticked, untouched] = stored.provisionalSums;
  assert.equal(ticked.completed, true, "the PC sum's done tick was cleared by a save that never mentioned it");
  assert.equal(
    new Date(ticked.completedAt).toISOString(),
    TICKED_ON.toISOString(),
    "completedAt was re-stamped instead of carried",
  );
  assert.equal(untouched.completed, false, "an unticked PC sum must stay unticked");
  assert.equal(untouched.completedAt, null);

  const [doneVar, openVar] = stored.variations;
  assert.equal(doneVar.completed, true, "the variation's done tick was cleared by a save that never mentioned it");
  assert.equal(new Date(doneVar.completedAt).toISOString(), TICKED_ON.toISOString());
  assert.equal(openVar.completed, false);

  // Provenance is server-set and the editor never sends it back either.
  assert.equal(openVar.source, "post-lock-new-item", "the post-lock provenance was reset to manual");

  // The edit the save actually carried still landed.
  assert.equal(stored.clientName, "Lagos State Housing");
  assert.equal(stored.version, 8);
});

test("an explicit flag still moves the tick either way", async () => {
  stored = projectDoc();

  await withServer(async (base) => {
    await put(base, {
      baseVersion: 7,
      // Row 1 is ticked in the DB and is being untinked; row 2 is being ticked.
      provisionalSums: [
        { description: "PC sum for kitchen fittings", amount: 4_500_000, completed: false },
        { description: "PC sum for ironmongery", amount: 1_200_000, completed: true },
      ],
      variations: [
        { description: "Additional skirting in study", qty: 40, unit: "m", rate: 3_500, reference: "AI-001", completed: false },
        { description: "Extra downlights to lobby", qty: 12, unit: "No", rate: 18_000, reference: "AI-002", completed: true },
      ],
    });
  });

  assert.equal(stored.provisionalSums[0].completed, false, "an explicit false must untick");
  assert.equal(stored.provisionalSums[0].completedAt, null, "untinking must clear the date");
  assert.equal(stored.provisionalSums[1].completed, true, "an explicit true must tick");
  assert.ok(stored.provisionalSums[1].completedAt instanceof Date, "ticking must stamp a date");

  assert.equal(stored.variations[0].completed, false);
  assert.equal(stored.variations[1].completed, true);
  assert.ok(stored.variations[1].completedAt instanceof Date);
});

test("the fixed editor's payload round-trips the tick and its date", async () => {
  stored = projectDoc();
  const clientDate = "2026-09-20T11:00:00.000Z";

  await withServer(async (base) => {
    const out = await put(base, {
      baseVersion: 7,
      // What initRatesFromProject now reads out and saveRatesToCloud sends.
      provisionalSums: [
        { description: "PC sum for kitchen fittings", amount: 4_500_000, completed: true, completedAt: clientDate },
        { description: "PC sum for ironmongery", amount: 1_200_000, completed: false, completedAt: null },
      ],
      variations: [
        { description: "Additional skirting in study", qty: 40, unit: "m", rate: 3_500, reference: "AI-001", completed: true, completedAt: clientDate },
      ],
    });

    // The response feeds straight back into initRatesFromProject, so the tick
    // has to be on the way out too.
    assert.equal(out.provisionalSums[0].completed, true);
    assert.equal(new Date(out.provisionalSums[0].completedAt).toISOString(), clientDate);
    assert.equal(out.variations[0].completed, true);
  });

  assert.equal(new Date(stored.provisionalSums[0].completedAt).toISOString(), clientDate);
});

test("a renamed row keeps its tick; a brand-new row does not inherit one", async () => {
  stored = projectDoc();

  await withServer(async (base) => {
    await put(base, {
      baseVersion: 7,
      provisionalSums: [
        // Row 1 re-described in place — matched by slot, tick kept.
        { description: "PC sum for kitchen fittings (revised)", amount: 4_500_000 },
        { description: "PC sum for ironmongery", amount: 1_200_000 },
        // Row 3 is new — nothing to inherit from.
        { description: "PC sum for landscaping", amount: 800_000 },
      ],
      variations: oldClientVariations,
    });
  });

  assert.equal(stored.provisionalSums[0].description, "PC sum for kitchen fittings (revised)");
  assert.equal(stored.provisionalSums[0].completed, true, "re-describing a row must not drop its tick");
  assert.equal(stored.provisionalSums[2].description, "PC sum for landscaping");
  assert.equal(stored.provisionalSums[2].completed, false, "a new row must not inherit a tick");
  assert.equal(stored.provisionalSums[2].completedAt, null);
});

test("deleting the ticked row does not move its tick onto the survivor", async () => {
  stored = projectDoc();

  await withServer(async (base) => {
    await put(base, {
      baseVersion: 7,
      // The ticked first row is gone; only the unticked one is sent.
      provisionalSums: [{ description: "PC sum for ironmongery", amount: 1_200_000 }],
      variations: oldClientVariations,
    });
  });

  assert.equal(stored.provisionalSums.length, 1);
  assert.equal(stored.provisionalSums[0].description, "PC sum for ironmongery");
  assert.equal(
    stored.provisionalSums[0].completed,
    false,
    "the deleted row's tick was inherited by the row that took its slot",
  );
});
