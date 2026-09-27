// server/routes/projects.openIntent.test.js
//
// "Open in QUIV / HERON" tickets. What is pinned here is the security model in
// util/openIntent.js: the ticket names one user, project and product; it is
// not an access token and an access token is not a ticket; access is checked
// again at redeem; and a ticket opens a project once.
//
// Mongo is stubbed. What is checked is what the ROUTE decides.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { User } = await import("../models/User.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { OpenIntent } = await import("../models/OpenIntent.js");
const { ActivityLog } = await import("../models/ActivityLog.js");
const { verifyOpenIntent, signOpenIntent } = await import("../util/openIntent.js");
const { default: openIntentRouter } = await import("./projects.openIntent.js");

const OWNER = new mongoose.Types.ObjectId();
const STRANGER = new mongoose.Types.ObjectId();
const PROJECT = new mongoose.Types.ObjectId();

const users = new Map();
function setUser(id, entitlements) {
  users.set(String(id), { _id: id, email: `${id}@example.com`, entitlements });
}

User.findById = (id) => {
  const found = users.get(String(id)) || null;
  const q = {
    select: () => q,
    lean: async () => found,
    then: (ok, ko) => Promise.resolve(found).then(ok, ko),
  };
  return q;
};

// The one project in the "database". Tests mutate it.
let project;
function resetProject() {
  project = {
    _id: PROJECT,
    name: "Duplex, Lekki",
    userId: OWNER,
    productKey: "revit",
    isSample: false,
    collaborators: [],
    clientProjectKey: "DUPLEX-01",
    modelTitle: "Duplex.rvt",
  };
}

function matches(filter) {
  if (!project) return false;
  if (filter._id && String(filter._id) !== String(project._id)) return false;
  const pk = filter.productKey;
  if (typeof pk === "string" && pk !== project.productKey) return false;
  if (pk?.$in && !pk.$in.includes(project.productKey)) return false;
  if (filter.$or) {
    const ok = filter.$or.some((c) => {
      if (c.userId) return String(c.userId) === String(project.userId);
      if (c["collaborators.userId"]) {
        return project.collaborators.some(
          (x) => String(x.userId) === String(c["collaborators.userId"]),
        );
      }
      if (c.isSample) return !!project.isSample;
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

TakeoffProject.findOne = (filter) => {
  const q = { select: () => q, lean: async () => (matches(filter) ? { ...project } : null) };
  return q;
};

// OpenIntent rows in memory.
let intents;
OpenIntent.create = async (doc) => {
  intents.set(doc.jti, { ...doc, redeemedAt: null, failure: "" });
  return doc;
};
OpenIntent.findOneAndUpdate = (filter, update) => ({
  lean: async () => {
    const row = intents.get(filter.jti);
    if (!row || String(row.userId) !== String(filter.userId) || row.redeemedAt) return null;
    Object.assign(row, update.$set);
    return row;
  },
});
OpenIntent.updateOne = async (filter, update) => {
  const row = intents.get(filter.jti);
  if (row && !row.redeemedAt) Object.assign(row, update.$set);
  return {};
};

let activities;
ActivityLog.create = async (doc) => {
  activities.push(doc);
  return doc;
};

function reset() {
  resetProject();
  intents = new Map();
  activities = [];
  users.clear();
  setUser(OWNER, [{ productKey: "revit", status: "active" }]);
  setUser(STRANGER, [{ productKey: "revit", status: "active" }]);
}

function bearer(id) {
  return signAccess({ _id: String(id), email: `${id}@example.com`, role: "user" });
}

async function call(path, { token, body }) {
  const app = express();
  app.use(express.json());
  app.use("/projects/open-intent", openIntentRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const issue = (id = OWNER, projectId = String(PROJECT)) =>
  call("/projects/open-intent/issue", { token: bearer(id), body: { projectId } });

function ticketOf(url) {
  const u = new URL(url);
  return u.searchParams.get("ticket");
}

const redeem = (ticket, id = OWNER, extra = {}) =>
  call("/projects/open-intent/redeem", {
    token: bearer(id),
    body: { ticket, projectId: String(PROJECT), product: "quiv", ...extra },
  });

test("issue: an owner gets an adlm:// link naming only product, project and ticket", async () => {
  reset();
  const res = await issue();
  assert.equal(res.status, 200);
  assert.equal(res.body.product, "quiv");
  const u = new URL(res.body.url);
  assert.equal(u.protocol, "adlm:");
  assert.equal(u.host, "open");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["product", "project", "ticket", "v"]);
  assert.equal(u.searchParams.get("project"), String(PROJECT));
  const claims = verifyOpenIntent(u.searchParams.get("ticket"));
  assert.equal(claims.sub, String(OWNER));
  assert.equal(claims.pid, String(PROJECT));
  assert.equal(intents.size, 1);
});

test("issue: HERON projects map to product heron", async () => {
  reset();
  project.productKey = "planswift";
  setUser(OWNER, [{ productKey: "planswift", status: "active" }]);
  const res = await issue();
  assert.equal(res.status, 200);
  assert.equal(res.body.product, "heron");
});

test("issue: products without a desktop entry point are refused", async () => {
  reset();
  project.productKey = "revitmep";
  const res = await issue();
  assert.equal(res.status, 404);
});

test("issue: someone else's project looks like no project at all", async () => {
  reset();
  const res = await issue(STRANGER);
  assert.equal(res.status, 404);
  assert.equal(intents.size, 0);
});

test("issue: no licence, no link", async () => {
  reset();
  setUser(OWNER, []);
  const res = await issue();
  assert.equal(res.status, 403);
  assert.equal(intents.size, 0);
});

test("issue: combined projects are refused", async () => {
  reset();
  project.mergeContainer = true;
  const res = await issue();
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "MERGED");
});

test("issue: a malformed id is a 400", async () => {
  reset();
  const res = await issue(OWNER, "not-an-id");
  assert.equal(res.status, 400);
});

test("the ticket is not an access token", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  const res = await call("/projects/open-intent/issue", {
    token: ticket,
    body: { projectId: String(PROJECT) },
  });
  assert.equal(res.status, 401);
});

test("an access token is not a ticket", async () => {
  reset();
  const res = await redeem(bearer(OWNER));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "BAD_TICKET");
});

test("redeem: opens once, then refuses", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  const first = await redeem(ticket);
  assert.equal(first.status, 200);
  assert.equal(first.body.projectId, String(PROJECT));
  assert.equal(first.body.productKey, "revit");
  assert.equal(first.body.modelTitle, "Duplex.rvt");
  assert.equal(first.body.role, "owner");
  assert.equal(activities.length, 1);
  assert.equal(activities[0].action, "project.opened-desktop");

  const second = await redeem(ticket);
  assert.equal(second.status, 410);
  assert.equal(second.body.code, "USED");
});

test("redeem: another account cannot use it, and the ticket survives for the right one", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  const wrong = await redeem(ticket, STRANGER);
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.code, "WRONG_ACCOUNT");
  const right = await redeem(ticket);
  assert.equal(right.status, 200);
});

