// server/routes/admin.settings.installerHub.test.js
//
// POST /admin/settings/installer-hub is open to admins and mini-admins, because
// the Installer Hub links are theirs to keep current. Two rules now meet on it:
//
//   * THE RELEASE GATE (docs/RELEASE_GATE.md). installerHubUrl is the file every
//     customer's "Download the Installer Hub" button fetches, so changing it IS
//     a release: it is STAGED for the approver and customers keep the current
//     Hub. The video and guide links are not the Hub and save as they always
//     did.
//   * THE WEEKLY DIGEST (util/releaseDigest.js). A new Installation Center is
//     announced to everybody holding a licence for software it installs - but
//     only once the approver has made it live. This route queues nothing at all;
//     util/releaseGateFlow.js applyCandidate does, on approval (its own test).
//
// So a staged link that is never approved announces nothing, which is the whole
// point of the gate.
//
// No database and no mail: the Setting and User reads are answered from memory,
// and the one path that would stage (and so would write a candidate and mail the
// approver) is asserted from the source rather than executed.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

process.env.JWT_ACCESS_SECRET = "test-secret-for-installer-hub-settings";

const HUB_102 = "https://cdn.test/adlm/hub-private/1726000000000-ADLMInstallerHub-v1.0.2.zip";
const HUB_103 = "https://cdn.test/adlm/hub-private/1726990000000-ADLMInstallerHub-v1.0.3.zip";

/** Who the database says each token's subject is. */
const accounts = new Map();
/** The global Setting document. */
const setting = {};

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
  const app = express();
  app.use(express.json());
  app.use("/admin/settings", settings.default);
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err?.message || err) }));

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  accounts.clear();
  accounts.set("admin1", { role: "admin", disabled: false });
  accounts.set("mini1", { role: "mini_admin", disabled: false });
  for (const k of Object.keys(setting)) delete setting[k];
  Object.assign(setting, { key: "global", installerHubUrl: HUB_102, installerHubVideoUrl: "", installerHubGuideUrl: "" });
});

const tokenFor = (sub, role) =>
  jwt.sign({ id: sub, email: `${sub}@adlm.test`, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

async function post(path_, body, token) {
  const res = await fetch(`${base}${path_}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("the video and guide links still save, and queue nothing for customers", async () => {
  const r = await post(
    "/admin/settings/installer-hub",
    { installerHubVideoUrl: "https://youtu.be/abc", installerHubGuideUrl: "https://cdn.test/guide.pdf" },
    tokenFor("mini1", "mini_admin"),
  );
  assert.equal(r.status, 200);
  assert.equal(setting.installerHubVideoUrl, "https://youtu.be/abc");
  assert.equal(setting.installerHubUrl, HUB_102, "the Hub itself is untouched");
  assert.equal(r.json.hubNotice, undefined, "nothing was queued: this is not the Hub");
});

test("re-saving the same Hub link is not a release, and announces nothing", async () => {
  const r = await post("/admin/settings/installer-hub", { installerHubUrl: HUB_102 }, tokenFor("admin1", "admin"));
  assert.equal(r.status, 200, "unchanged, so there is nothing to sign off");
  assert.equal(setting.installerHubUrl, HUB_102);
  assert.equal(r.json.hubNotice, undefined);
});

test("a customer cannot touch the Installer Hub links at all", async () => {
  assert.equal((await post("/admin/settings/installer-hub", { installerHubUrl: HUB_103 }, tokenFor("u1", "user"))).status, 403);
  assert.equal(setting.installerHubUrl, HUB_102);
});

test("nothing is saved when the body names no link", async () => {
  const r = await post("/admin/settings/installer-hub", { nope: 1 }, tokenFor("admin1", "admin"));
  assert.equal(r.status, 400);
  assert.equal(setting.installerHubUrl, HUB_102);
});

// A NEW Hub link is the gated case. Staging it writes a ReleaseCandidate and
// mails the approver, so it is read rather than run: the route must stage it,
// answer 202, leave the stored link alone, and say that nothing is queued yet.
test("a NEW Hub link is staged for sign-off, not saved, and queues nothing until it is approved", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "admin.settings.js"), "utf8");
  const hub = src.indexOf('router.post("/installer-hub"');
  assert.ok(hub > 0);
  const handler = src.slice(hub, src.indexOf('router.post("/force-reinstall"', hub) || undefined);

  // It stages, and the staged answer is a 202 that returns before the save.
  const staged = handler.indexOf("stageSettingChange({");
  const answer202 = handler.indexOf("res.status(202)", staged);
  const save = handler.indexOf("const s = await Setting.findOneAndUpdate(");
  assert.ok(staged > 0, "a new Hub link is staged");
  assert.ok(answer202 > staged, "and answered with 202 pendingApproval");
  assert.ok(save > answer202, "the plain save is only reached when nothing was staged");

  // The staged answer says so, and the route holds no digest recorder at all.
  assert.match(handler, /hubNotice: \{ created: false, reason: "pending-approval" \}/);
  assert.ok(!/releaseDigest|recordInstallerHubChange/.test(src), "this route never queues customer mail");
  // And the live value is what it returns, so the Hub the fleet downloads is unchanged.
  assert.match(handler, /installerHubUrl: previous,/);
});
