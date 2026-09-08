import crypto from "node:crypto";
import mongoose from "mongoose";

/**
 * Deliberately a copy of EmailSend's hashRecipient rather than an import of it.
 *
 * The two must produce identical values so a recipient can be correlated
 * across both collections, and this is kept byte-for-byte identical for that
 * reason. But EmailSend belongs to the mail-logging work, which lives on a
 * different branch to this one — importing it would mean broadcast could only
 * ship after that feature, and a route that fails to import takes the whole
 * API down at boot rather than degrading. A four-line hash is not worth that
 * coupling.
 */
export const hashRecipient = (to) =>
  crypto
    .createHash("sha256")
    .update(String(Array.isArray(to) ? to[0] : to || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);

/**
 * A one-to-many announcement, and the per-recipient ledger that makes it safe
 * to run more than once.
 *
 * WHY A LEDGER AND NOT A LOOP
 *   The API runs on Lambda, so nothing can sit in one request long enough to
 *   mail a whole customer base, and a request that dies halfway leaves no
 *   record of who already received the message. Re-running would then mail the
 *   early recipients twice. So the audience is materialised up front, one row
 *   per person, and sending only ever moves rows from "pending" to "sent".
 *   Resuming is just another pass over what is still pending, and a duplicate
 *   send is impossible rather than merely unlikely.
 *
 * The unique index on (broadcastKey, emailHash) is what enforces that: the
 * same address cannot be enrolled in the same broadcast twice, however many
 * times the audience is built.
 */
const BroadcastSchema = new mongoose.Schema(
  {
    // Caller-supplied idempotency key, e.g. "hub-v1.0.2-2026-09". Re-posting
    // the same key returns the existing broadcast instead of making a second.
    key: { type: String, required: true, unique: true, index: true, trim: true },

    subject: { type: String, required: true, trim: true },
    html: { type: String, required: true },

    // "all" | "entitled" | "product:<productKey>"
    audience: { type: String, required: true, trim: true },

    // Marketing opt-out is honoured for every audience. Recorded per broadcast
    // so the decision is visible after the fact, not inferred from code.
    honoursMarketingOptOut: { type: Boolean, default: true },

    status: {
      type: String,
      enum: ["draft", "sending", "done"],
      default: "draft",
      index: true,
    },

    createdBy: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const BroadcastRecipientSchema = new mongoose.Schema(
  {
    broadcastKey: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    // Mirrors EmailSend's hashing so a recipient can be correlated across the
    // two without either collection storing a second copy of the address.
    emailHash: { type: String, default: "", index: true },

    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: "" },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The guarantee: one row per address per broadcast, so building the audience
// twice cannot enrol anyone twice.
BroadcastRecipientSchema.index({ broadcastKey: 1, emailHash: 1 }, { unique: true });
// Drives the send loop's "give me the next batch still owed a message".
BroadcastRecipientSchema.index({ broadcastKey: 1, status: 1 });

export const Broadcast =
  mongoose.models.Broadcast || mongoose.model("Broadcast", BroadcastSchema);

export const BroadcastRecipient =
  mongoose.models.BroadcastRecipient ||
  mongoose.model("BroadcastRecipient", BroadcastRecipientSchema);
