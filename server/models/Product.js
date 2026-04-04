import mongoose from "mongoose";

// ---- Discount schema ----
// percent = percentage off normal recurring total
// fixed = fixed bundle total (recurring only, per seat)
const DiscountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["percent", "fixed"], required: true },

    // For "percent": store the percent in valueNGN (e.g. 10 = 10% off)
    // For "fixed": store the bundle price in NGN (per seat)
    valueNGN: { type: Number, default: 0 },

    // Optional: fixed USD bundle (per seat)
    valueUSD: { type: Number, default: null },
  },
  { _id: false },
);

const PriceSchema = new mongoose.Schema(
  {
    monthlyNGN: { type: Number, default: 0 }, // per month (actual / list price)
    yearlyNGN: { type: Number, default: 0 }, // per year (actual / list price)
    installNGN: { type: Number, default: 0 }, // one-time install fee

    // Optional explicit USD overrides. If not provided, server will compute = NGN * fxRate
    monthlyUSD: { type: Number, default: undefined },
    yearlyUSD: { type: Number, default: undefined },
    installUSD: { type: Number, default: undefined },

    // 6-month tier — total price for 6 months (not per-month)
    sixMonthNGN: { type: Number, default: 0 },
    sixMonthUSD: { type: Number, default: undefined },

    // Discounted (sale) prices — when set, shown as the active price with
    // the actual price struck through. If null/0, actual price is used.
    discountedMonthlyNGN: { type: Number, default: undefined },
    discountedMonthlyUSD: { type: Number, default: undefined },
    discountedSixMonthNGN: { type: Number, default: undefined },
    discountedSixMonthUSD: { type: Number, default: undefined },
    discountedYearlyNGN: { type: Number, default: undefined },
    discountedYearlyUSD: { type: Number, default: undefined },
  },
  { _id: false },
);

const ProductSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // stable productKey
    name: { type: String, required: true },
    blurb: { type: String, default: "" },
    description: { type: String, default: "" },
    features: { type: [String], default: [] },
    images: { type: [String], default: [] },

    // "monthly" or "yearly" is the default billing cadence for UI
    billingInterval: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },

    isCourse: { type: Boolean, default: false },
    courseSku: { type: String, default: undefined },
    relatedFreeVideoIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "FreeVideo" },
    ],
    relatedCourseSkus: [{ type: String, default: [] }],

    // Dual currency pricing container
    price: { type: PriceSchema, default: () => ({}) },

    // Bundle discounts (optional)
    discounts: {
      sixMonths: { type: DiscountSchema, default: undefined },
      oneYear: { type: DiscountSchema, default: undefined },
    },

    previewUrl: { type: String, default: undefined },
    thumbnailUrl: { type: String, default: undefined },

    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Product = mongoose.model("Product", ProductSchema);
