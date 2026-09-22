// server/routes/admin.settings.installerHub.test.js
//
// POST /admin/settings/installer-hub is open to admins and mini-admins, because
// the Installer Hub links are theirs to keep current. Since the weekly digest
// (util/releaseDigest.js), pointing the link at a new ADLMInstallerHub-vX.Y.Z
// file also queues "a new Installation Center is ready" for every customer who
// holds software it installs. That is mail to the customer base, which every
// other release-mail path keeps for admins (requireAdmin: the deployment PUT,
// /admin/release-notifications). So here: a mini-admin's change is saved and
// queues nothing; an admin's queues the announcement; an admin demoted since
// their token was issued is treated as what the database says they are now.
//
// No database: the Setting and User reads are answered from memory, the way
// routes/admin.releaseNotifications.test.js answers User.findById.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_ACCESS_SECRET = "test-secret-for-installer-hub-settings";

const HUB_102 = "https://cdn.test/adlm/installer-hub/1726000000000-ADLMInstallerHub-v1.0.2.zip";
const HUB_103 = "https://cdn.test/adlm/installer-hub/1726990000000-ADLMInstallerHub-v1.0.3.zip";

/** Who the database says each token's subject is. */
const accounts = new Map();
/** The global Setting document. */
const setting = {};
/** What the spied route asked the digest to record. */
let recorded = [];

let server;
let base;

before(async () => {
  const { registerDemoTenancy } = await import("../models/demoTenancy.js");
  registerDemoTenancy();
  const { User } = await import("../models/User.js");
  User.findById = (id) => ({ select: () => ({ lean: async () => accounts.get(String(id)) ?? null }) });
  const { Setting } = await import("../models/Setting.js");
  Setting.findOne = () => ({
    select: () => ({ lean: () => Promise.resolve({ ...setting }) }),
    lean: () => Promise.resolve({ ...setting }),
  });
  Setting.findOneAndUpdate = async (_filter, update) => {
    Object.assign(setting, update);
    return { ...setting };
  };

  const settings = await import("./admin.settings.js");
  const { requireAuth } = await import("../middleware/auth.js");

  const app = express();
  app.use(express.json());
  // The real router, mounted as server/index.js mounts it.
  app.use("/admin/settings", settings.default);
  // The same chain with the digest's recorder replaced by a spy.
  app.post(
    "/spy/installer-hub",
    requireAuth,
    settings.requireAdminOrMiniAdmin,
    settings.makeInstallerHubHandler({
      recordHubChange: async (o) => {
        recorded.push(o);
        return { created: true, key: "hub@1.0.3", status: "pending", deliveredBy: "weekly-digest" };
      },
      log: { error() {} },
    }),
  );
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err?.message || err) }));

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  recorded = [];
  accounts.clear();
  accounts.set("admin1", { role: "admin", disabled: false });
  accounts.set("mini1", { role: "mini_admin", disabled: false });
  accounts.set("demoted", { role: "mini_admin", disabled: false });
  for (const k of Object.keys(setting)) delete setting[k];
  Object.assign(setting, { key: "global", installerHubUrl: HUB_102, installerHubVideoUrl: "", installerHubGuideUrl: "" });
});

const tokenFor = (sub, role) =>
  jwt.sign({ id: sub, email: `${sub}@adlm.test`, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

async function post(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("a mini-admin through the real route: the new link is saved and nothing is queued for customers", async () => {
  const started = Date.now();
  const r = await post("/admin/settings/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("mini1", "mini_admin"));
  assert.equal(r.status, 200);
  assert.equal(r.json.installerHubUrl, HUB_103);
  assert.equal(setting.installerHubUrl, HUB_103, "the link is theirs to change");
  assert.equal(r.json.hubNotice.created, false);
  assert.equal(r.json.hubNotice.reason, "not-admin");
  assert.match(r.json.hubNotice.note, /Only an admin/);
  assert.match(r.json.hubNotice.note, /digest\/hub/);
  // Had it reached the digest's recorder, that would have waited on Mongo.
  assert.ok(Date.now() - started < 5000);
});

test("the same chain with the recorder watched: mini-admin queues nothing, admin queues it, a demoted admin's token does not", async () => {
  const mini = await post("/spy/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("mini1", "mini_admin"));
  assert.equal(mini.status, 200);
  assert.equal(mini.json.hubNotice.reason, "not-admin");
  assert.equal(recorded.length, 0);

  setting.installerHubUrl = HUB_102;
  const admin = await post("/spy/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("admin1", "admin"));
  assert.equal(admin.status, 200);
  assert.equal(admin.json.hubNotice.key, "hub@1.0.3");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].previousUrl, HUB_102);
  assert.equal(recorded[0].nextUrl, HUB_103);
  assert.equal(recorded[0].actor, "admin1@adlm.test");

  // A token that still says admin, for an account the database now calls mini_admin.
  setting.installerHubUrl = HUB_102;
  const demoted = await post("/spy/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("demoted", "admin"));
  assert.equal(demoted.status, 200);
  assert.equal(demoted.json.hubNotice.reason, "not-admin");
  assert.equal(recorded.length, 1);

  // Saving the same link again asks nobody anything; a customer is refused outright.
  const same = await post("/spy/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("admin1", "admin"));
  assert.equal(same.json.hubNotice, undefined);
  assert.equal((await post("/spy/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("u1", "user"))).status, 403);
  assert.equal(recorded.length, 1);
});
