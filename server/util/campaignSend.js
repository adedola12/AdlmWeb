// server/util/campaignSend.js
//
// Sending a marketing campaign, in pieces that survive being cut off.
//
// WHY THIS IS NOT JUST THE ROUTE ANY MORE
//
// POST /admin/campaigns/:id/send answers at once and sends in the background.
// On a long-lived server that was fine. On Lambda it is not: once the response
// is out, nothing promises the rest of the work runs. On 1 Oct 2026 the price
// campaign reached all 453 mailable people (each one is in EmailSend), but the
// last step, marking it sent and writing the stats and the audit entry, never
// ran. The record sat at "sending" with 0 sent. On a bigger audience the sends
// themselves could have stopped halfway, with nothing to pick them up.
//
// So the send is now something that can be run again:
//
//   - EmailSend is the ledger. sendMail writes one row per delivered campaign
//     message (with `to` and `campaign`), so "who has this already" is a query,
//     and a resumed run skips those people. Nobody is mailed twice by a resume.
//   - Each run has a deadline and stops starting new sends when it passes. What
//     is left is left for the next run.
//   - Finishing is its own step, worked out from the ledger rather than from
//     counters held in memory, and it refuses to say "sent" while anybody who
//     should get the message has not.
//   - sweepStalledCampaigns, run by every scheduled invocation (scheduled.js),
//     finds a campaign stuck at "sending" with no progress for ten minutes,
//     takes a lock so two runs cannot both work it, and carries it on.
//
// WHY THE STORE IS INJECTED
//
// Every database call goes through `store` (mongoStore below by default), the
// same way util/releaseNotifier.js does it, so the tests can run the real send
// loop against an in-memory store: a resume that skips people, a deadline that
// stops a run, and two sweeps racing for one campaign.

import { Campaign } from "../models/Campaign.js";
import { EmailSend } from "../models/EmailSend.js";
import { sendMail as realSendMail } from "./mailer.js";
import { mapWithPool } from "./sendPool.js";
import { isSesSelected, sendRatePerSecond } from "./sesTransport.js";
import { marketingMessage } from "./emailContent.js";
import { writeAudit as realWriteAudit } from "./audit.js";
import { resolveAudience, unsubscribeUrl } from "./campaigns.js";

/* ───────────────────────────────────────────────────────────── settings ── */

/** No progress for this long, and a "sending" campaign is taken to be stalled. */
export const STALE_MS = 10 * 60 * 1000;

/**
 * How long the route's own run may keep starting sends. Long, because on
 * Lambda the background work only moves while the container is thawed, and
 * the lock it holds keeps the sweeper away until this has passed anyway.
 */
export const ROUTE_BUDGET_MS = Number(process.env.CAMPAIGN_SEND_BUDGET_MS || 10 * 60 * 1000);

/** The lock outlives the run's deadline by this, for the sends still in flight. */
export const LOCK_MARGIN_MS = 60 * 1000;

/**
 * A campaign that started sending longer ago than this is not resumed.
 * EmailSend rows expire after ninety days, and once the ledger is gone a
 * "resume" could not tell who already has the message. Two weeks is far
 * inside that, and a send that old needs a person to look at it anyway.
 */
export const MAX_RESUME_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * How fast a campaign goes out.
 *
 * CAMPAIGN_GAP_MS used to be a sleep between one send and the next. It is now
 * the pacing for a transport that cannot tell us its limit: 400ms between
 * sends is 2.5 a second, which is a guess. SES will say, so when SES carries
 * the mail the gap is replaced by its real per-second ceiling and as many
 * sends in flight as that ceiling can feed.
 */
const GAP_MS = Number(process.env.CAMPAIGN_GAP_MS || 400);

export async function campaignPacing() {
  if (!isSesSelected()) return { concurrency: 1, ratePerSecond: 1000 / GAP_MS };
  const ratePerSecond = await sendRatePerSecond();
  const concurrency =
    Number(process.env.CAMPAIGN_CONCURRENCY) || Math.max(1, Math.ceil(ratePerSecond));
  return { concurrency, ratePerSecond };
}

