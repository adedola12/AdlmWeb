// What the receiving servers told us.
//
// The User record carries the DECISION — this address is undeliverable, this
// person complained — and that is what the send paths read. This collection
// carries the EVIDENCE, which is a different job and is needed for a different
// question: not "should we mail them" but "why did we stop, and when, and what
// exactly did their server say".
//
// Without it, a customer ringing up to ask why they stopped getting invoices
// gets "the system decided not to" as an answer. With it, they get the SMTP
// response their own IT department sent us.
//
// WHY THE ADDRESS IS STORED IN THE CLEAR HERE
//
// EmailSend hashes its recipient on purpose — it is a volume counter, and a
// log of who was mailed when is a mailing list nobody asked for. This is the
// opposite case. The address IS the actionable content: it is what somebody
// searches for during a support call, and what a reconciliation would have to
// match on. A hash answers neither. Ninety days, then Mongo drops it.

import mongoose from "mongoose";

const MailEventSchema = new mongoose.Schema(
  {
    /** "bounce" | "complaint" | "delivery-delay" | whatever SES sends next. */
    type: { type: String, default: "", index: true },

    email: { type: String, default: "", index: true },

    /** Set when the address matched an account. Absent is normal, not an error. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /** Bounces: "Permanent" | "Transient" | "Undetermined". */
    bounceType: { type: String, default: "" },
    /** Bounces: "General", "NoEmail", "Suppressed", "MailboxFull", … */
    bounceSubType: { type: String, default: "" },
    /** Complaints: "abuse", "fraud", "not-spam", … */
    complaintType: { type: String, default: "" },

    /** The receiving server's diagnostic, or the SMTP status. Trimmed. */
    detail: { type: String, default: "" },

    /** SES's own ids, for matching against the console or a support case. */
    messageId: { type: String, default: "" },
    feedbackId: { type: String, default: "" },

    /**
     * What we did about it, in plain words — "marked undeliverable",
     * "transient, recorded only", "no account for this address".
     *
     * Stored rather than re-derived, because the rules change and a log that
     * re-derives its own history under today's rules is a log that lies about
     * yesterday.
     */
    action: { type: String, default: "" },

    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// Same ninety days as EmailSend, for the same reason: long enough to answer a
// month-on-month question, short enough that this never becomes an archive.
MailEventSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const MailEvent =
  mongoose.models.MailEvent || mongoose.model("MailEvent", MailEventSchema);
