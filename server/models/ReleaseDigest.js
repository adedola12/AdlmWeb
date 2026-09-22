// server/models/ReleaseDigest.js
//
// "This week's ADLM updates": one email per customer per week, listing every
// release of the software they hold (util/releaseDigest.js).
//
// Two collections, the same shape as models/ReleaseNotice.js and for the same
// reason: the API runs on Lambda, a run can die halfway, and the record of who
// already got the week's email must survive it.
//
// ONE DIGEST PER WEEK
//
// `key` is unique: "digest@2026-W40" for the scheduled Monday run (the ISO
// week, in Lagos time, of the slot it runs at), "digest@2026-W40-now-<time>"
// for an admin's emergency send-now. The scheduled run inserts its key before
// it does anything else, so two containers racing on the same Monday produce
// one digest: the second insert fails on the index and that run stops.
//
// ONE EMAIL PER CUSTOMER PER DIGEST
//
// The ledger is keyed (digestKey, userId), unique, and (digestKey, emailHash),
// unique, so however often the audience is enrolled a customer (and an
// address) is in it once. A row is claimed (pending -> sending) by one atomic
// update before its message goes out, and a row left "sending" by a crash or a
// lost SES answer is never sent again on a guess, exactly as in the
// per-notice ledger.

import mongoose from "mongoose";

export const DIGEST_STATUSES = [
  "enrolling", // key recorded; notices being taken and the audience written down
  "sending", // the ledger is being worked through
  "done", // nobody is still owed the email
  "empty", // the week had nothing to announce; nothing was sent
  "failed", // SES refused (sandbox, paused, denied); resumable by an admin (send-now)
  "missed", // never took an update (SES unreachable until its start window passed, or
  //           send-now replaced it); nothing was sent and the updates stayed queued
];

/**
 * A digest the fifteen-minute job carries on with. "failed" waits for an admin.
 * One that has not taken its updates by its `startBy` is closed as "missed".
 */
export const ACTIVE_DIGEST_STATUSES = ["enrolling", "sending"];

/** Everything not yet finished, including one SES refused. */
export const UNFINISHED_DIGEST_STATUSES = ["enrolling", "sending", "failed"];

const ReleaseDigestSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    // The ISO week the digest belongs to, in Lagos time: "2026-W40".
    week: { type: String, required: true, trim: true },
    // "schedule" (the Monday run) or "send-now" (an admin's emergency send).
    trigger: { type: String, default: "schedule" },
    createdBy: { type: String, default: "" },

    status: { type: String, enum: DIGEST_STATUSES, default: "enrolling", index: true },

    // The Monday 09:00 Lagos slot this run belongs to (null for send-now).
    scheduledFor: { type: Date, default: null },
    // The latest it may still TAKE its updates: the end of the slot's window
    // for a scheduled digest, an hour after the press for send-now. A digest
    // that has not taken anything by then is closed as "missed" rather than
    // taking, days later, whatever happens to be queued.
    startBy: { type: Date, default: null },
    // Why an admin's send-now (or the job) closed it without sending more.
    closedReason: { type: String, default: "" },
    // When the notices were taken. Until then a resumed run may take more;
    // after it, a resumed run works only with what it took.
    claimedAt: { type: Date, default: null },
    enrolledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },

    // What it announces, for the record. The live state of each notice is on
    // the notice (a pulled build is cancelled there, and dropped from every
    // email not yet sent).
    noticeKeys: { type: [String], default: [] },
    items: {
      type: [
        new mongoose.Schema(
          {
            key: String,
            kind: String,
            productKey: String,
            productName: String,
            version: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    error: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    failedAt: { type: Date, default: null },

    counts: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      sending: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      skippedBy: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true },
);

ReleaseDigestSchema.index({ createdAt: -1 });

const ReleaseDigestRecipientSchema = new mongoose.Schema(
  {
    digestKey: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    // Same hash as models/EmailSend.js, so a support call can line them up.
    emailHash: { type: String, required: true },
    // The notices this customer's email lists, decided at enrolment from
    // their licences. Re-checked at send time: a notice cancelled since, or a
    // licence that lapsed since, drops out of the email.
    noticeKeys: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["pending", "sending", "sent", "failed", "skipped"],
      default: "pending",
    },
    skipReason: { type: String, default: "" },

    attempts: { type: Number, default: 0 },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: "" },
    // What the sent email actually listed.
    sentNoticeKeys: { type: [String], default: [] },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

// The guarantees: one row per customer, and per address, per digest.
ReleaseDigestRecipientSchema.index({ digestKey: 1, userId: 1 }, { unique: true });
ReleaseDigestRecipientSchema.index({ digestKey: 1, emailHash: 1 }, { unique: true });
// "Give me the next batch still owed an email."
ReleaseDigestRecipientSchema.index({ digestKey: 1, status: 1 });

export const ReleaseDigest =
  mongoose.models.ReleaseDigest || mongoose.model("ReleaseDigest", ReleaseDigestSchema);

export const ReleaseDigestRecipient =
  mongoose.models.ReleaseDigestRecipient ||
  mongoose.model("ReleaseDigestRecipient", ReleaseDigestRecipientSchema);
