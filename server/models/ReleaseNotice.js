// server/models/ReleaseNotice.js
//
// "QUIV 3.1.11 is ready", told once to everybody licensed for QUIV.
//
// Two collections, the same shape as models/Broadcast.js and for the same
// reason: the API runs on Lambda, nothing can sit in one request long enough to
// mail a whole customer base, and a run that dies halfway must leave a record
// of who already got the message. So the audience is written down once, one row
// per person, and sending only ever moves a row forward.
//
// ONE NOTICE PER PRODUCT VERSION
//
// `key` is "<productKey>@<version>" and is unique, with the version in its
// canonical spelling (util/releaseVersion.js canonicalVersion), so "3.2" and
// "3.2.0" are one key. The deployment PUT inserts it once and a second insert
// of the same key returns the first, so a release script that retries its PUT,
// two admins saving the same manifest, or an admin typing the version another
// way can never make a second notice for one version.
//
// ONE EMAIL PER PERSON PER NOTICE
//
// The unique (noticeKey, emailHash) index on the ledger is what enforces it:
// however many times the audience is built, an address is enrolled once, and a
// row is claimed (pending -> sending) by one atomic update before its message
// goes out. A row left in "sending" by a crash, or by a send whose answer was
// lost (a timeout, a reset connection, a 5xx: SES may have taken it), is NOT
// sent again on a guess; it is reported as in flight and only re-queued when
// an admin asks. A missed
// message is a support question. A duplicate is a customer wondering why the
// studio mails them twice.
//
// THE WEEKLY DIGEST (util/releaseDigest.js)
//
// Since the weekly digest, a recorded notice waits ("pending") for the next
// Monday digest instead of being mailed on its own. The digest takes it by a
// conditional update (pending/failed -> "digesting", digestKey set), so a
// notice is in exactly one digest, and the per-notice send refuses a notice
// a digest has taken. The digest's own ledger is models/ReleaseDigest.js: one
// row per customer per week, listing every update that customer holds. The
// per-notice ledger below is only written by the per-notice send, which is
// now an emergency path (POST .../:id/send with bypassDigest:true).
//
// A "hub" notice (kind "hub", productKey "hub") is a new Installation Center
// build: recorded when an admin points Setting.installerHubUrl at a new
// ADLMInstallerHub-vX.Y.Z file, or by hand, and told to everybody with a live
// licence for software the Installation Center installs (not a course, not a
// web-only key), inside the same weekly email. It is never sent on its own.

import mongoose from "mongoose";

export const NOTICE_STATUSES = [
  "pending", // recorded, nothing sent yet (waits for the weekly digest)
  "sending", // the per-notice ledger is being worked through (emergency path)
  "digesting", // taken by a weekly digest (digestKey); only that digest mails it
  "done", // nobody is still owed the message
  "failed", // SES refused (sandbox, paused, denied); resumable by an admin
  "superseded", // a newer version of the product was announced first
  "cancelled", // the build was pulled (rolled back below this version, switched off, left with no package, or deleted), or an admin stopped it
];

/** Statuses that may still send. A pulled build cancels any of these. */
export const OPEN_STATUSES = ["pending", "sending", "failed", "digesting"];

/**
 * The statuses a newer version supersedes. Not "digesting": a notice a digest
 * has already started mailing is finished by that digest, so its remaining
 * recipients are not left with neither version.
 */
export const SUPERSEDABLE_STATUSES = ["pending", "sending", "failed"];

const ChangeGroupSchema = new mongoose.Schema(
  {
    type: { type: String, default: "" },
    items: { type: [String], default: [] },
  },
  { _id: false },
);

const ReleaseNoticeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    productKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    version: { type: String, required: true, trim: true },
    previousVersion: { type: String, default: "", trim: true },

    // Snapshot of what the mail says, so every batch of a run says the same
    // thing even if the What's New page is edited halfway through.
    productName: { type: String, default: "" },
    notes: {
      // "request" (passed in the PUT), "changelog" (What's New), "generic"
      source: { type: String, default: "generic" },
      title: { type: String, default: "" },
      highlight: { type: String, default: "" },
      groups: { type: [ChangeGroupSchema], default: [] },
      paragraphs: { type: [String], default: [] },
      moreUrl: { type: String, default: "" },
    },

    status: { type: String, enum: NOTICE_STATUSES, default: "pending", index: true },

    // "product" (a deployment) or "hub" (a new Installation Center build,
    // told to everybody with a live licence for software it installs).
    kind: { type: String, enum: ["product", "hub"], default: "product" },
    // Hub notices: the setup file the admin published, for the record. The
    // email links the customer dashboard (its "Download Installer Hub"
    // button), not this file.
    downloadUrl: { type: String, default: "" },

    // The weekly digest that took it ("digest@2026-W40"), and when. Empty
    // until a digest takes it; a notice is in one digest at most.
    digestKey: { type: String, default: "", index: true },
    digestedAt: { type: Date, default: null },

    // Where it came from: "deployment" (the PUT), "manual" (an admin),
    // "installer-hub-setting" (Setting.installerHubUrl changed).
    source: { type: String, default: "deployment" },
    createdBy: { type: String, default: "" },

    // When it last became sendable: recorded, or reopened after a cancel. The
    // fifteen-minute job leaves a pending notice alone until it is
    // RELEASE_HOLD_MS old (util/releaseNotifier.js), so a release script can
    // finish checking the build it published, and cancel, before anything goes.
    openedAt: { type: Date, default: null },
    enrolledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },

    // The last thing that stopped it, in SES's own words. Kept after a resume
    // so the history of "why did this sit for two days" is not erased.
    error: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    failedAt: { type: Date, default: null },

    supersededBy: { type: String, default: "" },
    cancelledReason: { type: String, default: "" },

    // Refreshed after every run. The admin list reads the ledger live; these
    // are for a glance at the document itself.
    counts: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      sending: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      // { optedOut, undeliverable, noEntitlement, disabled, ... }
      skippedBy: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true },
);

ReleaseNoticeSchema.index({ productKey: 1, createdAt: -1 });

const ReleaseNoticeRecipientSchema = new mongoose.Schema(
  {
    noticeKey: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    // Same hash as models/EmailSend.js, so a support call can line the two up.
    emailHash: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "sending", "sent", "failed", "skipped"],
      default: "pending",
    },
    // Why a row was not mailed: opted-out, undeliverable, no-entitlement,
    // disabled, no-address, address-changed.
    skipReason: { type: String, default: "" },

    attempts: { type: Number, default: 0 },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

// The guarantee: one row per address per notice.
ReleaseNoticeRecipientSchema.index({ noticeKey: 1, emailHash: 1 }, { unique: true });
// "Give me the next batch still owed a message."
ReleaseNoticeRecipientSchema.index({ noticeKey: 1, status: 1 });

export const ReleaseNotice =
  mongoose.models.ReleaseNotice || mongoose.model("ReleaseNotice", ReleaseNoticeSchema);

export const ReleaseNoticeRecipient =
  mongoose.models.ReleaseNoticeRecipient ||
  mongoose.model("ReleaseNoticeRecipient", ReleaseNoticeRecipientSchema);
