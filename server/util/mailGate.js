// server/util/mailGate.js
//
// The compliance gate every BULK send passes through before a single message
// leaves ADLM Studio. It exists because bulk paths used to each roll their own
// recipient filter and they disagreed — some checked the hard-bounce flag, some
// the opt-out, some neither — so a suppressed or opted-out address could still
// be mailed depending on which path sent it. AWS SES will review, then pause, an
// account whose bounce rate crosses 5% or complaint rate 0.1%, so "who we are
// allowed to email" cannot be a per-caller convention. It has to be one answer.
//
// TWO TIERS (see docs/VIDEO_NOTIFICATIONS.md is the sibling; the plan is in the
// mail-compliance-gate design):
//
//   Tier 1 — a hard-bounce safety net inside sendMail() (util/mailer.js): every
//     message, transactional included, is dropped if the address is a known
//     permanent bounce, and any message flagged `bulk` without a gate token is
//     refused. That makes "nothing bypasses the gate" a fact, not a hope.
//   Tier 2 — sendBulk() here: the single entry point for any list/query send.
//     It filters the audience (this file), forces a one-click unsubscribe, and
//     paces the send under the SES rate, a daily cap and a bounce/complaint
//     circuit-breaker.
//
// This file currently implements the recipient-eligibility core (canEmail /
// filterRecipients). sendBulk, the sending-rule checks and the circuit-breaker
// build on top of it.
//
// WHAT IT REUSES (it invents no parallel model):
//   - User.emailUndeliverable  — the permanent-bounce/complaint flag written by
//     util/mailFeedback.js. The ONLY suppression source; checked on every send.
//   - User.emailPrefs.{marketing,videoUpdates} — the live per-topic opt-out
//     flags, read as `=== false` so an account that predates the field stays IN.
//   - User.emailVerified — an unverified address is a likely-fake that costs
//     bounce reputation, so it is not mailed in bulk.
// It generalises util/videoNotifier.js classifyRecipient/splitAudience, which
// hard-coded the videoUpdates topic, into a category-parameterised predicate.

import { MailEvent } from "../models/MailEvent.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { mapWithPool } from "./sendPool.js";
import { sendRatePerSecond } from "./sesTransport.js";
import { unsubscribeUrl, videoUnsubscribeUrl, assertUnsubscribeLinksWork } from "./campaigns.js";
// sendMail is imported lazily inside sendBulk: mailer.js imports THIS module for
// its Tier-1 hard-bounce net, so a static import here would be a load-time cycle.

/**
 * Message categories, and which consent flag each one must honour.
 *
 *   marketing     — announcements, campaigns, guides. Honours emailPrefs.marketing.
 *   videoUpdates  — new-recording notices. Honours emailPrefs.videoUpdates.
 *   transactional — receipts, resets, licence and billing mail. Honours NO
 *                   opt-out (a customer cannot unsubscribe from their receipt),
 *                   but is STILL stopped at a hard bounce like everything else.
 *
 * A new bulk stream must add its own entry here rather than pick a field ad hoc —
 * that is what keeps topic segregation (SES's rule: consent is per-topic) real.
 */
export const CATEGORIES = Object.freeze({
  marketing: "marketing",
  videoUpdates: "videoUpdates",
  transactional: null,
});

export function isBulkCategory(category) {
  return category === "marketing" || category === "videoUpdates";
}

