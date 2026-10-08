// server/util/campaignSend.test.js
//
// The campaign send, run against an in-memory store with the same rules as
// mongoStore: the EmailSend ledger is written by the (fake) mailer exactly as
// sendMail writes it, finishing only touches a campaign still at "sending",
// and the lock is one atomic check-and-set. No database, no SES.
//
// Pinned: who is skipped and why; nobody in the ledger is mailed again; a
// campaign is never "sent" while anybody is left; the figures come from the
// ledger; the 1 Oct 2026 price campaign (453 delivered, stuck at "sending")
// is finished without a single message; a deadline stops new sends; and two
// sweeps cannot both work one campaign.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAudience,
  finalizeCampaign,
  runCampaignSend,
  sweepStalledCampaigns,
  STALE_MS,
} from "./campaignSend.js";

const MIN = 60 * 1000;
const silent = { log() {}, warn() {}, error() {} };

function person(i, over = {}) {
  return {
    _id: `u${i}`,
    email: `Person${i}@Example.com`,
    firstName: `P${i}`,
    emailVerified: true,
    emailPrefs: { marketing: true },
    ...over,
  };
}

/** A store with the same rules as mongoStore, held in memory. */
function memoryStore({ campaigns = [], people = [], ledger = [] } = {}) {
  const db = {
    campaigns: new Map(campaigns.map((c) => [String(c._id), { failedIds: [], ...c }])),
    people,
    ledger: [...ledger], // { to, campaign, at }
    audits: [],
  };
  const store = {
    db,
    loadCampaign: async (id) => {
      const c = db.campaigns.get(String(id));
      return c ? structuredClone(c) : null;
    },
    audience: async () => db.people,
    sentAddresses: async (id) =>
      new Set(db.ledger.filter((r) => r.campaign === String(id)).map((r) => r.to.toLowerCase())),
    countSent: async (id) => db.ledger.filter((r) => r.campaign === String(id)).length,
    recordFailures: async (id, ids) => {
      const c = db.campaigns.get(String(id));
      c.failedIds = [...new Set([...(c.failedIds || []), ...ids])];
    },
    finalize: async (id, set) => {
      const c = db.campaigns.get(String(id));
      if (!c || c.status !== "sending") return false;
      Object.assign(c, set);
      return true;
    },
    claimAudit: async (id, at) => {
      const c = db.campaigns.get(String(id));
      if (c.auditedAt) return false;
      c.auditedAt = at;
      return true;
    },
    sendingCampaigns: async () =>
      [...db.campaigns.values()].filter((c) => c.status === "sending").map((c) => structuredClone(c)),
    latestProgress: async (c) => {
      const rows = db.ledger.filter((r) => r.campaign === String(c._id));
      if (!rows.length) return c.updatedAt;
      return new Date(Math.max(...rows.map((r) => r.at.getTime())));
    },
    // Synchronous between the check and the set, like one findOneAndUpdate.
    takeLock: async (id, now, until, extra = {}) => {
      const c = db.campaigns.get(String(id));
      if (!c || c.status !== "sending") return null;
      if (c.sweepLockedUntil && c.sweepLockedUntil > now) return null;
      c.sweepLockedUntil = until;
      Object.assign(c, extra);
      return structuredClone(c);
    },
    releaseLock: async (id, until) => {
      const c = db.campaigns.get(String(id));
      if (c && c.sweepLockedUntil?.getTime() === until.getTime()) c.sweepLockedUntil = null;
    },
  };
  return store;
}

/** A mailer that logs to the ledger the way sendMail does, lower-casing `to`. */
function fakeMailer(store, { failFor = [], clock = null, stepMs = 0, delayMs = 0 } = {}) {
  const sent = [];
  const sendMail = async ({ to, track }) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (failFor.includes(to)) throw new Error("SES said no");
    sent.push(to);
    if (clock) clock.t += stepMs;
    store.db.ledger.push({
      to: String(to).trim().toLowerCase(),
      campaign: track.campaign,
      at: new Date(clock ? clock.t : Date.now()),
    });
  };
  return { sendMail, sent };
}

