// Telling everybody about a new video.
//
// THE ONE THING THAT MUST NOT HAPPEN
//
// Sending twice. Every other failure here is recoverable — a batch that fails
// can be retried, an address that bounces can be fixed, a run that dies
// halfway leaves a record of where it got to. A second mailshot about the same
// video cannot be taken back, and it is the failure a customer actually
// notices.
//
// So the video is CLAIMED before a single message goes out: one atomic
// findOneAndUpdate that only matches while notifiedAt is still null. Whoever
// wins that write owns the send; everybody else — a second poller, a retried
// Lambda invocation, an admin pressing the manual button at the same moment —
// gets null back and does nothing. This is the same reasoning as the ledger in
// models/Broadcast.js, reduced to the one row this feature needs.
//
// The cost of claiming first is that a run which dies mid-send leaves some
// people unmailed and the video marked as done. That is the right way round.
// Some people missing one announcement is a disappointment; everybody getting
// it twice is a complaint, and the failed addresses are recorded so the gap
// can be closed deliberately from the admin screen rather than by a blind
// re-run.
//
// WHY THE FILTERING HAPPENS IN CODE AND NOT IN THE QUERY
//
// Opted-out and unverified addresses could be excluded in Mongo, and the run
// would be a little lighter. They are counted here instead so the admin screen
// can say "820 accounts, 60 of whom have opted out" rather than quietly
// showing 760 and leaving somebody hunting for the missing 60. A send that
// reached 760 of 820 is a fact about consent, not a fault. Same call the
// campaigns screen makes, for the same reason.

import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Video } from "../models/Video.js";
import { sendMail } from "./mailer.js";
import { newVideoMessage } from "./videoEmail.js";
import { mapWithPool } from "./sendPool.js";
import { isSesSelected, sendRatePerSecond } from "./sesTransport.js";
import { videoUnsubscribeUrl } from "./campaigns.js";
import { fetchRecentUploads, isConfigured, watchUrl } from "./youtubeFeed.js";

/** 50 per batch, per the brief. */
export const BATCH_SIZE = Number(process.env.VIDEO_BATCH_SIZE || 50);

/** Between batches, not between messages — see runBatches. */
export const BATCH_PAUSE_MS = Number(process.env.VIDEO_BATCH_PAUSE_MS || 2000);

/** Attempts per recipient, including the first. 1 disables retrying. */
export const MAX_ATTEMPTS = Number(process.env.VIDEO_SEND_ATTEMPTS || 3);

/**
 * Log the recipients, send nothing.
 *
 * Read at call time rather than captured at import: on Lambda the SSM secrets
 * land in process.env after this module could already have been loaded, and a
 * flag frozen at import would read as unset on the very first invocation.
 */
export const isDryRun = () =>
  /^(1|true|yes)$/i.test(String(process.env.DRY_RUN || "").trim());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How many messages to have in flight, and how fast to start them.
 *
 * Only SES gets the parallel treatment, and only because it will say what its
 * limit is. Everything else keeps the one-at-a-time pacing this job has always
 * used: a transport that cannot tell you its ceiling is a transport you find
 * the ceiling of by hitting it, in front of eight hundred customers.
 *
 * Concurrency is capped at the batch size because there is no point admitting
 * more workers than there is work in the batch they are draining.
 */
export async function sendPacing() {
  if (!isSesSelected()) return { concurrency: 1, ratePerSecond: 0 };
  const ratePerSecond = await sendRatePerSecond();
  const concurrency =
    Number(process.env.VIDEO_SEND_CONCURRENCY) ||
    Math.min(BATCH_SIZE, Math.max(1, Math.ceil(ratePerSecond)));
  return { concurrency, ratePerSecond };
}

/* ──────────────────────────────────────────────────────────── recipients ── */

/**
 * The accounts a video announcement could reach, before consent is considered.
 *
 * Disabled accounts are excluded here rather than counted as "skipped": a
 * closed account is not a person who opted out, and putting it in the skipped
 * figure would make the consent number wrong in the direction that flatters
 * us.
 */
export const audienceQuery = () =>
  User.find({ disabled: { $ne: true }, email: { $exists: true, $ne: "" } });

