// server/routes/projects.boq.rateGen.test.js
//
// GET /projectsboq/:tool/:id/export/{boq,bill-budget}: both are priced
// workbooks. A collaborator sees rates on the project page only with an active
// RateGen subscription, and the certificate / final-account exports already
// refuse without it. These two did not, so a "full" collaborator without
// RateGen could download every rate the page hides from them.
//
// Mongo is stubbed; nothing here touches a database. Only the refusal is
// pinned: the exporters themselves are covered by their own tests.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { User } = await import("../models/User.js");
const { default: boqRouter } = await import("./projects.boq.js");

const OWNER = new mongoose.Types.ObjectId();
const NORATE = new mongoose.Types.ObjectId(); // full collaborator, no RateGen
const PRICER = new mongoose.Types.ObjectId(); // full collaborator, has RateGen
const VIEWER = new mongoose.Types.ObjectId(); // view collaborator
const PROJECT_ID = new mongoose.Types.ObjectId();

const ENTITLEMENTS = new Map([
  [String(OWNER), []],
  [String(NORATE), []],
  [String(PRICER), [{ productKey: "rategen", status: "active" }]],
  [String(VIEWER), [{ productKey: "rategen", status: "active" }]],
]);

const project = {
  _id: PROJECT_ID,
  userId: OWNER,
  productKey: "planswift",
  name: "Pavillion",
  collaborators: [
    { userId: NORATE, accessLevel: "full" },
    { userId: PRICER, accessLevel: "full" },
    { userId: VIEWER, accessLevel: "view" },
  ],
  items: [],
};

Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
Object.defineProperty(mongoose.connection, "db", { value: {}, configurable: true });

TakeoffProject.findOne = () => ({ lean: async () => project });
User.findById = (id) => {
  const doc = { _id: id, entitlements: ENTITLEMENTS.get(String(id)) || [] };
  return { lean: async () => doc, then: (ok, ko) => Promise.resolve(doc).then(ok, ko) };
};

async function exportAs(userId, kind) {
  const app = express();
  app.use("/projectsboq", boqRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/projectsboq/planswift/${PROJECT_ID}/export/${kind}`,
      {
        headers: {
          Authorization: `Bearer ${signAccess({ _id: String(userId), email: "u@example.com", role: "user" })}`,
        },
      },
    );
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* a workbook */
    }
    return { status: res.status, body };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

for (const kind of ["boq", "bill-budget"]) {
  test(`${kind}: a full collaborator without RateGen is refused`, async () => {
    const res = await exportAs(NORATE, kind);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "RATEGEN_REQUIRED");
  });

  test(`${kind}: a full collaborator WITH RateGen gets past the gate`, async () => {
    const res = await exportAs(PRICER, kind);
    assert.notEqual(res.status, 403);
    assert.notEqual(res.body?.code, "RATEGEN_REQUIRED");
  });

  test(`${kind}: the owner needs no RateGen for their own project`, async () => {
    const res = await exportAs(OWNER, kind);
    assert.notEqual(res.status, 403);
  });

  test(`${kind}: view-only is still refused as view-only`, async () => {
    const res = await exportAs(VIEWER, kind);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "VIEW_ONLY");
  });
}
