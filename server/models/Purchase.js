// models/Purchase.js
import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    productKey: { type: String, trim: true },
    name: { type: String, trim: true },
    billingInterval: { type: String, trim: true }, // "monthly" | "yearly"
    qty: { type: Number, default: 1, min: 1 },
    unit: { type: Number, default: 0 },
    install: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
  },
  { _id: false }
);

// ✅ NEW: entitlement grant schema (legacy-safe)
const GrantSchema = new mongoose.Schema(
  {
    productKey: { type: String, trim: true, required: true },
    months: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const PurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, trim: true, lowercase: true, index: true },

    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    totalAmount: { type: Number, default: 0 },
    totalBeforeDiscount: { type: Number, default: 0 },

    coupon: {
      code: { type: String, trim: true, uppercase: true },
      type: { type: String, enum: ["percent", "fixed"] },
      value: { type: Number },
      currency: { type: String, enum: ["NGN", "USD"] },
      discountAmount: { type: Number, default: 0 },
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
      redeemedApplied: { type: Boolean, default: false },
    },

    lines: { type: [LineSchema], default: [] },

    paystackRef: { type: String, trim: true },
    paid: { type: Boolean, default: false },

    // legacy compatibility
    productKey: { type: String, trim: true },
    requestedMonths: { type: Number },

    // ✅ UPDATED installation schema (adds missing fields)
    installation: {
      status: {
        type: String,
        enum: ["none", "pending", "complete"],
        default: "none",
      },
      anydeskUrl: {
        type: String,
        default: "https://anydesk.com/en/downloads/windows",
      },
      installVideoUrl: { type: String, default: "" },
      address: { type: String, default: "" },
      markedBy: { type: String, default: "" },
      markedAt: { type: Date },

      // ✅ these were missing (caused “legacy” + no entitlement applied)
      entitlementGrants: { type: [GrantSchema], default: [] },
      entitlementsApplied: { type: Boolean, default: false },
      entitlementsAppliedAt: { type: Date },
    },

    userConfirmedAt: { type: Date },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    decidedBy: { type: String, trim: true },
    decidedAt: { type: Date },
    approvedMonths: { type: Number },
  },
  { timestamps: true, minimize: false }
);

export const Purchase =
  mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