const lower = (s) => String(s || "").trim().toLowerCase();

/* ──────────────────────────────────────────────────────── who gets it ── */

/**
 * Split the audience into who gets it and who is skipped, and why.
 *
 * Consent is settled before a single message is queued, so the pool only ever
 * holds people who should actually receive this. An unverified address is one
 * nobody has proved exists: marketing to it buys nothing and costs sender
 * reputation on a bounce.
 */
export function classifyAudience(people = []) {
  const mailable = [];
  let optedOut = 0;
  let unverified = 0;
  for (const u of people) {
    if (u.emailPrefs?.marketing === false) optedOut++;
    else if (!u.emailVerified) unverified++;
    else mailable.push(u);
  }
  return { mailable, optedOut, unverified };
}

/** Mailable people not yet in the ledger and not already refused. */
function stillToSend(mailable, logged, failedIds) {
  return mailable.filter(
    (u) => !logged.has(lower(u.email)) && !failedIds.has(String(u._id)),
  );
}

/* ─────────────────────────────────────────────────────────── the store ── */

export const mongoStore = {
  loadCampaign: (id) => Campaign.findById(id).lean(),

  audience: (c) =>
    resolveAudience(c.audience, c.productKey)
      .select("email firstName emailPrefs emailVerified")
      .lean(),

  /** Addresses this campaign has been delivered to, lower case. */
  async sentAddresses(campaignId) {
    const rows = await EmailSend.find({ campaign: String(campaignId), to: { $ne: "" } })
      .select("to")
      .lean();
    return new Set(rows.map((r) => lower(r.to)));
  },

  // Only a delivered campaign message carries `campaign` (a refused one is
  // logged without it), so every row here is one message that went out.
  countSent: (campaignId) =>
    EmailSend.countDocuments({ campaign: String(campaignId), ok: { $ne: false } }),

  recordFailures: (campaignId, userIds) =>
    Campaign.updateOne({ _id: campaignId }, { $addToSet: { failedIds: { $each: userIds } } }),

  /** Only a campaign still at "sending" is finished, and only once. */
  async finalize(campaignId, set) {
    const r = await Campaign.updateOne({ _id: campaignId, status: "sending" }, { $set: set });
    return r.matchedCount > 0;
  },

  /** True for the one caller that gets to write the audit entry. */
  async claimAudit(campaignId, at) {
    const r = await Campaign.updateOne(
      { _id: campaignId, auditedAt: null },
      { $set: { auditedAt: at } },
    );
    return r.matchedCount > 0;
  },

  sendingCampaigns: () => Campaign.find({ status: "sending" }).lean(),

  /** The newest delivered message, by ObjectId time, or the record's own updatedAt. */
  async latestProgress(c) {
    const row = await EmailSend.findOne({ campaign: String(c._id) })
      .sort({ _id: -1 })
      .select("_id")
      .lean();
    if (row?._id?.getTimestamp) return row._id.getTimestamp();
    return c.updatedAt ? new Date(c.updatedAt) : new Date(0);
  },

  /**
   * One atomic update, so of two runs reaching for the same campaign exactly
   * one gets it. Timestamps are left alone: the lock is not progress.
   */
  takeLock: (campaignId, now, until, extra = {}) =>
    Campaign.findOneAndUpdate(
      {
        _id: campaignId,
        status: "sending",
        $or: [{ sweepLockedUntil: null }, { sweepLockedUntil: { $lte: now } }],
      },
      { $set: { sweepLockedUntil: until, ...extra } },
      { new: true, timestamps: false },
    ).lean(),

  /** Let go, but only of the lock this run took. */
  releaseLock: (campaignId, until) =>
    Campaign.updateOne(
      { _id: campaignId, sweepLockedUntil: until },
      { $set: { sweepLockedUntil: null } },
      { timestamps: false },
    ),
};

