// Who referred whom, and whether it turned into money.
//
// ONE DOCUMENT PER REFERRED PERSON, NOT PER PURCHASE
//
// That is the whole design, and it is what stops the count being wrong.
//
// A renewal is a brand-new Purchase every cycle (util/autoRenew.js: isRenewal
// true), so crediting a referral per purchase would keep paying out for the
// same customer every month for ever. A referral converts ONCE, the first time
// the person it belongs to pays for anything — `referredUserId` is uniquely
// indexed, so the database itself refuses a second row.
//
// AND THE CREDIT IS CLAIMED, NOT CHECKED-THEN-WRITTEN
//
// Four separate paths take somebody from unpaid to paid — card verify, the
// Paystack webhook, the renewal cron and an admin approving a transfer — and
// two of them race on purpose (the buyer returning to the thank-you page and
// the webhook arriving). Paystack also re-delivers webhooks.
//
// So conversion is an atomic conditional update, `{_id, convertedAt: null}` →
// `$set`, exactly like Purchase's own `installation.entitlementsApplied` and
// `adminNotifiedAt` flags. Read-then-write would double-count under precisely
// the conditions that are normal here. The repo already has a live example of
// getting this wrong: the coupon `redeemedCount` is incremented after a
// non-atomic read of `coupon.redeemedApplied`, and two concurrent completes can
// record one redemption twice.

import mongoose from "mongoose";

const ReferralSchema = new mongoose.Schema(
  {
    // The code as handed out — always the normalised, upper-case form.
    code: { type: String, required: true, trim: true, uppercase: true, index: true },

    // Whose link it was.
    referrerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referrerEmail: { type: String, trim: true, lowercase: true, default: "" },

    // Who arrived on it. Unique: a person is referred once, by one person, and
    // the index is what makes that true rather than a comment that hopes so.
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    referredEmail: { type: String, trim: true, lowercase: true, default: "" },

    // How they signed up, so a social-vs-password gap in capture is visible
    // rather than guessed at.
    signupMethod: { type: String, enum: ["password", "social", "unknown"], default: "unknown" },

    signedUpAt: { type: Date, default: Date.now },

    // ── Conversion ──
    // null until the referred person first pays for anything. Set once, by an
    // atomic claim. Never cleared: a refund is a separate fact and unsetting
    // this would let the same person convert twice.
    convertedAt: { type: Date, default: null, index: true },
    // Which path credited it, for when the numbers are questioned.
    convertedVia: {
      type: String,
      enum: ["", "card", "webhook", "admin-approval", "renewal"],
      default: "",
    },
    // The order that did it. Kept for the audit trail, never used to count.
    convertedPurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", default: null },
    convertedAmount: { type: Number, default: 0 },
    convertedCurrency: { type: String, trim: true, default: "" },
    // What they bought, so a referrer can be told "they took HERON" rather than
    // a bare yes.
    convertedProducts: { type: [String], default: [] },
  },
  { timestamps: true },
);

// The admin list: newest first, and "converted only" without a scan.
ReferralSchema.index({ referrerUserId: 1, convertedAt: -1 });
ReferralSchema.index({ createdAt: -1 });

export const Referral =
  mongoose.models.Referral || mongoose.model("Referral", ReferralSchema);

export default Referral;
