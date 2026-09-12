// server/util/videoNotifier.test.js
//
// Only the pure half is exercised here: detection, filtering, retry and the
// batch loop. announceVideo and runVideoPoll need a Mongo and belong to an
// integration run, and a unit test that mocks a whole ODM tests the mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRecipient,
  isTransient,
  isVideoRecipient,
  pickNewVideos,
  runBatches,
  sendWithRetry,
  splitAudience,
} from "./videoNotifier.js";

const quiet = { log() {}, error() {}, warn() {} };
const noPause = async () => {};

/* ─────────────────────────────────────────────────────── new-video detection ── */

const vid = (videoId, publishedAt) => ({ videoId, publishedAt, title: videoId });

test("a videoId not in the collection is new; one that is, is not", () => {
  const fresh = pickNewVideos(
    [vid("aaa", "2026-09-03"), vid("bbb", "2026-09-02"), vid("ccc", "2026-09-01")],
    ["bbb"],
  );
  assert.deepEqual(fresh.map((v) => v.videoId), ["ccc", "aaa"]);
});

test("nothing new is an empty list, not a null", () => {
  assert.deepEqual(pickNewVideos([vid("aaa")], ["aaa"]), []);
  assert.deepEqual(pickNewVideos([], ["aaa"]), []);
  assert.deepEqual(pickNewVideos(undefined, undefined), []);
});

test("three videos between polls are announced oldest first", () => {
  // The playlist lists newest first. Announcing in that order tells people
  // about Friday's video before Wednesday's.
  const fresh = pickNewVideos(
    [vid("fri", "2026-09-04T10:00:00Z"), vid("thu", "2026-09-03T10:00:00Z"), vid("wed", "2026-09-02T10:00:00Z")],
    [],
  );
  assert.deepEqual(fresh.map((v) => v.videoId), ["wed", "thu", "fri"]);
});

test("a duplicate in the playlist is only new once", () => {
  const fresh = pickNewVideos([vid("aaa", "2026-09-01"), vid("aaa", "2026-09-01")], []);
  assert.equal(fresh.length, 1);
});

test("an item with no videoId cannot be new", () => {
  assert.deepEqual(pickNewVideos([{ title: "no id" }, vid("aaa")], []).map((v) => v.videoId), ["aaa"]);
});

test("known ids are compared as strings, so ObjectId-ish values still match", () => {
  assert.deepEqual(pickNewVideos([vid("123")], [{ toString: () => "123" }]), []);
});

/* ──────────────────────────────────────────────────────── recipient filtering ── */

const verified = { email: "a@x.test", emailVerified: true };

test("verified and not opted out gets the mail", () => {
  assert.equal(isVideoRecipient(verified), true);
  assert.equal(isVideoRecipient({ ...verified, emailPrefs: { videoUpdates: true } }), true);
});

test("videoUpdates false is the only value that opts somebody out", () => {
  assert.equal(classifyRecipient({ ...verified, emailPrefs: { videoUpdates: false } }), "opted-out");
});

test("an account from before the field existed is opted IN", () => {
  // The whole reason the check is `!== false`. Written as `=== true` this
  // drops every account created before the migration, silently.
  assert.equal(classifyRecipient({ ...verified, emailPrefs: {} }), "send");
  assert.equal(classifyRecipient({ ...verified, emailPrefs: undefined }), "send");
  assert.equal(classifyRecipient({ ...verified, emailPrefs: { videoUpdates: undefined } }), "send");
  assert.equal(classifyRecipient({ ...verified, emailPrefs: { videoUpdates: null } }), "send");
});

test("an unverified address is not mailed, whatever its preference says", () => {
  assert.equal(classifyRecipient({ email: "a@x.test", emailVerified: false }), "unverified");
  assert.equal(classifyRecipient({ email: "a@x.test" }), "unverified");
  assert.equal(
    classifyRecipient({ email: "a@x.test", emailVerified: true, emailPrefs: { videoUpdates: false } }),
    "opted-out",
  );
});

test("opting out beats being unverified in the counts, and no address beats both", () => {
  assert.equal(classifyRecipient({ email: "", emailVerified: true }), "no-address");
  assert.equal(classifyRecipient({}), "no-address");
  assert.equal(classifyRecipient(null), "no-address");
});

test("the split gives back the list and the reasons together", () => {
  const { recipients, skipped } = splitAudience([
    { email: "in1@x.test", emailVerified: true },
    { email: "in2@x.test", emailVerified: true, emailPrefs: { videoUpdates: true } },
    { email: "out@x.test", emailVerified: true, emailPrefs: { videoUpdates: false } },
    { email: "unv@x.test", emailVerified: false },
    { email: "dead@x.test", emailVerified: true, emailUndeliverable: true },
    { email: "", emailVerified: true },
  ]);

  assert.deepEqual(recipients.map((u) => u.email), ["in1@x.test", "in2@x.test"]);
  assert.deepEqual(skipped, { optedOut: 1, unverified: 1, undeliverable: 1, noAddress: 1 });
  // The figures have to add up, or the admin screen lies about consent.
  assert.equal(
    recipients.length +
      skipped.optedOut +
      skipped.unverified +
      skipped.undeliverable +
      skipped.noAddress,
    6,
  );
});