// Trim + lowercase to the canonical form used for dedupe and for the sendMail
// hard-bounce lookup, so "A@X.com " and "a@x.com" are one person, not two.
export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Deliberately permissive: this is a "not obviously broken" check to keep
// malformed rows out of a bulk run, not RFC 5322 validation. A real address
// that fails delivery is caught by the bounce feedback loop, not here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The single per-recipient verdict.
 *
 *   'send' | 'no-address' | 'invalid-address' | 'disabled' | 'unverified'
 *   | 'undeliverable' | 'opted-out' | 'unverifiable'
 *
 * Precedence matters and is deliberate: address → valid → active → verified →
 * hard-bounce → consent. It keeps the skip counts honest — a deleted mailbox is
 * 'undeliverable', never 'opted-out', so "how many asked us to stop" is not
 * inflated by people who never asked for anything.
 *
 * FAILS CLOSED. If the fields needed to judge eligibility were never loaded onto
 * the doc, the verdict is 'unverifiable' (dropped), never 'send'. A compliance
 * gate must not mail an address because it could not check it. filterRecipients
 * reloads the fields by id before calling this, so 'unverifiable' should only
 * ever surface a genuinely broken document.
 */
export function canEmail(user, category) {
  if (!(category in CATEGORIES)) {
    throw new Error(`canEmail: unknown category "${category}"`);
  }
  if (!user || typeof user !== "object") return "unverifiable";

  const email = normalizeEmail(user.email);
  if (!email) return "no-address";
  if (!EMAIL_RE.test(email)) return "invalid-address";
  // A closed account is excluded, not counted as an opt-out (see videoNotifier's
  // note): it is not a person who asked us to stop.
  if (user.disabled === true) return "disabled";

  // The hard-bounce and verified flags MUST be present. Their absence means the
  // caller projected them away, and "send because we did not load the check" is
  // exactly the failure this gate exists to prevent.
  if (!("emailVerified" in user) || !("emailUndeliverable" in user)) return "unverifiable";

  if (user.emailVerified !== true) return "unverified";
  if (user.emailUndeliverable === true) return "undeliverable";

  const consentField = CATEGORIES[category];
  if (consentField) {
    // Consent is required for this category. If emailPrefs was not loaded at
    // all we cannot know the opt-out state → fail closed. But a field that was
    // never SET (present subdoc, missing key) reads as opted IN by the model's
    // documented default, so `=== false` — not `!== true` — is the test.
    if (!("emailPrefs" in user) || user.emailPrefs == null) return "unverifiable";
    if (user.emailPrefs[consentField] === false) return "opted-out";
  }
  return "send";
}

const VERDICT_TO_SKIP = Object.freeze({
  "opted-out": "optedOut",
  unverified: "unverified",
  undeliverable: "undeliverable",
  "invalid-address": "invalid",
  "no-address": "noAddress",
  disabled: "disabled",
  unverifiable: "unverifiable",
});

/**
 * Run canEmail over a whole audience and dedupe, returning the recipients that
 * may be mailed and an honest count of who was dropped and why.
 *
 * Returns { recipients, skipped: { optedOut, unverified, undeliverable, invalid,
 * noAddress, disabled, unverifiable, duplicate } }. Every caller needs both the
 * list and the counts — computing them apart is how the "820 sent, 60 opted out"
 * figure on an admin screen drifts from the number of messages actually sent.
 *
 * This is the in-memory pass. The ledger-based "already sent under this run"
 * dedupe (idempotent resume) lives in sendBulk, which has the EmailSend rows.
 */
export function filterRecipients(users = [], category, { opId } = {}) {
  void opId; // reserved for the ledger dedupe in sendBulk
  const recipients = [];
  const seen = new Set();
  const skipped = {
    optedOut: 0,
    unverified: 0,
    undeliverable: 0,
    invalid: 0,
    noAddress: 0,
    disabled: 0,
    unverifiable: 0,
    duplicate: 0,
  };

  for (const u of users) {
    const verdict = canEmail(u, category);
    if (verdict !== "send") {
      const bucket = VERDICT_TO_SKIP[verdict];
      if (bucket) skipped[bucket] += 1;
      continue;
    }
    const email = normalizeEmail(u.email);
    if (seen.has(email)) {
      skipped.duplicate += 1;
      continue;
    }
    seen.add(email);
    recipients.push(u);
  }

  return { recipients, skipped };
}

