// server/routes/admin.releaseNotifications.test.js
//
// The admin endpoints for the "new version is ready" emails, over real HTTP.
//
// What a release script loops on is pinned here: the status code, `counts`
// and the note for every way a /send call can end (pending, done, stopped by
// SES, paused, SES unreachable, nothing to do). So are the gate (admin read
// from the database, disabled accounts and demo sessions refused), the limit
// clamp, retry-failed reopening a finished notice, cancel, and the manual
// announcement's refusals.
//
// The router is the real one with its real gate. Behind it runs the real send
// loop (util/releaseNotifier.js) against the in-memory store the notifier's
// own tests use, with SES stubbed: nothing here sends mail, reaches AWS or
// needs a database. The one database call the gate makes (User.findById) is
// answered from a map, the way middleware/requireAdmin.test.js does it.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {
  memoryStore,
  quiet,
  noPause,
  person,
  PRODUCTION,
  stubSes,
  sesErr,
  put,
} from "../util/releaseNotifier.memoryStore.js";

process.env.JWT_ACCESS_SECRET = "test-secret-for-release-notifications";
process.env.API_BASE_URL = "https://api.adlmstudio.net";
delete process.env.DRY_RUN;
delete process.env.MAIL_SEND_RATE_PER_SEC;

/** Who the database says each token's subject is. */
const accounts = new Map();

/** What the routes are running against this test. Replaced in beforeEach. */
const world = {};

let server;
let base;
let sendReleaseNotice;
let recordDeploymentRelease;

