// server/models/FollowUp.js
//
// A person on the renewal call list, plus the log of every call made to them.
//
// Two kinds of people land here, both rebuilt from live data by
// util/followUps.js:
//   • "expired" — at least one entitlement whose expiry has passed.
//   • "pending" — at least one Purchase still sitting on status "pending",
//     i.e. they started buying and it was never approved or paid.
//
// ONE row per person, not one per reason. Whoever works the list phones a
// human being once and talks about everything that person has outstanding, so
// the reasons are an array and the snapshot below carries both sides.
//
// The snapshot fields (products, purchases, names, phone) are DENORMALISED on
// purpose. They are what the caller reads off the screen while the phone is
// ringing, and a rebuild refreshes them; joining live to User and Purchase on
// every list render would be three collections deep for a screen that is
// mostly scrolled and read.
import mongoose from "mongoose";

// Outcomes are deliberately about what happened on the CALL, not about the
// subscription. "renewed" is the only one that implies money, and even that is
// the caller's report — the entitlement itself is changed by the purchase flow,
// never from here.
export const CALL_OUTCOMES = [
  "reached", // spoke to them, no decision yet
  "renewed", // they agreed to renew / completed payment
  "callback", // asked to be called back — set nextFollowUpAt
  "not_interested", // explicit no
  "no_answer", // rang out
  "voicemail", // left a message
  "wrong_number", // number does not belong to them
  "unreachable", // number dead / barred / no number to call
];

export const FOLLOWUP_STATUSES = ["to_call", "in_progress", "done", "snoozed"];

export const FOLLOWUP_REASONS = ["expired", "pending"];

const CallSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },

    // Who made the call. Name is denormalised so the log still reads correctly
    // if the staff account is renamed or removed later.
    byId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, trim: true, default: "" },

    outcome: { type: String, enum: CALL_OUTCOMES, required: true },
    channel: {
      type: String,
      enum: ["phone", "whatsapp", "email"],
      default: "phone",
    },

    note: { type: String, trim: true, default: "", maxlength: 2000 },

    // Set when the outcome is "callback", or whenever the caller wants another
    // attempt scheduled. Drives the "due today" filter on the list.
    nextFollowUpAt: { type: Date, default: null },

    // Activity Log page this call created in the Notion CRM, when Notion is
    // configured. Empty means it was never pushed (or the push failed).
    notionPageId: { type: String, default: "" },
  },
  { _id: true, timestamps: false },
);

// One outstanding product for this person. Rebuilt from the user's
// entitlements each time the list is refreshed.
const ProductSnapshotSchema = new mongoose.Schema(
  {
    productKey: { type: String, trim: true, lowercase: true, default: "" },
    productName: { type: String, trim: true, default: "" },
    expiresAt: { type: Date, default: null },
    // Positive = days since it lapsed. Recomputed on every rebuild.
    daysOverdue: { type: Number, default: 0 },
    seats: { type: Number, default: 1 },
    licenseType: { type: String, trim: true, default: "personal" },
    organizationName: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

// One unapproved purchase attempt.
const PurchaseSnapshotSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
      default: null,
    },
    items: { type: String, trim: true, default: "" }, // human summary of the lines
    total: { type: Number, default: 0 },
    currency: { type: String, trim: true, default: "NGN" },
    createdAt: { type: Date, default: null },
    ageDays: { type: Number, default: 0 },
    // A receipt was uploaded but nobody has approved it — the most urgent
    // shape of "pending", because the money may already have moved.
    hasReceipt: { type: Boolean, default: false },
  },
  { _id: false },
);

const FollowUpSchema = new mongoose.Schema(
  {
    // ── who to call ──────────────────────────────────────────────────────
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // The identity of the row. Purchases can exist without an account, so the
    // email is the key, not the user id.
    // Indexed by the unique index declared below, not here — declaring both
    // makes Mongoose build the index twice and warn on every boot.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    firmName: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },

    // ── why they are on the list ─────────────────────────────────────────
    reasons: { type: [String], default: [], index: true },

    products: { type: [ProductSnapshotSchema], default: [] },
    purchases: { type: [PurchaseSnapshotSchema], default: [] },

    // Largest daysOverdue across `products` — the list sorts on this so the
    // longest-lapsed accounts are called first.
    maxDaysOverdue: { type: Number, default: 0, index: true },
    // Most recent expiry, for display.
    lastExpiredAt: { type: Date, default: null },

    // True when the person still holds a live entitlement for something else.
    // Changes the conversation completely — they are an existing customer who
    // let one product lapse, not a lost one.
    hasActiveOther: { type: Boolean, default: false },
    // Account is disabled — worth knowing before dialling.
    accountDisabled: { type: Boolean, default: false },

    // ── work state ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: FOLLOWUP_STATUSES,
      default: "to_call",
      index: true,
    },
    // Cleared by a rebuild when the person no longer matches either reason —
    // they renewed, or the purchase was approved. The row is KEPT so its call
    // history survives; the list just hides it by default.
    active: { type: Boolean, default: true, index: true },
    resolvedAt: { type: Date, default: null },

    calls: { type: [CallSchema], default: [] },
    callCount: { type: Number, default: 0 },
    lastCalledAt: { type: Date, default: null },
    lastOutcome: { type: String, default: "" },
    nextFollowUpAt: { type: Date, default: null, index: true },

    // Who owns this call. Free-text name alongside the id so a list can be
    // handed to someone without an admin account (e.g. read off a CSV).
    assignedToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedToName: { type: String, trim: true, default: "" },

    note: { type: String, trim: true, default: "", maxlength: 4000 },

    // ── Notion CRM bookkeeping (mirrors the proposal/lead sync shape) ─────
    notion: {
      contactPageId: { type: String, default: "" },
      lastSyncedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
    },

    // Set by the rebuild so a run can report what it touched.
    lastRebuiltAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One row per person. The rebuild upserts on this, so two concurrent runs
// cannot produce a duplicate call for the same human.
FollowUpSchema.index({ email: 1 }, { unique: true });
// Default view: open work, longest-lapsed first.
FollowUpSchema.index({ active: 1, status: 1, maxDaysOverdue: -1 });
// "Due today" view.
FollowUpSchema.index({ active: 1, nextFollowUpAt: 1 });

export const FollowUp =
  mongoose.models.FollowUp || mongoose.model("FollowUp", FollowUpSchema);

export default FollowUp;