/* ──────────────────────────────────────────────────────────── finishing ── */

/**
 * Mark a campaign sent, if and only if nobody who should get it is left.
 *
 * The figures come from the ledger, not from a run's counters: a campaign
 * finished by the sweeper days after the route started it still says how many
 * messages went out. `failed` is the set of people SES refused, kept on the
 * record, so a failure is counted once however many runs it took.
 */
export async function finalizeCampaign(
  campaignId,
  {
    store = mongoStore,
    writeAudit = realWriteAudit,
    now = () => Date.now(),
    auditContext = {},
  } = {},
) {
  const c = await store.loadCampaign(campaignId);
  if (!c) return { finalized: false, reason: "not found" };
  if (c.status !== "sending") return { finalized: false, reason: `status is ${c.status}` };

  const people = await store.audience(c);
  const { mailable, optedOut, unverified } = classifyAudience(people);
  const logged = await store.sentAddresses(c._id);
  const failedIds = new Set((c.failedIds || []).map(String));
  const remaining = stillToSend(mailable, logged, failedIds).length;
  if (remaining > 0) return { finalized: false, remaining };

  const sent = await store.countSent(c._id);
  const at = new Date(now());
  const stats = {
    audience: c.stats?.audience || people.length,
    sent,
    skippedOptedOut: optedOut,
    skippedUnverified: unverified,
    failed: failedIds.size,
  };

  const done = await store.finalize(c._id, {
    status: "sent",
    sentAt: c.sentAt || at,
    stats,
  });
  if (!done) return { finalized: false, reason: "no longer sending" };

  let audited = false;
  if (await store.claimAudit(c._id, at)) {
    await writeAudit({
      actorId: c.sentById || null,
      actorEmail: c.sentByEmail || "",
      action: "campaign.send",
      status: 200,
      ...auditContext,
      meta: {
        campaign: String(c._id),
        subject: c.subject,
        audience: c.audience,
        sent,
        optedOut,
        unverified,
        failed: failedIds.size,
      },
    });
    audited = true;
  }

  return { finalized: true, stats, audited };
}

/* ──────────────────────────────────────────────────────────── sending ── */

const NOT_STARTED = Symbol("not started");

/**
 * Send what is left of a campaign until the deadline, then try to finish it.
 *
 * Safe to run again: people already in the ledger are skipped, so a second
 * run after a cut-off mails only the ones the first never reached.
 */
export async function runCampaignSend(
  campaign,
  {
    deadlineAt,
    people = null,
    store = mongoStore,
    sendMail = realSendMail,
    writeAudit = realWriteAudit,
    pacing = campaignPacing,
    now = () => Date.now(),
    log = console,
    auditContext = {},
  } = {},
) {
  const c = campaign;
  const id = String(c._id);
  const until = deadlineAt ?? now() + ROUTE_BUDGET_MS;

  const everyone = people ?? (await store.audience(c));
  const { mailable } = classifyAudience(everyone);
  const logged = await store.sentAddresses(id);
  const failedBefore = new Set((c.failedIds || []).map(String));
  const pending = stillToSend(mailable, logged, failedBefore);

  let sent = 0;
  let notStarted = 0;
  const failedNow = [];

  if (pending.length) {
    const { concurrency, ratePerSecond } = await pacing();

    await mapWithPool(
      pending,
      async (u) => {
        // Checked when the send is about to start, after the rate limiter has
        // let it through, not when it was queued. A container thawed long
        // after its deadline also stops here rather than racing the sweeper.
        if (now() >= until) return NOT_STARTED;
        const optOut = unsubscribeUrl(u._id);
        const r = marketingMessage({
          firstName: u.firstName,
          subject: c.subject,
          preheader: c.preheader,
          heading: c.heading,
          body: c.body,
          ctaLabel: c.ctaLabel,
          ctaHref: c.ctaHref,
          unsubscribeUrl: optOut,
        });
        await sendMail({
          to: u.email,
          subject: r.subject,
          html: r.html,
          templateKey: "marketing.campaign",
          // Marketing mail without a header-level opt-out is what Gmail's bulk
          // sender rules exist to punish. The footer link stays too.
          listUnsubscribe: optOut,
          // Routes this send to MarketingConfigSet, the only configuration set
          // that records opens and clicks, and keeps the recipient against this
          // campaign in EmailSend. That row is also what a resumed run reads to
          // skip this person. Transactional mail must not pass this.
          track: { campaign: id },
        });
        return true;
      },
      {
        concurrency,
        ratePerSecond,
        onResult: (u, result) => {
          if (result.ok && result.value === NOT_STARTED) notStarted++;
          else if (result.ok) sent++;
          else {
            failedNow.push(String(u._id));
            log.error?.(`[campaign ${id}] ${u.email}:`, result.error?.message || result.error);
          }
        },
      },
    );

    if (failedNow.length) await store.recordFailures(c._id, failedNow);
  }

  const finished = await finalizeCampaign(c._id, { store, writeAudit, now, auditContext });

  return {
    campaign: id,
    pending: pending.length,
    sent,
    failed: failedNow.length,
    left: notStarted,
    ...finished,
  };
}

