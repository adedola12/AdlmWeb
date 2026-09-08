// Takeoff Time Log route tests.
//
// Drive the real routers over real HTTP with a real signed access token, the
// way projects.boq.test.js does: requireAuth decodes the token, the plugin
// route resolves the caller's firm from the account, computes the manual-time
// estimate against the active baseline, stores the batch, and the admin
// summary reads it back. Only Mongo is stubbed — an in-memory list of stored
// sessions plus a small interpreter for the aggregation shapes the summary
// uses — because the container has no database.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { Role } = await import("../models/Role.js");
const { TakeoffSession } = await import("../models/TakeoffSession.js");
const { TakeoffBaseline } = await import("../models/TakeoffBaseline.js");
const { TakeoffCalibration } = await import("../models/TakeoffCalibration.js");
const { loadRoleCache } = await import("../util/rbac.js");
const { DEFAULT_BASELINE_RATES, DEFAULT_BASELINE_VERSION } = await import(
  "../config/takeoffBaselineDefaults.js"
);
const { estimateManualSeconds } = await import("../util/takeoffTime.js");
const { default: telemetryRouter } = await import("./telemetry.takeoff.js");
const { default: adminRouter } = await import("./admin.takeoff.js");

const QS = new mongoose.Types.ObjectId();
const ADMIN = new mongoose.Types.ObjectId();
const PERSONAL = new mongoose.Types.ObjectId();

const users = {
  [String(QS)]: {
    _id: QS,
    email: "qs@example.com",
    role: "user",
    firmName: "",
    entitlements: [
      { productKey: "planswift", licenseType: "organization", organizationName: "Lekki Build & Co" },
    ],
  },
  [String(ADMIN)]: { _id: ADMIN, email: "admin@example.com", role: "admin", entitlements: [] },
  [String(PERSONAL)]: {
    _id: PERSONAL,
    email: "solo@example.com",
    role: "user",
    firmName: "",
    entitlements: [{ productKey: "revit", licenseType: "personal", organizationName: "" }],
  },
};

/* ───────────── Mongo stub ───────────── */

let stored = [];
let calibrations = [];
const chain = (value) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  skip() {
    return this;
  },
  limit() {
    return this;
  },
  lean: async () => value,
  then: (ok, ko) => Promise.resolve(value).then(ok, ko),
});