const pacing = async () => ({ concurrency: 3, ratePerSecond: 0 });

function campaign(over = {}) {
  return {
    _id: "c1",
    subject: "New ADLM prices",
    body: "Hello",
    audience: "everyone",
    status: "sending",
    stats: { audience: 0 },
    sentByEmail: "admin@example.com",
    updatedAt: new Date(Date.now() - 6 * 24 * 60 * MIN),
    ...over,
  };
}

/* ─────────────────────────────────────────────────────────── classify ── */

test("opted out, unverified and mailable are told apart exactly as the route did", () => {
  const r = classifyAudience([
    person(1),
    person(2, { emailPrefs: { marketing: false } }),
    // Opted out wins over unverified: both are skipped, counted once.
    person(3, { emailPrefs: { marketing: false }, emailVerified: false }),
    person(4, { emailVerified: false }),
    person(5, { emailPrefs: undefined }),
  ]);
  assert.equal(r.optedOut, 2);
  assert.equal(r.unverified, 1);
  assert.deepEqual(r.mailable.map((u) => u._id), ["u1", "u5"]);
});

/* ──────────────────────────────────────────────────────────── resuming ── */

test("people already in the ledger are skipped, whatever the case of their address", async () => {
  const people = [person(1), person(2), person(3)];
  const store = memoryStore({
    campaigns: [campaign()],
    people,
    ledger: [{ to: "person1@example.com", campaign: "c1", at: new Date() }],
  });
  const { sendMail, sent } = fakeMailer(store);
  const r = await runCampaignSend(await store.loadCampaign("c1"), {
    store,
    sendMail,
    pacing,
    writeAudit: async () => {},
    log: silent,
  });
  assert.deepEqual(sent.sort(), ["Person2@Example.com", "Person3@Example.com"]);
  assert.equal(r.finalized, true);
  assert.equal(r.stats.sent, 3);
});

test("a ledger row for ANOTHER campaign does not count as having this one", async () => {
  const store = memoryStore({
    campaigns: [campaign()],
    people: [person(1)],
    ledger: [{ to: "person1@example.com", campaign: "c0", at: new Date() }],
  });
  const { sendMail, sent } = fakeMailer(store);
  await runCampaignSend(await store.loadCampaign("c1"), {
    store, sendMail, pacing, writeAudit: async () => {}, log: silent,
  });
  assert.deepEqual(sent, ["Person1@Example.com"]);
});

/* ─────────────────────────────────────────────────────────── finishing ── */

test("finishing refuses 'sent' while anybody mailable has not had it", async () => {
  const store = memoryStore({
    campaigns: [campaign()],
    people: [person(1), person(2)],
    ledger: [{ to: "person1@example.com", campaign: "c1", at: new Date() }],
  });
  const audits = [];
  const r = await finalizeCampaign("c1", { store, writeAudit: async (a) => audits.push(a) });
  assert.equal(r.finalized, false);
  assert.equal(r.remaining, 1);
  assert.equal(store.db.campaigns.get("c1").status, "sending");
  assert.equal(audits.length, 0);
});

