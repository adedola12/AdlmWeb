import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },

    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true },

    // fixed coupons only
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },

    minSubtotal: { type: Number, default: 0 },

    maxRedemptions: { type: Number },
    redeemedCount: { type: Number, default: 0, index: true },

    isActive: { type: Boolean, default: true, index: true },

    // duration
    startsAt: { type: Date },
    endsAt: { type: Date },

    // ✅ Banner support
    isBanner: { type: Boolean, default: false, index: true },
    bannerText: { type: String, default: "" },

    // ✅ Product-specific coupons
    appliesTo: {
      mode: { type: String, enum: ["all", "include"], default: "all" },
      productKeys: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

export const Coupon = mongoose.model("Coupon", CouponSchema);