function installMongoStub() {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

  User.findById = (id) => chain(users[String(id)] || null);
  Role.find = () => chain([{ key: "admin", isSuperAdmin: true, permissions: [] }, { key: "user", permissions: [] }]);

  const baselineDoc = {
    _id: new mongoose.Types.ObjectId(),
    version: DEFAULT_BASELINE_VERSION,
    rates: { ...DEFAULT_BASELINE_RATES },
    notes: "test",
    active: true,
    activatedAt: new Date(),
  };
  TakeoffBaseline.findOne = () => chain(baselineDoc);

  TakeoffCalibration.findOne = (q) =>
    chain(calibrations.find((c) => String(c.userId) === String(q.userId) && c.product === q.product) || null);
  TakeoffCalibration.findOneAndUpdate = (q, u) => {
    calibrations = calibrations.filter((c) => !(String(c.userId) === String(q.userId) && c.product === q.product));
    const doc = { _id: new mongoose.Types.ObjectId(), userId: q.userId, product: q.product, ...u.$set };
    calibrations.push(doc);
    return chain(doc);
  };

  TakeoffSession.insertMany = async (records) => {
    const inserted = [];
    const writeErrors = [];
    records.forEach((r, index) => {
      if (stored.some((s) => s.sessionId === r.sessionId)) writeErrors.push({ index, code: 11000 });
      else {
        const doc = { _id: new mongoose.Types.ObjectId(), ...r };
        stored.push(doc);
        inserted.push(doc);
      }
    });
    if (writeErrors.length) {
      const err = new Error("bulk write");
      err.code = 11000;
      err.writeErrors = writeErrors;
      err.insertedDocs = inserted;
      throw err;
    }
    return inserted;
  };

  const get = (doc, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), doc);
  const matches = (doc, match) =>
    Object.entries(match).every(([k, v]) => {
      const val = get(doc, k);
      if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
        if ("$ne" in v && val === v.$ne) return false;
        if ("$gte" in v && !(val >= v.$gte)) return false;
        if ("$lte" in v && !(val <= v.$lte)) return false;
        return true;
      }
      return String(val) === String(v);
    });

  TakeoffSession.countDocuments = async (match = {}) => stored.filter((d) => matches(d, match)).length;
  TakeoffSession.find = (match = {}) => chain(stored.filter((d) => matches(d, match)));

  // Enough of $match / $group / $sort / $limit for the summary pipelines. The
  // _id expression may be null, "$field", or an object (date buckets) — the
  // latter is keyed by the ISO date so the test can still count groups.
  TakeoffSession.aggregate = async (pipeline) => {
    let docs = [...stored];
    let rows = null;
    for (const stage of pipeline) {
      if (stage.$match) docs = docs.filter((d) => matches(d, stage.$match));
      else if (stage.$group) {
        const g = stage.$group;
        const keyOf = (d) => {
          if (g._id === null) return "null";
          if (typeof g._id === "string") return String(get(d, g._id.slice(1)) ?? "");
          if (g._id && typeof g._id === "object" && "version" in g._id)
            return JSON.stringify({ version: get(d, "baseline.version"), method: get(d, "baseline.method") });
          return new Date(d.startedAt).toISOString().slice(0, 10);
        };
        const groups = new Map();
        for (const d of docs) {
          const k = keyOf(d);
          if (!groups.has(k)) {
            const idVal =
              g._id === null
                ? null
                : typeof g._id === "string"
                  ? get(d, g._id.slice(1))
                  : "version" in g._id
                    ? { version: get(d, "baseline.version"), method: get(d, "baseline.method") }
                    : k;
            groups.set(k, { _id: idVal, __docs: [] });
          }
          groups.get(k).__docs.push(d);
        }
        rows = [...groups.values()].map((grp) => {
          const out = { _id: grp._id };
          for (const [field, expr] of Object.entries(g)) {
            if (field === "_id") continue;
            const [op, arg] = Object.entries(expr)[0];
            const vals = grp.__docs.map((d) => (typeof arg === "string" && arg.startsWith("$") ? get(d, arg.slice(1)) : arg));
            if (op === "$sum") out[field] = vals.reduce((a, b) => a + (Number(b) || 0), 0);
            else if (op === "$push") out[field] = vals;
            else if (op === "$addToSet") out[field] = [...new Set(vals.map(String))];
            else if (op === "$min") out[field] = vals.reduce((a, b) => (a == null || b < a ? b : a), null);
            else if (op === "$max") out[field] = vals.reduce((a, b) => (a == null || b > a ? b : a), null);
            else if (op === "$last") out[field] = vals[vals.length - 1];
          }
          return out;
        });
      } else if (stage.$sort && rows) {
        const [[k, dir]] = Object.entries(stage.$sort);
        rows.sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
      } else if (stage.$limit && rows) rows = rows.slice(0, stage.$limit);
    }
    return rows || docs;
  };
}