test("finishing takes its figures from the ledger and the record, and audits once", async () => {
  const sentAt = new Date("2026-10-01T09:00:00Z");
  const store = memoryStore({
    campaigns: [campaign({ stats: { audience: 6 }, failedIds: ["u4"], sentAt })],
    people: [
      person(1),
      person(2),
      person(3, { emailPrefs: { marketing: false } }),
      person(4),
      person(5, { emailVerified: false }),
      person(6, { emailVerified: false }),
    ],
    ledger: [
      { to: "person1@example.com", campaign: "c1", at: new Date() },
      { to: "person2@example.com", campaign: "c1", at: new Date() },
    ],
  });
  const audits = [];
  const writeAudit = async (a) => audits.push(a);
  const r = await finalizeCampaign("c1", { store, writeAudit });
  assert.equal(r.finalized, true);
  const c = store.db.campaigns.get("c1");
  assert.equal(c.status, "sent");
  assert.equal(c.sentAt.getTime(), sentAt.getTime(), "an existing sentAt is kept");
  assert.deepEqual(c.stats, {
    audience: 6,
    sent: 2,
    skippedOptedOut: 1,
    skippedUnverified: 2,
    failed: 1,
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "campaign.send");
  assert.equal(audits[0].actorEmail, "admin@example.com");
  assert.deepEqual(
    { sent: audits[0].meta.sent, failed: audits[0].meta.failed },
    { sent: 2, failed: 1 },
  );

  // A second call finds it already sent and writes nothing more.
  const again = await finalizeCampaign("c1", { store, writeAudit });
  assert.equal(again.finalized, false);
  assert.equal(audits.length, 1);
});

test("a failure is counted once across runs and is not retried", async () => {
  const store = memoryStore({ campaigns: [campaign()], people: [person(1), person(2)] });
  const { sendMail, sent } = fakeMailer(store, { failFor: ["Person2@Example.com"] });
  const opts = { store, sendMail, pacing, writeAudit: async () => {}, log: silent };
  const r = await runCampaignSend(await store.loadCampaign("c1"), opts);
  assert.equal(r.finalized, true);
  assert.equal(r.stats.failed, 1);
  assert.equal(r.stats.sent, 1);
  assert.deepEqual(sent, ["Person1@Example.com"]);
});

/* ─────────────────────────────────────────────────── the 1 Oct campaign ── */

test("the stuck price campaign: 453 in the ledger, at 'sending', is finished with nothing sent", async () => {
  const people = [];
  for (let i = 0; i < 453; i++) people.push(person(i));
  // A few skipped people in the same audience, as there were.
  people.push(person(900, { emailPrefs: { marketing: false } }));
  people.push(person(901, { emailVerified: false }));
  const day = new Date("2026-10-01T10:00:00Z");
  const store = memoryStore({
    campaigns: [
      campaign({
        _id: "6abe50ae95eb07ca5fc0491a",
        stats: { audience: 455, sent: 0, skippedOptedOut: 0, skippedUnverified: 0, failed: 0 },
        updatedAt: day,
        sentByEmail: "",
      }),
    ],
    people,
    ledger: people.slice(0, 453).map((u) => ({
      to: u.email.toLowerCase(),
      campaign: "6abe50ae95eb07ca5fc0491a",
      at: day,
    })),
  });
  const { sendMail, sent } = fakeMailer(store);
  const audits = [];
  const out = await sweepStalledCampaigns({
    deadlineMs: 4 * MIN,
    store,
    sendMail,
    pacing,
    writeAudit: async (a) => audits.push(a),
    log: silent,
  });

  assert.equal(sent.length, 0, "not one message");
  const c = store.db.campaigns.get("6abe50ae95eb07ca5fc0491a");
  assert.equal(c.status, "sent");
  assert.equal(c.stats.sent, 453);
  assert.equal(c.stats.skippedOptedOut, 1);
  assert.equal(c.stats.skippedUnverified, 1);
  assert.equal(c.stats.failed, 0);
  assert.equal(c.stats.audience, 455);
  assert.equal(audits.length, 1, "the missing audit entry is written");
  assert.equal(c.sweepLockedUntil, null, "the lock is let go");
  assert.equal(out.results[0].finalized, true);
});

/* ──────────────────────────────────────────────────────────── deadline ── */

test("a deadline stops new sends, leaves the rest, and does not mark it sent", async () => {
  const clock = { t: Date.parse("2026-10-07T10:00:00Z") };
  const now = () => clock.t;
  const people = [];
  for (let i = 0; i < 10; i++) people.push(person(i));
  const store = memoryStore({ campaigns: [campaign()], people });
  // Each send moves the clock a minute; the run has three and a half.
  const { sendMail, sent } = fakeMailer(store, { clock, stepMs: MIN });
  const r = await runCampaignSend(await store.loadCampaign("c1"), {
    deadlineAt: clock.t + 3.5 * MIN,
    store,
    sendMail,
    pacing: async () => ({ concurrency: 1, ratePerSecond: 0 }),
    now,
    writeAudit: async () => {},
    log: silent,
  });
  assert.equal(sent.length, 4, "sends that had started before the deadline finish");
  assert.equal(r.left, 6);
  assert.equal(r.finalized, false);
  assert.equal(store.db.campaigns.get("c1").status, "sending");

  // The next run picks up the six, and only the six.
  const again = await runCampaignSend(await store.loadCampaign("c1"), {
    deadlineAt: clock.t + 60 * MIN,
    store,
    sendMail,
    pacing,
    now,
    writeAudit: async () => {},
    log: silent,
  });
  assert.equal(sent.length, 10);
  assert.equal(new Set(sent).size, 10, "nobody twice");
  assert.equal(again.finalized, true);
  assert.equal(store.db.campaigns.get("c1").stats.sent, 10);
});

/* ─────────────────────────────────────────────────────────────── sweep ── */

test("two sweeps at once: one works the campaign, the other is locked out", async () => {
  const people = [];
  for (let i = 0; i < 12; i++) people.push(person(i));
  const store = memoryStore({ campaigns: [campaign()], people });
  const { sendMail, sent } = fakeMailer(store, { delayMs: 2 });
  const opts = { deadlineMs: 4 * MIN, store, sendMail, pacing, writeAudit: async () => {}, log: silent };
  const [a, b] = await Promise.all([sweepStalledCampaigns(opts), sweepStalledCampaigns(opts)]);
  const outcomes = [a.results[0], b.results[0]];
  assert.equal(outcomes.filter((r) => r.skipped === "locked").length, 1);
  assert.equal(outcomes.filter((r) => r.finalized === true).length, 1);
  assert.equal(sent.length, 12);
  assert.equal(new Set(sent).size, 12, "nobody twice");
});

test("a held lock (the route's own run) keeps the sweep away", async () => {
  const store = memoryStore({
    campaigns: [campaign({ sweepLockedUntil: new Date(Date.now() + 5 * MIN) })],
    people: [person(1)],
  });
  const { sendMail, sent } = fakeMailer(store);
  const out = await sweepStalledCampaigns({
    deadlineMs: 4 * MIN, store, sendMail, pacing, writeAudit: async () => {}, log: silent,
  });
  assert.equal(out.results[0].skipped, "locked");
  assert.equal(sent.length, 0);
});

test("a campaign that moved in the last ten minutes is left alone", async () => {
  const store = memoryStore({
    campaigns: [campaign({ updatedAt: new Date(Date.now() - 20 * MIN) })],
    people: [person(1), person(2)],
    ledger: [{ to: "person1@example.com", campaign: "c1", at: new Date(Date.now() - STALE_MS / 2) }],
  });
  const { sendMail, sent } = fakeMailer(store);
  const out = await sweepStalledCampaigns({
    deadlineMs: 4 * MIN, store, sendMail, pacing, writeAudit: async () => {}, log: silent,
  });
  assert.equal(out.results[0].skipped, "still moving");
  assert.equal(sent.length, 0);
});

test("a send started more than two weeks ago is not resumed", async () => {
  const store = memoryStore({
    campaigns: [campaign({ sendStartedAt: new Date(Date.now() - 20 * 24 * 60 * MIN) })],
    people: [person(1)],
  });
  const { sendMail, sent } = fakeMailer(store);
  const out = await sweepStalledCampaigns({
    deadlineMs: 4 * MIN, store, sendMail, pacing, writeAudit: async () => {}, log: silent,
  });
  assert.equal(out.results[0].skipped, "too old to resume");
  assert.equal(sent.length, 0);
});

test("campaigns that are not at 'sending' are never touched", async () => {
  const store = memoryStore({
    campaigns: [campaign({ status: "sent" }), campaign({ _id: "c2", status: "draft" })],
    people: [person(1)],
  });
  const { sendMail, sent } = fakeMailer(store);
  const out = await sweepStalledCampaigns({
    deadlineMs: 4 * MIN, store, sendMail, pacing, writeAudit: async () => {}, log: silent,
  });
  assert.equal(out.checked, 0);
  assert.equal(sent.length, 0);
});