test("an address that bounced permanently is not mailed, and is not called an opt-out", () => {
  // The distinction matters on the admin screen: "60 people asked us to stop"
  // and "60 mailboxes no longer exist" are the same number and completely
  // different news. Counting a dead mailbox as consent withdrawn would make
  // the studio look rejected when it has only been outlived.
  assert.equal(
    classifyRecipient({ email: "a@x.test", emailVerified: true, emailUndeliverable: true }),
    "undeliverable",
  );
  // Still undeliverable even where the preference says yes.
  assert.equal(
    classifyRecipient({
      email: "a@x.test",
      emailVerified: true,
      emailUndeliverable: true,
      emailPrefs: { videoUpdates: true },
    }),
    "undeliverable",
  );
  // An account from before the field existed must read as mailable.
  assert.equal(
    classifyRecipient({ email: "a@x.test", emailVerified: true, emailUndeliverable: undefined }),
    "send",
  );
});

/* ─────────────────────────────────────────────────────────────────── retry ── */

test("a timeout or a 429 is worth trying again; a bad address is not", () => {
  for (const m of ["socket timeout", "ETIMEDOUT", "429 Too Many Requests", "503 Service Unavailable", "rate limit exceeded", "ECONNRESET"]) {
    assert.equal(isTransient(new Error(m)), true, m);
  }
  for (const m of ["invalid email address", "recipient is not a valid address", "malformed to field", "address is suppressed"]) {
    assert.equal(isTransient(new Error(m)), false, m);
  }
});

test("a transient failure is retried and can succeed", async () => {
  let calls = 0;
  const send = async () => {
    calls += 1;
    if (calls < 3) throw new Error("ETIMEDOUT");
  };
  const r = await sendWithRetry(send, {}, { attempts: 3, pause: noPause });
  assert.equal(r.ok, true);
  assert.equal(calls, 3);
});

test("a permanent failure is not retried — it would fail identically", async () => {
  let calls = 0;
  const send = async () => {
    calls += 1;
    throw new Error("invalid email address");
  };
  const r = await sendWithRetry(send, {}, { attempts: 3, pause: noPause });
  assert.equal(r.ok, false);
  assert.equal(calls, 1, "one attempt, not three");
});

test("retries are bounded and the helper never throws", async () => {
  const send = async () => {
    throw new Error("ETIMEDOUT");
  };
  const r = await sendWithRetry(send, {}, { attempts: 3, pause: noPause });
  assert.equal(r.ok, false);
  assert.equal(r.error.message, "ETIMEDOUT");
});

/* ─────────────────────────────────────────────────────────── the batch loop ── */

const people = (n) =>
  Array.from({ length: n }, (_, i) => ({ email: `u${i}@x.test`, firstName: `U${i}` }));

test("everybody is mailed, fifty to a batch", async () => {
  const seen = [];
  const out = await runBatches({
    recipients: people(120),
    build: (u) => ({ to: u.email }),
    send: async (m) => void seen.push(m.to),
    pause: noPause,
    log: quiet,
  });

  assert.equal(out.sent, 120);
  assert.equal(out.failed, 0);
  assert.equal(out.batches, 3, "120 at 50 a batch is three batches");
  assert.equal(seen.length, 120);
  assert.equal(new Set(seen).size, 120, "nobody is mailed twice");
});

test("one bad address does not abort the run", async () => {
  // The requirement, stated directly. Before the per-recipient catch, a single
  // rejected send took the other 99 people with it.
  const send = async (m) => {
    if (m.to === "u7@x.test") throw new Error("invalid email address");
    if (m.to === "u60@x.test") throw new Error("invalid email address");
  };

  const out = await runBatches({
    recipients: people(100),
    build: (u) => ({ to: u.email }),
    send,
    pause: noPause,
    log: quiet,
  });

  assert.equal(out.sent, 98);
  assert.equal(out.failed, 2);
  assert.deepEqual(out.failedRecipients, ["u7@x.test", "u60@x.test"]);
});

test("per-batch success and failure counts are logged", async () => {
  const lines = [];
  await runBatches({
    recipients: people(60),
    build: (u) => ({ to: u.email }),
    send: async (m) => {
      if (m.to === "u0@x.test") throw new Error("invalid email address");
    },
    batchSize: 50,
    pause: noPause,
    log: { log: (l) => lines.push(l), error() {} },
  });

  assert.deepEqual(lines, [
    "[video] batch 1/2: 49 sent, 1 failed",
    "[video] batch 2/2: 10 sent, 0 failed",
  ]);
});

test("there is a pause between batches and none after the last", async () => {
  let pauses = 0;
  await runBatches({
    recipients: people(150),
    build: (u) => ({ to: u.email }),
    send: async () => {},
    batchSize: 50,
    pauseMs: 2000,
    pause: async () => {
      pauses += 1;
    },
    log: quiet,
  });
  // Three batches, two gaps. A fourth pause would delay the summary for nothing.
  assert.equal(pauses, 2);
});

test("an empty audience is a no-op, not a crash", async () => {
  const out = await runBatches({
    recipients: [],
    build: () => ({}),
    send: async () => assert.fail("must not send"),
    pause: noPause,
    log: quiet,
  });
  assert.deepEqual(
    { sent: out.sent, failed: out.failed, batches: out.batches, failedRecipients: out.failedRecipients },
    { sent: 0, failed: 0, batches: 0, failedRecipients: [] },
  );
});

test("each recipient gets their own message, built per user", async () => {
  const seen = [];
  await runBatches({
    recipients: people(3),
    build: (u) => ({ to: u.email, subject: `Hi ${u.firstName}` }),
    send: async (m) => void seen.push(m.subject),
    pause: noPause,
    log: quiet,
  });
  assert.deepEqual(seen, ["Hi U0", "Hi U1", "Hi U2"]);
});