before(async () => {
  const { registerDemoTenancy } = await import("../models/demoTenancy.js");
  registerDemoTenancy();
  const { User } = await import("../models/User.js");
  User.findById = (id) => ({ select: () => ({ lean: async () => accounts.get(String(id)) ?? null }) });

  const notifier = await import("../util/releaseNotifier.js");
  ({ sendReleaseNotice, recordDeploymentRelease } = notifier);
  const { makeReleaseNotificationsRouter } = await import("./admin.releaseNotifications.js");

  const storeProxy = new Proxy(
    {},
    {
      get: (_t, prop) => {
        const v = world.store[prop];
        return typeof v === "function" ? v.bind(world.store) : v;
      },
    },
  );

  const router = makeReleaseNotificationsRouter({
    store: storeProxy,
    send: (key, opts) => {
      world.sendCalls.push(opts);
      return sendReleaseNotice(key, {
        ...opts,
        store: world.store,
        send: world.ses.send,
        sesAccount: world.sesAccount,
        pause: noPause,
        log: quiet,
        // dryRun left to DRY_RUN, as in production.
      });
    },
    preview: (args) => notifier.previewRelease({ ...args, store: world.store, log: quiet }),
    createManual: (args) => notifier.createManualNotice({ ...args, store: world.store, log: quiet }),
    sesState: async () => ({ ok: true }),
    liveCounts: async (keys) => new Map(await Promise.all(keys.map(async (k) => [k, await world.store.counts(k)]))),
    listNotices: async ({ productKey, limit }) =>
      [...world.store.notices.values()].filter((n) => !productKey || n.productKey === productKey).slice(0, limit),
    rowsIn: async (key, status) => world.store.rows.filter((r) => r.noticeKey === key && r.status === status),
  });

  const app = express();
  app.use(express.json());
  // Stands in for demoModeGuard, which marks a demo session before any router.
  app.use((req, _res, next) => {
    if (req.headers["x-test-demo"]) req.demoMode = true;
    next();
  });
  app.use("/admin/release-notifications", router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err?.message || err) }));

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/admin/release-notifications`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(async () => {
  delete process.env.DRY_RUN;
  accounts.clear();
  accounts.set("admin1", { role: "admin", disabled: false });
  world.store = memoryStore({ users: [person(1), person(2), person(3)] });
  world.ses = stubSes();
  world.sesAccount = async () => PRODUCTION;
  world.sendCalls = [];
  world.store.deployments.set("revit", put("3.1.11"));
  await recordDeploymentRelease({ previous: put("3.1.10"), item: put("3.1.11"), store: world.store, log: quiet });
});

const tokenFor = (sub, claims = {}) =>
  jwt.sign({ id: sub, email: `${sub}@adlm.test`, role: "admin", ...claims }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });

async function call(method, path, { body, token = tokenFor("admin1"), headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, headers: res.headers };
}

const KEY = "revit@3.1.11";
const send = (body = {}) => call("POST", `/${encodeURIComponent(KEY)}/send`, { body });

/* ════════════════════════════════════════════════════════════ the gate ══ */

test("the gate: the database's admin, and nobody else", async () => {
  assert.equal((await call("GET", "/")).status, 200);
  assert.equal((await call("GET", "/", { token: "" })).status, 401);

  // The token still says admin; the database says the role was taken away.
  accounts.set("revoked", { role: "user", disabled: false });
  assert.equal((await call("GET", "/", { token: tokenFor("revoked") })).status, 403);

  // An admin whose account was disabled.
  accounts.set("gone", { role: "admin", disabled: true });
  assert.equal((await call("GET", "/", { token: tokenFor("gone") })).status, 403);

  // An account that no longer exists.
  assert.equal((await call("GET", "/", { token: tokenFor("nobody") })).status, 403);

  // A mini-admin is not enough to mail the customer base.
  accounts.set("mini", { role: "mini_admin", disabled: false });
  assert.equal((await call("GET", "/", { token: tokenFor("mini", { role: "mini_admin" }) })).status, 403);

  // A demo session is admitted by requireAdmin for viewing, and refused here.
  const demo = await call("POST", `/${encodeURIComponent(KEY)}/send`, { body: {}, headers: { "x-test-demo": "1" } });
  assert.equal(demo.status, 403);
  assert.equal(world.ses.calls.length, 0);
});

/* ═════════════════════════════════════════════ /send: the loop contract ══ */

test("/send with people still to go: 200, counts.pending, and 'call again'", async () => {
  const r = await send({ limit: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.sent, 1);
  assert.equal(r.json.counts.pending, 2);
  assert.equal(r.json.note, "Call again to send the next 1.");
});

test("/send to the end: 200 'Complete.', then 'Nothing to do'", async () => {
  const done = await send();
  assert.equal(done.status, 200);
  assert.equal(done.json.status, "done");
  assert.equal(done.json.counts.pending, 0);
  assert.equal(done.json.counts.sent, 3);
  assert.equal(done.json.note, "Complete.");

  const again = await send();
  assert.equal(again.status, 200);
  assert.equal(again.json.skipped, true);
  assert.equal(again.json.note, "Nothing to do (already-done).");
  assert.equal(world.ses.calls.length, 3);
});

test("/send when SES refuses (sandbox): 409, stopped, counts, and no other provider", async () => {
  world.sesAccount = async () => ({ ...PRODUCTION, ProductionAccessEnabled: false });
  const r = await send();
  assert.equal(r.status, 409);
  assert.equal(r.json.stopped, true);
  assert.equal(r.json.code, "ses-sandbox");
  assert.ok(r.json.counts);
  assert.match(r.json.note, /SES refused\. Nothing further was sent and no other provider was tried/);
  assert.equal(world.ses.calls.length, 0);
});

test("/send when the daily quota runs out: 200, paused, counts, and 'call again later'", async () => {
  world.sesAccount = async () => ({ ...PRODUCTION, SendQuota: { MaxSendRate: 14, Max24HourSend: 12, SentLast24Hours: 0 } });
  const r = await send();
  assert.equal(r.status, 200);
  assert.equal(r.json.paused, true);
  assert.equal(r.json.sent, 2, "12 - 10 kept in hand");
  assert.equal(r.json.counts.pending, 1);
  assert.equal(
    r.json.note,
    "Paused: Daily sending quota reached; the rest go on the next run. 1 still to go; call /send again later.",
  );
});

test("/send when SES cannot be reached at all: 503 with Retry-After and the counts, never 'Complete.'", async () => {
  world.sesAccount = async () => {
    throw sesErr("TooManyRequestsException", "Rate exceeded", 429);
  };
  const r = await send();
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("retry-after"), "30");
  assert.equal(r.json.retryLater, true);
  assert.equal(r.json.ok, false);
  assert.ok(r.json.counts, "counts, so a loop on counts.pending carries on");
  assert.match(r.json.note, /SES could not be reached, so nothing was sent/);
  assert.notEqual(r.json.note, "Complete.");
  assert.equal(world.store.notices.get(KEY).status, "pending");
});

test("/send when SES throttles mid-run: 200, retryLater, the counts, and 'call again shortly'", async () => {
  world.ses = stubSes({ failFor: () => sesErr("TooManyRequestsException", "Maximum sending rate exceeded.", 429) });
  process.env.MAIL_SEND_RATE_PER_SEC = "1";
  try {
    const r = await send();
    assert.equal(r.status, 200);
    assert.equal(r.json.retryLater, true);
    assert.equal(r.json.status, "sending");
    assert.equal(r.json.counts.pending, 3);
    assert.match(r.json.note, /throttling or did not answer.*3 still to go\. Call \/send again shortly\./);
  } finally {
    delete process.env.MAIL_SEND_RATE_PER_SEC;
  }
});

test("/send for a build that was pulled: 200, nothing sent, and why", async () => {
  world.store.deployments.set("revit", put("3.1.11", { enabled: false }));
  const r = await send();
  assert.equal(r.status, 200);
  assert.equal(r.json.skipped, true);
  assert.equal(r.json.status, "cancelled");
  assert.match(r.json.note, /^Nothing to do \(deployment-withdrawn: the deployment was switched off\)/);
  assert.equal(world.ses.calls.length, 0);
});

test("/send under DRY_RUN says what it would do, and sends and writes nothing", async () => {
  process.env.DRY_RUN = "1";
  try {
    const before = world.store.writes.length;
    const r = await call("POST", `/${encodeURIComponent(KEY)}/send`, { body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.json.dryRun, true);
    assert.equal(r.json.note, "DRY RUN: would mail 3 licence holder(s). Nothing sent, nothing written.");
    assert.equal(world.ses.calls.length, 0);
    assert.equal(world.store.writes.length, before);
  } finally {
    delete process.env.DRY_RUN;
  }
});

test("/send clamps the limit and always resumes", async () => {
  for (const [given, used] of [
    [5000, 1000],
    [-5, 1],
    ["abc", 200],
    [undefined, 200],
    [25, 25],
  ]) {
    world.sendCalls.length = 0;
    await send(given === undefined ? {} : { limit: given });
    assert.equal(world.sendCalls[0].limit, used, String(given));
    assert.equal(world.sendCalls[0].resume, true);
  }
  assert.equal((await call("POST", "/revit@9.9.9/send", { body: {} })).status, 404);
});

/* ═════════════════════════════════════════════ retry-failed and cancel ══ */

test("retry-failed puts failed rows back and reopens a finished notice", async () => {
  world.ses = stubSes({ failFor: (m) => (m.to[0] === "user2@firm.test" ? sesErr("BadRequestException", "Illegal address") : null) });
  const first = await send();
  assert.equal(first.json.status, "done");
  assert.equal(first.json.counts.failed, 1);

  const r = await call("POST", `/${encodeURIComponent(KEY)}/retry-failed`, { body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.requeued, 1);
  assert.equal(world.store.notices.get(KEY).status, "sending");

  world.ses = stubSes();
  const again = await send();
  assert.equal(again.json.counts.sent, 3);
  assert.deepEqual(world.ses.calls.map((m) => m.to[0]), ["user2@firm.test"]);
});

test("cancel stops an open notice, and a second cancel is a 409", async () => {
  const r = await call("POST", `/${encodeURIComponent(KEY)}/cancel`, { body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "cancelled");
  assert.match(world.store.notices.get(KEY).cancelledReason, /admin1@adlm\.test/);

  const again = await call("POST", `/${encodeURIComponent(KEY)}/cancel`, { body: {} });
  assert.equal(again.status, 409);

  const retry = await call("POST", `/${encodeURIComponent(KEY)}/retry-failed`, { body: {} });
  assert.equal(retry.status, 409);

  const sent = await send();
  assert.equal(sent.json.skipped, true);
  assert.equal(world.ses.calls.length, 0);
});

/* ═══════════════════════════════════════════ manual announcements, reads ══ */

test("a manual announcement: 409 for a version already announced however it is spelt, 409 for a pulled build, 400 for nonsense", async () => {
  const dup = await call("POST", "/", { body: { productKey: "revit", version: "3.1.11.0" } });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, "already-announced");
  assert.equal(dup.json.key, KEY);

  const pulled = await call("POST", "/", { body: { productKey: "mep", version: "1.8.4" } });
  assert.equal(pulled.status, 409);
  assert.equal(pulled.json.code, "not-downloadable");

  assert.equal((await call("POST", "/", { body: { productKey: "revit", version: "latest" } })).status, 400);

  world.store.deployments.set("rategen", put("2.9.1", { productKey: "rategen" }));
  const made = await call("POST", "/", { body: { productKey: "rategen", version: "2.9.1" } });
  assert.equal(made.status, 201);
  assert.equal(made.json.key, "rategen@2.9.1");
  assert.match(made.json.note, /Nothing has been sent/);
  assert.equal(world.ses.calls.length, 0);
});

test("reads: the list with live counts, one notice with its failed and in-flight rows", async () => {
  await send({ limit: 1 });
  const list = await call("GET", "/");
  assert.equal(list.status, 200);
  assert.equal(list.json.items.length, 1);
  assert.equal(list.json.items[0].counts.sent, 1);

  const one = await call("GET", `/${encodeURIComponent(KEY)}`);
  assert.equal(one.status, 200);
  assert.equal(one.json.key, KEY);
  assert.equal(one.json.counts.pending, 2);
  assert.deepEqual(one.json.failed, []);
  assert.deepEqual(one.json.inFlight, []);

  assert.equal((await call("GET", "/revit@0.0.1")).status, 404);
});