// The Mongoose projection every bulk audience query must include so canEmail can
// judge eligibility without a reload. Callers select at least these.
export const ELIGIBILITY_FIELDS = Object.freeze([
  "email",
  "disabled",
  "emailVerified",
  "emailUndeliverable",
  "emailPrefs",
]);

/* ─────────────────────────── sending rules ───────────────────────────
 *
 * The non-recipient half of the gate: the rate, daily cap and the
 * bounce/complaint circuit-breaker. SES reviews an account at a 5% bounce rate
 * and a 0.1% complaint rate, then pauses it. We halt bulk BEFORE those lines,
 * on figures we compute ourselves from what already happened — MailEvent
 * (permanent bounces + complaints) over EmailSend (what we actually sent) — so
 * the brake does not depend on an AWS call. Everything is env-tunable.
 */
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const BOUNCE_HALT = num(process.env.BULK_BOUNCE_HALT, 0.04); // SES reviews at 0.05
const COMPLAINT_HALT = num(process.env.BULK_COMPLAINT_HALT, 0.0008); // SES reviews at 0.001
const BREAKER_MIN_SAMPLE = num(process.env.BULK_BREAKER_MIN_SAMPLE, 200);
const DAILY_BULK_FRACTION = num(process.env.BULK_DAILY_FRACTION, 0.8); // leave 20% for transactional
const RATE_HEADROOM = num(process.env.BULK_RATE_HEADROOM, 0.7); // leave headroom under MaxSendRate
const DEFAULT_MAX_PER_RUN = num(process.env.BULK_MAX_PER_RUN, 500);
const STOP_AFTER_CONSECUTIVE_FAILURES = num(process.env.BULK_STOP_AFTER_FAILS, 10);
const BREAKER_RECHECK_EVERY = num(process.env.BULK_BREAKER_RECHECK_EVERY, 50);

/**
 * Live bounce/complaint rates over a rolling window, computed app-locally — no
 * AWS call. Numerator: permanent bounces + complaints (MailEvent, which carries
 * a 90-day TTL). Denominator: successful sends (EmailSend). `denom` is returned
 * so a caller does not trip the breaker on one bounce in a tiny sample.
 */
export async function reputationRates({ windowHours = 24 } = {}) {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);
  const [permBounces, complaints, sent] = await Promise.all([
    MailEvent.countDocuments({ type: "bounce", bounceType: "Permanent", at: { $gte: since } }),
    MailEvent.countDocuments({ type: "complaint", at: { $gte: since } }),
    EmailSend.countDocuments({ ok: true, at: { $gte: since } }),
  ]);
  return {
    windowHours,
    denom: sent,
    permBounces,
    complaints,
    bounceRate: sent > 0 ? permBounces / sent : 0,
    complaintRate: sent > 0 ? complaints / sent : 0,
  };
}

// Reason string if the breaker should trip, else null. Silent below the sample
// floor — a handful of sends cannot produce a trustworthy rate.
function breakerTripped(rates) {
  if (!rates || rates.denom < BREAKER_MIN_SAMPLE) return null;
  if (rates.bounceRate >= BOUNCE_HALT)
    return `bounce ${(rates.bounceRate * 100).toFixed(2)}% >= ${(BOUNCE_HALT * 100).toFixed(1)}%`;
  if (rates.complaintRate >= COMPLAINT_HALT)
    return `complaint ${(rates.complaintRate * 100).toFixed(3)}% >= ${(COMPLAINT_HALT * 100).toFixed(3)}%`;
  return null;
}

// SES account state — the definitive hard signal (paused? quota left?). Lazy
// SES client so a caller that never sends bulk never loads it.
async function sesAccount() {
  const { SESv2Client, GetAccountCommand } = await import("@aws-sdk/client-sesv2");
  const region = process.env.SES_REGION || process.env.AWS_REGION || "eu-west-1";
  const a = await new SESv2Client({ region }).send(new GetAccountCommand({}));
  return {
    sendingEnabled: a.SendingEnabled !== false,
    max24h: Number(a.SendQuota?.Max24HourSend || 0),
    sent24h: Number(a.SendQuota?.SentLast24Hours || 0),
  };
}

