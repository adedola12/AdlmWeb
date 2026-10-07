// POST /projects/:productKey/:id/model-drift and .../model-drift/dismiss
// (work-board item r2-model-drift-alerts).
//
// The real projects router over real HTTP with a real signed token. Mongo and
// the mailer are stubbed: nothing here reaches a database or sends mail. What
// is pinned: who may report, that a report about another copy of the model is
// refused, that only whitelisted fields are written, that the first detection
// asks for exactly one owner email, and that the gallery row and the project
// payload carry the badge summary and nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.MAIL_TRANSPORT = "ses";
process.env.MAIL_FALLBACK = "off";
process.env.RESEND_API_KEY = "";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { ModelDriftEvent } = await import("../models/ModelDriftEvent.js");
const { modelRefFor } = await import("../services/modelDrift.js");
const { notifyOwnerOfDrift } = await import("../services/modelDriftNotify.js");
const { default: projectsRouter, projectForClient } = await import("./projects.js");

const OWNER = new mongoose.Types.ObjectId();
const VIEWER = new mongoose.Types.ObjectId();
const FULL = new mongoose.Types.ObjectId();
const STRANGER = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();
const FP = crypto.createHash("sha256").update("stamped-model-guid").digest("hex");
const REF = modelRefFor(FP);

const users = {
  [OWNER]: { _id: OWNER, email: "owner@example.com", firstName: "Ada", entitlements: [{ productKey: "revit", status: "active" }] },
  [VIEWER]: { _id: VIEWER, email: "v@example.com", entitlements: [{ productKey: "revit", status: "active" }] },
  [FULL]: { _id: FULL, email: "f@example.com", entitlements: [{ productKey: "revit", status: "active" }] },
  [STRANGER]: { _id: STRANGER, email: "s@example.com", entitlements: [{ productKey: "revit", status: "active" }] },
};

User.findById = (id) => {
  const u = users[String(id)] || null;
  return {
    select() {
      return this;
    },
    lean: async () => u,
    then: (ok, ko) => Promise.resolve(u).then(ok, ko),
  };
};

let project;
let projectWrites = [];
let events = [];
let eventWrites = [];

function freshProject(extra = {}) {
  return {
    _id: PROJECT_ID,
    userId: OWNER,
    productKey: "revit",
    name: "Tower Block",
    modelFingerprint: FP,
    collaborators: [
      { userId: VIEWER, accessLevel: "view" },
      { userId: FULL, accessLevel: "full" },
    ],
    items: [{ code: "a1" }, { code: "b2" }, { code: "c3" }],
    ...extra,
  };
}

TakeoffProject.findOne = async (filter) => {
  if (!project) return null;
  if (String(filter?._id) !== String(project._id)) return null;
  const who = filter?.$or?.[0]?.userId;
  const allowed =
    String(project.userId) === String(who) ||
    (project.collaborators || []).some((c) => String(c.userId) === String(who));
  return allowed ? project : null;
};
TakeoffProject.updateOne = async (filter, update, opts) => {
  projectWrites.push({ filter, update, opts });
  if (update?.$set?.modelDrift) project = { ...project, modelDrift: update.$set.modelDrift };
  return { modifiedCount: 1 };
};
// The route's owner email is fire-and-forget; by default it finds nothing to
// claim, so no test here ever reaches the mailer except the one that asks to.
TakeoffProject.findOneAndUpdate = () => ({ lean: async () => null });
ModelDriftEvent.create = async (doc) => {
  const ev = { _id: new mongoose.Types.ObjectId(), ...doc };
  events.push(ev);
  return ev;
};
ModelDriftEvent.updateOne = async (filter, update) => {
  eventWrites.push({ filter, update });
  return { modifiedCount: 1 };
};

function reset(extra) {
  project = freshProject(extra);
  projectWrites = [];
  events = [];
  eventWrites = [];
}

async function post(path, body, as = OWNER) {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${signAccess({ _id: String(as), email: users[as].email, role: "user" })}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const url = `/projects/revit/${PROJECT_ID}/model-drift`;
const good = (over = {}) => ({
  modelRef: REF,
  checkedAt: new Date().toISOString(),
  productVersion: "3.2.0",
  counts: { added: 2, removed: 1, elementsChecked: 500 },
  lines: [
    { code: "a1", added: 2 },
    { code: "b2", removed: 1 },
  ],
  ...over,
});

test("the owner's first report opens a drift, logs one event and writes no timestamps", async () => {
  reset();
  const res = await post(url, good({ modelTitle: "Tower.rvt", lines: [{ code: "a1", added: 2, description: "Wall" }] }));
  assert.equal(res.status, 200);
  assert.equal(res.body.action, "open");
  assert.equal(res.body.modelDrift.status, "open");
  assert.equal(res.body.modelDrift.counts.linesAffected, 1);
  assert.equal(res.body.modelDrift.modelRef, undefined);
  assert.equal(events.length, 1);
  assert.equal(events[0].productKey, "revit");
  const w = projectWrites.at(-1);
  assert.deepEqual(w.opts, { timestamps: false });
  const stored = JSON.stringify(w.update.$set.modelDrift);
  assert.ok(!stored.includes("Tower"));
  assert.ok(!stored.includes("Wall"));
  assert.equal(String(w.update.$set.modelDrift.eventId), String(events[0]._id));
});

test("the same drift reported again refreshes, and does not open a second event", async () => {
  reset();
  await post(url, good());
  const res = await post(url, good());
  assert.equal(res.body.action, "refresh");
  assert.equal(events.length, 1);
  assert.ok(eventWrites.some((e) => e.update.$inc?.reports === 1));
});

test("a clean re-check clears it", async () => {
  reset();
  await post(url, good());
  const res = await post(url, good({ lines: [], counts: {} }));
  assert.equal(res.body.action, "clear");
  assert.equal(res.body.modelDrift.status, "cleared");
  assert.equal(res.body.modelDrift.clearedBy, "clean-check");
});

test("a report about another copy of the model is refused", async () => {
  reset();
  const other = modelRefFor("some-other-fingerprint");
  const res = await post(url, good({ modelRef: other }));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "MODEL_MISMATCH");
  assert.equal(projectWrites.length, 0);
});

