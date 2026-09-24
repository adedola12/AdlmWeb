// server/util/videoNotifier.integration.test.js
//
// The half the unit tests cannot reach: announceVideo against a real Mongo.
//
// WHY THIS IS SEPARATE AND OPT-IN
//
// It needs a database, and `npm test` must keep working on a laptop with no
// Mongo running and in CI with no secrets. So it skips itself unless VIDEO_IT=1
// is set, and it refuses to run against the production database name — the
// whole file writes and deletes, and a guard you can defeat by forgetting is
// not a guard.
//
//   AUTH_DB=adlmWeb_videotest VIDEO_IT=1 node --test util/videoNotifier.integration.test.js
//
// WHAT IT IS ACTUALLY FOR
//
// One thing above all: proving a video cannot be announced twice. Everything
// else here is recoverable — a wrong count can be recounted, a failed address
// can be retried. A second mailshot to the whole customer base cannot be taken
// back, and the claim that prevents it is an atomic findOneAndUpdate whose
// behaviour under a second caller is exactly the thing a unit test with a
// mocked ODM would assert into existence rather than verify.

// Loads server/.env, so MONGO_URI does not have to be exported by hand. It did
// have to be, once — which meant the suite passed for whoever had exported it
// and failed with "MONGO_URI is not set" for everybody else, including the
// second time I ran it myself.
import "dotenv/config";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const RUN = process.env.VIDEO_IT === "1";
const DB = process.env.AUTH_DB || "";

// Refusing loudly rather than skipping quietly: somebody who set VIDEO_IT=1 and
// got a silent pass would believe this ran.
if (RUN && (!DB || DB === "adlmWeb")) {
  throw new Error(
    "Set AUTH_DB to a throwaway database name (not adlmWeb). This file writes and deletes.",
  );
}

const opts = { skip: RUN ? false : "set VIDEO_IT=1 and AUTH_DB=<throwaway> to run" };

let Video;
let User;
let announceVideo;

const VIDEO_ID = "itest0000001";

before(async () => {
  if (!RUN) return;
  const { connectDB } = await import("../db.js");
  await connectDB(process.env.MONGO_URI);
  assert.notEqual(mongoose.connection.name, "adlmWeb", "refusing to touch production");

  ({ Video } = await import("../models/Video.js"));
  ({ User } = await import("../models/User.js"));
  ({ announceVideo } = await import("./videoNotifier.js"));
});

after(async () => {
  if (!RUN) return;
  await Video.deleteMany({});
  await User.deleteMany({});
  await mongoose.disconnect();
});

beforeEach(async () => {
  if (!RUN) return;
  delete process.env.DRY_RUN;
  await Video.deleteMany({});
  await User.deleteMany({});

  await User.create([
    { email: "one@x.test", firstName: "One", emailVerified: true },
    { email: "two@x.test", firstName: "Two", emailVerified: true },
    { email: "three@x.test", firstName: "Three", emailVerified: true },
    // Skipped, and each for a different reason, so the counts can be told apart.
    { email: "out@x.test", firstName: "Out", emailVerified: true, emailPrefs: { videoUpdates: false } },
    { email: "unv@x.test", firstName: "Unv", emailVerified: false },
    { email: "off@x.test", firstName: "Off", emailVerified: true, disabled: true },
  ]);

  await Video.create({
    videoId: VIDEO_ID,
    title: "Integration video",
    description: "First sentence. Second sentence. Third.",
    thumbnailUrl: "https://i.ytimg.com/vi/x/hq.jpg",
    publishedAt: new Date(),
  });
});

/** A transport that records, and optionally fails for certain addresses. */
const recorder = (failFor = []) => {
  const sent = [];
  const fn = async (message) => {
    if (failFor.includes(message.to)) throw new Error("invalid email address");
    sent.push(message.to);
  };
  fn.sent = sent;
  return fn;
};

const quiet = { log() {}, error() {}, warn() {} };
const noPause = async () => {};

/* ─────────────────────────────────────────────────────────── the happy path ── */

test("it mails the eligible, skips the rest, and records why", opts, async () => {
  const send = recorder();
  const out = await announceVideo(VIDEO_ID, { send, log: quiet, pause: noPause });

  assert.deepEqual(send.sent.sort(), ["one@x.test", "three@x.test", "two@x.test"]);
  assert.equal(out.sent, 3);
  assert.equal(out.failed, 0);
  assert.equal(out.skippedOptedOut, 1);
  assert.equal(out.skippedUnverified, 1);
  // The disabled account is excluded outright and is NOT in any skipped figure:
  // a closed account is not somebody who opted out.
  assert.equal(out.recipients, 3);

  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.ok(row.notifiedAt, "notifiedAt is stamped");
  assert.equal(row.stats.sent, 3);
  assert.equal(row.stats.skippedOptedOut, 1);
});

/* ────────────────────────────────────────────────── the thing that must hold ── */

test("announcing the same video twice sends nothing the second time", opts, async () => {
  const first = recorder();
  await announceVideo(VIDEO_ID, { send: first, log: quiet, pause: noPause });
  assert.equal(first.sent.length, 3);

  const second = recorder();
  const out = await announceVideo(VIDEO_ID, { send: second, log: quiet, pause: noPause });

  assert.equal(second.sent.length, 0, "NOBODY is mailed a second time");
  assert.equal(out.skipped, true);
  assert.equal(out.reason, "already-notified");
});