/**
 * The preflight run() calls before sending: circuit-breaker, AWS pause signal,
 * and the daily-cap headroom. Returns { ok, reason, allowedThisRun } — a run may
 * be refused outright or trimmed to what the daily cap still allows.
 */
export async function checkSendingRules({ category, recipientCount }) {
  void category;
  const rates = await reputationRates({});
  const tripped = breakerTripped(rates);
  if (tripped) return { ok: false, reason: `circuit-breaker: ${tripped}`, allowedThisRun: 0, rates };

  let acct = null;
  try {
    acct = await sesAccount();
  } catch {
    // Could not read SES (e.g. still on another transport). Fall through on the
    // breaker + per-run cap alone rather than block, since the breaker already
    // covers the reputational danger.
  }
  if (acct && !acct.sendingEnabled) {
    return { ok: false, reason: "SES has paused sending (SendingEnabled=false)", allowedThisRun: 0, rates, acct };
  }

  let allowedThisRun = recipientCount;
  if (acct && acct.max24h > 0) {
    const ceiling = Math.floor(acct.max24h * DAILY_BULK_FRACTION);
    const room = Math.max(0, ceiling - acct.sent24h);
    allowedThisRun = Math.min(recipientCount, room);
    if (allowedThisRun <= 0) {
      return { ok: false, reason: `daily bulk cap reached (${acct.sent24h}/${ceiling})`, allowedThisRun: 0, rates, acct };
    }
  }
  return { ok: true, reason: "", allowedThisRun, rates, acct };
}

/* ─────────────────────────── the bulk token ───────────────────────────
 *
 * What makes "nothing bypasses the gate" a code fact rather than a hope. sendBulk
 * mints a token for the run; the Tier-1 net in sendMail (util/mailer.js) requires
 * a valid one whenever a message is flagged bulk. An ad-hoc loop over sendMail
 * with bulk:true and no token is refused.
 */
