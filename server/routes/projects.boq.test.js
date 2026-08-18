// BoQ export route tests.
//
// These drive the real Express router over real HTTP with a real signed access
// token, so the whole path the browser takes is exercised: requireAuth decoding
// the token, the caller's id being resolved from it, the access filter, the
// exporter, the response headers and the .xlsx bytes. Only Mongo is stubbed —
// the container has no database and the mongod download is blocked.
//
// The regression they exist for: requireAuth assigns the decoded token
// ({ id, … }), the routes read req.user._id, and every export answered "project
// not found" for the caller's own projects. The filter assertion below is what
// catches that — with the bug, userId in the query is undefined.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { default: boqRouter } = await import("./projects.boq.js");

const OWNER = new mongoose.Types.ObjectId();
const COLLABORATOR = new mongoose.Types.ObjectId();
const STRANGER = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();

function projectDoc(extra = {}) {
  return {
    _id: PROJECT_ID,
    userId: OWNER,
    productKey: "planswift",
    name: "Pavillion",
    collaborators: [],
    items: [
      {
        code: "BQ-1",
        category: "Demolition And Alteration",
        takeoffLine: "",
        description: "Remove existing damaged roof covering and cart away debris",
        unit: "Item",
        qty: 1,
        rate: 250_000,
      },
      {
        code: "BQ-2",
        category: "111: Insitu Concrete Works",
        description: "Reinforced concrete grade 25 in columns",
        unit: "m3",
        qty: 32,
        rate: 65_000,
      },
    ],
    budgetItems: [
      { billIdentity: "BQ-2", componentKind: "Material", materialName: "Cement (50kg)", unit: "bags", qty: 224, rate: 9500, overheadPercent: 8, profitPercent: 12 },
      { billIdentity: "BQ-2", componentKind: "Labour", materialName: "Carpenter", unit: "m2", qty: 180, rate: 1200, overheadPercent: 8, profitPercent: 12 },
    ],
    contract: {},
    ...extra,
  };
}

// The filters findOne was called with, so a test can assert on what reached Mongo.
let filters = [];
let stored = null;

function installMongoStub() {
  // A connected-looking connection. readyState and db are prototype getters.
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  Object.defineProperty(mongoose.connection, "db", {
    value: { listCollections: () => ({ toArray: async () => [] }) },
    configurable: true,
  });

  TakeoffProject.findOne = (filter) => {
    filters.push(filter);
    const uid = filter?.$or?.[0]?.userId;
    const matchesOwner = uid && stored?.userId && String(uid) === String(stored.userId);
    const matchesCollab =
      uid && (stored?.collaborators || []).some((c) => String(c.userId) === String(uid));
    const hit =
      stored &&
      String(filter?._id) === String(stored._id) &&
      (matchesOwner || matchesCollab)
        ? stored
        : null;
    return { lean: async () => hit };
  };
}

installMongoStub();

async function withServer(fn) {
  const app = express();
  app.use("/projectsboq", boqRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// Exactly the payload signAccess issues and requireAuth decodes: `id`, no `_id`.
const tokenFor = (userId) =>
  signAccess({ id: String(userId), email: "qs@example.com", role: "user" });

function get(base, path, token) {
  return fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const EXPORTS = [
  ["/export/bill-budget", "Bill & Budget"],
  ["/export/boq?building=bungalow", "elemental BoQ"],
  ["/export/boq?building=bungalow&format=trade", "trade BoQ"],
  ["/export/boq?building=multistorey&format=milestone", "milestone BoQ"],
];

for (const [path, label] of EXPORTS) {
  test(`the owner downloads a real .xlsx from ${label}`, async () => {
    stored = projectDoc();
    filters = [];

    await withServer(async (base) => {
      const res = await get(base, `/projectsboq/planswift/${PROJECT_ID}${path}`, tokenFor(OWNER));
      // Read once: a Response body cannot be consumed twice, and on failure we
      // want to show what the route actually said.
      const buf = Buffer.from(await res.arrayBuffer());

      assert.equal(
        res.status,
        200,
        `expected 200, got ${res.status}: ${buf.toString("utf8").slice(0, 300)}`,
      );
      assert.match(
        res.headers.get("content-type") || "",
        /spreadsheetml\.sheet/,
        "not served as an xlsx",
      );
      assert.match(res.headers.get("content-disposition") || "", /attachment; filename=".+\.xlsx"/);

      // A real workbook is a ZIP: it starts with "PK".
      assert.ok(buf.length > 1000, `suspiciously small workbook: ${buf.length} bytes`);
      assert.equal(buf.subarray(0, 2).toString(), "PK", "response is not a zip/xlsx");
    });

    // The regression: the caller's id has to reach the query. Reading
    // req.user._id alone left this undefined and nothing ever matched.
    assert.ok(filters.length, "TakeoffProject.findOne was never called");
    const uid = filters[0]?.$or?.[0]?.userId;
    assert.ok(uid, "the query carried no user id — req.user.id was not read");
    assert.equal(String(uid), String(OWNER));
    assert.equal(String(filters[0]._id), String(PROJECT_ID));
  });
}

test("a full collaborator may export; a view-only one is told why not", async () => {
  await withServer(async (base) => {
    stored = projectDoc({
      collaborators: [{ userId: COLLABORATOR, accessLevel: "full" }],
    });
    let res = await get(
      base,
      `/projectsboq/planswift/${PROJECT_ID}/export/bill-budget`,
      tokenFor(COLLABORATOR),
    );
    assert.equal(res.status, 200);

    stored = projectDoc({
      collaborators: [{ userId: COLLABORATOR, accessLevel: "view" }],
    });
    res = await get(
      base,
      `/projectsboq/planswift/${PROJECT_ID}/export/bill-budget`,
      tokenFor(COLLABORATOR),
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "VIEW_ONLY");
  });
});

test("someone else's project is not found, and no token is unauthorized", async () => {
  await withServer(async (base) => {
    stored = projectDoc();

    let res = await get(
      base,
      `/projectsboq/planswift/${PROJECT_ID}/export/bill-budget`,
      tokenFor(STRANGER),
    );
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "PROJECT_NOT_FOUND");

    res = await get(base, `/projectsboq/planswift/${PROJECT_ID}/export/bill-budget`);
    assert.equal(res.status, 401);
  });
});

test("a disconnected database says so, instead of a bare 500", async () => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
  try {
    await withServer(async (base) => {
      const res = await get(
        base,
        `/projectsboq/planswift/${PROJECT_ID}/export/bill-budget`,
        tokenFor(OWNER),
      );
      assert.equal(res.status, 503);
      assert.equal((await res.json()).code, "DB_NOT_READY");
    });
  } finally {
    installMongoStub();
  }
});

test("the tool in the URL does not have to equal the stored productKey", async () => {
  // planswift-materials is the same family; filtering on productKey used to
  // turn this into a false "not found".
  stored = projectDoc({ productKey: "planswift" });
  await withServer(async (base) => {
    const res = await get(
      base,
      `/projectsboq/planswift-materials/${PROJECT_ID}/export/bill-budget`,
      tokenFor(OWNER),
    );
    assert.equal(res.status, 200);
  });
});