/** Why this person is or is not getting it. One place, so the tests can ask. */
export function classifyRecipient(user) {
  if (!user?.email) return "no-address";
  // An unverified address is one nobody has proved exists. Mailing it buys
  // nothing and costs sender reputation on the bounce.
  if (!user.emailVerified) return "unverified";
  // An address that already bounced permanently. Checked BEFORE the opt-out
  // so the counts stay meaningful: somebody whose mailbox was deleted has not
  // opted out of anything, and filing them under "opted out" would overstate
  // how many people asked us to stop.
  if (user.emailUndeliverable) return "undeliverable";
  // `!== false` and not `=== true`: an account created before the field
  // existed has no value at all, and must read as opted IN rather than being
  // silently dropped off the list.
  if (user.emailPrefs?.videoUpdates === false) return "opted-out";
  return "send";
}

export const isVideoRecipient = (user) => classifyRecipient(user) === "send";

/**
 * Split an audience into who gets it and why the rest do not.
 *
 * Deliberately returns the counts alongside the list. Every caller needs both,
 * and computing them separately is how the figure on the screen drifts from
 * the number of messages actually sent.
 */
export function splitAudience(users = []) {
  const recipients = [];
  const skipped = { optedOut: 0, unverified: 0, undeliverable: 0, noAddress: 0 };

  for (const u of users) {
    switch (classifyRecipient(u)) {
      case "send":
        recipients.push(u);
        break;
      case "opted-out":
        skipped.optedOut += 1;
        break;
      case "unverified":
        skipped.unverified += 1;
        break;
      case "undeliverable":
        skipped.undeliverable += 1;
        break;
      default:
        skipped.noAddress += 1;
    }
  }

  return { recipients, skipped };
}

/* ──────────────────────────────────────────────────────── new-video logic ── */

/**
 * Which of the videos YouTube just listed have never been seen.
 *
 * Pure, and the whole of the detection rule: a videoId absent from the known
 * set is new. Order is oldest-first in the return, because if three videos
 * went up between polls they should be announced in the order they were
 * published, not the order the playlist happens to list them.
 */
export function pickNewVideos(fromYouTube = [], knownIds = []) {
  const known = new Set(Array.from(knownIds, String));

  const fresh = [];
  const seen = new Set();
  for (const v of fromYouTube) {
    if (!v?.videoId || known.has(String(v.videoId))) continue;
    // The playlist can list the same id twice; the collection's unique index
    // would refuse the second, but failing a write is a worse way to find out.
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    fresh.push(v);
  }

  return fresh.sort(
    (a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0),
  );
}

/* ───────────────────────────────────────────────────────────── the sending ── */

/**
 * Errors worth trying again.
 *
 * A timeout, a 5xx or a rate limit is the provider having a moment and will
 * very likely succeed on the next attempt. A rejected address will be rejected
 * identically three times in a row — retrying it wastes two more requests and
 * delays everybody behind it in the batch.
 */
export function isTransient(err) {
  const m = String(err?.message || err || "").toLowerCase();
  if (/\b(invalid|not a valid|malformed|unverified sender|blocked|suppress)/.test(m)) {
    return false;
  }
  // `timed?\s*out` and not "timed out": Node reports these as ETIMEDOUT, one
  // word and no space, which a literal "timed out" misses entirely — and
  // missing it means the single most common transient failure is never
  // retried.
  return /timed?\s*out|econn|enotfound|eai_again|esockettimedout|socket|network|rate.?limit|too many|throttl|\b(429|500|502|503|504)\b|temporar|try again|unavailable/.test(
    m,
  );
}

async function sendOnce(send, message, attempt) {
  try {
    await send(message);
    return { ok: true, attempts: attempt };
  } catch (err) {
    return { ok: false, err, attempts: attempt };
  }
}

/**
 * One recipient, with retries for the failures that deserve them.
 *
 * Never throws. A run that stops because one address was bad is a run that
 * leaves the other 799 people unmailed, which is the thing the brief asks
 * against and the thing that actually happens if this returns a rejected
 * promise into a Promise.all.
 */
export async function sendWithRetry(send, message, { attempts = MAX_ATTEMPTS, pause = sleep } = {}) {
  let last;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    const r = await sendOnce(send, message, attempt);
    if (r.ok) return r;
    last = r;
    if (!isTransient(r.err) || attempt === attempts) break;
    // Backoff, so a provider that is rate limiting is not hammered by the
    // retry that was supposed to be polite about it.
    await pause(250 * 2 ** (attempt - 1));
  }
  return { ok: false, error: last?.err, attempts: last?.attempts ?? 1 };
}

