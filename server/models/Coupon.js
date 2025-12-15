import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // stored UPPERCASE
    description: { type: String, default: "" },

    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true }, // percent: 1-100, fixed: amount in currency below

    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" }, // only used when type=fixed
    minSubtotal: { type: Number, default: 0 }, // in chosen checkout currency (same currency as cart)

    isActive: { type: Boolean, default: true },

    // add to Coupon schema fields:
    isBanner: { type: Boolean, default: false, index: true },
    bannerText: { type: String, default: "" },
    startsAt: { type: Date },
    endsAt: { type: Date },

    maxRedemptions: { type: Number }, // optional
    redeemedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 }, { unique: true });

export const Coupon = mongoose.model("Coupon", CouponSchema);
