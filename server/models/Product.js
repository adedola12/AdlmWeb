import mongoose from "mongoose";

const PriceSchema = new mongoose.Schema(
  {
    monthlyNGN: { type: Number, default: 0 }, // per month, in naira
    yearlyNGN: { type: Number, default: 0 }, // per year, in naira
    installNGN: { type: Number, default: 0 }, // one-time, in naira

    // Optional explicit USD overrides. If not provided, server will compute = NGN * fxRate
    monthlyUSD: { type: Number },
    yearlyUSD: { type: Number },
    installUSD: { type: Number },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // stable productKey
    name: { type: String, required: true },
    blurb: { type: String, default: "" },
    description: { type: String, default: "" },
    features: { type: [String], default: [] },

    // "monthly" or "yearly" is the default billing cadence for UI
    billingInterval: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },

    isCourse: { type: Boolean, default: false }, // product itself is a course?
    courseSku: { type: String }, // if it maps to a PaidCourse.sku
    relatedFreeVideoIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "FreeVideo" },
    ],
    relatedCourseSkus: [{ type: String }], // other courses by SKU

    // Dual currency pricing container
    price: { type: PriceSchema, default: () => ({}) },

    previewUrl: { type: String },
    thumbnailUrl: { type: String },

    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", ProductSchema);