/**
 * Mail everybody, fifty at a time.
 *
 * WHY BATCHES AND NOT ONE LONG LOOP
 *   A batch is a place to stop. The per-batch line in the log is what turns
 *   "the run failed" into "it failed after batch 9 of 17, on these addresses",
 *   and the pause between batches is what keeps a burst of 800 messages from
 *   reading as an attack to the provider.
 *
 * WHY THE SENDS INSIDE A BATCH ARE NOW PARALLEL
 *   They used to be sequential, and the reason given was that fifty concurrent
 *   requests is the shape that trips a rate limit. That was true of a reseller
 *   whose limit we could not ask about. SES tells us its per-second ceiling
 *   (see util/sesTransport.js), so the limit can be held directly instead of
 *   approximated by doing one thing at a time — which is both faster and more
 *   accurate about the thing it was protecting.
 *
 *   `concurrency: 1` with no rate limit is exactly the old behaviour, and it
 *   is still the default here: a caller that has not thought about the
 *   transport's limits gets the cautious version.
 *
 * `send` is injected so the tests can drive this without a provider, and so
 * DRY_RUN can pass a function that only logs.
 */
export async function runBatches({
  recipients,
  build,
  send,
  batchSize = BATCH_SIZE,
  pauseMs = BATCH_PAUSE_MS,
  pause = sleep,
  concurrency = 1,
  ratePerSecond = 0,
  label = "video",
  log = console,
}) {
  const failedRecipients = [];
  let sent = 0;
  let failed = 0;

  const size = Math.max(1, Number(batchSize) || 1);
  const total = Math.ceil(recipients.length / size);

  for (let i = 0; i < recipients.length; i += size) {
    const batch = recipients.slice(i, i + size);
    const n = Math.floor(i / size) + 1;

    let batchSent = 0;
    let batchFailed = 0;

    // Settled, in the order the recipients went in — so the failure log and
    // failedRecipients read the same way they did when this was a loop, even
    // though the sends themselves finished in whatever order they finished.
    const results = await mapWithPool(
      batch,
      (user) => sendWithRetry(send, build(user), { attempts: MAX_ATTEMPTS, pause }),
      { concurrency, ratePerSecond, sleep: pause },
    );

    results.forEach(({ value }, idx) => {
      const user = batch[idx];
      if (value?.ok) {
        batchSent += 1;
        return;
      }
      batchFailed += 1;
      failedRecipients.push(user.email);
      // The address is named because that is what makes the failure
      // actionable; the error is named because "failed" alone cannot
      // distinguish a typo from the provider being down.
      log.error?.(
        `[${label}] batch ${n}/${total} ${user.email}: ${value?.error?.message || value?.error}`,
      );
    });

    sent += batchSent;
    failed += batchFailed;
    log.log?.(`[${label}] batch ${n}/${total}: ${batchSent} sent, ${batchFailed} failed`);

    // No pause after the last batch — it would delay the summary for nothing.
    if (i + size < recipients.length && pauseMs > 0) await pause(pauseMs);
  }

  return { sent, failed, failedRecipients, batches: total };
}

/* ────────────────────────────────────────────────────────── the announce ── */

/** Capped: a thousand failures is a provider outage, and storing all thousand helps nobody. */
const MAX_STORED_FAILURES = 500;

function buildMessage(video) {
  const url = watchUrl(video.videoId);
  return (user) => {
    const optOut = videoUnsubscribeUrl(user._id);
    const m = newVideoMessage({
      firstName: user.firstName,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      videoUrl: url,
      unsubscribeUrl: optOut,
    });
    return {
      // The same URL the footer link uses, promoted into a header so the
      // "unsubscribe" button in Gmail's own chrome works. A list that is
      // genuinely easy to leave gets reported as spam far less often, which
      // is the reputation this whole migration depends on.
      listUnsubscribe: optOut,
      to: user.email,
      subject: m.subject,
      html: m.html,
      text: m.text,
      templateKey: "video.published",
    };
  };
}

/**
 * Announce one video, once.
 *
 * `only` restricts the send to a set of addresses — that is the "resend to
 * failed" path, and it is the one case that is allowed past the notifiedAt
 * guard, because the video has already been claimed and the point is to close
 * the gap the first run left.
 */
