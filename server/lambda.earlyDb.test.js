// server/lambda.earlyDb.test.js
//
// The cold-start overlap: lambda.js starts the Mongo connection and the role
// seed while index.js is still importing, and bootstrap() then reuses that
// work. What must hold is that nothing is done twice, nothing is done with the
// wrong options, and the demo-tenancy guard still passes.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const { Role } = await import("./models/Role.js");
const { ensureRolesSeededOnce } = await import("./util/rbac.js");
const { startDatabaseEarly, loadDbParamsIntoEnv, DB_PARAM_NAMES } = await import("./lambda.js");
const { getRoleAccess } = await import("./util/rbac.js");
const { assertTenancyApplied } = await import("./models/demoTenancy.js");

// Every built-in role already exists, as on every cold start after the first.
const KEYS = ["admin", "mini_admin", "user", "design", "release_approver", "tech_support", "designer"];
let roleFinds = 0;
let failNextFind = false;
Role.find = (q) => {
  roleFinds += 1;
  const rows = KEYS.map((key) => ({
    key,
    system: true,
    isSuperAdmin: key === "admin",
    designAccess: key === "design",
    demoMode: key === "designer",
    permissions: key === "release_approver" ? ["releases"] : key === "tech_support" ? ["preview"] : [],
    save: async () => {},
  }));
  const p = failNextFind
    ? ((failNextFind = false), Promise.reject(new Error("stub: Atlas stalled")))
    : Promise.resolve(rows);
  // Both Role.find(q) (awaited directly) and Role.find({}).lean() are used.
  p.lean = () => p;
  return p;
};

test("concurrent callers share ONE seed run", async () => {
  roleFinds = 0;
  await Promise.all([ensureRolesSeededOnce(), ensureRolesSeededOnce(), ensureRolesSeededOnce()]);
  // ONE read serves both the repair and the cache (it used to be two).
  assert.equal(roleFinds, 1);
  await ensureRolesSeededOnce();
  assert.equal(roleFinds, 1, "a finished run is reused, not repeated");
  // …and the cache it built is the real one.
  assert.equal(getRoleAccess("admin").isSuperAdmin, true);
  assert.ok(getRoleAccess("tech_support").perms.has("preview"));
});

test("the early start connects with the API's options, and bootstrap is not left a second seed", async () => {
  const seen = [];
  const realConnect = mongoose.connect;
  mongoose.connect = async (uri, opts) => {
    seen.push({ uri, opts });
    return mongoose;
  };
  process.env.MONGO_URI = "mongodb://stub-cluster";
  roleFinds = 0;
  try {
    await startDatabaseEarly();
  } finally {
    mongoose.connect = realConnect;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].uri, "mongodb://stub-cluster");
  // First caller's options win in connectDB, so the early start MUST carry the
  // fail-fast timeouts or the whole API would silently lose them.
  assert.equal(seen[0].opts.socketTimeoutMS, 25000);
  assert.equal(seen[0].opts.waitQueueTimeoutMS, 10000);
  // The seed already ran in the first test and is reused here.
  assert.equal(roleFinds, 0);
});

test("the demo-tenancy guard still passes after the early start", () => {
  // Role and friends were compiled after the plugin registered.
  assert.doesNotThrow(() => assertTenancyApplied());
});

test("a failed seed run is forgotten, so the next caller retries", async () => {
  // A fresh memo is needed to see the failure path, so load rbac anew.
  const fresh = await import(`./util/rbac.js?retry=${Date.now()}`);
  failNextFind = true;
  await assert.rejects(fresh.ensureRolesSeededOnce(), /Atlas stalled/);
  roleFinds = 0;
  await fresh.ensureRolesSeededOnce();
  assert.equal(roleFinds, 1, "the failed run was forgotten and a new one ran");
});

// ── The database's own parameters, fetched first ────────────────────────────

function fakeSsm(reply) {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd.input);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

test("the early fetch asks for exactly the parameters the connection reads, AUTH_DB included", async () => {
  const saved = { MONGO_URI: process.env.MONGO_URI, AUTH_DB: process.env.AUTH_DB };
  delete process.env.MONGO_URI;
  delete process.env.AUTH_DB;
  const ssm = fakeSsm({
    Parameters: [
      { Name: "/adlm/cloud/prod/MONGO_URI", Value: "mongodb+srv://from-ssm" },
      { Name: "/adlm/cloud/prod/AUTH_DB", Value: "adlmWeb" },
    ],
  });
  try {
    assert.equal(await loadDbParamsIntoEnv(ssm, "/adlm/cloud/prod/"), true);
    assert.deepEqual(ssm.sent[0].Names, DB_PARAM_NAMES.map((n) => `/adlm/cloud/prod/${n}`));
    assert.equal(ssm.sent[0].WithDecryption, true);
    assert.ok(DB_PARAM_NAMES.includes("AUTH_DB"));
    assert.equal(process.env.MONGO_URI, "mongodb+srv://from-ssm");
    assert.equal(process.env.AUTH_DB, "adlmWeb");
  } finally {
    Object.assign(process.env, saved);
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  }
});

test("an explicitly set env var still wins, as in the full load", async () => {
  process.env.MONGO_URI = "mongodb://break-glass";
  const ssm = fakeSsm({ Parameters: [{ Name: "/p/MONGO_URI", Value: "mongodb://ssm" }] });
  assert.equal(await loadDbParamsIntoEnv(ssm, "/p"), true);
  assert.equal(process.env.MONGO_URI, "mongodb://break-glass");
});

test("no early connect when the fetch fails or MONGO_URI is not there", async () => {
  const saved = process.env.MONGO_URI;
  delete process.env.MONGO_URI;
  try {
    assert.equal(await loadDbParamsIntoEnv(fakeSsm(new Error("AccessDenied")), "/p"), false);
    assert.equal(await loadDbParamsIntoEnv(fakeSsm({ Parameters: [] }), "/p"), false);
  } finally {
    process.env.MONGO_URI = saved;
  }
});

test("a missing built-in role is created, then the cache is re-read so it includes it", async () => {
  const fresh = await import(`./util/rbac.js?create=${Date.now()}`);
  const realFind = Role.find;
  const realCreate = Role.create;
  let reads = 0;
  const created = [];
  Role.find = (q) => {
    reads += 1;
    // The first read lacks tech_support; the re-read has it.
    const keys = reads === 1 ? KEYS.filter((k) => k !== "tech_support") : KEYS;
    const rows = keys.map((key) => ({ key, system: true, isSuperAdmin: key === "admin", permissions: key === "tech_support" ? ["preview"] : key === "release_approver" ? ["releases"] : [], demoMode: key === "designer", designAccess: key === "design", save: async () => {} }));
    const p = Promise.resolve(rows);
    p.lean = () => p;
    return p;
  };
  Role.create = async (d) => created.push(d.key);
  try {
    await fresh.ensureRolesSeeded();
  } finally {
    Role.find = realFind;
    Role.create = realCreate;
  }
  assert.deepEqual(created, ["tech_support"]);
  assert.equal(reads, 2);
  assert.ok(fresh.getRoleAccess("tech_support").perms.has("preview"));
});