const activeBulkTokens = new Set();
export function issueBulkToken() {
  const t = `bulk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  activeBulkTokens.add(t);
  return t;
}
export function verifyBulkToken(t) {
  return typeof t === "string" && activeBulkTokens.has(t);
}
function revokeBulkToken(t) {
  activeBulkTokens.delete(t);
}

const UNSUB_URL_FOR = { marketing: unsubscribeUrl, videoUpdates: videoUnsubscribeUrl };

/**
 * THE single entry point every bulk/list send must go through.
 *
 *   sendBulk({ category, users?|query?, opId, render, maxPerRun? })
 *
 * category  one of CATEGORIES. Bulk categories (marketing/videoUpdates) get a
 *           forced one-click unsubscribe; transactional does not.
 * users     an array of user docs projected with at least ELIGIBILITY_FIELDS
 *           plus whatever render() needs; OR
 * query     a Mongoose query (or promise) resolving to those docs.
 * opId      the run key. EmailSend rows are tagged with it, so a re-run with the
 *           same opId never re-sends anyone already sent — idempotent resume.
 * render    (user) => { subject, html, text?, track? }. The message body.
 *
 * Order: assert the unsubscribe link works → filter (eligibility + dedupe) →
 * drop anyone already sent under opId → preflight (breaker + daily cap) → cap →
 * pace through the SES-rate pool, forcing the unsubscribe header, re-checking the
 * breaker every N sends, and aborting after too many consecutive failures.
 */
export async function sendBulk({ category, users, query, opId, render, maxPerRun = DEFAULT_MAX_PER_RUN }) {
  if (!(category in CATEGORIES)) throw new Error(`sendBulk: unknown category "${category}"`);
  if (typeof render !== "function") throw new Error("sendBulk: render(user) is required");
  if (!opId) throw new Error("sendBulk: opId (the run key) is required for idempotent resume");

  // A bulk send with no working one-click unsubscribe is not compliant. Fail
  // before a single message rather than after.
  if (isBulkCategory(category)) assertUnsubscribeLinksWork();

  let audience = users;
  if (!audience && query) audience = typeof query?.lean === "function" ? await query.lean() : await query;
  audience = Array.isArray(audience) ? audience : [];

  const { recipients, skipped } = filterRecipients(audience, category, { opId });

  // Idempotent resume: never re-send to anyone already sent under this opId.
  let toSend = recipients;
  if (toSend.length) {
    const already = await EmailSend.find({ key: opId, ok: true }, { toHash: 1 }).lean();
    const done = new Set(already.map((r) => r.toHash));
    const before = toSend.length;
    toSend = toSend.filter((u) => !done.has(hashRecipient(normalizeEmail(u.email))));
    skipped.alreadySent = before - toSend.length;
  }

  const result = { category, opId, eligible: recipients.length, sent: 0, failed: 0, skipped, halted: false, reason: "" };
  if (!toSend.length) {
    result.reason = "nothing to send (all filtered or already sent)";
    return result;
  }

  const pre = await checkSendingRules({ category, recipientCount: toSend.length });
  result.rates = pre.rates;
  if (!pre.ok) {
    result.halted = true;
    result.reason = pre.reason;
    return result;
  }
  if (pre.allowedThisRun < toSend.length) {
    toSend = toSend.slice(0, pre.allowedThisRun);
    result.reason = `trimmed to ${pre.allowedThisRun} for the daily cap`;
  }
  if (toSend.length > maxPerRun) {
    toSend = toSend.slice(0, maxPerRun);
    result.reason = (result.reason ? result.reason + "; " : "") + `capped at maxPerRun=${maxPerRun}`;
  }

  const baseRate = await sendRatePerSecond().catch(() => 1);
  const ratePerSecond = Math.max(1, Math.floor((Number(baseRate) || 1) * RATE_HEADROOM));

  const { sendMail } = await import("./mailer.js"); // lazy — avoids the load-time cycle
  const token = issueBulkToken();
  const unsub = UNSUB_URL_FOR[category] || null;
  let consecutiveFailures = 0;
  let processed = 0;
  let aborted = false;

  try {
    await mapWithPool(
      toSend,
      async (user) => {
        if (aborted) return;
        if (processed > 0 && processed % BREAKER_RECHECK_EVERY === 0) {
          const t = breakerTripped(await reputationRates({}));
          if (t) {
            aborted = true;
            result.halted = true;
            result.reason = `aborted mid-run: circuit-breaker ${t}`;
            return;
          }
        }
        processed += 1;
        const email = normalizeEmail(user.email);
        const msg = render(user) || {};
        try {
          await sendMail({
            to: email,
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            templateKey: opId, // tags the EmailSend row with the run -> resume dedupe
            listUnsubscribe: unsub ? unsub(String(user._id)) : undefined,
            track: msg.track || null,
            bulkToken: token, // the Tier-1 net in mailer.js requires this for bulk
          });
          result.sent += 1;
          consecutiveFailures = 0;
        } catch (e) {
          result.failed += 1;
          consecutiveFailures += 1;
          if (consecutiveFailures >= STOP_AFTER_CONSECUTIVE_FAILURES) {
            aborted = true;
            result.halted = true;
            result.reason = `aborted: ${STOP_AFTER_CONSECUTIVE_FAILURES} sends failed in a row (last: ${String(e?.message || e).slice(0, 140)})`;
          }
        }
      },
      { concurrency: Math.min(ratePerSecond, 5), ratePerSecond },
    );
  } finally {
    revokeBulkToken(token);
  }
  return result;
}