export async function announceVideo(
  videoId,
  { actor = "", only = null, send = sendMail, log = console, pause = sleep } = {},
) {
  const dryRun = isDryRun();
  const resend = Array.isArray(only);

  // Claim it. Anything but a fresh, unnotified video gets null back and this
  // returns without sending — which is the point.
  const claimed = resend
    ? await Video.findOne({ videoId })
    : await Video.findOneAndUpdate(
        { videoId, notifiedAt: null },
        { $set: { notifiedAt: new Date(), notifiedBy: actor || "" } },
        { new: true },
      );

  if (!claimed) {
    log.log?.(`[video-mail] ${videoId}: already announced, nothing to do`);
    return { ok: true, skipped: true, reason: "already-notified", videoId };
  }

  const all = await audienceQuery()
    .select("email firstName emailVerified emailPrefs emailUndeliverable")
    .lean();

  let { recipients, skipped } = splitAudience(all);

  if (resend) {
    const wanted = new Set(only.map((e) => String(e).trim().toLowerCase()));
    recipients = recipients.filter((u) => wanted.has(String(u.email).toLowerCase()));
  }

  log.log?.(
    `[video-mail] ${videoId} "${claimed.title}": ${recipients.length} to mail, ` +
      `${skipped.optedOut} opted out, ${skipped.unverified} unverified, ` +
      `${skipped.undeliverable} undeliverable` +
      (dryRun ? " — DRY RUN, nothing will be sent" : ""),
  );

  // DRY_RUN swaps the transport, not the code path. Everything above and
  // everything below runs exactly as it would for real, so a dry run proves
  // the audience and the template rather than proving that the dry-run branch
  // works.
  const transport = dryRun
    ? async (message) => {
        log.log?.(`[video-mail] DRY RUN would send to ${message.to}: ${message.subject}`);
      }
    : send;

  const { concurrency, ratePerSecond } = await sendPacing();
  if (concurrency > 1) {
    log.log?.(
      `[video-mail] ${videoId}: sending ${concurrency} at a time, up to ${ratePerSecond}/s`,
    );
  }

  const out = await runBatches({
    recipients,
    build: buildMessage(claimed),
    send: transport,
    pause,
    concurrency,
    ratePerSecond,
    label: "video-mail",
    log,
  });

  // A resend touches a handful of addresses out of hundreds, so it ADDS to the
  // record rather than replacing it. Overwriting would leave the screen saying
  // "3 recipients, 3 sent" about a video that went to 800 people, and the
  // consent figures beside it would be zero.
  const before = claimed.stats || {};
  const stats = resend
    ? {
        recipients: before.recipients ?? recipients.length,
        sent: (before.sent ?? 0) + out.sent,
        failed: out.failed,
        skippedOptedOut: before.skippedOptedOut ?? 0,
        skippedUnverified: before.skippedUnverified ?? 0,
        skippedUndeliverable: before.skippedUndeliverable ?? 0,
        dryRun: !!before.dryRun,
      }
    : {
        recipients: recipients.length,
        sent: out.sent,
        failed: out.failed,
        skippedOptedOut: skipped.optedOut,
        skippedUnverified: skipped.unverified,
        skippedUndeliverable: skipped.undeliverable,
        dryRun,
      };

  // A dry run writes NOTHING to the record. Two reasons, and the second is the
  // one that bites: a dry run must not leave the video marked as announced, or
  // the first real run finds it claimed and nobody is ever told — and a dry
  // run of a RESEND must not overwrite failedRecipients with the empty list a
  // dry run always produces, which would erase the very addresses it was about
  // to help retry.
  if (dryRun) {
    if (!resend) {
      await Video.updateOne({ videoId }, { $set: { notifiedAt: null, notifiedBy: "" } });
      log.log?.(`[video-mail] ${videoId}: DRY RUN, claim released`);
    }
  } else {
    await Video.updateOne(
      { videoId },
      {
        $set: {
          stats,
          failedRecipients: out.failedRecipients.slice(0, MAX_STORED_FAILURES),
          ...(resend ? {} : { source: actor ? "manual" : "poller" }),
        },
      },
    );
  }

  log.log?.(
    `[video-mail] ${videoId} done: ${out.sent} sent, ${out.failed} failed, ` +
      `${out.batches} batch(es)${dryRun ? " (dry run)" : ""}`,
  );

  return { ok: true, videoId, title: claimed.title, ...stats, batches: out.batches };
}

/* ───────────────────────────────────────────────────────────── the poller ── */

/* The same job lock the nightly jobs use. EventBridge Scheduler is
 * at-least-once, and this runs every fifteen minutes, so two overlapping runs
 * is a thing that will happen rather than a thing that might. The claim above
 * makes a double send impossible either way; the lock keeps two runs from
 * spending YouTube quota on the same question. */