test("two callers racing the same video: exactly one of them sends", opts, async () => {
  // The real shape of the risk — a retried Lambda invocation arriving while the
  // poller is still going, or an admin pressing the button at that moment.
  // Sequential assertions would pass against a check-then-write that this
  // catches.
  const a = recorder();
  const b = recorder();

  const [ra, rb] = await Promise.all([
    announceVideo(VIDEO_ID, { send: a, log: quiet, pause: noPause }),
    announceVideo(VIDEO_ID, { send: b, log: quiet, pause: noPause }),
  ]);

  const total = a.sent.length + b.sent.length;
  assert.equal(total, 3, `exactly one caller sent; got ${a.sent.length} + ${b.sent.length}`);
  assert.equal([ra, rb].filter((r) => r.skipped).length, 1, "the loser did nothing");
});

/* ───────────────────────────────────────────────────────── failures and resend ── */

test("a bad address does not stop the run, and is stored for retry", opts, async () => {
  const send = recorder(["two@x.test"]);
  const out = await announceVideo(VIDEO_ID, { send, log: quiet, pause: noPause });

  assert.equal(out.sent, 2);
  assert.equal(out.failed, 1);
  assert.deepEqual(send.sent.sort(), ["one@x.test", "three@x.test"]);

  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.deepEqual(row.failedRecipients, ["two@x.test"]);
});

test("a resend goes only to the failures, and ADDS to the record", opts, async () => {
  await announceVideo(VIDEO_ID, {
    send: recorder(["two@x.test"]),
    log: quiet,
    pause: noPause,
  });

  const retry = recorder();
  const out = await announceVideo(VIDEO_ID, {
    send: retry,
    only: ["two@x.test"],
    log: quiet,
    pause: noPause,
  });

  assert.deepEqual(retry.sent, ["two@x.test"], "only the one that failed");
  assert.equal(out.sent, 3, "2 from the first run plus 1 now — not 1");

  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.equal(row.stats.recipients, 3, "still the original audience, not 1");
  assert.equal(row.stats.sent, 3);
  assert.equal(row.stats.failed, 0);
  assert.equal(row.stats.skippedOptedOut, 1, "the consent figures survive a resend");
  assert.deepEqual(row.failedRecipients, [], "cleared now they have gone through");
});

/* ────────────────────────────────────────────────────────────────── dry run ── */

test("a dry run sends nothing and leaves the video unclaimed", opts, async () => {
  process.env.DRY_RUN = "true";
  const send = recorder();
  const out = await announceVideo(VIDEO_ID, { send, log: quiet, pause: noPause });

  assert.equal(send.sent.length, 0, "the transport was never called");
  assert.equal(out.dryRun, true);
  assert.equal(out.recipients, 3, "but the real audience was resolved");

  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.equal(row.notifiedAt, null, "the claim was handed back");

  // The point of handing it back: the real run must still work afterwards.
  delete process.env.DRY_RUN;
  const real = recorder();
  await announceVideo(VIDEO_ID, { send: real, log: quiet, pause: noPause });
  assert.equal(real.sent.length, 3, "a dry run did not consume the announcement");
});

test("a dry run of a RESEND does not erase the addresses it exists to retry", opts, async () => {
  // The bug this is here for: a dry run always "succeeds", so writing its empty
  // failure list back would wipe the very addresses the resend was for.
  await announceVideo(VIDEO_ID, {
    send: recorder(["two@x.test"]),
    log: quiet,
    pause: noPause,
  });

  process.env.DRY_RUN = "true";
  await announceVideo(VIDEO_ID, {
    send: recorder(),
    only: ["two@x.test"],
    log: quiet,
    pause: noPause,
  });

  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.deepEqual(row.failedRecipients, ["two@x.test"], "still there to retry");
  assert.ok(row.notifiedAt, "and the video is still marked announced");
});

/* ───────────────────────────────────────────────────── the poll writes nothing ── */

test("a dry run of the POLL does not file anything", opts, async () => {
  // Found by running it for real against the live channel: the poll wrote its
  // rows before ever reaching announceVideo, which is the only thing that had
  // been taught about DRY_RUN. So a "dry run" filed fifteen videos and marked
  // every one notified — permanently deciding that the back catalogue would
  // never be announced — while the wrapper printed "nothing was written".
  const { runVideoPoll } = await import("./videoNotifier.js");
  await Video.deleteMany({});

  process.env.DRY_RUN = "true";
  const out = await runVideoPoll({ log: quiet });

  // No key in CI, and that is fine: the assertion that matters is that the
  // collection is untouched either way.
  assert.equal(await Video.countDocuments(), 0, "the collection is still empty");
  if (!out.skipped) {
    assert.equal(out.dryRun, true);
    assert.equal(out.announced, 0);
  }
});

/* ──────────────────────────────────────────────────────────────── edge cases ── */

test("a video that is not in the collection announces nothing", opts, async () => {
  const send = recorder();
  const out = await announceVideo("nosuchvideo", { send, log: quiet, pause: noPause });
  assert.equal(send.sent.length, 0);
  assert.equal(out.skipped, true);
});

test("an audience of nobody is not an error", opts, async () => {
  await User.deleteMany({});
  const send = recorder();
  const out = await announceVideo(VIDEO_ID, { send, log: quiet, pause: noPause });

  assert.equal(send.sent.length, 0);
  assert.equal(out.sent, 0);
  const row = await Video.findOne({ videoId: VIDEO_ID }).lean();
  assert.ok(row.notifiedAt, "it still counts as announced — there was nobody to tell");
});
