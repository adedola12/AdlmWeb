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