installMongoStub();
await loadRoleCache();

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use("/telemetry", telemetryRouter);
  app.use("/admin/takeoff", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const tokenFor = (id, role = "user") => signAccess({ id: String(id), email: users[String(id)].email, role });

const post = (base, path, token, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const get = (base, path, token) =>
  fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const START = new Date("2026-09-01T09:00:00Z");
const session = (over = {}) => ({
  sessionId: "3f2b1c4e-0000-4000-8000-" + String(Math.random()).slice(2, 14).padEnd(12, "0"),
  productKey: "planswift",
  productVersion: "2.9.1",
  mode: "auto",
  projectRef: "Site B",
  startedAt: START.toISOString(),
  endedAt: new Date(START.getTime() + 20 * 60000).toISOString(),
  wallSeconds: 1200,
  activeSeconds: 840,
  counts: { sheets: 2, items: 10, itemsByKind: { area: 4, linear: 3, count: 3 }, elementTypes: 3, boqLines: 5 },
  clientTimezone: "Africa/Lagos",
  deviceFingerprint: "abc123",
  ...over,
});

test("a plugin posts a batch: the server computes the estimate, resolves the firm and stores counts only", async () => {
  stored = [];
  await withServer(async (base) => {
    const good = session();
    const cancelled = session({ cancelled: true, activeSeconds: 100 });
    const leaky = session({
      projectRef: "C:\\Jobs\\Site B\\plan.pdf",
      counts: { sheets: 1, items: 2, elementTypes: 1, boqLines: 1, elementNames: ["Wall 1"] },
      fileName: "plan.pdf",
      activeSeconds: 99999, // more than wall time; must be clamped
    });
    const bad = session({ sessionId: "x" });

    const res = await post(base, "/telemetry/takeoff-sessions", tokenFor(QS), {
      productKey: "planswift",
      sessions: [good, cancelled, leaky, bad],
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.accepted, 3);
    assert.equal(body.duplicates, 0);
    assert.equal(body.rejected.length, 1);
    assert.match(body.rejected[0].error, /sessionId/);
    assert.equal(body.calibration.asked, false);

    // The estimate is the documented arithmetic on the active rate table.
    const expected = estimateManualSeconds(good.counts, DEFAULT_BASELINE_RATES, "HERON");
    assert.equal(expected, 72.5 * 60);
    const r = body.results.find((x) => x.sessionId === good.sessionId);
    assert.equal(r.estimatedManualSeconds, expected);
    assert.equal(r.savedSeconds, expected - 840);
    assert.equal(r.baselineVersion, DEFAULT_BASELINE_VERSION);
    assert.equal(r.baselineMethod, "admin_rate_table");
    assert.equal(r.labels.active, "14 min");
    assert.equal(r.labels.estimatedManual, "1 h 13 min");

    // What reached Mongo.
    const doc = stored.find((d) => d.sessionId === good.sessionId);
    assert.equal(String(doc.userId), String(QS));
    assert.equal(doc.email, "qs@example.com");
    assert.equal(doc.product, "HERON");
    assert.equal(doc.firmId, "lekki-build-and-co");
    assert.equal(doc.firmName, "Lekki Build & Co");
    assert.equal(doc.seatId, "abc123");
    assert.equal(doc.baseline.estimatedManualSeconds, expected);
    assert.equal(doc.seeded, false);

    const c = stored.find((d) => d.sessionId === cancelled.sessionId);
    assert.equal(c.cancelled, true);
    assert.equal(c.savedSeconds, 0);
    assert.equal(c.baseline.estimatedManualSeconds, 0);

    const l = stored.find((d) => d.sessionId === leaky.sessionId);
    assert.equal(l.projectRef, "", "a path must never be stored");
    assert.equal(l.activeSeconds, l.wallSeconds, "active time is clamped to wall time");
    assert.equal("fileName" in l, false);
    assert.equal("elementNames" in l.counts, false);
    assert.deepEqual(Object.keys(l.counts).sort(), ["boqLines", "elementTypes", "items", "sheets"]);
  });
});

test("a retried batch is not double counted", async () => {
  stored = [];
  await withServer(async (base) => {
    const s = session();
    let res = await post(base, "/telemetry/takeoff-sessions", tokenFor(QS), { sessions: [s] });
    assert.equal((await res.json()).accepted, 1);
    res = await post(base, "/telemetry/takeoff-sessions", tokenFor(QS), { sessions: [s] });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.accepted, 0);
    assert.equal(body.duplicates, 1);
    assert.equal(stored.length, 1);
  });
});

test("a personal licence has no firm; a user calibration rescales that user's estimate only", async () => {
  stored = [];
  calibrations = [];
  await withServer(async (base) => {
    // Skipping is remembered, and nothing changes.
    let res = await post(base, "/telemetry/takeoff-calibration", tokenFor(PERSONAL), { product: "QUIV", skipped: true });
    assert.equal(res.status, 200);

    assert.equal(calibrations[0].skipped, true);

    // Answering: 100 element instances by hand in 300 min = 2x the table's 150 min.
    res = await post(base, "/telemetry/takeoff-calibration", tokenFor(PERSONAL), {
      product: "revit",
      manualMinutes: 300,
      referenceCounts: { items: 100 },
      referenceSessionId: "ref",
    });
    let body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.scale, 2);

    const s = session({ productKey: "revit", counts: { sheets: 0, items: 40, elementTypes: 4, boqLines: 0 } });
    res = await post(base, "/telemetry/takeoff-sessions", tokenFor(PERSONAL), { productKey: "revit", sessions: [s] });
    body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const table = estimateManualSeconds(s.counts, DEFAULT_BASELINE_RATES, "QUIV");
    assert.equal(body.results[0].estimatedManualSeconds, table * 2);
    assert.equal(body.results[0].baselineMethod, "user_calibration");
    assert.equal(body.calibration.asked, true);

    const doc = stored[0];
    assert.equal(doc.product, "QUIV");
    assert.equal(doc.firmId, null);
    assert.equal(doc.baseline.scale, 2);
    assert.equal(String(doc.baseline.calibrationId), String(calibrations[0]._id));

    // The other user is unaffected.
    res = await post(base, "/telemetry/takeoff-sessions", tokenFor(QS), { sessions: [session()] });
    body = await res.json();
    assert.equal(body.results[0].baselineMethod, "admin_rate_table");
  });
});

test("the admin summary adds up exactly what was stored and excludes cancelled and seeded sessions", async () => {
  stored = [];
  calibrations = [];
  await withServer(async (base) => {
    const a = session({ activeSeconds: 600 });
    const b = session({ productKey: "revit", counts: { items: 20, elementTypes: 2 }, activeSeconds: 300 });
    const c = session({ cancelled: true });
    await post(base, "/telemetry/takeoff-sessions", tokenFor(QS), { sessions: [a, b, c] });
    // A seeded record, as the seed script would write it.
    stored.push({ ...stored[0], _id: new mongoose.Types.ObjectId(), sessionId: "seed-1", seeded: true, savedSeconds: 999999 });

    // A plain user may not read it.
    let res = await get(base, "/admin/takeoff/summary?from=2026-08-01&to=2026-10-01", tokenFor(QS));
    assert.equal(res.status, 403);
    res = await get(base, "/telemetry/takeoff-summary?from=2026-08-01&to=2026-10-01", tokenFor(QS));
    assert.equal(res.status, 403);

    res = await get(base, "/admin/takeoff/summary?from=2026-08-01&to=2026-10-01&groupBy=product", tokenFor(ADMIN, "admin"));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));

    const live = stored.filter((d) => !d.cancelled && !d.seeded);
    const sum = (k, f = (d) => d[k]) => live.reduce((n, d) => n + f(d), 0);
    assert.equal(body.totals.sessions, 2);
    assert.equal(body.totals.activeSeconds, 900);
    assert.equal(body.totals.estimatedManualSeconds, sum("", (d) => d.baseline.estimatedManualSeconds));
    assert.equal(body.totals.savedSeconds, sum("savedSeconds"));
    assert.equal(body.totals.medianActiveSeconds, 450);
    // Reported so the page can say "excluding N cancelled", never added in.
    assert.equal(body.totals.cancelledSessions, 1);
    assert.equal(body.totals.seededSessions, 1);
    assert.equal(body.totals.users, 1);

    assert.equal(body.groupBy, "product");
    const byKey = Object.fromEntries(body.groups.map((g) => [g.key, g]));
    assert.deepEqual(Object.keys(byKey).sort(), ["HERON", "QUIV"]);
    assert.equal(byKey.HERON.activeSeconds, 600);
    assert.equal(byKey.QUIV.activeSeconds, 300);

    assert.equal(body.baselineVersions.length, 1);
    assert.equal(body.baselineVersions[0].version, DEFAULT_BASELINE_VERSION);
    assert.equal(body.activeBaseline.version, DEFAULT_BASELINE_VERSION);
    assert.equal(body.methodology.idleGapSeconds, 120);
    assert.equal(body.filters.includeSeeded, false);

    // Reviewing with seed data included is explicit and labelled.
    res = await get(base, "/admin/takeoff/summary?from=2026-08-01&to=2026-10-01&includeSeeded=1", tokenFor(ADMIN, "admin"));
    const withSeed = await res.json();
    assert.equal(withSeed.filters.includeSeeded, true);
    assert.equal(withSeed.totals.sessions, 3);
  });
});