test("redeem: the request file cannot swap the project or product", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  const otherProject = await redeem(ticket, OWNER, {
    projectId: String(new mongoose.Types.ObjectId()),
  });
  assert.equal(otherProject.status, 400);
  const otherProduct = await redeem(ticket, OWNER, { product: "heron" });
  assert.equal(otherProduct.status, 400);
});

test("redeem: access is checked again, not trusted from the link", async () => {
  reset();
  const collaborator = new mongoose.Types.ObjectId();
  setUser(collaborator, [{ productKey: "revit", status: "active" }]);
  project.collaborators = [{ userId: collaborator, accessLevel: "view" }];
  const ticket = ticketOf((await issue(collaborator)).body.url);
  project.collaborators = []; // removed from the project after clicking
  const res = await redeem(ticket, collaborator);
  assert.equal(res.status, 404);
  assert.equal(res.body.code, "NOT_FOUND");
});

test("redeem: an expired ticket is a 410", async () => {
  reset();
  const realNow = Date.now;
  let ticket;
  try {
    Date.now = () => realNow() - 11 * 60 * 1000;
    ticket = signOpenIntent({
      userId: String(OWNER),
      projectId: String(PROJECT),
      product: "quiv",
      jti: "old-one",
    });
  } finally {
    Date.now = realNow;
  }
  const res = await redeem(ticket);
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "EXPIRED");
});

test("redeem: a lapsed licence is refused before anything is burned", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  setUser(OWNER, [{ productKey: "revit", status: "active", expiresAt: new Date(0) }]);
  const res = await redeem(ticket);
  assert.equal(res.status, 403);
  const [row] = [...intents.values()];
  assert.equal(row.redeemedAt, null);
  assert.equal(row.failure, "NO_LICENCE");
});

test("redeem: needs a session", async () => {
  reset();
  const ticket = ticketOf((await issue()).body.url);
  const res = await call("/projects/open-intent/redeem", {
    body: { ticket, projectId: String(PROJECT), product: "quiv" },
  });
  assert.equal(res.status, 401);
});
