// server/models/Product.js
import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // stable productKey
    name: { type: String, required: true },
    blurb: { type: String, default: "" }, // short one-liner
    description: { type: String, default: "" }, // long/markdown allowed
    features: { type: [String], default: [] }, // bullets
    priceMonthly: { type: Number, default: 0 }, // optional, for display
    previewUrl: { type: String }, // MP4/Cloudinary for hover+detail
    thumbnailUrl: { type: String }, // fallback image
    isPublished: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", ProductSchema);