/* ──────────────────────────────────────────────────────────── the sweep ── */

/**
 * Carry on every campaign stuck at "sending".
 *
 * Called from every scheduled invocation (scheduled.js), so a campaign the
 * route could not finish is picked up within about fifteen minutes. A
 * campaign is only touched once nothing has happened to it for STALE_MS and
 * its lock has run out, so a run still going is left alone.
 *
 * `deadlineMs` is the time this sweep may spend, from now.
 */
export async function sweepStalledCampaigns({
  deadlineMs = 5 * 60 * 1000,
  store = mongoStore,
  sendMail = realSendMail,
  writeAudit = realWriteAudit,
  pacing = campaignPacing,
  now = () => Date.now(),
  log = console,
  staleMs = STALE_MS,
} = {}) {
  const until = now() + Math.max(0, deadlineMs);
  const candidates = await store.sendingCampaigns();
  const results = [];

  for (const c of candidates) {
    const id = String(c._id);
    if (now() >= until) {
      results.push({ campaign: id, skipped: "out of time" });
      continue;
    }

    const last = await store.latestProgress(c);
    if (now() - new Date(last).getTime() < staleMs) {
      results.push({ campaign: id, skipped: "still moving" });
      continue;
    }

    // A record from before sendStartedAt existed takes its updatedAt, which
    // for a stuck campaign is when it was set to "sending". Written on the
    // first lock so it does not drift.
    const startedAt = c.sendStartedAt || c.updatedAt || null;
    if (startedAt && now() - new Date(startedAt).getTime() > MAX_RESUME_AGE_MS) {
      log.warn?.(`[campaign-sweep] ${id} started ${new Date(startedAt).toISOString()}; too old to resume`);
      results.push({ campaign: id, skipped: "too old to resume" });
      continue;
    }

    const lockUntil = new Date(until + LOCK_MARGIN_MS);
    const extra = !c.sendStartedAt && startedAt ? { sendStartedAt: new Date(startedAt) } : {};
    const locked = await store.takeLock(c._id, new Date(now()), lockUntil, extra);
    if (!locked) {
      results.push({ campaign: id, skipped: "locked" });
      continue;
    }

    try {
      const r = await runCampaignSend(locked, {
        deadlineAt: until,
        store,
        sendMail,
        writeAudit,
        pacing,
        now,
        log,
      });
      log.log?.(`[campaign-sweep] ${id}:`, JSON.stringify(r));
      results.push(r);
    } catch (err) {
      log.error?.(`[campaign-sweep] ${id} failed:`, err?.message || err);
      results.push({ campaign: id, ok: false, error: String(err?.message || err) });
    } finally {
      await store.releaseLock(c._id, lockUntil);
    }
  }

  return { ok: true, checked: candidates.length, results };
}