test("a project with no model identity cannot take a report", async () => {
  reset({ modelFingerprint: "" });
  const res = await post(url, good());
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "NO_MODEL_IDENTITY");
});

test("a malformed report is refused", async () => {
  reset();
  const res = await post(url, good({ modelRef: "not-a-hash" }));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "BAD_DRIFT_REPORT");
});

test("a full collaborator may report; a view-only one and a stranger may not", async () => {
  reset();
  assert.equal((await post(url, good(), FULL)).status, 200);
  reset();
  const v = await post(url, good(), VIEWER);
  assert.equal(v.status, 403);
  assert.equal(v.body.code, "VIEW_ONLY");
  reset();
  assert.equal((await post(url, good(), STRANGER)).status, 404);
  assert.equal(projectWrites.length, 0);
});

test("only QUIV and ArchiCAD projects take drift reports", async () => {
  reset();
  users[OWNER].entitlements.push({ productKey: "planswift", status: "active" });
  const res = await post(`/projects/planswift/${PROJECT_ID}/model-drift`, good());
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DRIFT_UNSUPPORTED_PRODUCT");
});

test("a merged project is refused: drift belongs to its sources", async () => {
  reset({ mergeContainer: true });
  const res = await post(url, good());
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "MERGED_PROJECT");
});

test("'not a real change' dismisses, and the same change stays dismissed", async () => {
  reset();
  await post(url, good());
  const d = await post(`${url}/dismiss`, { reason: "not-a-real-change" });
  assert.equal(d.status, 200);
  assert.equal(d.body.modelDrift.status, "dismissed");
  assert.ok(eventWrites.some((e) => e.update.$set?.clearedBy === "dismissed"));
  const again = await post(url, good());
  assert.equal(again.body.action, "ignore");
  const none = await post(`${url}/dismiss`, {});
  assert.equal(none.status, 409);
});

test("the owner email goes once, SES template key, to the owner", async () => {
  const sent = [];
  let claimed = false;
  TakeoffProject.findOneAndUpdate = (filter) => ({
    lean: async () => {
      // The conditional claim: only the first caller gets the document back.
      if (claimed || filter["modelDrift.notifiedAt"] !== null) return null;
      claimed = true;
      return {
        _id: PROJECT_ID,
        name: "Tower Block",
        userId: OWNER,
        productKey: "revit",
        modelDrift: { status: "open", counts: { added: 2, removed: 1, changed: 0, linesAffected: 2 }, eventId: null },
      };
    },
  });
  const send = async (m) => sent.push(m);
  const a = await notifyOwnerOfDrift(PROJECT_ID, { send });
  const b = await notifyOwnerOfDrift(PROJECT_ID, { send });
  assert.equal(a.sent, true);
  assert.equal(b.sent, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].templateKey, "project.model-drift");
  assert.match(sent[0].subject, /Tower Block/);
  assert.match(sent[0].html, /projects\/revit\?project=/);
});

test("the project payload carries the badge summary only", () => {
  const out = projectForClient(
    {
      _id: PROJECT_ID,
      name: "Tower Block",
      modelDrift: {
        status: "open",
        modelRef: REF,
        signature: "abc",
        eventId: new mongoose.Types.ObjectId(),
        counts: { added: 1, removed: 0, changed: 0, linesAffected: 1 },
        lines: [{ code: "a1", added: 1, removed: 0, changed: 0 }],
      },
    },
    { role: "owner", canEdit: true, canManage: true, canSeeRates: true },
  );
  assert.equal(out.modelDrift.status, "open");
  assert.equal(out.modelDrift.modelRef, undefined);
  assert.equal(out.modelDrift.signature, undefined);
  assert.equal(out.modelDrift.eventId, undefined);
  const none = projectForClient({ _id: PROJECT_ID, modelDrift: { status: "none" } }, null);
  assert.equal("modelDrift" in none, false);
});