async function acquireJobLock(lockId, ttlMinutes = 10) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const col = mongoose.connection.collection("job_locks");

  const upd = await col.findOneAndUpdate(
    { _id: lockId, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }] },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );
  if (upd) return true;

  try {
    await col.insertOne({ _id: lockId, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false;
  }
}

async function releaseJobLock(lockId) {
  try {
    await mongoose.connection.collection("job_locks").deleteOne({ _id: lockId });
  } catch {
    /* a lock left behind expires on its own; failing to release is not fatal */
  }
}

const LOCK = "video-poll";

/**
 * The fifteen-minute poll.
 *
 * WHY THE FIRST RUN DOES NOT MAIL ANYBODY
 *
 * On an empty collection every video on the channel is "new", and announcing a
 * back catalogue to the whole customer base is the single worst thing this
 * feature could do. So the first run files what it finds and announces none of
 * it — the collection is seeded, and the next upload is the first thing anyone
 * hears about. Set VIDEO_ANNOUNCE_ON_FIRST_RUN=true only if you actually mean
 * it.
 */
export async function runVideoPoll({ log = console } = {}) {
  if (!isConfigured()) {
    log.warn?.("[video-poll] YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID is not set; skipping");
    return { ok: true, skipped: true, reason: "not-configured" };
  }

  const gotLock = await acquireJobLock(LOCK);
  if (!gotLock) {
    log.warn?.("[video-poll] another run holds the lock; skipping");
    return { ok: true, skipped: true, reason: "lock-held" };
  }

  try {
    const uploads = await fetchRecentUploads(Number(process.env.VIDEO_POLL_LIMIT || 15));
    const ids = uploads.map((v) => v.videoId);

    const known = await Video.find({ videoId: { $in: ids } }).select("videoId").lean();
    const fresh = pickNewVideos(uploads, known.map((v) => v.videoId));

    if (!fresh.length) {
      return { ok: true, checked: uploads.length, found: 0, announced: 0 };
    }

    // Seeding, not announcing. See the note above.
    const isFirstRun = (await Video.estimatedDocumentCount()) === 0;
    const announceFirstRun = /^(1|true|yes)$/i.test(
      String(process.env.VIDEO_ANNOUNCE_ON_FIRST_RUN || "").trim(),
    );
    const seedOnly = isFirstRun && !announceFirstRun;

    /**
     * A dry run stops HERE, before the collection is touched.
     *
     * announceVideo has always honoured DRY_RUN, but this function writes
     * before it ever calls it — so a dry run of the poll filed fifteen videos
     * and marked every one of them notified, while the wrapper script printed
     * "nothing was written". It was not a harmless discrepancy: those rows are
     * what makes a video never be announced, so a preview quietly decided that
     * the entire back catalogue would never be mailed.
     *
     * Worse in the other direction. The point of a dry run is to be able to
     * look before committing, and a look that consumes the thing you were
     * deciding about is not a look.
     */
    if (isDryRun()) {
      log.warn?.(
        `[video-poll] DRY RUN: ${fresh.length} new video(s) found and NOT filed` +
          (seedOnly ? " (a real run here would seed and mail nobody)" : ""),
      );
      for (const v of fresh) log.log?.(`[video-poll] DRY RUN would file ${v.videoId} — ${v.title}`);
      return {
        ok: true,
        dryRun: true,
        checked: uploads.length,
        found: fresh.length,
        announced: 0,
        wouldSeed: seedOnly,
      };
    }

    // Written BEFORE anything is sent. A crash between seeing and sending
    // leaves a row with notifiedAt still null, so the next run sends it. The
    // other order would mean a crash loses the video silently and for good.
    for (const v of fresh) {
      await Video.updateOne(
        { videoId: v.videoId },
        {
          $setOnInsert: {
            ...v,
            source: "poller",
            ...(seedOnly ? { notifiedAt: new Date(), notifiedBy: "seed" } : {}),
          },
        },
        { upsert: true },
      );
    }

    if (seedOnly) {
      log.warn?.(
        `[video-poll] first run: filed ${fresh.length} existing video(s) without announcing. ` +
          "The next upload will be the first one mailed.",
      );
      return { ok: true, checked: uploads.length, found: fresh.length, announced: 0, seeded: true };
    }

    const results = [];
    for (const v of fresh) {
      results.push(await announceVideo(v.videoId, { log }));
    }

    return {
      ok: true,
      checked: uploads.length,
      found: fresh.length,
      announced: results.filter((r) => !r.skipped).length,
      results,
    };
  } finally {
    await releaseJobLock(LOCK);
  }
}

export default runVideoPoll;
